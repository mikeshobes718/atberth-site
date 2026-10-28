import { get, enc } from "../api.js";
import { h, mount, empty, errorBox, loading, badge, fmtDateTime, timeEl } from "../ui.js";

// The app's audit log: changes made with an account key or a secret key. User traffic is in Logs.
export default async function activity(ctx) {
  const { slug } = ctx;
  const page = h("div.page");
  ctx.root.append(page);
  const list = h("div.card");
  const more = h("div", { style: { marginTop: "12px" } });
  mount(page, h("div.ph", h("div", h("h1", "Activity"), h("p", "Who changed what in ", h("b", slug), ": schema, policies, keys, settings, SQL, functions and users. Kept for 400 days."))), list, more);
  let entries = [];
  const words = (e) => {
    const r = e.route.replace("/v1/apps/{app}", "") || "/";
    const map = [
      [/^\/tables$/, { POST: "created a table" }], [/^\/tables\/\{table\}$/, { PATCH: "changed a table or its policy", DELETE: "dropped a table" }],
      [/^\/keys$/, { POST: "created a key" }], [/^\/keys\/\{key_id\}$/, { DELETE: "revoked a key" }], [/^\/sql$/, { POST: "ran SQL" }],
      [/^\/rpc\/\{function\}\/access$/, { PUT: "changed who may call a function" }], [/^$|^\/$/, { PATCH: "changed app settings" }],
      [/^\/functions\/\{name\}\/deployment$/, { PUT: "deployed a function" }], [/^\/auth\/users/, { PATCH: "changed a user", POST: "added or imported users", DELETE: "deleted a user" }],
      [/^\/jobs/, { POST: "queued a job", DELETE: "cancelled a job" }], [/^\/storage\/buckets/, { POST: "created a bucket", PATCH: "changed a bucket", DELETE: "deleted a bucket" }],
    ];
    for (const [re, m] of map) if (re.test(r) && m[e.method]) return m[e.method];
    return e.method + " " + r;
  };
  async function load(before) {
    try {
      const d = await get("/apps/" + enc(slug) + "/audit?limit=100" + (before ? "&before=" + before : ""));
      entries = entries.concat(d.entries || []);
      draw(d.next_before);
    } catch (e) {
      mount(list, errorBox(e, () => load()));
    }
  }
  function draw(next) {
    if (!entries.length) {
      mount(list, empty({ icon: "history", title: "No changes yet", text: "Changes to this app show up here." }));
      return;
    }
    mount(list, h("div.tbl-wrap", h("table.tbl",
      h("thead", h("tr", h("th", "When"), h("th", "Who"), h("th", "What"), h("th", "Path"), h("th", "From"))),
      h("tbody", entries.map((e) => h("tr",
        h("td.dim", { title: fmtDateTime(e.at) }, timeEl(e.at)),
        h("td", e.actor_kind === "secret" && e.actor.startsWith("scoped") ? badge(e.actor, "info") : h("span.small", e.actor)),
        h("td.strong", words(e)),
        h("td.mono.small.dim.trunc", { style: { maxWidth: "280px" } }, e.method + " " + e.path.replace("/v1/apps/" + slug, "")),
        h("td.mono.small.dim", e.ip || "")))))));
    mount(more, next ? h("button.btn.sm", { type: "button", onclick: () => load(next) }, "Older") : null);
  }
  mount(list, loading());
  load();
}
