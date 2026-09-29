import { h, fmtNum } from "../ui.js";
import { insightsPage, tiles, trend, funnel, heatmap, cohortTable, barList, stackBar, card } from "./insights-kit.js";

// Berth's own product analytics, for the platform admin.
export default async function platformInsights(ctx) {
  return insightsPage(ctx, {
    eyebrow: "platform",
    title: "Platform insights",
    lede: "Who is signing up, whether they get started, whether they come back, and what they use. Compared with the period before. You and your demo account are left out.",
    endpoint: "/admin/insights",
    build: (d) => {
      const sourceTable = d.sources.length
        ? h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", h("th", "Source"), h("th", "Medium"), h("th", "Campaign"), h("th.num", "Signups"), h("th.num", "Paid"))),
            h("tbody", d.sources.map((s) => h("tr", h("td.strong", s.source), h("td", s.medium || "-"), h("td", s.campaign || "-"), h("td.num", fmtNum(s.signups)), h("td.num", fmtNum(s.paid)))))))
        : h("div.small.dim", "No new accounts in this period yet.");
      const topApps = d.top_apps.length
        ? h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", h("th", "App"), h("th", "Owner"), h("th.num", "Requests"))),
            h("tbody", d.top_apps.map((a) => h("tr", h("td.strong.mono", a.slug), h("td.small.dim", a.owner), h("td.num", fmtNum(a.requests)))))))
        : h("div.small.dim", "No traffic in this period yet.");
      const group = (title, rows) => h("div", h("h3.ins-h3", title), rows.length ? [stackBar(rows), barList(rows)] : h("div.small.dim", "Nothing yet."));
      return [
        tiles(d.tiles),
        trend(d.series, [["new_accounts", "New accounts"], ["active", "Active builders"], ["requests", "Requests"], ["rows_written", "Rows written"], ["function_invocations", "Function runs"], ["storage_uploads", "Uploads"]]),
        h("div.ins-two", card("What builders do", "Share of active builders in this period who did each thing.", barList(d.activity, { right: (r) => fmtNum(r.events) + " times" })),
          card("Features in use", "Share of accounts with an app that use each part of Berth. Sign in, realtime and SQL count from when tracking began.", barList(d.adoption))),
        h("div.ins-two", card("Activation", "New accounts in this period, and how far each one got.", funnel(d.funnel)),
          card("When builders are here", "Console, CLI and iPhone app activity by weekday and hour.", heatmap(d.hours, 1))),
        card("Retention by sign-up week", "W0 is the rest of the sign-up week, W1 the week after, and so on: the share of that week's sign-ups who were active. D1+, D7+ and D30+ ask whether they came back on that day or any day after it.", cohortTable(d.cohorts, "accounts")),
        h("div.ins-two", card("Where they come from", "New accounts in this period, credited to the first link or site that brought them.", sourceTable),
          card("How they build", "", group("Tool used", d.clients), group("Signed up with", d.signin), group("Plans", d.plans))),
        card("Busiest apps", "By API requests in this period, across every app on Berth.", topApps),
      ];
    },
  });
}
