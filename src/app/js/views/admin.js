import { get, post, patch, del, enc } from "../api.js";
import { h, mount, icon, toast, toastError, confirmDanger, drawer, field, input, empty, errorBox, loading, badge, timeEl, fmtDate, fmtDateTime, fmtNum, fmtBytes, busy, toggle, avatar, copyBtn, select } from "../ui.js";
import { state, appPath, staffLevel } from "../state.js";

const LIMITS = ["apps", "rows", "database_bytes", "storage_bytes", "rpm", "functions", "webhooks", "users"];

// Traffic to atberth.com: which links and sites bring visitors, and which of them bring signups and paying accounts.
export function webCard(endpoint = "/admin/web-stats") {
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
  get(endpoint + "?days=" + days).then((d) => {
    const t = d.totals;
    const tile = (label, value) => h("div", h("div.small.dim", label), h("div", { style: { fontSize: "22px", fontWeight: "600", marginTop: "2px" } }, value));
    const src = (d.top_sources || []).map((r) => h("tr", h("td.strong", r.source || "-"), h("td", r.medium || "-"), h("td", r.campaign || "-"), h("td.num", fmtNum(r.views)), h("td.num", fmtNum(r.visitors)), h("td.num", fmtNum(r.signups)), h("td.num", fmtNum(r.paid))));
    const list = (rows, what = "Page") => rows.length ? table([what, "Views"], rows.slice(0, 8).map((r) => h("tr", h("td.mono.small.trunc", { style: { maxWidth: "320px" } }, r.key), h("td.num", fmtNum(r.count))))) : h("div.small.dim", { style: { padding: "12px 0" } }, "Nothing yet.");
    mount(
      box,
      h("div.grid.g4", tile("Page views", fmtNum(t.views)), tile("Visitors (sum of daily)", fmtNum(t.visitors)), tile("New accounts", fmtNum(t.signups)), tile("Paying accounts", fmtNum(t.paid))),
      h("p.small.dim", { style: { marginTop: "12px" } }, t.signups_without_source ? fmtNum(t.signups_without_source) + " of the new accounts have no source: they came before tracking, straight to the site, or from a browser that blocks it." : "Every new account has a source."),
      src.length ? table(["Source", "Medium", "Campaign", "Views", "Visitors", "Signups", "Paid"], src) : h("div.small.dim", { style: { padding: "12px 0" } }, "No campaign links or referring sites yet. Make a link below and share it."),
      h("div.grid.g2", { style: { marginTop: "14px" } }, h("div", h("h3", { style: { fontSize: "15px", marginBottom: "6px" } }, "Top pages"), list(d.top_pages)), h("div", h("h3", { style: { fontSize: "15px", marginBottom: "6px" } }, "Referring sites"), list(d.top_referrers, "Site")))
    );
    card.append(builder());
  }).catch((e) => mount(box, errorBox(e)));
  return card;
}

