import { get, enc } from "../api.js";
import { h, mount, icon, seg, input, empty, errorBox, loading, badge, fmtNum, fmtDateTime, toggle, copyBtn } from "../ui.js";

export default async function logs(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug) + "/logs";
  const page = h("div.page");
  ctx.root.append(page);
  let status = "";
  let rows = [];
  let timer = null;
  ctx.onCleanup(() => clearInterval(timer));
  const list = h("div.card");
  const q = input({ type: "search", placeholder: "Filter by path or request id", "aria-label": "Filter logs" });
  const summary = h("div.row.small.dim");
  const auto = toggle(false, (v) => {
    clearInterval(timer);
    timer = v ? setInterval(load, 5000) : null;
  }, "Live tail");
  q.addEventListener("input", () => draw());
  mount(
    page,
    h("div.ph", h("div", h("h1", "Logs"), h("p", "Every API request to ", h("b", slug), " for the last 7 days, newest first."))),
    h(
      "div.row.wrap",
      { style: { marginBottom: "14px", gap: "10px" } },
      seg([["", "All"], ["2xx", "2xx"], ["4xx", "4xx"], ["5xx", "5xx"]], status, (v) => ((status = v), load())),
      h("div.search", { style: { width: "300px", maxWidth: "100%" } }, icon("search"), q),
      h("span.spacer"),
      h("label.check-row.small", auto, "Live tail"),
      h("button.btn.sm", { type: "button", onclick: () => load() }, icon("refresh", "i-sm"), "Refresh")
    ),
    summary,
    list
  );
  summary.style.marginBottom = "10px";

  async function load() {
    if (!rows.length) mount(list, loading());
    try {
      rows = (await get(base + "?limit=500" + (status ? "&status=" + status : ""))).logs || [];
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    if (!ctx.alive()) return;
    draw();
  }

  function draw() {
    const term = q.value.trim().toLowerCase();
    const shown = rows.filter((l) => !term || l.path.toLowerCase().includes(term) || (l.request_id || "").toLowerCase().includes(term));
    const errs = rows.filter((l) => l.status >= 500).length;
    const avg = rows.length ? Math.round(rows.reduce((s, l) => s + l.duration_ms, 0) / rows.length) : 0;
    mount(summary, h("span", fmtNum(shown.length) + " requests"), h("span", "·"), h("span", "avg " + avg + " ms"), errs ? [h("span", "·"), h("span.bad-text", fmtNum(errs) + " server errors")] : null);
    if (!shown.length) {
      mount(list, empty({ icon: "logs", title: "No requests", text: status || term ? "Nothing matches these filters." : "Requests to this app show up here." }));
      return;
    }
    mount(
      list,
      h(
        "div.tbl-wrap",
        { style: { maxHeight: "calc(100vh - 290px)" } },
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "Time"), h("th", "Status"), h("th", "Method"), h("th", "Path"), h("th", "Key"), h("th.r", "Duration"), h("th", "Request id"))),
          h(
            "tbody",
            shown.map((l) =>
              h(
                "tr",
                h("td.dim.small.num", { style: { whiteSpace: "nowrap" } }, fmtDateTime(l.created_at)),
                h("td", h("span.st.s" + String(l.status)[0], String(l.status))),
                h("td", h("span.method." + l.method, l.method)),
                h("td.mono.small.trunc", { title: l.path, style: { maxWidth: "440px" } }, l.path.replace("/v1/apps/" + slug, "") || "/"),
                h("td", l.key_type ? badge(l.key_type) : h("span.dim", "none")),
                h("td.r.num" + (l.duration_ms > 1000 ? ".bad-text" : ".dim"), fmtNum(l.duration_ms) + " ms"),
                h("td", h("div.row", { style: { gap: "2px" } }, h("span.mono.tiny.dim", l.request_id), copyBtn(l.request_id)))
              )
            )
          )
        )
      )
    );
  }

  load();
}
