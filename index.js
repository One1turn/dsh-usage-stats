/**
 * dsh-usage-stats — ZCode 风格的应用用量统计（DSH 插件）。
 *
 * 数据源：本地会话日志 `~/.dsh/sessions/<cwd>/session-<id>/session.v4.jsonl.zstd`。
 * 该文件是【多帧 zstd 拼接】（每次写入追加一帧），Node 的 zstdDecompressSync 只解第一帧，
 * 必须按帧魔数 28 B5 2F FD 切片逐帧解压。
 *
 * 聚合规则（与 dsh 事件契约一致）：
 *  - `request/header` 事件 data.header.config.{provider,model} → 当前路由
 *  - `assistant/message` 事件 data.usage.{inputTokens,outputTokens,totalTokens,cacheReadTokens}
 *    → 记到「当前路由的模型」上，按事件 time（epoch ms）落到本地日期
 *  - 会话时长 = 首末事件时间差；首末事件时间为会话起止
 *
 * 缓存：`~/.dsh/usage-stats/cache.json`，按文件 (mtime,size) 签名增量聚合；首次全量回填。
 * 对外：POST /api/usage-stats  {method:'usage.summary', payload:{range:7|30}}
 * 刻意零 @deepseek-ai 裸导入（外部 link 插件解析不到宿主 SDK，全部走 ctx 服务 + node 内置）。
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const LOG = "[dsh-usage-stats]";
const RPC_PATH = "/api/usage-stats";
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

export const inject = ["connection"];

export function apply(ctx, config = {}) {
  const sessionsRoot =
    typeof config.sessionsRoot === "string" && config.sessionsRoot.trim()
      ? config.sessionsRoot.trim()
      : path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "sessions");
  const cacheFile =
    typeof config.cacheFile === "string" && config.cacheFile.trim()
      ? config.cacheFile.trim()
      : path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "usage-stats", "cache.json");

  let aggregate = null; // 聚合结果（进程内）
  let building = null; // 并发去重

  // ── 多帧 zstd 解压 ──────────────────────────────────────────────────────
  function decompressMultiFrame(buf) {
    const frames = [];
    let i = 0;
    while ((i = buf.indexOf(ZSTD_MAGIC, i)) >= 0) {
      frames.push(i);
      i += 4;
    }
    if (frames.length === 0) throw new Error("not a zstd file");
    frames.push(buf.length);
    const parts = [];
    for (let k = 0; k < frames.length - 1; k += 1) {
      try {
        parts.push(zlib.zstdDecompressSync(buf.subarray(frames[k], frames[k + 1])));
      } catch {
        // 尾部残帧/坏帧忽略（写入中断的最后一段）
      }
    }
    return Buffer.concat(parts).toString("utf8");
  }

  // ── 单会话聚合 ─────────────────────────────────────────────────────────
  function aggregateSession(text) {
    const days = new Map(); // 'YYYY-MM-DD' -> { tokens, byModel: Map }
    let firstTime = 0;
    let lastTime = 0;
    let activeMs = 0; // 活跃时长：相邻事件间隔超过 10 分钟按 10 分钟计，避免挂机跨天被算成连续聊天
    let prevTime = 0;
    let requests = 0;
    let currentModel = null;
    for (const line of text.split("\n")) {
      if (!line || line.length < 2) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      const t = typeof ev.time === "number" ? ev.time : 0;
      if (t) {
        if (!firstTime) firstTime = t;
        if (prevTime && t > prevTime) activeMs += Math.min(t - prevTime, 10 * 60_000);
        prevTime = t;
        lastTime = t;
      }
      if (ev.type === "request/header") {
        const model = ev.data?.header?.config?.model;
        if (model) currentModel = model;
      } else if (ev.type === "assistant/message") {
        const usage = ev.data?.usage;
        if (!usage || typeof usage.totalTokens !== "number") continue;
        requests += 1;
        const model = currentModel ?? "(unknown)";
        const day = dayKeyOf(t || lastTime || Date.now());
        let d = days.get(day);
        if (!d) {
          d = { tokens: 0, byModel: {} };
          days.set(day, d);
        }
        d.tokens += usage.totalTokens;
        d.byModel[model] = (d.byModel[model] ?? 0) + usage.totalTokens;
      }
    }
    return { days: Object.fromEntries(days), firstTime, lastTime, requests, activeMs };
  }

  function dayKeyOf(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ── 全量扫描 + 增量缓存 ────────────────────────────────────────────────
  async function buildAggregate() {
    const cache = await readCache();
    const sessions = {};
    let files = [];
    async function walk(dir) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.isFile() && e.name.endsWith(".jsonl.zstd")) files.push(p);
      }
    }
    await walk(sessionsRoot);

    let cacheDirty = false;
    for (const file of files) {
      let stat;
      try {
        stat = await fs.stat(file);
      } catch {
        continue;
      }
      const sig = `${stat.mtimeMs}:${stat.size}`;
      const hit = cache.sessions[file];
      if (hit && hit.sig === sig) {
        sessions[file] = hit.agg;
        continue;
      }
      let text;
      try {
        text = decompressMultiFrame(await fs.readFile(file));
      } catch (error) {
        console.warn(`${LOG} 跳过无法解压的会话 ${path.basename(file)}: ${error.message}`);
        continue;
      }
      const agg = aggregateSession(text);
      sessions[file] = agg;
      cache.sessions[file] = { sig, agg };
      cacheDirty = true;
    }
    // 清掉已消失的会话
    const fileSet = new Set(files);
    for (const key of Object.keys(cache.sessions)) {
      if (!fileSet.has(key)) {
        delete cache.sessions[key];
        cacheDirty = true;
      }
    }
    if (cacheDirty) {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, JSON.stringify({ ...cache, version: 2 }), "utf8").catch(() => {});
    }

    // 汇总
    const daily = new Map(); // day -> { tokens, byModel:{} }
    let longestChatMs = 0;
    for (const agg of Object.values(sessions)) {
      for (const [day, d] of Object.entries(agg.days)) {
        let e = daily.get(day);
        if (!e) {
          e = { tokens: 0, byModel: {} };
          daily.set(day, e);
        }
        e.tokens += d.tokens;
        for (const [m, v] of Object.entries(d.byModel)) e.byModel[m] = (e.byModel[m] ?? 0) + v;
      }
      const span = agg.activeMs ?? 0;
      if (span > longestChatMs) longestChatMs = span;
    }
    return { daily: Object.fromEntries(daily), longestChatMs, sessionCount: files.length, builtAt: Date.now() };
  }

  async function readCache() {
    try {
      const raw = JSON.parse(await fs.readFile(cacheFile, "utf8"));
      if (raw && typeof raw === "object" && raw.version === 2 && raw.sessions) return raw;
    } catch {}
    return { version: 2, sessions: {} };
  }

  async function getAggregate() {
    building ??= buildAggregate().finally(() => {
      building = null;
    });
    return building;
  }

  // ── 视图组装 ───────────────────────────────────────────────────────────
  function dayList(daysBack) {
    const list = [];
    const now = new Date();
    for (let i = daysBack - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return list;
  }

  function streaks(daily) {
    const days = Object.keys(daily).filter((k) => daily[k].tokens > 0).sort();
    let cur = 0;
    let best = 0;
    let prev = null;
    const todayKey = dayKeyOf(Date.now());
    for (const day of days) {
      if (prev && nextDay(prev) === day) cur += 1;
      else cur = 1;
      best = Math.max(best, cur);
      prev = day;
    }
    // 当前连续：从今天（或昨天）往回数
    let current = 0;
    let probe = new Date();
    if (!daily[dayKeyOf(probe.getTime())]) probe = new Date(probe.getTime() - 86400000);
    while (daily[dayKeyOf(probe.getTime())]?.tokens > 0) {
      current += 1;
      probe = new Date(probe.getTime() - 86400000);
    }
    return { current, best, hasToday: days.includes(todayKey) };
  }

  function nextDay(day) {
    const [y, m, d] = day.split("-").map(Number);
    const t = new Date(y, m - 1, d + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }

  async function summary(range) {
    const agg = await getAggregate();
    const daily = agg.daily;
    const allDays = Object.keys(daily);
    const totalTokens = allDays.reduce((s, d) => s + daily[d].tokens, 0);
    const peakDay = allDays.reduce((best, d) => (daily[d].tokens > (daily[best]?.tokens ?? 0) ? d : best), allDays[0] ?? "");
    const { current, best } = streaks(daily);

    // 热力图：过去 365 天
    const heatDays = dayList(365).map((day) => ({ day, tokens: daily[day]?.tokens ?? 0 }));

    // 趋势 + 环形：range 天
    const rangeDays = dayList(range);
    const byModel = new Map();
    for (const day of rangeDays) {
      for (const [m, v] of Object.entries(daily[day]?.byModel ?? {})) {
        byModel.set(m, (byModel.get(m) ?? 0) + v);
      }
    }
    const models = [...byModel.entries()].sort((a, b) => b[1] - a[1]).map(([name, tokens]) => ({ name, tokens }));
    const rangeTotal = models.reduce((s, m) => s + m.tokens, 0);
    const donut = models.map((m) => ({ ...m, pct: rangeTotal ? (m.tokens / rangeTotal) * 100 : 0 }));
    const trend = {
      days: rangeDays,
      series: models.map((m) => ({
        name: m.name,
        values: rangeDays.map((day) => daily[day]?.byModel?.[m.name] ?? 0),
      })),
    };

    return {
      cards: {
        totalTokens,
        peakDayTokens: peakDay ? daily[peakDay].tokens : 0,
        peakDay,
        longestChatMs: agg.longestChatMs,
        streakCurrent: current,
        streakBest: best,
      },
      heatmap: heatDays,
      trend,
      donut,
      rangeTotal,
      sessionCount: agg.sessionCount,
      generatedAt: Date.now(),
    };
  }

  // ── RPC ────────────────────────────────────────────────────────────────
  ctx.inject(["connection"], (connectionCtx) => {
    const connection = connectionCtx.connection ?? connectionCtx.get?.("connection");
    if (!connection?.fetch?.register) {
      console.warn(`${LOG} connection.fetch 不可用，统计端点未注册`);
      return;
    }
    const reply = (rpcId, result) => Response.json({ type: "server-response", rpcId, result });
    connection.fetch.register({
      path: RPC_PATH,
      methods: ["POST"],
      requestBody: "buffered",
      async fetch(request) {
        if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
        let message;
        try {
          message = await request.json();
        } catch {
          return new Response("body is not JSON", { status: 400 });
        }
        const rpcId = typeof message?.rpcId === "string" ? message.rpcId : "invalid";
        const call = message?.payload;
        try {
          if (call?.method === "usage.summary") {
            const range = call.payload?.range === 30 ? 30 : 7;
            return reply(rpcId, { ok: true, value: await summary(range) });
          }
          if (call?.method === "usage.openSessions") {
            spawn("explorer", [sessionsRoot], { detached: true, stdio: "ignore" }).unref();
            return reply(rpcId, { ok: true, value: { ok: true } });
          }
          return reply(rpcId, { ok: false, error: { code: "usage/bad-method", message: `unknown method: ${call?.method}` } });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          console.warn(`${LOG} ${call?.method} 失败: ${text}`);
          return reply(rpcId, { ok: false, error: { code: "usage/failed", message: text } });
        }
      },
    });
    console.log(`${LOG} 统计端点已注册 ${RPC_PATH}（会话根 ${sessionsRoot}）`);
  });

  console.log(`${LOG} 已激活`);
}
