import { h, fmtNum } from "../ui.js";
import { enc } from "../api.js";
import { insightsPage, tiles, trend, funnel, heatmap, cohortTable, barList, stackBar, card } from "./insights-kit.js";

// Analytics for one app's own users, on every Berth app with no code: sign-ups, who is active,
// whether they come back, what they sign in with, and what they use.
export default async function appInsights(ctx) {
  return insightsPage(ctx, {
    title: "Insights",
    lede: "How people use " + ctx.slug + ": who signs up, who comes back, and on what. Compared with the period before. Activity counts each sign-in and token refresh.",
    endpoint: "/apps/" + enc(ctx.slug) + "/insights",
    build: (d) => {
      const dist = (title, rows) => h("div", h("h3.ins-h3", title), rows.length ? [stackBar(rows), barList(rows)] : h("div.small.dim", "Nothing yet."));
      const profile = d.profile.map((p) => card(p.field, `From your users' profile data. ${fmtNum(p.known)} users have it.`, stackBar(p.values), barList(p.values)));
      return [
        tiles(d.tiles),
        trend(d.series, [["signups", "Sign-ups"], ["active", "Active users"], ["requests", "Requests"], ["rows_written", "Rows written"], ["function_invocations", "Function runs"], ["storage_uploads", "Uploads"]]),
        h("div.ins-two", card("Activation", "New users in this period, and how many became regulars.", funnel(d.funnel)),
          card("When people are here", "Sign-ins and refreshes by weekday and hour.", heatmap(d.hours, 1))),
        card("Retention by sign-up week", "W0 is the rest of the sign-up week, W1 the week after, and so on: the share of that week's sign-ups who were active. D1+, D7+ and D30+ ask whether they came back on that day or any day after it.", cohortTable(d.cohorts, "users")),
        h("div.ins-two", card("How they sign in", "", dist("Method", d.signin)), card("Where they are", "From each user's most recent session.", dist("Platform", d.platforms), dist("App or browser", d.clients))),
        ...profile,
      ];
    },
  });
}
