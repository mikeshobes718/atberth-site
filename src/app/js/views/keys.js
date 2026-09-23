import { get, post, del, enc } from "../api.js";
import { h, mount, icon, toast, modal, confirmDanger, field, input, options, empty, errorBox, loading, badge, timeEl, secretReveal, fmtDate } from "../ui.js";
import { replace, appPath } from "../state.js";

export default async function keys(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug) + "/keys";
  const page = h("div.page");
  ctx.root.append(page);
  const list = h("div.card");
  let showRevoked = false;
  const revokedToggle = h("label.check-row.small", h("input", { type: "checkbox", onchange: (e) => ((showRevoked = e.target.checked), load()) }), "Show revoked");
  mount(
    page,
    h(
      "div.ph",
      h("div", h("h1", "API keys"), h("p", "Secret keys have full access to ", h("b", slug), ". Publishable keys are safe in phone and browser apps and only do what table and bucket policies allow.")),
      h("div.ph-actions", h("button.btn.primary", { type: "button", onclick: () => createKey() }, icon("plus"), "Create key"))
    ),
    h(
      "div.grid.g2",
      { style: { marginBottom: "18px" } },
      h("div.card.card-b", h("div.row", h("span.badge.bad", "bsk_"), h("b", "Secret")), h("p.small.muted", { style: { marginTop: "8px" } }, "Servers, CI and scripts. Never ship it inside an app.")),
      h("div.card.card-b", h("div.row", h("span.badge.ok", "bpk_"), h("b", "Publishable")), h("p.small.muted", { style: { marginTop: "8px" } }, "Phones and browsers. Pair it with a signed-in user's token."))
    ),
    h("div.row", { style: { marginBottom: "10px" } }, h("span.spacer"), revokedToggle),
    list
  );

  async function load() {
    mount(list, loading());
    let rows;
    try {
      rows = (await get(base)).keys || [];
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    const shown = rows.filter((k) => showRevoked || !k.revoked_at);
    if (!shown.length) {
      mount(list, empty({ icon: "key", title: "No active keys", text: "Create a key to call the API.", actions: [h("button.btn.primary", { type: "button", onclick: createKey }, icon("plus"), "Create key")] }));
      return;
    }
    mount(
      list,
      h(
        "div.tbl-wrap",
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "Name"), h("th", "Type"), h("th", "Key"), h("th", "Created"), h("th", "Last used"), h("th.actions", ""))),
          h(
            "tbody",
            shown.map((k) =>
              h(
                "tr",
                { style: k.revoked_at ? { opacity: ".5" } : null },
                h("td.strong", k.name),
                h("td", k.type === "secret" ? badge("secret", "bad") : badge("publishable", "ok")),
                h("td.mono.small", k.prefix + "…"),
                h("td.dim", fmtDate(k.created_at)),
                h("td.dim", k.revoked_at ? "revoked " + fmtDate(k.revoked_at) : timeEl(k.last_used_at)),
                h(
                  "td.actions",
                  k.revoked_at
                    ? null
                    : h(
                        "button.btn.ghost.sm",
                        {
                          type: "button",
                          onclick: () =>
                            confirmDanger({
                              title: "Revoke " + k.name,
                              text: "Requests with " + k.prefix + "… start failing right away. Anything still using it will break.",
                              confirm: "Revoke key",
                              onConfirm: async () => {
                                await del(base + "/" + enc(k.id));
                                toast("Key revoked");
                                load();
                              },
                            }),
                        },
                        "Revoke"
                      )
                )
              )
            )
          )
        )
      )
    );
  }

  function createKey() {
    const name = input({ placeholder: "production server", autofocus: true, maxlength: "60" });
    const type = options(
      [
        { value: "secret", label: "Secret", hint: "Full access, server only" },
        { value: "publishable", label: "Publishable", hint: "Safe in apps, policies apply" },
      ],
      "secret"
    );
    modal({
      title: "Create an API key for " + slug,
      body: h("div.form", field("Name", name, "So you can tell keys apart later."), field("Type", type)),
      actions: [
        { label: "Cancel" },
        {
          label: "Create key",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const t = type.get();
            const out = await post(base, { name: name.value.trim() || t, type: t });
            load();
            modal({
              title: "Key created",
              persist: true,
              text: out.key.name + ", " + t,
              body: secretReveal(out.secret, t === "secret" ? "Full access to " + slug + ". Copy it now, it is shown once." : "Copy it now. Publishable keys are safe to ship in apps."),
              actions: [{ label: "Done", kind: "primary" }],
            });
          },
        },
      ],
    });
  }

  await load();
  if (ctx.query.new) {
    replace(appPath(slug, "keys"));
    createKey();
  }
}
