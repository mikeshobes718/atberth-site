import { get } from "../api.js";
import { h, mount, icon, areaChart, seg, fmtNum, fmtCompact, errorBox, skeleton, toast } from "../ui.js";
import { replace } from "../state.js";

// The pieces of an analytics dashboard, shared by the platform page (admin) and every app's Insights tab:
// metric tiles that compare with the period before, a trend chart, an activation funnel, retention by
// signup week, a when-are-they-here heatmap, and bar lists for the rest.

const NS = "http://www.w3.org/2000/svg";
const DAYS = [["7", "7d"], ["30", "30d"], ["90", "90d"]];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatValue(t) {
  if (t.value === null || t.value === undefined) return "-";
  if (typeof t.value === "string") return t.value;
  const n = Number.isInteger(t.value) ? fmtCompact(t.value) : String(t.value);
  return n + (t.unit || "");
}

function delta(t) {
  if (typeof t.value !== "number" || t.prev === null || t.prev === undefined) return null;
  if (t.prev === 0) return t.value > 0 ? { text: "new", tone: "neutral" } : null;
  const pct = ((t.value - t.prev) / t.prev) * 100;
  if (Math.abs(pct) < 0.5) return { text: "flat", tone: "neutral" };
  const up = pct > 0;
  const good = t.good === "down" ? !up : up;
  const shown = Math.abs(pct) >= 1000 ? Math.round(Math.abs(pct) / 100) * 100 : Math.round(Math.abs(pct));
  return { text: (up ? "↑ " : "↓ ") + shown + "%", tone: good ? "good" : "bad" };
}

function spark(points) {
  if (!points || points.length < 2 || Math.max(...points) === 0) return null;
  const W = 120, H = 28, max = Math.max(...points), min = Math.min(...points);
  const x = (i) => (i / (points.length - 1)) * W;
  const y = (v) => H - 3 - ((v - min) / Math.max(1, max - min)) * (H - 6);
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", `0 0 ${W} ${H}`);
  s.setAttribute("class", "ins-spark");
  s.setAttribute("preserveAspectRatio", "none");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", points.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" "));
  s.append(p);
  return s;
}

export function tiles(list) {
  return h(
    "div.ins-tiles",
    list.map((t) => {
      const d = delta(t);
      return h(
        "div.ins-tile",
        h("div.ins-tile-top", h("span.ins-label", t.label), d ? h("span.ins-delta." + d.tone, d.text) : null),
        h("div.ins-value", formatValue(t)),
        spark(t.spark),
        t.sub ? h("div.ins-sub", t.sub) : null
      );
    })
  );
}

export function barList(rows, { emptyText = "Nothing yet.", right } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.count ?? r.accounts ?? 0));
  if (!rows.length) return h("div.small.dim", { style: { padding: "6px 0" } }, emptyText);
  return h(
    "div.ins-bars",
    rows.map((r) => {
      const n = r.count ?? r.accounts ?? 0;
      return h(
        "div.ins-bar-row",
        h("div.ins-bar-label", r.label, r.detail ? h("span.dim", r.detail) : null),
        h("div.ins-bar-track", h("i", { style: { width: Math.max(2, (n / max) * 100) + "%" } })),
        h("div.ins-bar-n", right ? right(r) : fmtNum(n)),
        h("div.ins-bar-pct", r.pct === null || r.pct === undefined ? "" : Math.round(r.pct) + "%")
      );
    })
  );
}

export function funnel(steps, { emptyText = "No sign-ups in this period yet." } = {}) {
  if (!steps.length || !steps[0].count) return h("div.small.dim", { style: { padding: "6px 0" } }, emptyText);
  return h(
    "div.ins-funnel",
    steps.map((s, i) =>
      h(
        "div.ins-step",
        h("div.ins-step-n", String(i + 1)),
        h(
          "div.ins-step-body",
          h("div.ins-step-top", h("span", s.label), h("span.ins-step-count", fmtNum(s.count), h("span.dim", s.of_first === null ? "" : " " + Math.round(s.of_first) + "%"))),
          h("div.ins-bar-track.funnel", h("i", { style: { width: Math.max(1.5, s.of_first || 0) + "%" } })),
          i && s.of_prev !== null ? h("div.ins-step-note", Math.round(s.of_prev) + "% of the step before") : null
        )
      )
    )
  );
}

