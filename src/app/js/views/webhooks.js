import { get, post, patch, del, enc } from "../api.js";
import { h, mount, icon, toast, toastError, modal, confirmDanger, drawer, field, input, select, empty, errorBox, loading, badge, timeEl, fmtDateTime, secretReveal, busy, toggle, copyBtn } from "../ui.js";

const EVENTS = ["insert", "update", "delete"];

export default async function webhooks(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug) + "/webhooks";
  const page = h("div.page");
  ctx.root.append(page);
  const list = h("div.card");
  mount(
    page,
    h(
      "div.ph",
      h("div", h("h1", "Webhooks"), h("p", "Berth POSTs a signed JSON event to your URL when rows change. Failed deliveries retry for about 2.5 hours.")),
      h("div.ph-actions", h("a.btn", { href: "/docs/webhooks/", target: "_blank", rel: "noopener" }, icon("book"), "Verify signatures"), h("button.btn.primary", { type: "button", onclick: () => addHook() }, icon("plus"), "Add webhook"))
    ),
    list
  );

  let tables = [];
  get("/apps/" + enc(slug) + "/tables")
    .then((o) => (tables = (o.tables || []).filter((t) => t.kind !== "view").map((t) => t.name)))
    .catch(() => {});

  async function load() {
    mount(list, loading());
    let rows;
    try {
      rows = (await get(base)).webhooks || [];
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    if (!rows.length) {
      mount(list, empty({ icon: "webhook", title: "No webhooks yet", text: "Send row inserts, updates and deletes to Slack, Zapier, your own server, or a Berth function.", actions: [h("button.btn.primary", { type: "button", onclick: () => addHook() }, icon("plus"), "Add webhook")] }));
      return;
    }
    mount(
      list,
      h(
        "div.tbl-wrap",
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "Endpoint"), h("th", "Table"), h("th", "Events"), h("th", "Status"), h("th", "Created"), h("th.actions", ""))),
          h(
            "tbody",
            rows.map((w) =>
              h(
                "tr.click",
                { onclick: () => hookDrawer(w) },
                h("td", h("div.strong.mono.small.trunc", { title: w.url }, w.url), w.description ? h("div.tiny.dim", w.description) : null),
                h("td", w.table ? h("span.badge.mono", w.table) : h("span.dim", "all tables")),
                h("td", h("div.row", { style: { gap: "4px" } }, w.events.map((e) => badge(e)))),
                h("td", w.enabled ? badge("enabled", "ok") : badge("paused", "warn")),
                h("td.dim", timeEl(w.created_at)),
                h("td.actions", icon("chev", "i-sm"))
              )
            )
          )
        )
      )
    );
  }

  function eventPicker(selected) {
    const boxes = EVENTS.map((e) => ({ e, box: h("input", { type: "checkbox", checked: selected.includes(e) }) }));
    const el = h("div.row", { style: { gap: "18px" } }, boxes.map((b) => h("label.check-row", b.box, b.e)));
    el.get = () => boxes.filter((b) => b.box.checked).map((b) => b.e);
    return el;
  }

  function addHook() {
    const url = input({ type: "url", placeholder: "https://example.com/hooks/berth", mono: true, autofocus: true });
    const table = select([["", "All tables"], ...tables], "");
    const events = eventPicker(EVENTS);
    const desc = input({ placeholder: "optional" });
    modal({
      title: "Add webhook",
      body: h("div.form", field("Endpoint URL", url, "Public HTTPS. Private and loopback addresses are refused."), field("Table", table), h("div.field", h("label", "Events"), events), field("Description", desc)),
      actions: [
        { label: "Cancel" },
        {
          label: "Add webhook",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const ev = events.get();
            if (!ev.length) throw new Error("Pick at least one event.");
            const body = { url: url.value.trim(), events: ev };
            if (table.value) body.table = table.value;
            if (desc.value.trim()) body.description = desc.value.trim();
            const out = await post(base, body);
            load();
            modal({
              title: "Webhook added",
              persist: true,
              text: "Use this secret to check the Berth-Signature header on every delivery.",
              body: secretReveal(out.secret),
              actions: [{ label: "I saved it", kind: "primary" }],
            });
          },
        },
      ],
    });
  }

  function hookDrawer(w) {
    const url = input({ value: w.url, mono: true });
    const events = eventPicker(w.events);
    let enabled = w.enabled;
    const en = toggle(enabled, (v) => (enabled = v), "Enabled");
    const deliveries = h("div", loading());
    const loadDeliveries = async () => {
      try {
        const rows = (await get(base + "/" + enc(w.id) + "/deliveries?limit=30")).deliveries || [];
        mount(
          deliveries,
          rows.length
            ? h(
                "div.card",
                rows.map((d) =>
                  h(
                    "div.list-row",
                    { style: { alignItems: "flex-start" } },
                    d.status === "delivered" ? badge("delivered", "ok") : d.status === "failed" ? badge("failed", "bad") : badge(d.status, "warn"),
                    h(
                      "div",
                      { style: { minWidth: 0, flex: "1" } },
                      h("div.small", h("span.mono", d.event_type), d.last_status_code ? h("span.dim", " · HTTP " + d.last_status_code) : null, h("span.dim", " · " + d.attempts + (d.attempts === 1 ? " attempt" : " attempts"))),
                      d.last_error ? h("div.tiny.bad-text.mono", { style: { overflowWrap: "anywhere" } }, d.last_error) : null,
                      d.status === "pending" && d.next_attempt_at ? h("div.tiny.dim", "Next try " + fmtDateTime(d.next_attempt_at)) : null
                    ),
                    h("span.tiny.dim", timeEl(d.created_at))
                  )
                )
              )
            : h("div.dim.small", "No deliveries yet. Send a test ping.")
        );
      } catch (e) {
        mount(deliveries, h("div.bad-box", icon("alert"), e.message));
      }
    };
    loadDeliveries();
    drawer({
      title: "Webhook",
      sub: w.id,
      width: 600,
      body: h(
        "div.form",
        h("label.check-row", en, "Enabled"),
        field("Endpoint URL", url),
        h("div.field", h("label", "Events"), events),
        h("dl.kv", h("dt", "Table"), h("dd.mono", w.table || "all tables"), h("dt", "Created"), h("dd", fmtDateTime(w.created_at)), h("dt", "Id"), h("dd.row", { style: { gap: "4px" } }, h("span.mono.tiny", w.id), copyBtn(w.id))),
        h("div.hr"),
        h(
          "div.row",
          h("h3", { style: { fontSize: "14px", fontWeight: "600" } }, "Recent deliveries"),
          h("span.spacer"),
          h("button.btn.sm", { type: "button", onclick: loadDeliveries }, icon("refresh", "i-sm")),
          h(
            "button.btn.sm",
            {
              type: "button",
              onclick: (e) =>
                busy(e.currentTarget, async () => {
                  try {
                    const out = await post(base + "/" + enc(w.id) + "/test", {});
                    const d = out.delivery || {};
                    toast(d.status === "delivered" ? "Ping delivered" : "Ping sent: " + (d.status || "queued") + (d.last_status_code ? ", HTTP " + d.last_status_code : ""), { bad: d.status === "failed" });
                    loadDeliveries();
                  } catch (err) {
                    toastError(err);
                  }
                }),
            },
            icon("send", "i-sm"),
            "Send test ping"
          )
        ),
        deliveries
      ),
      foot: (close) => [
        h(
          "button.btn.danger",
          {
            type: "button",
            onclick: () =>
              confirmDanger({
                title: "Remove webhook",
                text: "Berth stops sending events to " + w.url + ".",
                confirm: "Remove",
                onConfirm: async () => {
                  await del(base + "/" + enc(w.id));
                  toast("Webhook removed");
                  close();
                  load();
                },
              }),
          },
          icon("trash"),
          "Remove"
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
                  const body = {};
                  if (url.value.trim() !== w.url) body.url = url.value.trim();
                  const ev = events.get();
                  if (!ev.length) throw new Error("Pick at least one event.");
                  if (ev.join() !== w.events.join()) body.events = ev;
                  if (enabled !== w.enabled) body.enabled = enabled;
                  if (Object.keys(body).length) {
                    await patch(base + "/" + enc(w.id), body);
                    toast("Webhook saved");
                    load();
                  }
                  close();
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

  load();
}
