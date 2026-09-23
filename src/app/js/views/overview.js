import { get, enc } from "../api.js";
import { h, mount, icon, avatar, areaChart, fmtNum, fmtCompact, fmtBytes, fmtDate, meter, seg, codeBlock, copyBtn, errorBox, skeleton, timeEl, badge } from "../ui.js";
import { appPath } from "../state.js";

const METRICS = [
  ["requests", "Requests"],
  ["rows_written", "Row writes"],
  ["function_invocations", "Function runs"],
  ["storage_uploads", "Uploads"],
  ["storage_downloads", "Downloads"],
];

export default async function overview(ctx) {
  const { app, slug } = ctx;
  const base = "/apps/" + enc(slug);
  const page = h("div.page");
  ctx.root.append(page);
  const header = h(
    "div.ph",
    h(
      "div.row",
      { style: { gap: "14px", alignItems: "center" } },
      avatar(slug, "sq"),
      h("div", h("h1", slug), h("p", { style: { marginTop: "2px" } }, h("span.mono.small", "app_" + slug), h("span.dim", " · created " + fmtDate(app.created_at))))
    ),
    h(
      "div.ph-actions",
      h("a.btn", { href: "#" + appPath(slug, "sql") }, icon("sql"), "SQL editor"),
      h("a.btn.primary", { href: "#" + appPath(slug, "tables") }, icon("table"), "Open tables")
    )
  );
  page.append(header, skeleton(4, 80));

  let usage, daily, logs;
  try {
    [usage, daily, logs] = await Promise.all([get(base + "/usage"), get(base + "/usage/daily?days=30"), get(base + "/logs?limit=8")]);
  } catch (e) {
    if (!ctx.alive()) return;
    page.lastChild.replaceWith(errorBox(e, () => location.reload()));
    return;
  }
  if (!ctx.alive()) return;
  const u = usage.usage;
  const lim = usage.limits === "unlimited" ? null : usage.limits;
  const days = daily.days;
  const today = days[days.length - 1] || {};

  const body = h("div.stack", { style: { gap: "20px" } });
  page.lastChild.replaceWith(body);

  const statCard = (label, ic, value, used, max, maxLabel, href) =>
    h(
      href ? "a.stat" : "div.stat",
      href ? { href: "#" + href } : null,
      h("div.stat-label", icon(ic, "i-sm"), label),
      h("div.stat-value", value, max ? h("small", "of " + maxLabel) : null),
      max ? h("div.stat-foot", meter(used, max)) : null
    );

  body.append(
    h(
      "div.stats",
      statCard("Rows", "table", fmtCompact(u.rows), u.rows, lim && lim.rows, lim && fmtCompact(lim.rows), appPath(slug, "tables")),
      statCard("Database", "db", fmtBytes(u.database_bytes), u.database_bytes, lim && lim.database_bytes, lim && fmtBytes(lim.database_bytes)),
      statCard("Storage", "storage", fmtBytes(u.storage_bytes), u.storage_bytes, null, null, appPath(slug, "storage")),
      statCard("Auth users", "users", fmtCompact(u.users), u.users, lim && lim.users, lim && fmtCompact(lim.users), appPath(slug, "users")),
      statCard("Requests today", "overview", fmtCompact(today.requests || 0), 0, null, null, appPath(slug, "logs"))
    )
  );

  let metric = "requests";
  const chartBox = h("div");
  const total = h("span.num");
  const draw = () => {
    total.textContent = fmtNum(days.reduce((s, d) => s + (d[metric] || 0), 0));
    mount(chartBox, areaChart(days.map((d) => ({ v: d[metric] || 0, label: shortDay(d.day), full: shortDay(d.day) })), { label: metric }));
  };
  body.append(
    h(
      "div.grid",
      { style: { gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }, class: "ov-grid" },
      h(
        "section.card",
        h("div.card-h", h("div", h("h2", "Activity"), h("div.sub", total, " in the last 30 days")), seg(METRICS, metric, (v) => ((metric = v), draw()))),
        h("div.card-b", chartBox)
      ),
      h(
        "section.card",
        h("div.card-h", h("h2", "Resources")),
        h(
          "div",
          resRow("table", "Tables", u.tables, appPath(slug, "tables")),
          resRow("fn", "Functions", u.functions, appPath(slug, "functions")),
          resRow("webhook", "Webhooks", u.webhooks, appPath(slug, "webhooks")),
          resRow("storage", "Buckets", u.buckets, appPath(slug, "storage")),
          resRow("file", "Files", u.objects, appPath(slug, "storage")),
          resRow("users", "Auth users", u.users, appPath(slug, "users"))
        )
      )
    )
  );
  draw();

  const snippets = {
    curl: `curl ${app.api_url}/tables/notes/rows \\\n  -H "Authorization: Bearer $BERTH_SECRET_KEY"`,
    js: `const res = await fetch("${app.api_url}/tables/notes/rows?limit=20", {\n  headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + accessToken },\n});\nconst { rows } = await res.json();`,
    cli: `berth use ${slug}\nberth tables list\nberth rows list notes --limit 20`,
  };
  let lang = "curl";
  const snip = h("div");
  const drawSnip = () => mount(snip, codeBlock(snippets[lang]));
  drawSnip();
  body.append(
    h(
      "section.card",
      h("div.card-h", h("div", h("h2", "Connect"), h("div.sub", "Call the API from a server with the secret key, or from an app with the publishable key and a user token.")), seg([["curl", "cURL"], ["js", "JavaScript"], ["cli", "CLI"]], lang, (v) => ((lang = v), drawSnip()))),
      h(
        "div.card-b.stack",
        { style: { gap: "14px" } },
        h("div.field", h("label", "API URL"), h("div.secret", h("span", app.api_url), copyBtn(app.api_url))),
        snip
      ),
      h(
        "div.connect",
        h("a", { href: "#" + appPath(slug, "keys") }, icon("key"), h("b", "API keys"), h("span", "Create and revoke keys")),
        h("a", { href: "#" + appPath(slug, "users") }, icon("users"), h("b", "Auth"), h("span", "Email and password, or codes")),
        h("a", { href: "#" + appPath(slug, "functions") }, icon("fn"), h("b", "Functions"), h("span", "Deno, cron, env vars")),
        h("a", { href: "/docs/", target: "_blank", rel: "noopener" }, icon("book"), h("b", "Docs"), h("span", "Guides and API reference"))
      )
    )
  );

  const rows = logs.logs || [];
  body.append(
    h(
      "section.card",
      h("div.card-h", h("div", h("h2", "Recent requests")), h("a.btn.sm", { href: "#" + appPath(slug, "logs") }, "View all", icon("arrow", "i-sm"))),
      rows.length
        ? h(
            "div.tbl-wrap",
            h(
              "table.tbl",
              h("thead", h("tr", h("th", "Status"), h("th", "Method"), h("th", "Path"), h("th", "Key"), h("th.r", "Time"), h("th.r", "When"))),
              h(
                "tbody",
                rows.map((l) =>
                  h(
                    "tr",
                    h("td", h("span.st.s" + String(l.status)[0], String(l.status))),
                    h("td", h("span.method." + l.method, l.method)),
                    h("td.mono.small.trunc", { title: l.path }, l.path.replace("/v1/apps/" + slug, "")),
                    h("td", l.key_type ? badge(l.key_type) : h("span.dim", "none")),
                    h("td.r.num.dim", l.duration_ms + " ms"),
                    h("td.r.dim", timeEl(l.created_at))
                  )
                )
              )
            )
          )
        : h("div.card-b.dim", "No requests yet.")
    )
  );
}

function resRow(ic, label, n, href) {
  return h("a.list-row", { href: "#" + href, style: { transition: "background .15s" } }, h("span.dim", icon(ic)), h("span", label), h("span.spacer"), h("b.num", fmtNum(n)), icon("chev", "i-sm"));
}

function shortDay(d) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