export default async function admin(ctx) {
  const owner = state.me.role === "admin"; // the platform owner; everyone else here is on the team
  const level = staffLevel(); // 1 support (look only), 2 admin, 3 owner
  const page = h("div.page");
  ctx.root.append(page);
  const list = h("div.card");
  const q = input({ type: "search", placeholder: "Search accounts" });
  mount(
    page,
    h("div.ph", h("div", h("div.eyebrow", "platform"), h("h1", "Admin"), h("p", owner ? "Customer accounts, limits and support tools. Add people under Team." : level < 2 ? "Customer accounts and project requests, read only." : "Customer accounts, limits and platform numbers. What you change here is recorded."))),
    h("div.stats", { style: { marginBottom: "18px" } }, h("div.stat", h("div.stat-label", "Customer apps"), h("div.stat-value#app-count", "…")), h("div.stat#acct-count", h("div.stat-label", "Accounts"), h("div.stat-value", "…")), h("div.stat", h("div.stat-label", "Team"), h("div.stat-value#admin-count", "…"))),
    level >= 2 ? webCard() : null,
    h("div.grid", { style: { gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", alignItems: "start" }, class: "ov-grid" }, h("div.stack", h("div.search", icon("search"), q), list), h("div.stack", level >= 2 ? incidentsCard() : null, owner ? codeLookup() : null, level >= 2 ? auditCard() : null))
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
    const ac = page.querySelector("#app-count");
    if (ac) ac.textContent = fmtNum(rows.reduce((n, a) => n + Number(a.apps || 0), 0));
    const ad = page.querySelector("#admin-count");
    if (ad) ad.textContent = fmtNum(rows.filter((a) => a.team_role || a.owner).length);
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
                h("td", h("div.row", { style: { gap: "6px", flexWrap: "wrap" } }, a.disabled ? badge("disabled", "bad") : Object.keys(a.limits || {}).length ? badge("custom limits", "info") : badge("active", "ok"), a.owner ? badge("owner", "info") : a.team_role ? badge(a.team_role, "info") : null)),
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
    const locked = level < 2 || (!owner && (full.team_role || full.owner)); // support looks only; only the owner changes team members
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
        h("h3", { style: { fontSize: "14px", fontWeight: "600" } }, "Access"),
        full.owner
          ? h("div.hint", "This is the platform owner. The owner is set on the server and always has full access.")
          : full.team_role
            ? h("div.hint", "Team role: " + full.team_role + "." + (owner ? " Change it on the Team page." : ""), owner ? h("span", " ", h("a", { href: "#/team" }, "Open Team")) : null)
            : owner ? h("div.hint", "To give this person admin pages, add them on the Team page.") : null,
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
        owner ? h(
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
        ) : null,
        h("span.spacer"),
        h("button.btn", { type: "button", onclick: close }, "Cancel"),
        h(
          "button.btn.primary",
          {
            type: "button",
            disabled: locked ? "" : null,
            onclick: (e) =>
              busy(e.currentTarget, async () => {
                try {
                  const limits = {};
                  for (const k of LIMITS) {
                    const v = inputs[k].value.trim();
                    limits[k] = v === "" ? null : Number(v);
                  }
                  const body = { limits, disabled };
                  await patch("/admin/accounts/" + enc(a.id), body);
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

  function auditCard() {
    const body = h("div.card-b", loading());
    const tabs = h("div.row", { style: { gap: "6px", marginTop: "8px" } });
    let filter = "all";
    const loadLog = () => {
      mount(body, loading());
      get("/admin/audit?limit=40&filter=" + filter).then((d) => {
      const e = d.entries || [];
      const words = { "account.update": "changed", "account.delete": "deleted", "codes.lookup": "looked up a code for", "team.add": "added to the team:", "team.change": "changed the team role of", "team.remove": "removed from the team:", "team.accept": "accepted the invite:", "status.post": "posted an incident", "status.update": "updated an incident", "status.delete": "deleted an incident" };
      const detail = (x) => {
        const o = x.detail || {};
        const bits = [];
        if (x.action.startsWith("team.") && o.role) bits.push(o.role + (o.status === "pending" ? " (invited)" : ""));
        if (x.action.startsWith("status.")) return (words[x.action] || x.action) + (o.title ? ": " + o.title : o.status ? " (" + o.status + ")" : "");
        if (o.disabled !== undefined) bits.push(o.disabled ? "disabled" : "enabled");
        if (o.limits) bits.push("limits");
        return bits.join(", ");
      };
      mount(body, e.length ? h("div.stack", { style: { gap: "10px" } }, e.map((x) => h("div", h("div.small", h("b", x.actor_email), " ", detail(x) || words[x.action] || x.action, x.target_email ? h("span", " ", h("span.mono", x.target_email)) : null), h("div.tiny.dim", timeEl(x.at))))) : h("div.small.dim", "Nothing yet. Admin actions show up here."));
    }).catch((err) => mount(body, errorBox(err)));
    };
    const drawTabs = () => mount(tabs, ["all", "team", "accounts"].map((f) => h("button.btn.sm" + (f === filter ? ".primary" : ""), { type: "button", onclick: () => { filter = f; drawTabs(); loadLog(); } }, f === "all" ? "All" : f === "team" ? "Team" : "Accounts")));
    drawTabs();
    loadLog();
    return h("section.card", h("div.card-h", h("div", h("h2", "Activity log"), h("div.sub", "Who changed what in this portal."), tabs)), body);
  }

  // Incidents and planned maintenance: what customers see on atberth.com/status and in the console banner.
  function incidentsCard() {
    const body = h("div.card-b", loading());
    const PH = { scheduled: "Scheduled", investigating: "Investigating", identified: "Identified", monitoring: "Monitoring", resolved: "Resolved", in_progress: "In progress", completed: "Completed" };
    let comps = [];
    const load = () => get("/admin/incidents?limit=12").then((d) => {
      comps = d.components || [];
      const list = d.incidents || [];
      mount(
        body,
        h("div.row", { style: { justifyContent: "space-between", marginBottom: "10px" } }, h("div.small", h("b", d.now.headline)), h("button.btn.sm.primary", { type: "button", onclick: () => postDrawer() }, icon("plus"), "Post")),
        list.length
          ? h("div.stack", { style: { gap: "8px" } }, list.map((i) => h("a.list-row", { href: "javascript:void 0", onclick: () => updateDrawer(i) },
              badge(PH[i.status] || i.status, i.resolved_at ? "ok" : i.impact === "minor" || i.impact === "maintenance" ? "info" : "bad"),
              h("div", { style: { minWidth: 0, flex: "1" } }, h("div.small.strong.trunc", i.title), h("div.tiny.dim", (i.auto ? "automatic, " : "") + (i.component_names || []).join(", "))),
              icon("chev", "i-sm"))))
          : h("div.small.dim", "No incidents yet.")
      );
    }).catch((e) => mount(body, errorBox(e, load)));

    function notifyRow(on, onChange) {
      return h("label.check-row", toggle(on, onChange, "Email people"), h("div", h("div", "Email people"), h("div.tiny.dim", "Status subscribers always. For major and critical incidents and maintenance, also every account owner who hasn't turned status emails off.")));
    }

    function postDrawer() {
      const title = input({ placeholder: "Uploads are slow", maxlength: "140" });
      const impact = select([["minor", "Degraded (minor)"], ["major", "Partial outage (major)"], ["critical", "Major outage (critical)"], ["maintenance", "Planned maintenance"]], "minor");
      const message = h("textarea.input", { rows: "5", placeholder: "What customers see, what works, what doesn't, and when the next update comes." });
      const when = input({ type: "datetime-local" });
      const picked = new Set();
      const boxes = h("div.row", { style: { flexWrap: "wrap", gap: "8px" } }, comps.map((c) => {
        const b = h("button.btn.sm", { type: "button", onclick: () => { picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id); b.classList.toggle("primary"); } }, c.name);
        return b;
      }));
      let notify = true;
      const whenField = field("Planned for (your time)", when, "Leave empty if it starts now.");
      whenField.hidden = true;
      impact.addEventListener("change", () => (whenField.hidden = impact.value !== "maintenance"));
      drawer({
        title: "Post an incident",
        sub: "Shows on atberth.com/status and in every console at once.",
        width: 560,
        body: h("div.form", field("Title", title), field("Impact", impact), field("Affects", boxes), whenField, field("Message", message), notifyRow(true, (v) => (notify = v))),
        foot: (close) => [h("span.spacer"), h("button.btn", { type: "button", onclick: close }, "Cancel"), h("button.btn.primary", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
          try {
            const b = { title: title.value.trim(), impact: impact.value, components: [...picked], message: message.value.trim(), notify };
            if (impact.value === "maintenance" && when.value) b.scheduled_for = new Date(when.value).toISOString();
            await post("/admin/incidents", b);
            toast("Posted");
            close();
            load();
          } catch (err) { toastError(err); }
        }) }, "Post")],
      });
    }

    function updateDrawer(i) {
      const opts = i.impact === "maintenance" ? ["scheduled", "in_progress", "completed"] : ["investigating", "identified", "monitoring", "resolved"];
      const status = select(opts.map((o) => [o, PH[o]]), i.resolved_at ? opts[opts.length - 1] : i.status);
      const message = h("textarea.input", { rows: "4", placeholder: "What changed since the last update." });
      let notify = true;
      drawer({
        title: i.title,
        sub: (i.auto ? "Opened automatically. " : "") + (i.component_names || []).join(", "),
        width: 560,
        body: h("div.form",
          h("div.stack", { style: { gap: "10px" } }, (i.updates || []).map((u) => h("div", h("div.small", h("b", PH[u.status] || u.status), " ", h("span.dim", timeEl(u.at))), h("div.small", { style: { whiteSpace: "pre-wrap" } }, u.message)))),
          h("div.hr"), field("New status", status), field("Update", message), notifyRow(true, (v) => (notify = v)),
          h("a.small", { href: i.url, target: "_blank", rel: "noopener" }, "Open on the status page")),
        foot: (close) => [
          owner ? h("button.btn.danger", { type: "button", onclick: () => confirmDanger({ title: "Delete this incident", text: "Only for something posted by mistake. Real incidents should stay in the history.", confirm: "Delete", onConfirm: async () => { await del("/admin/incidents/" + i.id); toast("Deleted"); close(); load(); } }) }, icon("trash"), "Delete") : null,
          h("span.spacer"), h("button.btn", { type: "button", onclick: close }, "Close"),
          h("button.btn.primary", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
            try {
              await post("/admin/incidents/" + i.id + "/updates", { status: status.value, message: message.value.trim(), notify });
              toast("Update posted");
              close();
              load();
            } catch (err) { toastError(err); }
          }) }, "Post update"),
        ],
      });
    }

    load();
    return h("section.card", h("div.card-h", h("div", h("h2", "Status and incidents"), h("div.sub", "What customers see when something is wrong."))), body);
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
