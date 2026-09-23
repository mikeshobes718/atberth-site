import { api, patch, del, enc } from "../api.js";
import { h, mount, icon, toast, toastError, confirmDanger, input, busy, copyBtn, download, fmtDateTime, fmtBytes, spinner } from "../ui.js";
import { state, go, loadApps } from "../state.js";

export default async function settings(ctx) {
  const { slug, app } = ctx;
  const base = "/apps/" + enc(slug);
  const page = h("div.page");
  ctx.root.append(page);
  let origins = [...(app.cors_origins || ["*"])];

  const originList = h("div.chips");
  const originInput = input({ placeholder: "https://example.com", mono: true });
  const drawOrigins = () =>
    mount(
      originList,
      origins.map((o, i) =>
        h("span.chip", o === "*" ? "* (any origin)" : o, h("button", { type: "button", "aria-label": "Remove " + o, onclick: () => { origins.splice(i, 1); drawOrigins(); } }, icon("x", "i-sm")))
      ),
      !origins.length ? h("span.dim.small", "No origins. Add one, or * for any.") : null
    );
  const addOrigin = () => {
    const v = originInput.value.trim().replace(/\/$/, "");
    if (!v) return;
    if (v !== "*" && !/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(v)) return toastError(new Error("Origins look like https://example.com, with no path."));
    if (v === "*") origins = ["*"];
    else {
      origins = origins.filter((o) => o !== "*");
      if (!origins.includes(v)) origins.push(v);
    }
    originInput.value = "";
    drawOrigins();
  };
  originInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addOrigin();
    }
  });
  drawOrigins();

  const row = (label, value, copyable) => [h("dt", label), h("dd.row", { style: { gap: "4px" } }, h("span.mono.small", value), copyable ? copyBtn(value) : null)];

  mount(
    page,
    h("div.ph", h("div", h("h1", "Settings"), h("p", "General details, browser access, backups and deletion for ", h("b", slug), "."))),
    h(
      "div.stack",
      { style: { maxWidth: "860px" } },
      h(
        "section.card",
        h("div.card-h", h("h2", "General")),
        h(
          "div.card-b",
          h(
            "dl.kv",
            row("Name", app.slug, true),
            row("App id", app.id, true),
            row("API URL", app.api_url, true),
            row("Database", "app_" + app.slug),
            [h("dt", "Created"), h("dd", fmtDateTime(app.created_at))],
            state.me.role === "admin" ? [h("dt", "Owner"), h("dd.mono.small", app.account_id || "platform admin")] : null
          )
        )
      ),
      h(
        "section.card",
        h("div.card-h", h("div", h("h2", "Browser origins (CORS)"), h("div.sub", "Which websites may call this app with a publishable key or a user token."))),
        h(
          "div.card-b.stack",
          { style: { gap: "12px" } },
          originList,
          h("div.input-group", originInput, h("button.btn", { type: "button", onclick: addOrigin }, icon("plus", "i-sm"), "Add")),
          h("div.hint", "Secret keys are never limited by origin. Native phone apps do not send an origin.")
        ),
        h(
          "div.card-f",
          h(
            "button.btn.primary",
            {
              type: "button",
              onclick: (e) =>
                busy(e.currentTarget, async () => {
                  try {
                    const out = await patch(base, { cors_origins: origins.length ? origins : ["*"] });
                    origins = [...out.app.cors_origins];
                    drawOrigins();
                    await loadApps();
                    toast("Origins saved");
                  } catch (err) {
                    toastError(err);
                  }
                }),
            },
            "Save origins"
          )
        )
      ),
      h(
        "section.card",
        h("div.card-h", h("div", h("h2", "Backup"), h("div.sub", "Download the whole database as a pg_dump custom format file. Restore it into a new app from the apps page, or with pg_restore."))),
        h(
          "div.card-b.row",
          h(
            "button.btn",
            {
              type: "button",
              onclick: (e) =>
                busy(e.currentTarget, async () => {
                  try {
                    const blob = await api("GET", base + "/export", { blob: true });
                    const stamp = new Date().toISOString().slice(0, 10);
                    download(blob, slug + "-" + stamp + ".dump");
                    toast("Exported " + fmtBytes(blob.size));
                  } catch (err) {
                    toastError(err);
                  }
                }),
            },
            icon("download"),
            "Export database"
          ),
          h("span.hint", "Files in storage are not included.")
        )
      ),
      h(
        "section.card",
        { style: { borderColor: "color-mix(in srgb,var(--red) 35%,transparent)" } },
        h("div.card-h", h("div", h("h2", { style: { color: "var(--red)" } }, "Delete app"), h("div.sub", "Deletes the database, every file, function, webhook and key. There is no undo."))),
        h(
          "div.card-b",
          h(
            "button.btn.danger",
            {
              type: "button",
              onclick: () =>
                confirmDanger({
                  title: "Delete " + slug,
                  text: "The database app_" + slug + ", its files, functions, webhooks, users and keys are deleted for good. Export first if you might need anything.",
                  confirm: "Delete app",
                  typeToConfirm: slug,
                  onConfirm: async () => {
                    await del(base);
                    await loadApps();
                    toast(slug + " deleted");
                    go("/");
                  },
                }),
            },
            icon("trash"),
            "Delete this app"
          )
        )
      )
    )
  );
}