export function heatmap(hours, index = 1) {
  // hours: [[iso, count...]]. Binned into weekday x hour of day in the viewer's own time zone.
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const row of hours) {
    const d = new Date(row[0]);
    const wd = (d.getDay() + 6) % 7;
    grid[wd][d.getHours()] += row[index] || 0;
  }
  const max = Math.max(1, ...grid.flat());
  if (max === 1 && grid.flat().every((v) => v === 0)) return h("div.small.dim", { style: { padding: "6px 0" } }, "No activity recorded yet.");
  const cells = [];
  const head = h("div.ins-heat-head", h("span"));
  for (let hr = 0; hr < 24; hr += 6) head.append(h("span", { style: { gridColumn: `${hr + 2} / span 6` } }, String(hr).padStart(2, "0")));
  cells.push(head);
  grid.forEach((row, wd) => {
    const r = h("div.ins-heat-row", h("span.ins-heat-day", WEEKDAYS[wd]));
    row.forEach((v, hr) => r.append(h("i", { style: { opacity: v ? 0.18 + 0.82 * (v / max) : 0.06 }, title: `${WEEKDAYS[wd]} ${String(hr).padStart(2, "0")}:00, ${fmtNum(v)}` })));
    cells.push(r);
  });
  const tz = (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || "";
  return h("div.ins-heat", cells, h("div.ins-heat-foot", h("span", "Less"), h("span.ins-heat-scale"), h("span", "More"), h("span.spacer"), h("span", "Last 28 days" + (tz ? ", " + tz : ""))));
}

export function cohortTable(data, noun = "users") {
  const rows = (data && data.rows) || [];
  if (!rows.length) return h("div.small.dim", { style: { padding: "6px 0" } }, "Retention appears once people have signed up.");
  const cell = (v) => h("td.ins-cell", v === null || v === undefined ? { class: "empty" } : { style: { background: `color-mix(in srgb, var(--accent) ${Math.round(6 + (v / 100) * 62)}%, transparent)` } }, v === null || v === undefined ? "" : Math.round(v) + "%");
  return h(
    "div.tbl-wrap",
    h(
      "table.tbl.ins-cohort",
      h("thead", h("tr", h("th", "Week of"), h("th.num", noun[0].toUpperCase() + noun.slice(1)), Array.from({ length: 9 }, (_, i) => h("th.num", "W" + i)), h("th.num.split", "D1+"), h("th.num", "D7+"), h("th.num", "D30+"))),
      h(
        "tbody",
        rows.map((r) =>
          h("tr", h("td.mono.small", r.week), h("td.num", fmtNum(r.users)), r.weeks.map(cell), h("td.num.split", r.d1 === null ? "-" : Math.round(r.d1) + "%"), h("td.num", r.d7 === null ? "-" : Math.round(r.d7) + "%"), h("td.num", r.d30 === null ? "-" : Math.round(r.d30) + "%"))
        )
      )
    )
  );
}

export function stackBar(rows) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!total) return null;
  return h(
    "div.ins-stack",
    h("div.ins-stackbar", rows.map((r, i) => h("i", { class: "c" + (i % 5), style: { width: (r.count / total) * 100 + "%" }, title: `${r.label}: ${r.count}` }))),
    h("div.ins-stacklegend", rows.map((r, i) => h("span", h("b", { class: "c" + (i % 5) }), `${r.label} ${Math.round((r.count / total) * 100)}%`)))
  );
}

export function card(title, sub, ...body) {
  return h("section.card.ins-card", h("div.card-h", h("div", h("h2", title), sub ? h("div.sub", sub) : null)), h("div.card-b", body));
}

export function trend(series, tabs, { noun = "Total" } = {}) {
  let metric = tabs[0][0];
  const box = h("div", { style: { height: "240px" } });
  const total = h("span.num");
  const draw = () => {
    const sum = series.reduce((s, d) => s + (d[metric] || 0), 0);
    total.textContent = fmtNum(sum);
    const label = (d) => d.slice(5).replace("-", "/");
    mount(box, areaChart(series.map((d) => ({ v: d[metric] || 0, label: label(d.day), full: d.day })), { label: metric }));
  };
  const c = h("section.card.ins-card", h("div.card-h", h("div", h("h2", "Over time"), h("div.sub", total, " in this period")), seg(tabs, metric, (v) => ((metric = v), draw()))), h("div.card-b", box));
  requestAnimationFrame(draw);
  return c;
}

export async function insightsPage(ctx, { eyebrow, title, lede, endpoint, build }) {
  const page = h("div.page");
  ctx.root.append(page);
  let days = ["7", "30", "90"].includes(ctx.query.days) ? ctx.query.days : "30";
  const body = h("div.stack", { style: { gap: "16px" } });
  const stamp = h("span.dim.small");
  const range = seg(DAYS, days, (v) => {
    days = v;
    replace(location.hash.replace(/^#/, "").split("?")[0] + "?days=" + v);
    load();
  });
  const refresh = h("button.btn.ghost.icon", { type: "button", title: "Refresh", "aria-label": "Refresh" }, icon("refresh"));
  refresh.onclick = () => load(true);
  mount(page, h("div.ph", h("div", eyebrow ? h("div.eyebrow", eyebrow) : null, h("h1", title), h("p", lede)), h("div.ph-actions", stamp, range, refresh)), body);

  async function load(manual) {
    mount(body, skeleton(3, 120));
    let data;
    try {
      data = await get(endpoint + "?days=" + days);
    } catch (e) {
      if (!ctx.alive()) return;
      return mount(body, errorBox(e, () => load()));
    }
    if (!ctx.alive()) return;
    mount(body, build(data));
    stamp.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " · " + data.range.start + " to " + data.range.end + " UTC";
    if (manual) toast("Refreshed.");
  }
  await load();
}
