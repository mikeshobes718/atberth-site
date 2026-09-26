import { get, post, del, enc, session } from "../api.js";
import { h, mount, icon, toast, toastError, modal, confirmDanger, field, input, empty, errorBox, loading, badge, timeEl, fmtDate, fmtDateTime, fmtNum, fmtBytes, meter, secretReveal, codeBlock, avatar, seg } from "../ui.js";
import { state, go } from "../state.js";

const LIMIT_LABELS = {
  apps: ["Apps", fmtNum],
  rows: ["Rows per app", fmtNum],
  database_bytes: ["Database per app", fmtBytes],
  storage_bytes: ["Storage", fmtBytes],
  rpm: ["Requests per minute", fmtNum],
  functions: ["Functions per app", fmtNum],
  webhooks: ["Webhooks per app", fmtNum],
  users: ["End users per app", fmtNum],
  sites: ["Sites", fmtNum],
  site_bytes: ["Size per site deploy", fmtBytes],
};

function takeIntent(key) {
  try {
    const v = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

async function startCheckout(interval, btn) {
  if (btn) btn.disabled = true;
  try {
    const out = await post("/account/billing/checkout", { interval });
    location.href = out.url;
  } catch (e) {
    if (btn) btn.disabled = false;
    toastError(e);
  }
}

async function openPortal(btn) {
  btn.disabled = true;
  try {
    const out = await post("/account/billing/portal", {});
    location.href = out.url;
  } catch (e) {
    btn.disabled = false;
    toastError(e);
  }
}

function planCard(b) {
  const pro = b.plan === "pro";
  const title = pro ? "Pro" : b.plan === "scale" ? "Scale" : "Free";
  let line;
  if (pro && b.cancel_at_period_end && b.renews_at) line = "Pro ends on " + fmtDate(b.renews_at) + ". You go back to Free then, and nothing is deleted.";
  else if (pro && b.status === "past_due") line = "The last payment failed. Stripe will try again. Update your card in Manage billing to keep Pro.";
  else if (pro && b.renews_at) line = "Renews " + (b.interval === "year" ? "yearly" : "monthly") + " on " + fmtDate(b.renews_at) + ".";
  else if (b.plan === "scale") line = "A custom plan. Email hello@atberth.com to change it.";
  else line = "Pro raises every limit below: 10 apps, 1,000,000 rows and 5 GB per app, 25 GB storage, 50,000 end users per app.";
  const actions = h("div.row", { style: { gap: "10px", flexWrap: "wrap" } });
  if (!pro && b.plan !== "scale") {
    if (b.self_service) {
      const m = h("button.btn.primary", { type: "button" }, "Upgrade to Pro, $" + b.prices.month + " a month");
      const y = h("button.btn", { type: "button" }, "$" + b.prices.year + " a year");
      m.onclick = () => startCheckout("month", m);
      y.onclick = () => startCheckout("year", y);
      actions.append(m, y);
    } else {
      actions.append(h("a.btn", { href: "mailto:hello@atberth.com?subject=Berth%20Pro" }, "Email to upgrade"));
    }
  }
  if (b.has_billing) {
    const manage = h("button.btn" + (pro ? ".primary" : ""), { type: "button" }, "Manage billing");
    manage.onclick = () => openPortal(manage);
    actions.append(manage);
  }
  return h(
    "div.card-b",
    { style: { borderBottom: "1px solid var(--line)" } },
    h("div.row", { style: { gap: "12px", flexWrap: "wrap" } }, h("div", { style: { fontWeight: "600", fontSize: "18px" } }, title), pro ? badge(b.status === "past_due" ? "payment due" : "active", b.status === "past_due" ? "warn" : "ok") : null),
    h("p.small.muted", { style: { margin: "6px 0 14px" } }, line),
    actions
  );
}

export default async function account(ctx) {
  const page = h("div.page");
  ctx.root.append(page);
  page.append(h("div.ph", h("div", h("h1", "Account"), h("p", "Your profile, limits, console sessions and keys for the CLI."))), loading());
  let acct, keys;
  try {
    [acct, keys] = await Promise.all([get("/account"), get("/account/keys")]);
  } catch (e) {
    page.lastChild.replaceWith(errorBox(e, () => location.reload()));
    return;
  }
  if (!ctx.alive()) return;
  const a = acct.account;
  const isAdmin = state.me.role === "admin";
  const body = h("div.stack", { style: { maxWidth: "980px", gap: "18px" } });
  page.lastChild.replaceWith(body);

  if (!a.email) {
    body.append(
      h(
        "div.card.card-b",
        h("div.row", h("span.avatar", icon("shield", "i-sm")), h("div", h("b", "Platform admin token"), h("div.small.dim", "This console session uses the admin token, which has no account. Sign in by email to manage sessions and keys here.")))
      )
    );
    return;
  }

  body.append(
    h(
      "section.card",
      h(
        "div.card-b.row",
        { style: { gap: "16px" } },
        avatar(a.email),
        h("div", { style: { minWidth: 0, flex: "1" } }, h("div", { style: { fontWeight: "600", fontSize: "16px" } }, a.email), h("div.small.dim.mono", a.id)),
        isAdmin ? badge("platform admin", "info") : badge("account", "ok")
      ),
      h(
        "div.card-b",
        { style: { borderTop: "1px solid var(--line)" } },
        h("dl.kv", h("dt", "Member since"), h("dd", fmtDate(a.created_at)), h("dt", "Last sign in"), h("dd", a.last_login_at ? fmtDateTime(a.last_login_at) : "never"), h("dt", "Apps"), h("dd", fmtNum(a.usage.apps)), h("dt", "Storage used"), h("dd", fmtBytes(a.usage.storage_bytes)))
      )
    )
  );

  if (!isAdmin) {
    const returned = takeIntent("berth.billing");
    const wanted = takeIntent("berth.upgrade");
    let billing = null;
    try {
      const q = returned && returned.session_id ? "?session_id=" + enc(returned.session_id) : "";
      billing = (await get("/account/billing" + q)).billing;
    } catch (e) {
      billing = null;
    }
    if (!ctx.alive()) return;
    if (returned && returned.status === "success") toast(billing && billing.plan === "pro" ? "You're on Pro. Your new limits apply now." : "Payment received. Pro turns on in a moment.");
    if (returned && returned.status === "cancel") toast("Checkout canceled. You're still on Free.");
    if (wanted && billing && billing.self_service && billing.plan === "free") {
      startCheckout(wanted.interval === "year" ? "year" : "month");
    }
    let lim = a.limits || {};
    if (returned) {
      try {
        lim = (await get("/account")).account.limits || lim;
      } catch {}
      if (!ctx.alive()) return;
    }
    body.append(
      h(
        "section.card",
        h("div.card-h", h("div", h("h2", "Plan"), h("div.sub", "Limits are hard caps. Nothing is billed beyond your plan."))),
        billing ? planCard(billing) : null,
        h(
          "div.card-b.grid.g2",
          Object.entries(LIMIT_LABELS).map(([k, [label, fmt]]) => {
            const used = k === "apps" ? a.usage.apps : k === "storage_bytes" ? a.usage.storage_bytes : null;
            return h(
              "div",
              h("div.row.small", h("span.muted", label), h("span.spacer"), h("span.num", used !== null ? fmt(used) + " of " + fmt(lim[k]) : fmt(lim[k]))),
              used !== null ? h("div", { style: { marginTop: "6px" } }, meter(used, lim[k])) : null
            );
          })
        )
      )
    );
  }

  const keysBox = h("div");
  let tab = "sessions";
  const drawKeys = () => {
    const all = keys.keys || [];
    const sessions = all.filter((k) => k.expires_at && !k.revoked_at && Date.parse(k.expires_at) > Date.now());
    const cli = all.filter((k) => !k.expires_at && !k.revoked_at);
    const shown = tab === "sessions" ? sessions : cli;
    mount(
      keysBox,
      shown.length
        ? h(
            "div.tbl-wrap",
            h(
              "table.tbl",
              h("thead", h("tr", h("th", "Name"), h("th", "Key"), h("th", tab === "sessions" ? "Expires" : "Created"), h("th", "Last used"), h("th.actions", ""))),
              h(
                "tbody",
                shown.map((k) =>
                  h(
                    "tr",
                    h("td.strong", k.name, k.current ? h("span", { style: { marginLeft: "8px" } }, badge("this browser", "ok")) : null),
                    h("td.mono.small", k.prefix + "…"),
                    h("td.dim", tab === "sessions" ? timeEl(k.expires_at) : fmtDate(k.created_at)),
                    h("td.dim", timeEl(k.last_used_at)),
                    h(
                      "td.actions",
                      h(
                        "button.btn.ghost.sm",
                        {
                          type: "button",
                          onclick: () =>
                            confirmDanger({
                              title: k.current ? "Sign out of this browser" : "Revoke " + k.name,
                              text: k.current ? "This console session ends now." : "Anything using " + k.prefix + "… stops working right away.",
                              confirm: k.current ? "Sign out" : "Revoke",
                              onConfirm: async () => {
                                await del("/account/keys/" + enc(k.id));
                                if (k.current) {
                                  session.clear();
                                  location.hash = "#/login";
                                  location.reload();
                                  return;
                                }
                                toast("Revoked");
                                keys = await get("/account/keys");
                                drawKeys();
                              },
                            }),
                        },
                        k.current ? "Sign out" : "Revoke"
                      )
                    )
                  )
                )
              )
            )
          )
        : empty({ icon: "key", title: tab === "sessions" ? "No other sessions" : "No CLI keys", text: tab === "sessions" ? "" : "Create a key to use the berth CLI or CI without email codes." })
    );
    others.disabled = sessions.filter((k) => !k.current).length === 0;
  };
  const others = h(
    "button.btn.sm",
    {
      type: "button",
      onclick: () =>
        confirmDanger({
          title: "Sign out other sessions",
          text: "Every console session except this browser ends now. CLI keys are not touched.",
          confirm: "Sign out others",
          onConfirm: async () => {
            const targets = (keys.keys || []).filter((k) => k.expires_at && !k.revoked_at && !k.current);
            for (const k of targets) await del("/account/keys/" + enc(k.id));
            toast("Signed out " + targets.length + (targets.length === 1 ? " session" : " sessions"));
            keys = await get("/account/keys");
            drawKeys();
          },
        }),
    },
    "Sign out others"
  );
  body.append(
    h(
      "section.card",
      h(
        "div.card-h",
        h("div", h("h2", "Sessions and keys"), h("div.sub", "Console sessions last 7 days. Account keys (bak_) never expire and can manage every app you own.")),
        h("div.row", others, h("button.btn.sm.primary", { type: "button", onclick: () => createKey() }, icon("plus", "i-sm"), "Create CLI key"))
      ),
      h("div", { style: { padding: "12px 16px 0" } }, seg([["sessions", "Console sessions"], ["cli", "CLI and CI keys"]], tab, (v) => ((tab = v), drawKeys()))),
      keysBox
    )
  );
  drawKeys();

  body.append(
    h(
      "section.card",
      h("div.card-h", h("div", h("h2", "Use the CLI"), h("div.sub", "Everything here also works from your terminal."))),
      h("div.card-b", codeBlock("curl -fsSL https://atberth.com/install.sh | sh\nberth login --email " + a.email + "\nberth apps list"))
    )
  );

  if (!isAdmin)
    body.append(
      h(
        "section.card",
        { style: { borderColor: "color-mix(in srgb,var(--red) 35%,transparent)" } },
        h("div.card-h", h("div", h("h2", { style: { color: "var(--red)" } }, "Delete account"), h("div.sub", "Deletes your account and every app in it, with all their data. There is no undo."))),
        h(
          "div.card-b",
          h(
            "button.btn.danger",
            {
              type: "button",
              onclick: () =>
                confirmDanger({
                  title: "Delete your account",
                  text: "Your " + a.usage.apps + (a.usage.apps === 1 ? " app is" : " apps are") + " deleted with every table, file, function and key.",
                  confirm: "Delete account",
                  typeToConfirm: a.email,
                  onConfirm: async () => {
                    await del("/account?confirm=" + enc(a.email));
                    session.clear();
                    location.hash = "#/login";
                    location.reload();
                  },
                }),
            },
            icon("trash"),
            "Delete account"
          )
        )
      )
    );

  function createKey() {
    const name = input({ placeholder: "laptop", autofocus: true, maxlength: "60" });
    modal({
      title: "Create an account key",
      text: "For the berth CLI and CI. It can manage every app in your account and does not expire.",
      body: field("Name", name),
      actions: [
        { label: "Cancel" },
        {
          label: "Create key",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const out = await post("/account/keys", { name: name.value.trim() || "key" });
            keys = await get("/account/keys");
            tab = "cli";
            drawKeys();
            modal({
              title: "Account key created",
              persist: true,
              wide: true,
              body: h("div.stack", secretReveal(out.secret), h("div.field", h("label", "Save it for the CLI"), codeBlock("berth login --token " + out.secret))),
              actions: [{ label: "Done", kind: "primary" }],
            });
          },
        },
      ],
    });
  }
}
