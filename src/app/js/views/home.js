import { get, post, api, enc } from "../api.js";
import { h, mount, icon, avatar, areaChart, miniBars, fmtNum, fmtCompact, fmtDate, ago, modal, field, input, secretReveal, codeBlock, toast, errorBox, skeleton, empty, seg, pickFile, fmtBytes } from "../ui.js";
import { state, go, loadApps, appPath, replace } from "../state.js";

const METRICS = [
  ["requests", "Requests"],
  ["rows_written", "Row writes"],
  ["function_invocations", "Function runs"],
  ["storage_uploads", "Uploads"],
];

export default async function home(ctx) {
  const page = h("div.page");
  ctx.root.append(page);
  const isAdmin = state.me.role === "admin";
  let account = state.me.account;
  mount(
    page,
    h(
      "div.ph",
      h("div", h("div.eyebrow", isAdmin ? "platform admin" : account ? account.email : ""), h("h1", "Apps"), h("p", "Each app is its own Postgres database with keys, auth, storage, functions and webhooks.")),
      h(
        "div.ph-actions",
        h("button.btn", { type: "button", onclick: () => restoreApp(ctx) }, icon("upload"), "Restore from dump"),
        h("button.btn.primary", { type: "button", onclick: () => createApp(ctx) }, icon("plus"), "New app")
      )
    ),
    skeleton(3, 90)
  );

  let usage = null;
  try {
    let me;
    [usage, , me] = await Promise.all([get("/account/usage/daily?days=30"), loadApps(), get("/me")]);
    state.me = me;
  } catch (e) {
    if (!ctx.alive()) return;
    page.lastChild.replaceWith(errorBox(e, () => go("/")));
    return;
  }
  if (!ctx.alive()) return;
  ctx.refreshShell();

  const apps = state.apps;
  const days = usage.days || [];
  const totals = Object.fromEntries(METRICS.map(([k]) => [k, days.reduce((s, d) => s + (d[k] || 0), 0)]));
  const byApp = usage.requests_by_app || {};

  const body = h("div.stack", { style: { gap: "22px" } });
  page.lastChild.replaceWith(body);

  account = state.me.account;
  const limits = account && account.limits;
  body.append(
    h(
      "div.stats",
      stat("Apps", fmtNum(apps.length), limits && !isAdmin ? h("span.dim.small", "of " + limits.apps) : null),
      stat("Requests, 30 days", fmtCompact(totals.requests)),
      stat("Row writes, 30 days", fmtCompact(totals.rows_written)),
      stat("Function runs, 30 days", fmtCompact(totals.function_invocations)),
      account && account.usage ? stat("Storage", fmtBytes(account.usage.storage_bytes)) : null
    )
  );

  if (apps.length) {
    let metric = "requests";
    const chartBox = h("div");
    const drawChart = () =>
      mount(
        chartBox,
        areaChart(
          days.map((d) => ({ v: d[metric] || 0, label: shortDay(d.day), full: longDay(d.day) })),
          { label: METRICS.find((m) => m[0] === metric)[1] }
        )
      );
    body.append(
      h(
        "section.card",
        h("div.card-h", h("div", h("h2", "Activity"), h("div.sub", isAdmin ? "Every app on the platform, last 30 days" : "Across your apps, last 30 days")), seg(METRICS, metric, (v) => {
          metric = v;
          drawChart();
        })),
        h("div.card-b", chartBox)
      )
    );
    drawChart();
  }

  const q = input({ placeholder: "Search apps", type: "search", "aria-label": "Search apps" });
  const grid = h("div.apps");
  const renderGrid = () => {
    const term = q.value.trim().toLowerCase();
    const list = apps.filter((a) => !term || a.slug.includes(term));
    mount(
      grid,
      list.map((a) => appCard(a, byApp[a.slug] || 0, days)),
      !term ? h("button.new-card", { type: "button", onclick: () => createApp(ctx) }, h("div.empty-ico", icon("plus")), h("b", "New app"), h("span.small.dim", "Its own Postgres database")) : null
    );
    if (term && !list.length) grid.append(h("div.dim", "No apps match."));
  };
  q.addEventListener("input", renderGrid);

  if (!apps.length) {
    body.append(
      h(
        "div.card",
        empty({
          icon: "db",
          title: "Create your first app",
          text: "An app gets its own Postgres database, a secret key for servers and a publishable key for phones and browsers.",
          actions: [h("button.btn.primary", { type: "button", onclick: () => createApp(ctx) }, icon("plus"), "New app")],
        })
      )
    );
  } else {
    body.append(h("div.row", h("h2", { style: { fontSize: "15px", fontWeight: "600" } }, "Your apps", h("span.dim", { style: { fontWeight: "400", marginLeft: "8px" } }, String(apps.length))), h("div.spacer"), h("div.search", { style: { width: "240px" } }, icon("search"), q)), grid);
    renderGrid();
  }

  if (ctx.query.new) {
    replace("/");
    createApp(ctx);
  }
}

