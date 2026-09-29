import { get, patch, del, enc } from "../api.js";
import { h, mount, icon, toast, toastError, confirmDanger, drawer, field, input, empty, errorBox, loading, badge, timeEl, fmtDate, fmtDateTime, fmtNum, fmtBytes, busy, toggle, avatar, copyBtn } from "../ui.js";
import { state, appPath } from "../state.js";

const LIMITS = ["apps", "rows", "database_bytes", "storage_bytes", "rpm", "functions", "webhooks", "users"];

// Traffic to atberth.com: which links and sites bring visitors, and which of them bring signups and paying accounts.
function webCard() {
  const box = h("div.card-b", loading());
  const days = 30;
  const card = h("div.card", { style: { marginBottom: "18px" } }, h("div.card-h", h("div", h("h2", "Website traffic"), h("div.sub", "atberth.com, last " + days + " days. Cookie-free: pages, referring sites and campaign tags, with a hashed daily visitor count. Signups are credited to the first campaign or site that brought them."))), box);
  const dash = (v) => v.trim().toLowerCase().replace(/[^a-z0-9._~ -]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  const table = (heads, rows) => h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", heads.map((t, i) => h(i > 0 && t !== "Medium" && t !== "Campaign" ? "th.num" : "th", t)))), h("tbody", rows)));
  const builder = () => {
    const inSource = input({ placeholder: "hacker-news, newsletter, brother", maxlength: "40" });
    const inMedium = input({ placeholder: "post, email, text", maxlength: "40" });
    const inCampaign = input({ placeholder: "show-hn, launch", maxlength: "40" });
    const inPath = input({ placeholder: "/ or /compare/", value: "/" });
    const made = h("code.mono.small", { style: { display: "block", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "8px", overflowWrap: "anywhere", flex: "1", minWidth: "240px" } });
    const build = () => {
      const q = [["utm_source", dash(inSource.value)], ["utm_medium", dash(inMedium.value)], ["utm_campaign", dash(inCampaign.value)]].filter(([, v]) => v);
      if (!q.length) { made.textContent = "Fill in at least one box to make a link."; return; }
      made.textContent = "https://atberth.com/" + inPath.value.trim().replace(/^\/+/, "") + "?" + q.map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
    };
    [inSource, inMedium, inCampaign, inPath].forEach((el) => el.addEventListener("input", build));
    build();
    return h("div", { style: { borderTop: "1px solid var(--line)" } }, h("div.card-b", h("h3", { style: { fontSize: "15px", marginBottom: "10px" } }, "Make a tagged link to atberth.com"), h("div.grid.g2", field("Source", inSource, "Where you share it"), field("Medium", inMedium, "How it is shared"), field("Campaign", inCampaign, "Which push"), field("Page", inPath, "Where it lands")), h("div.row", { style: { gap: "10px", marginTop: "14px", flexWrap: "wrap" } }, made, copyBtn(() => made.textContent, { label: "Link copied" }))));
  };
  get("/admin/web-stats?days=" + days).then((d) => {
    const t = d.totals;
    const tile = (label, value) => h("div", h("div.small.dim", label), h("div", { style: { fontSize: "22px", fontWeight: "600", marginTop: "2px" } }, value));
    const src = (d.top_sources || []).map((r) => h("tr", h("td.strong", r.source || "-"), h("td", r.medium || "-"), h("td", r.campaign || "-"), h("td.num", fmtNum(r.views)), h("td.num", fmtNum(r.visitors)), h("td.num", fmtNum(r.signups)), h("td.num", fmtNum(r.paid))));
    const list = (rows) => rows.length ? table(["Page", "Views"], rows.slice(0, 8).map((r) => h("tr", h("td.mono.small.trunc", { style: { maxWidth: "320px" } }, r.key), h("td.num", fmtNum(r.count))))) : h("div.small.dim", { style: { padding: "12px 0" } }, "Nothing yet.");
    mount(
      box,
      h("div.grid.g4", tile("Page views", fmtNum(t.views)), tile("Visitors (sum of daily)", fmtNum(t.visitors)), tile("New accounts", fmtNum(t.signups)), tile("Paying accounts", fmtNum(t.paid))),
      h("p.small.dim", { style: { marginTop: "12px" } }, t.signups_without_source ? fmtNum(t.signups_without_source) + " of the new accounts have no source: they came before tracking, straight to the site, or from a browser that blocks it." : "Every new account has a source."),
      src.length ? table(["Source", "Medium", "Campaign", "Views", "Visitors", "Signups", "Paid"], src) : h("div.small.dim", { style: { padding: "12px 0" } }, "No campaign links or referring sites yet. Make a link below and share it."),
      h("div.grid.g2", { style: { marginTop: "14px" } }, h("div", h("h3", { style: { fontSize: "15px", marginBottom: "6px" } }, "Top pages"), list(d.top_pages)), h("div", h("h3", { style: { fontSize: "15px", marginBottom: "6px" } }, "Referring sites"), list(d.top_referrers)))
    );
    card.append(builder());
  }).catch((e) => mount(box, errorBox(e)));
  return card;
}

export default async function admin(ctx) {
  const page = h("div.page");
  ctx.root.append(page);
  const list = h("div.card");
  const q = input({ type: "search", placeholder: "Search accounts" });
  mount(
    page,
    h("div.ph", h("div", h("div.eyebrow", "platform"), h("h1", "Admin"), h("p", "Customer accounts, their limits, and support tools. Only you see this."))),
    h("div.stats", { style: { marginBottom: "18px" } }, h("div.stat", h("div.stat-label", "Apps on the platform"), h("div.stat-value", fmtNum(state.apps.length))), h("div.stat#acct-count", h("div.stat-label", "Accounts"), h("div.stat-value", "…")), h("div.stat", h("div.stat-label", "Your own apps"), h("div.stat-value", fmtNum(state.apps.filter((a) => !a.account_id).length)))),
    webCard(),
    h("div.grid", { style: { gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", alignItems: "start" }, class: "ov-grid" }, h("div.stack", h("div.search", icon("search"), q), list), codeLookup())
  );
  let rows = [];
  q.addEventListener("input", () => draw());

  async function load() {
    mount(list, loading());
    try {
      rows = (await get("/admin/accounts")).accounts || [];
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    const c = page.querySelector("#acct-count .stat-value");
    if (c) c.textContent = fmtNum(rows.length);
    draw();
  }

  function draw() {
    const term = q.value.trim().toLowerCase();
    const shown = rows.filter((a) => !term || a.email.includes(term));
    if (!shown.length) {
      mount(list, empty({ icon: "account", title: "No accounts", text: term ? "No email matches." : "Nobody has signed up yet." }));
      return;
    }
    mount(
      list,
      h(
        "div.tbl-wrap",
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "Account"), h("th.r", "Apps"), h("th", "Joined"), h("th", "Last sign in"), h("th", "Status"), h("th.actions", ""))),
          h(
            "tbody",
            shown.map((a) =>
              h(
                "tr.click",
                { onclick: () => accountDrawer(a) },
                h("td", h("div.row", avatar(a.email), h("div", { style: { minWidth: 0 } }, h("div.strong", a.email), h("div.tiny.dim.mono", a.id)))),
                h("td.r.num", fmtNum(a.apps)),
                h("td.dim", fmtDate(a.created_at)),
                h("td.dim", timeEl(a.last_login_at)),
                h("td", a.disabled ? badge("disabled", "bad") : Object.keys(a.limits || {}).length ? badge("custom limits", "info") : badge("active", "ok")),
                h("td.actions", icon("chev", "i-sm"))
              )
            )
          )
        )
      )
    );
  }

  async function accountDrawer(a) {
    let full;
    try {
      full = (await get("/admin/accounts/" + enc(a.id))).account;
    } catch (e) {
      return toastError(e);
    }
    const inputs = {};
    const custom = a.limits || {};
    let disabled = !!full.disabled;
    const dis = toggle(disabled, (v) => (disabled = v), "Disabled");
    const apps = state.apps.filter((x) => x.account_id === a.id);
    drawer({
      title: a.email,
      sub: a.id,
      width: 560,
      body: h(
        "div.form",
        h("dl.kv", h("dt", "Joined"), h("dd", fmtDateTime(full.created_at)), h("dt", "Last sign in"), h("dd", full.last_login_at ? fmtDateTime(full.last_login_at) : "never"), h("dt", "Storage"), h("dd", fmtBytes(full.usage.storage_bytes))),
        h("label.check-row", dis, h("div", h("div", "Disabled"), h("div.tiny.dim", "Blocks every key and app in this account."))),
        h("div.hr"),
        h("h3", { style: { fontSize: "14px", fontWeight: "600" } }, "Limits"),
        h("div.hint", "Empty means the default. Bytes for sizes."),
        h(
          "div.form-row",
          LIMITS.map((k) => {
            const inp = input({ type: "number", min: "0", mono: true, value: custom[k] !== undefined ? String(custom[k]) : "", placeholder: String(full.limits[k]) });
            inputs[k] = inp;
            return field(k, inp);
          })
        ),
        h("div.hr"),
        h("h3", { style: { fontSize: "14px", fontWeight: "600" } }, "Apps"),
        apps.length ? h("div.card", apps.map((x) => h("a.list-row", { href: "#" + appPath(x.slug) }, icon("db"), h("span.mono", x.slug), h("span.spacer"), icon("chev", "i-sm")))) : h("div.dim.small", "No apps.")
      ),
      foot: (close) => [
        h(
          "button.btn.danger",
          {
            type: "button",
            onclick: () =>
              confirmDanger({
                title: "Delete " + a.email,
                text: "The account and all " + a.apps + " of its apps are deleted with their data.",
                confirm: "Delete account",
                typeToConfirm: a.email,
                onConfirm: async () => {
                  await del("/admin/accounts/" + enc(a.id));
                  toast("Account deleted");
                  close();
                  await ctx.refreshShell();
                  load();
                },
              }),
          },
          icon("trash"),
          "Delete"
        ),
        h("span.spacer"),
        h("button.btn", { type: "button", onclick: close }, "Cancel"),
        h(
          "button.btn.primary",
          {
            type: "button",
            onclick: (e) =>
              busy(e.currentTarget, async () => {
                try {
                  const limits = {};
                  for (const k of LIMITS) {
                    const v = inputs[k].value.trim();
                    limits[k] = v === "" ? null : Number(v);
                  }
                  await patch("/admin/accounts/" + enc(a.id), { limits, disabled });
                  toast("Account saved");
                  close();
                  load();
                } catch (err) {
                  toastError(err);
                }
              }),
          },
          "Save"
        ),
      ],
    });
  }

  function codeLookup() {
    const email = input({ type: "email", placeholder: "person@example.com" });
    const app = input({ placeholder: "app (optional, for end users)", mono: true });
    const out = h("div");
    return h(
      "section.card",
      h("div.card-h", h("div", h("h2", "Login code lookup"), h("div.sub", "The latest unexpired code, for support."))),
      h(
        "form.card-b.form",
        {
          onsubmit: (e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button[type=submit]");
            busy(btn, async () => {
              try {
                const r = await get("/admin/codes?email=" + enc(email.value.trim()) + (app.value.trim() ? "&app=" + enc(app.value.trim()) : ""));
                mount(out, h("div.secret", h("span", { style: { fontSize: "20px", letterSpacing: ".2em" } }, r.code), copyBtn(r.code)), h("div.hint", { style: { marginTop: "6px" } }, "Expires " + timeEl(r.expires_at).textContent + ", " + r.attempts + " wrong tries"));
              } catch (err) {
                mount(out, h("div.bad-box", icon("alert"), err.message));
              }
            });
          },
        },
        field("Email", email),
        field("App", app),
        h("button.btn", { type: "submit" }, icon("search"), "Look up"),
        out
      )
    );
  }

  load();
}
