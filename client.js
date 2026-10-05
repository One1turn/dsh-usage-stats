/**
 * dsh-usage-stats 设置页（Client 半边）——版式对齐 ZCode「使用统计 / 应用用量」页：
 *   大标题 + 应用用量徽标 → 5 指标卡 → Token 活动热力图（每日/每周/累计）→
 *   时间范围（近7日/近30日）→ 每日 Token 趋势图（多模型平滑曲线 + 悬浮提示）→
 *   模型用量环形图 + 图例 → 右下刷新。
 * 全部手绘 SVG，无图表依赖；样式只用 --dsw-* 主题 token；图标为内联 SVG（无 emoji）。
 */
window.__ModuleLoader__.load({
  id: "@local/dsh-usage-stats",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo, useRef } = React;

    const STYLES = `
.dshus-wrap { display: flex; flex-direction: column; gap: 16px; width: 100%; min-width: 0; color: var(--dsw-alias-label-primary); }
.dshus-headrow { display: flex; align-items: center; gap: 12px; }
.dshus-title { font-size: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 0; }
.dshus-badge { font-size: 12px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 3px 10px; background: var(--dsw-alias-bg-layer-1); }
.dshus-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2)); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); padding: 16px 8px; }
.dshus-card-cell { min-width: 0; text-align: center; padding: 2px 4px; }
.dshus-card-cell + .dshus-card-cell { border-left: 1px solid var(--dsw-alias-border-l2); }
.dshus-card-num { font-size: 17px; font-weight: 700; color: var(--dsw-alias-label-primary); white-space: nowrap; }
.dshus-card-label { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-top: 4px; white-space: nowrap; }
.dshus-panel { border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2)); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); padding: 16px 18px; }
.dshus-panelhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.dshus-paneltitle { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dshus-seg { display: flex; background: var(--dsw-alias-bg-layer-3); border-radius: 999px; padding: 3px; gap: 2px; }
.dshus-seg-item { border: none; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 4px 12px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.dshus-seg-item[data-active="true"] { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.dshus-rangelabel { font-size: 14px; color: var(--dsw-alias-label-primary); }
.dshus-heat { width: 100%; }
.dshus-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 8px; }
.dshus-legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
.dshus-trendbox { position: relative; }
.dshus-tip { position: absolute; pointer-events: none; background: var(--dsw-alias-bg-layer-3); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 8px 10px; font-size: 12px; color: var(--dsw-alias-label-primary); box-shadow: 0 6px 18px rgba(0,0,0,.4); z-index: 20; min-width: 180px; }
.dshus-tip-title { font-weight: 600; margin-bottom: 6px; }
.dshus-tip-row { display: flex; justify-content: space-between; gap: 12px; line-height: 1.7; }
.dshus-tip-name { color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.dshus-donutrow { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.dshus-donut-legend { flex: 1 1 220px; min-width: 200px; }
.dshus-dl-row { display: flex; align-items: baseline; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); font-size: 13px; }
.dshus-dl-row:last-child { border-bottom: none; }
.dshus-dl-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; align-self: center; }
.dshus-dl-name { font-weight: 600; color: var(--dsw-alias-label-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dshus-dl-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.dshus-dl-pct { margin-left: auto; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dshus-foot { display: flex; justify-content: flex-end; }
.dshus-refreshbtn { display: flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 10px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
.dshus-refreshbtn:hover { background: var(--dsw-alias-bg-layer-2); }
.dshus-empty { padding: 30px 0; text-align: center; color: var(--dsw-alias-label-dimmed); font-size: 13px; }
.dshus-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
`;

    const PALETTE = ["#3B82F6", "#22C55E", "#8B5CF6", "#EF4444", "#F97316", "#14B8A6", "#EAB308", "#EC4899", "#6366F1", "#84CC16", "#F472B6", "#0EA5E9"];

    const svgProps = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
    const IconRefresh = () => h("svg", svgProps, h("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }), h("path", { d: "M21 3v6h-6" }));

    /** 中文数量级格式化：41.4亿 / 7445万 / 6317 */
    function fmtTokens(v) {
      if (!Number.isFinite(v)) return "0";
      if (v >= 1e8) return `${trimZeros((v / 1e8).toFixed(v / 1e8 >= 10 ? 1 : 2))}亿`;
      if (v >= 1e4) return `${trimZeros((v / 1e4).toFixed(v / 1e4 >= 100 ? 0 : 1))}万`;
      return String(Math.round(v));
    }
    function trimZeros(s) {
      return s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
    }
    function fmtDuration(ms) {
      const min = Math.round(ms / 60000);
      if (min < 1) return "不到 1 分钟";
      const h = Math.floor(min / 60);
      const m = min % 60;
      return h ? `${h}小时${m}分` : `${m} 分钟`;
    }
    function dayLabelCN(day) {
      const [, m, d] = day.split("-").map(Number);
      return `${m}月${d}日`;
    }

    // ── 指标卡 ─────────────────────────────────────────────────────────────
    function Cards({ data }) {
      const c = data.cards;
      const cells = [
        [fmtTokens(c.totalTokens), "累计 Token 数"],
        [fmtTokens(c.peakDayTokens), "峰值 Token 数"],
        [fmtDuration(c.longestChatMs), "最长聊天时长"],
        [`${c.streakCurrent} 天`, "当前连续天数"],
        [`${c.streakBest} 天`, "最长连续天数"],
      ];
      return h("div", { className: "dshus-cards" },
        cells.map(([num, label]) => h("div", { key: label, className: "dshus-card-cell" },
          h("div", { className: "dshus-card-num" }, num),
          h("div", { className: "dshus-card-label" }, label),
        )),
      );
    }

    // ── 热力图 ─────────────────────────────────────────────────────────────
    function Heatmap({ data, mode }) {
      const days = data.heatmap; // [{day, tokens}] 365 天升序
      if (!days?.length) return h("div", { className: "dshus-empty" }, "暂无数据");
      // 列 = 周（对齐到周日开头），行 = 周日..周六
      const cols = [];
      let col = null;
      for (const item of days) {
        const [y, m, d] = item.day.split("-").map(Number);
        const dow = new Date(y, m - 1, d).getDay();
        if (dow === 0 || !col) {
          col = { days: Array(7).fill(null), month: m };
          cols.push(col);
        }
        col.days[dow] = item;
      }
      const values = days.map((x) => (mode === "cum" ? null : x.tokens));
      if (mode === "cum") {
        let acc = 0;
        for (const x of days) { acc += x.tokens; x._acc = acc; }
      }
      const maxDaily = Math.max(...days.map((x) => x.tokens), 1);
      const maxWeek = Math.max(...cols.map((c) => c.days.reduce((s, x) => s + (x?.tokens ?? 0), 0)), 1);
      const maxCum = Math.max(...days.map((x) => x._acc ?? 0), 1);
      const levelOf = (v, max) => (v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / max) * 4))));
      const cellColor = (v, max) => {
        if (v == null) return "transparent";
        const lv = levelOf(v, max);
        return lv === 0 ? "var(--dsw-alias-bg-layer-3)" : `rgba(59,130,246,${[0, 0.28, 0.5, 0.75, 1][lv]})`;
      };
      const CELL = 10, GAP = 3, TOP = 0;
      const width = cols.length * (CELL + GAP) + 8;
      const height = 7 * (CELL + GAP) + 22;
      // 月份标签：当某列第一天的月份与前列不同
      const monthLabels = [];
      cols.forEach((c, ci) => {
        const first = c.days.find((x) => x);
        if (!first) return;
        const m = Number(first.day.split("-")[1]);
        if (ci === 0 || m !== Number((cols[ci - 1].days.find((x) => x) || { day: "0" }).day.split("-")[1])) {
          monthLabels.push({ ci, label: `${m}月` });
        }
      });
      const title = (x) => mode === "cum"
        ? `${x.day} 累计 ${fmtTokens(x._acc ?? 0)} tokens`
        : `${x.day} ${fmtTokens(x.tokens)} tokens`;
      return h("div", { className: "dshus-heat" },
        h("svg", { width: "100%", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "xMinYMin meet", style: { display: "block" } },
          h("g", null,
            cols.map((c, ci) =>
              c.days.map((x, ri) => {
                if (!x) return null;
                let v = x.tokens;
                if (mode === "cum") v = x._acc ?? 0;
                if (mode === "week") return null;
                return h("rect", {
                  key: `${ci}-${ri}`,
                  x: ci * (CELL + GAP), y: TOP + ri * (CELL + GAP),
                  width: CELL, height: CELL, rx: 2.5,
                  fill: cellColor(mode === "cum" ? v : v, mode === "cum" ? maxCum : maxDaily),
                }, h("title", null, title(x)));
              }),
            ),
            // 每周模式：每列一格
            cols.map((c, ci) => {
              if (mode !== "week") return null;
              const v = c.days.reduce((s, x) => s + (x?.tokens ?? 0), 0);
              return h("rect", {
                key: `w-${ci}`,
                x: ci * (CELL + GAP), y: TOP + 2 * (CELL + GAP),
                width: CELL, height: CELL, rx: 2.5,
                fill: cellColor(v, maxWeek),
              }, h("title", null, `${c.days.find((x) => x)?.day ?? ""} 当周 ${fmtTokens(v)} tokens`));
            }),
          ),
          h("g", null,
            monthLabels.map(({ ci, label }) => h("text", {
              key: label + ci,
              x: ci * (CELL + GAP), y: height - 6,
              fontSize: 9, fill: "var(--dsw-alias-label-tertiary)",
            }, label)),
          ),
        ),
      );
    }

    // ── 趋势图 ─────────────────────────────────────────────────────────────
    function smoothPath(pts) {
      if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += `C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
      }
      return d;
    }

    function Trend({ data, range }) {
      const [hover, setHover] = useState(null); // day index
      const boxRef = useRef(null);
      const W = 1000, H = 320, PAD_L = 46, PAD_R = 16, PAD_T = 14, PAD_B = 28;
      const days = data.trend.days;
      const series = data.trend.series;
      const max = Math.max(...series.flatMap((s) => s.values), 1);
      const iw = W - PAD_L - PAD_R;
      const ih = H - PAD_T - PAD_B;
      const xAt = (i) => PAD_L + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
      const yAt = (v) => PAD_T + ih - (v / max) * ih;
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, y: yAt(max * f) }));
      const xLabelEvery = Math.max(1, Math.ceil(days.length / 7));

      const onMove = useCallback((e) => {
        const rect = boxRef.current?.getBoundingClientRect();
        if (!rect) return;
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const i = Math.round(((px - PAD_L) / iw) * (days.length - 1));
        setHover(Math.max(0, Math.min(days.length - 1, i)));
      }, [days.length, iw]);

      const tipDay = hover != null ? days[hover] : null;
      const tipRows = hover != null
        ? series.map((s, si) => ({ name: s.name, color: PALETTE[si % PALETTE.length], v: s.values[hover] }))
            .filter((r) => r.v > 0).sort((a, b) => b.v - a.v)
        : [];
      const tipTotal = tipRows.reduce((s, r) => s + r.v, 0);
      const tipLeftPct = hover != null ? (xAt(hover) / W) * 100 : 0;

      return h("div", { className: "dshus-trendbox", ref: boxRef,
          onMouseMove: onMove,
          onMouseLeave: () => setHover(null) },
        h("div", { className: "dshus-legend" },
          series.map((s, si) => h("span", { key: s.name },
            h("span", { className: "dshus-legend-dot", style: { background: PALETTE[si % PALETTE.length] } }),
            s.name,
          )),
        ),
        h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: { display: "block" } },
          ticks.map((t, i) => h("g", { key: i },
            h("line", { x1: PAD_L, y1: t.y, x2: W - PAD_R, y2: t.y, stroke: "var(--dsw-alias-border-l2)", strokeDasharray: "3 5" }),
            h("text", { x: PAD_L - 8, y: t.y + 4, fontSize: 11, fill: "var(--dsw-alias-label-tertiary)", textAnchor: "end" }, fmtTokens(t.v)),
          )),
          hover != null ? h("line", { x1: xAt(hover), y1: PAD_T, x2: xAt(hover), y2: PAD_T + ih, stroke: "var(--dsw-alias-label-tertiary)", strokeOpacity: 0.5 }) : null,
          series.map((s, si) => h("path", {
            key: s.name,
            d: smoothPath(s.values.map((v, i) => [xAt(i), yAt(v)])),
            fill: "none", stroke: PALETTE[si % PALETTE.length], strokeWidth: 2.2, strokeLinecap: "round",
          })),
          hover != null ? series.map((s, si) => h("circle", {
            key: s.name,
            cx: xAt(hover), cy: yAt(s.values[hover]), r: 3.5,
            fill: PALETTE[si % PALETTE.length],
          })) : null,
          days.map((day, i) => (i % xLabelEvery === 0 || i === days.length - 1)
            ? h("text", { key: day, x: xAt(i), y: H - 8, fontSize: 11, fill: "var(--dsw-alias-label-tertiary)", textAnchor: "middle" }, dayLabelCN(day))
            : null),
        ),
        hover != null ? h("div", {
            className: "dshus-tip",
            style: {
              left: `${Math.min(Math.max(tipLeftPct, 2), 72)}%`,
              top: 30,
            },
          },
          h("div", { className: "dshus-tip-title" }, `${dayLabelCN(tipDay)} - ${fmtTokens(tipTotal)} tokens`),
          tipRows.map((r) => h("div", { key: r.name, className: "dshus-tip-row" },
            h("span", null, h("span", { className: "dshus-legend-dot", style: { background: r.color } }), h("span", { className: "dshus-tip-name" }, r.name)),
            h("span", null, `${fmtTokens(r.v)} tokens`),
          )),
        ) : null,
      );
    }

    // ── 环形图 ─────────────────────────────────────────────────────────────
    function Donut({ data }) {
      const [hover, setHover] = useState(null);
      const boxRef = useRef(null);
      const items = data.donut.filter((x) => x.tokens > 0);
      const total = data.rangeTotal;
      const R = 74, C = 2 * Math.PI * R;
      let accF = 0;
      const segs = items.map((x, i) => {
        const frac = total ? x.tokens / total : 0;
        const seg = { ...x, color: PALETTE[i % PALETTE.length], dash: frac * C, offset: accF * C, frac };
        accF += frac;
        return seg;
      });
      const onMove = useCallback((e) => {
        const rect = boxRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left - 95;
        const y = e.clientY - rect.top - 95;
        const dist = Math.hypot(x, y);
        if (dist < R - 16 || dist > R + 16) { setHover(null); return; }
        let ang = Math.atan2(y, x) + Math.PI / 2;
        if (ang < 0) ang += Math.PI * 2;
        const frac = ang / (Math.PI * 2);
        let acc = 0; let idx = null;
        for (let i = 0; i < segs.length; i += 1) {
          if (frac >= acc && frac < acc + segs[i].frac) { idx = i; break; }
          acc += segs[i].frac;
        }
        setHover(idx);
      }, [segs]);
      if (!items.length || !total) return h('div', { className: 'dshus-empty' }, '所选范围内暂无用量');
      return h('div', { className: 'dshus-donutrow' },
        h('div', { ref: boxRef, style: { position: 'relative', flex: '0 0 auto' }, onMouseMove: onMove, onMouseLeave: () => setHover(null) },
          h('svg', { width: 190, height: 190, viewBox: '0 0 190 190' },
            h('g', { transform: 'rotate(-90 95 95)' },
              segs.map((sg, i) => h('circle', {
                key: sg.name + i,
                cx: 95, cy: 95, r: R, fill: 'none',
                stroke: sg.color, strokeWidth: hover === i ? 30 : 26,
                strokeDasharray: `${Math.max(0, sg.dash - 2)} ${C - Math.max(0, sg.dash - 2)}`,
                strokeDashoffset: -sg.offset,
                style: { transition: 'stroke-width .12s ease', cursor: 'pointer', opacity: hover == null || hover === i ? 1 : 0.55 },
              })),
            ),
            h('text', { x: 95, y: 92, textAnchor: 'middle', fontSize: 20, fontWeight: 700, fill: 'var(--dsw-alias-label-primary)' }, fmtTokens(total)),
            h('text', { x: 95, y: 112, textAnchor: 'middle', fontSize: 12, fill: 'var(--dsw-alias-label-tertiary)' }, 'tokens'),
          ),
          hover != null ? h('div', { className: 'dshus-tip', style: { left: '50%', top: 8, transform: 'translateX(-50%)', minWidth: 170 } },
            h('div', { className: 'dshus-tip-title' },
              h('span', { className: 'dshus-legend-dot', style: { background: segs[hover].color, marginRight: 6 } }),
              segs[hover].name,
            ),
            h('div', { className: 'dshus-tip-row' },
              h('span', { className: 'dshus-tip-name' }, 'tokens'),
              h('span', null, fmtTokens(segs[hover].tokens)),
            ),
            h('div', { className: 'dshus-tip-row' },
              h('span', { className: 'dshus-tip-name' }, '占比'),
              h('span', null, `${segs[hover].pct.toFixed(1)}%`),
            ),
          ) : null,
        ),
        h('div', { className: 'dshus-donut-legend' },
          data.donut.map((x, i) => h('div', { key: x.name, className: 'dshus-dl-row', style: { opacity: hover == null || hover === i ? 1 : 0.5, cursor: 'pointer' },
              onMouseEnter: () => setHover(items.findIndex((it) => it.name === x.name)),
              onMouseLeave: () => setHover(null) },
            h('span', { className: 'dshus-dl-dot', style: { background: PALETTE[i % PALETTE.length] } }),
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'dshus-dl-name' }, x.name),
              h('div', { className: 'dshus-dl-sub' }, `${fmtTokens(x.tokens)} tokens`),
            ),
            h('span', { className: 'dshus-dl-pct' }, `${x.pct.toFixed(1)}%`),
          )),
        ),
      );
    }

    function Seg({ options, value, onChange }) {
      return h("div", { className: "dshus-seg" },
        options.map(([key, label]) => h("button", {
          key: key,
          type: "button",
          className: "dshus-seg-item",
          "data-active": value === key ? "true" : "false",
          onClick: () => onChange(key),
        }, label)),
      );
    }

    function UsagePage({ rpcCall }) {
      const [data, setData] = useState(null);
      const [range, setRange] = useState(7);
      const [heatMode, setHeatMode] = useState("day");
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);

      const call = useCallback(async (method, payload) => {
        const raw = await rpcCall(method, payload);
        if (raw && raw.ok === false) throw new Error(raw.error?.message || "统计请求失败");
        return raw && raw.ok === true ? raw.value : raw;
      }, [rpcCall]);

      const load = useCallback(async (r) => {
        setLoading(true);
        setError(null);
        try {
          setData(await call("usage.summary", { range: r }));
        } catch (e) {
          setError(e?.message ?? String(e));
        } finally {
          setLoading(false);
        }
      }, [call]);

      useEffect(() => { void load(range); }, [load, range]);

      return h("div", { className: "dshus-wrap" },
        h("div", { className: "dshus-headrow" },
          h("h2", { className: "dshus-title" }, "使用统计"),
          h("span", { className: "dshus-badge" }, "应用用量"),
        ),
        error ? h("div", { className: "dshus-error" }, error) : null,
        data ? h(Cards, { data }) : h("div", { className: "dshus-panel" }, h("div", { className: "dshus-empty" }, loading ? "加载中…" : "暂无数据")),
        h("div", { className: "dshus-panel" },
          h("div", { className: "dshus-panelhead" },
            h("span", { className: "dshus-paneltitle" }, "Token 活动"),
            h(Seg, { options: [["day", "每日"], ["week", "每周"], ["cum", "累计"]], value: heatMode, onChange: setHeatMode }),
          ),
          data ? h(Heatmap, { data, mode: heatMode }) : null,
        ),
        h("div", { className: "dshus-panelhead", style: { marginBottom: 0 } },
          h("span", { className: "dshus-rangelabel" }, "时间范围"),
          h(Seg, { options: [[7, "近 7 日"], [30, "近 30 日"]], value: range, onChange: setRange }),
        ),
        h("div", { className: "dshus-panel" },
          h("div", { className: "dshus-panelhead" },
            h("span", { className: "dshus-paneltitle" }, "每日 Token 趋势图"),
          ),
          data ? h(Trend, { data, range }) : null,
        ),
        h("div", { className: "dshus-panel" },
          h("div", { className: "dshus-panelhead" },
            h("span", { className: "dshus-paneltitle" }, "模型用量"),
          ),
          data ? h(Donut, { data }) : null,
        ),
        h("div", { className: "dshus-foot" },
          h("button", { className: "dshus-refreshbtn", onClick: () => void load(range) },
            h(IconRefresh, null), "刷新",
          ),
        ),
      );
    }

    return {
      inject: ["slots", "connection"],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement("style");
          style.textContent = STYLES;
          document.head.appendChild(style);
          return () => style.remove();
        }, "dsh-usage-stats: styles");

        const rpcCall = async (method, payload, signal) => {
          const raw = await ctx.connection.rpc.call("/api", "usage-stats", { method, payload }, signal);
          if (raw && typeof raw === "object" && "ok" in raw) return raw;
          return raw?.result ?? raw;
        };

        ctx.slots.inject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: "usage-stats",
          order: 61,
          label: () => "使用统计",
          inject: () => ({ rpcCall }),
        }, UsagePage));
      },
    };
  },
});