function stat(label, value, foot) {
  return h("div.stat", h("div.stat-label", label), h("div.stat-value", value), foot ? h("div.stat-foot", foot) : null);
}

function shortDay(d) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function longDay(d) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function appCard(a, requests, days) {
  const card = h(
    "a.app-card",
    { href: "#" + appPath(a.slug) },
    h("div.app-card-h", avatar(a.slug, "sq"), h("div", { style: { minWidth: 0 } }, h("div.app-card-name", a.slug), h("div.app-card-sub", "app_" + a.slug)), h("span.spacer"), icon("chev", "i-sm")),
    h("div.bars-slot"),
    h("div.app-card-foot", h("span", fmtCompact(requests) + " requests in 30 days"), h("span", "Created " + fmtDate(a.created_at)))
  );
  const slot = card.querySelector(".bars-slot");
  slot.append(h("div.sk", { style: { height: "40px" } }));
  get("/apps/" + enc(a.slug) + "/usage/daily?days=30")
    .then((u) => slot.replaceChildren(miniBars(u.days.map((d) => d.requests), 30)))
    .catch(() => slot.replaceChildren(miniBars(new Array(30).fill(0), 30)));
  return card;
}

function createApp(ctx) {
  const name = input({ placeholder: "my_app", mono: true, autofocus: true, maxlength: "32" });
  const preview = h("div.hint", "Lowercase letters, numbers and underscore. 2 to 32 characters, starting with a letter.");
  name.addEventListener("input", () => {
    const v = name.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (v !== name.value) name.value = v;
  });
  return modal({
    title: "Create an app",
    text: "Berth makes a new Postgres database, a role that can only reach it, and two keys.",
    body: h("div.form", field("App name", name), preview),
    actions: [
      { label: "Cancel" },
      {
        label: "Create app",
        kind: "primary",
        submit: true,
        onClick: async () => {
          const slug = name.value.trim();
          if (!/^[a-z][a-z0-9_]{1,31}$/.test(slug)) throw new Error("Use 2 to 32 characters: a letter first, then lowercase letters, numbers, or underscore.");
          const out = await post("/apps", { name: slug });
          await loadApps();
          showKeys(out, "App created");
          go(appPath(slug));
        },
      },
    ],
  });
}

export function showKeys(out, title) {
  const slug = out.app.slug;
  const snippet = `curl ${out.app.api_url}/tables \\\n  -H "Authorization: Bearer ${out.keys.secret}"`;
  modal({
    title: title + ": " + slug,
    text: "Save both keys now. Berth only shows them once.",
    wide: true,
    persist: true,
    body: h(
      "div.stack",
      h("div.field", h("label", "Secret key ", h("span.badge.bad", "server only")), secretReveal(out.keys.secret, "Full access to this app. Keep it on your server, in CI, or in functions. Never ship it in an app.")),
      h("div.field", h("label", "Publishable key ", h("span.badge.ok", "safe in apps")), h("div.secret", h("span", out.keys.publishable), copyButton(out.keys.publishable))),
      h("div.field", h("label", "Try it"), codeBlock(snippet))
    ),
    actions: [{ label: "I saved them", kind: "primary" }],
  });
}

function copyButton(v) {
  const b = h("button.btn.ghost.icon.sm", { type: "button", "aria-label": "Copy" }, icon("copy", "i-sm"));
  b.addEventListener("click", () => navigator.clipboard.writeText(v).then(() => toast("Copied")));
  return b;
}

async function restoreApp(ctx) {
  let file = null;
  const name = input({ placeholder: "restored_app", mono: true, autofocus: true });
  const fileLabel = h("span.dim", "No file chosen");
  const pick = h("button.btn", { type: "button" }, icon("upload"), "Choose .dump file");
  pick.addEventListener("click", async () => {
    const f = await pickFile(".dump,application/octet-stream");
    if (f) {
      file = f;
      fileLabel.textContent = f.name + ", " + fmtBytes(f.size);
      if (!name.value) name.value = f.name.replace(/\.dump$/, "").replace(/[^a-z0-9_]/gi, "_").toLowerCase().replace(/^[^a-z]+/, "").slice(0, 32);
    }
  });
  modal({
    title: "Restore from a dump",
    text: "Creates a new app from a pg_dump custom format file, like the one Export gives you. Up to 200 MB.",
    body: h("div.form", field("New app name", name), h("div.row", pick, fileLabel)),
    actions: [
      { label: "Cancel" },
      {
        label: "Restore",
        kind: "primary",
        submit: true,
        onClick: async () => {
          const slug = name.value.trim();
          if (!file) throw new Error("Choose a .dump file first.");
          if (!/^[a-z][a-z0-9_]{1,31}$/.test(slug)) throw new Error("Pick a valid app name.");
          const out = await api("POST", "/apps/" + enc(slug) + "/restore", { raw: file, headers: { "Content-Type": "application/octet-stream" } });
          await loadApps();
          showKeys(out, "Restored");
          go(appPath(slug));
        },
      },
    ],
  });
}
