import { API, get, put, del, api, enc } from "../api.js";
import { h, mount, icon, toast, toastError, modal, confirmDanger, menu, field, input, select, options, seg, empty, errorBox, loading, spinner, badge, fmtNum, timeEl, fmtDateTime, busy, copyBtn, toggle } from "../ui.js";
import { state, appPath, replace } from "../state.js";

const TEMPLATES = {
  hello: `export default async (req: Request) => {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "world";
  return Response.json({ hello: name, at: new Date().toISOString() });
};
`,
  db: `// BERTH_SECRET_KEY and BERTH_API_URL are injected for you.
const api = Deno.env.get("BERTH_API_URL") + "/apps/" + Deno.env.get("BERTH_APP");
const key = Deno.env.get("BERTH_SECRET_KEY");

export default async (req: Request) => {
  const res = await fetch(api + "/tables/notes/rows?limit=10&order=created_at.desc", {
    headers: { Authorization: "Bearer " + key },
  });
  return Response.json(await res.json(), { status: res.status });
};
`,
  cron: `// Deploy with a schedule, like */15 * * * *. Berth POSTs here each due minute.
export default async (req: Request) => {
  const { scheduled_at } = await req.json();
  console.log("tick", scheduled_at);
  return new Response("ok");
};
`,
  webhook: `// Receive signed webhooks from another service.
export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const event = await req.json();
  console.log("event", event.type);
  return Response.json({ received: true });
};
`,
};

export default async function functions(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug);
  const page = h("div.page.flush");
  ctx.root.append(page);
  const pane = h("div.pane");
  const work = h("section.work");
  page.append(h("div.split", pane, work));
  let fns = [];
  let current = ctx.rest[0] ? decodeURIComponent(ctx.rest[0]) : null;
  const exempt = state.me.role === "admin";
  const maxTimeout = exempt ? 400000 : 30000;
  const maxMemory = exempt ? 1024 : 256;
  let timers = [];
  ctx.onCleanup(() => timers.forEach(clearInterval));

  const listEl = h("div.pane-list");
  mount(pane, h("div.pane-h", h("div.row", h("h2", "Functions"), h("span.spacer"), h("button.btn.sm", { type: "button", onclick: () => newFunction() }, icon("plus", "i-sm"), "New"))), listEl);

  function renderList() {
    mount(
      listEl,
      fns.map((f) =>
        h(
          "button.pane-item" + (f.name === current ? ".on" : ""),
          { type: "button", onclick: () => open(f.name) },
          icon(f.schedule ? "clock" : "fn", "i-sm"),
          h("span.nm", f.name),
          h("span.meta", "v" + f.version)
        )
      ),
      !fns.length ? h("div.dim.small", { style: { padding: "12px 10px" } }, "No functions yet.") : null,
      h("div.nav-title", { style: { padding: "18px 10px 6px" } }, "Configuration"),
      h("button.pane-item" + (current === "@env" ? ".on" : ""), { type: "button", onclick: () => open("@env") }, icon("lock", "i-sm"), h("span.nm", "Environment variables"))
    );
  }

  async function loadList() {
    fns = (await get(base + "/functions")).functions || [];
    renderList();
  }

  function open(name, tab) {
    current = name;
    replace(appPath(slug, "functions", name === "@env" ? "env" : name));
    ctx.chrome();
    renderList();
    timers.forEach(clearInterval);
    timers = [];
    if (name === "@env") envView();
    else showFn(name, tab);
  }

  async function showFn(name, tab = "code") {
    mount(work, loading());
    let f;
    try {
      f = (await get(base + "/functions/" + enc(name) + "/deployment")).function;
    } catch (e) {
      mount(work, errorBox(e, () => showFn(name, tab)));
      return;
    }
    if (current !== name) return;
    const host = h("div", { style: { flex: "1", display: "flex", flexDirection: "column", minHeight: "0" } });
    const tabs = seg([["code", "Code"], ["invoke", "Invoke"], ["logs", "Logs"], ["settings", "Settings"]], tab, (v) => render(v));
    mount(
      work,
      h(
        "div.toolbar",
        h("div.title", icon(f.schedule ? "clock" : "fn"), f.name),
        badge("v" + f.version, "mono"),
        badge("auth: " + f.verify, f.verify === "none" ? "warn" : ""),
        f.schedule ? badge(f.schedule, "info") : null,
        h("span.spacer"),
        tabs,
        h(
          "button.btn.ghost.icon.sm",
          {
            type: "button",
            "aria-label": "Function actions",
            onclick: (e) =>
              menu(
                e.currentTarget,
                [
                  { label: "Copy URL", icon: "link", onClick: () => navigator.clipboard.writeText(f.url).then(() => toast("URL copied")) },
                  "-",
                  {
                    label: "Delete function",
                    icon: "trash",
                    danger: true,
                    onClick: () =>
                      confirmDanger({
                        title: "Delete " + f.name,
                        text: "The function stops answering at its URL" + (f.schedule ? " and its schedule stops" : "") + ".",
                        confirm: "Delete function",
                        typeToConfirm: f.name,
                        onConfirm: async () => {
                          await del(base + "/functions/" + enc(f.name) + "/deployment");
                          toast("Function deleted");
                          current = null;
                          await loadList();
                          replace(appPath(slug, "functions"));
                          ctx.chrome();
                          showEmpty();
                        },
                      }),
                  },
                ],
                { align: "right" }
              ),
          },
          icon("more")
        )
      ),
      host
    );
    function render(which) {
      timers.forEach(clearInterval);
      timers = [];
      if (which === "code") codeTab(f, host);
      else if (which === "logs") logsTab(f, host);
      else if (which === "invoke") invokeTab(f, host);
      else settingsTab(f, host);
    }
    render(tab);
  }

  function codeTab(f, host) {
    const ed = h("textarea.editor", { spellcheck: "false", "aria-label": "Function source" });
    ed.value = f.source || "";
    const dirty = h("span.tiny.dim");
    ed.addEventListener("input", () => (dirty.textContent = ed.value !== f.source ? "Unsaved changes" : ""));
    ed.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        ed.setRangeText("  ", ed.selectionStart, ed.selectionEnd, "end");
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        deployBtn.click();
      }
    });
    const deployBtn = h(
      "button.btn.sm.primary",
      {
        type: "button",
        onclick: (e) =>
          busy(e.currentTarget, async () => {
            try {
              const out = await put(base + "/functions/" + enc(f.name) + "/deployment", { source: ed.value, verify: f.verify, timeout_ms: f.timeout_ms, memory_mb: f.memory_mb });
              Object.assign(f, out.function, { source: ed.value });
              dirty.textContent = "";
              toast("Deployed " + f.name + " v" + f.version);
              await loadList();
              showFn(f.name, "code");
            } catch (err) {
              toastError(err);
            }
          }),
      },
      icon("send", "i-sm"),
      "Deploy"
    );
    mount(
      host,
      h(
        "div.statusbar",
        { style: { borderTop: "0", borderBottom: "1px solid var(--line)" } },
        h("span.mono", "fn.ts"),
        dirty,
        h("span.spacer"),
        h("span", "Updated " + fmtDateTime(f.updated_at)),
        h("kbd", "⌘S"),
        deployBtn
      ),
      ed
    );
  }

  function settingsTab(f, host) {
    const verify = options(
      [
        { value: "key", label: "Key", hint: "Any key for this app" },
        { value: "user", label: "Signed-in user", hint: "Needs a user access token" },
        { value: "none", label: "Public", hint: "Anyone. Check auth yourself" },
      ],
      f.verify
    );
    const timeout = input({ type: "number", value: String(f.timeout_ms), min: "100", max: String(maxTimeout), mono: true });
    const memory = input({ type: "number", value: String(f.memory_mb), min: "32", max: String(maxMemory), mono: true });
    let hasSched = !!f.schedule;
    const sched = input({ value: f.schedule || "", placeholder: "*/15 * * * *", mono: true });
    sched.disabled = !hasSched;
    const schedT = toggle(hasSched, (v) => {
      hasSched = v;
      sched.disabled = !v;
      if (v && !sched.value) sched.value = "@hourly";
    }, "Run on a schedule");
    mount(
      host,
      h(
        "div",
        { style: { overflow: "auto", flex: "1" } },
        h(
          "div.stack",
          { style: { padding: "20px", maxWidth: "760px" } },
          h(
            "section.card",
            h("div.card-h", h("h2", "Endpoint")),
            h("div.card-b.stack", { style: { gap: "12px" } }, h("div.secret", h("span", f.url), copyBtn(f.url)), h("div.hint", "Sub paths reach the same function, like ", h("code", "/functions/" + f.name + "/any/path"), "."))
          ),
          h(
            "section.card",
            h("div.card-h", h("h2", "Runtime")),
            h(
              "div.card-b.form",
              field("Who can call it", verify),
              h("div.form-row", field("Timeout (ms)", timeout, "Up to " + fmtNum(maxTimeout)), field("Memory (MB)", memory, "Up to " + fmtNum(maxMemory))),
              h("label.check-row", schedT, "Run on a schedule (UTC)"),
              field("Cron", sched, "Five fields, or @hourly, @daily, @weekly, @monthly")
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
                        const out = await put(base + "/functions/" + enc(f.name) + "/deployment", {
                          source: f.source,
                          verify: verify.get(),
                          timeout_ms: Number(timeout.value),
                          memory_mb: Number(memory.value),
                          schedule: hasSched ? sched.value.trim() : null,
                        });
                        toast("Saved and redeployed as v" + out.function.version);
                        await loadList();
                        showFn(f.name, "settings");
                      } catch (err) {
                        toastError(err);
                      }
                    }),
                },
                "Save and redeploy"
              )
            )
          )
        )
      )
    );
  }

  function logsTab(f, host) {
    const list = h("div");
    let auto = false;
    const autoT = toggle(false, (v) => {
      auto = v;
      timers.forEach(clearInterval);
      timers = v ? [setInterval(load, 4000)] : [];
    }, "Auto refresh");
    mount(
      host,
      h("div.toolbar", h("label.check-row.small", autoT, "Auto refresh"), h("span.spacer"), h("button.btn.sm", { type: "button", onclick: () => load() }, icon("refresh", "i-sm"), "Refresh")),
      h("div", { style: { overflow: "auto", flex: "1" } }, list)
    );
    async function load() {
      if (!list.childNodes.length) mount(list, loading());
      let out;
      try {
        out = await get(base + "/functions/" + enc(f.name) + "/logs?limit=100");
      } catch (e) {
        mount(list, errorBox(e, load));
        return;
      }
      const rows = out.logs || [];
      if (!rows.length) {
        mount(list, empty({ icon: "logs", title: "No runs yet", text: "Invoke the function and its console output shows up here." }));
        return;
      }
      mount(
        list,
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "Status"), h("th", "Invocation"), h("th.r", "Duration"), h("th", "When"), h("th", "Output"))),
          h(
            "tbody",
            rows.map((l) => {
              const out = (l.error ? l.error + (l.logs ? "\n" : "") : "") + (l.logs || "");
              const tr = h(
                "tr.click",
                h("td", h("span.st.s" + String(l.status || 5)[0], String(l.status || "err"))),
                h("td.mono.tiny.dim", l.invocation_id),
                h("td.r.num.dim", fmtNum(l.duration_ms) + " ms"),
                h("td.dim", timeEl(l.created_at)),
                h("td.mono.tiny.trunc", { style: { maxWidth: "420px" } }, out.split("\n")[0] || "")
              );
              tr.addEventListener("click", () =>
                modal({
                  title: "Run " + l.invocation_id,
                  text: fmtDateTime(l.created_at) + " · " + l.status + " · " + l.duration_ms + " ms",
                  wide: true,
                  body: out ? h("pre.code", { style: { maxHeight: "60vh", whiteSpace: "pre-wrap" } }, out) : h("div.dim", "No output."),
                  actions: [{ label: "Close" }],
                })
              );
              return tr;
            })
          )
        )
      );
    }
    load();
  }

  function invokeTab(f, host) {
    const method = select(["POST", "GET", "PUT", "PATCH", "DELETE"], f.schedule ? "POST" : "GET");
    method.style.width = "110px";
    const path = input({ placeholder: "/sub/path?name=ana", mono: true });
    const body = h("textarea.textarea.mono", { rows: 8, placeholder: '{"hello": "world"}' }, f.schedule ? JSON.stringify({ scheduled_at: new Date().toISOString().slice(0, 16) + ":00Z" }, null, 2) : "");
    const out = h("div");
    const send = h(
      "button.btn.primary",
      {
        type: "button",
        onclick: (e) =>
          busy(e.currentTarget, async () => {
            const t0 = performance.now();
            try {
              const opts = { response: true, headers: {} };
              if (method.value !== "GET" && body.value.trim()) {
                opts.raw = body.value;
                opts.headers["Content-Type"] = /^\s*[[{]/.test(body.value) ? "application/json" : "text/plain";
              }
              const p = path.value.trim();
              const res = await api(method.value, base + "/functions/" + enc(f.name) + (p ? (p.startsWith("/") || p.startsWith("?") ? p : "/" + p) : ""), opts).catch((err) => err);
              const ms = Math.round(performance.now() - t0);
              if (res instanceof Error) {
                mount(out, h("div.row", { style: { marginBottom: "10px" } }, h("span.st.s" + String(res.status || 5)[0], String(res.status || "error")), h("span.dim", ms + " ms"), res.requestId ? h("span.mono.tiny.dim", res.requestId) : null), h("pre.code", res.message));
                return;
              }
              const text = await res.text();
              let pretty = text;
              try {
                pretty = JSON.stringify(JSON.parse(text), null, 2);
              } catch {}
              const hdrs = [];
              res.headers.forEach((v, k) => hdrs.push(k + ": " + v));
              mount(
                out,
                h("div.row", { style: { marginBottom: "10px" } }, h("span.st.s" + String(res.status)[0], String(res.status)), h("span.dim", ms + " ms"), h("span.mono.tiny.dim", res.headers.get("X-Berth-Invocation") || ""), h("span.spacer"), copyBtn(text, { title: "Copy body" })),
                h("pre.code", { style: { maxHeight: "44vh" } }, pretty || "(empty body)"),
                h("details", { style: { marginTop: "10px" } }, h("summary.small.dim", { style: { cursor: "pointer" } }, "Response headers"), h("pre.code", { style: { marginTop: "8px" } }, hdrs.join("\n")))
              );
            } catch (err) {
              toastError(err);
            }
          }),
      },
      icon("play"),
      "Send request"
    );
    mount(
      host,
      h(
        "div",
        { style: { overflow: "auto", flex: "1" } },
        h(
          "div.grid.g2",
          { style: { padding: "20px", alignItems: "start" } },
          h(
            "section.card",
            h("div.card-h", h("div", h("h2", "Request"), h("div.sub", "Sent with your console key, like a caller holding a secret key."))),
            h("div.card-b.form", h("div.row", method, path), field("Body", body)),
            h("div.card-f", send)
          ),
          h("section.card", h("div.card-h", h("h2", "Response")), h("div.card-b", out))
        )
      )
    );
    mount(out, h("div.dim.small", "Send a request to see the response."));
  }

  async function envView() {
    mount(work, loading());
    let rows;
    try {
      rows = (await get(base + "/env")).env || [];
    } catch (e) {
      mount(work, errorBox(e, envView));
      return;
    }
    const setVar = (existing) => {
      const name = input({ placeholder: "STRIPE_KEY", mono: true, value: existing || "", autofocus: !existing });
      if (existing) name.disabled = true;
      const value = h("textarea.textarea.mono", { rows: 3, placeholder: "value", autofocus: !!existing, spellcheck: "false" });
      modal({
        title: existing ? "Update " + existing : "Add environment variable",
        text: "Values are encrypted at rest and never shown again. Functions read them with Deno.env.get.",
        body: h("div.form", field("Name", name, "Capitals, digits and underscore. BERTH_ and DENO_ are reserved."), field("Value", value)),
        actions: [
          { label: "Cancel" },
          {
            label: "Save",
            kind: "primary",
            submit: true,
            onClick: async () => {
              const n = name.value.trim().toUpperCase();
              await put(base + "/env/" + enc(n), { value: value.value });
              toast(n + " saved");
              envView();
            },
          },
        ],
      });
    };
    mount(
      work,
      h("div.toolbar", h("div.title", icon("lock"), "Environment variables"), h("span.spacer"), h("button.btn.sm.primary", { type: "button", onclick: () => setVar() }, icon("plus", "i-sm"), "Add variable")),
      h(
        "div",
        { style: { overflow: "auto", flex: "1", padding: "20px" } },
        h("div.info-box", { style: { marginBottom: "16px", maxWidth: "760px" } }, icon("info"), h("div.small", "Every function in ", h("b", slug), " gets these, plus BERTH_API_URL, BERTH_APP and BERTH_SECRET_KEY. Redeploys are not needed: new values apply on the next run.")),
        rows.length
          ? h(
              "div.card",
              { style: { maxWidth: "760px" } },
              h(
                "table.tbl",
                h("thead", h("tr", h("th", "Name"), h("th", "Value"), h("th", "Updated"), h("th.actions", ""))),
                h(
                  "tbody",
                  rows.map((r) =>
                    h(
                      "tr",
                      h("td.mono.strong", r.name),
                      h("td.dim.mono", "••••••••"),
                      h("td.dim", timeEl(r.updated_at)),
                      h(
                        "td.actions",
                        h("button.btn.ghost.sm", { type: "button", onclick: () => setVar(r.name) }, "Update"),
                        h(
                          "button.btn.ghost.icon.sm",
                          {
                            type: "button",
                            "aria-label": "Remove",
                            onclick: () =>
                              confirmDanger({
                                title: "Remove " + r.name,
                                text: "Functions that read " + r.name + " get undefined from the next run.",
                                confirm: "Remove",
                                onConfirm: async () => {
                                  await del(base + "/env/" + enc(r.name));
                                  toast(r.name + " removed");
                                  envView();
                                },
                              }),
                          },
                          icon("trash", "i-sm")
                        )
                      )
                    )
                  )
                )
              )
            )
          : h("div.card", { style: { maxWidth: "760px" } }, empty({ icon: "lock", title: "No variables yet", text: "Store API keys and settings for your functions here.", actions: [h("button.btn.primary", { type: "button", onclick: () => setVar() }, icon("plus"), "Add variable")] }))
      )
    );
  }

  function newFunction() {
    const name = input({ placeholder: "hello", mono: true, autofocus: true });
    const tpl = options(
      [
        { value: "hello", label: "Hello", hint: "Returns JSON" },
        { value: "db", label: "Read a table", hint: "Uses the injected secret key" },
        { value: "cron", label: "Scheduled job", hint: "Runs on a cron" },
        { value: "webhook", label: "Webhook receiver", hint: "Accepts POSTs" },
      ],
      "hello"
    );
    const verify = select([["key", "Key: any key for this app"], ["user", "Signed-in user only"], ["none", "Public: anyone"]], "key");
    modal({
      title: "New function",
      text: "One TypeScript file, run in Deno with network access to the public internet.",
      wide: true,
      body: h("div.form", field("Name", name, "Lowercase letters, numbers, dashes or underscores."), field("Start from", tpl), field("Who can call it", verify)),
      actions: [
        { label: "Cancel" },
        {
          label: "Create and deploy",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const n = name.value.trim();
            const body = { source: TEMPLATES[tpl.get()], verify: verify.value };
            if (tpl.get() === "cron") body.schedule = "@hourly";
            await put(base + "/functions/" + enc(n) + "/deployment", body);
            toast("Deployed " + n);
            await loadList();
            open(n, "code");
          },
        },
      ],
    });
  }

  function showEmpty() {
    mount(
      work,
      empty({
        icon: "fn",
        title: fns.length ? "Pick a function" : "No functions yet",
        text: "Functions are single TypeScript files that run in Deno, on request or on a schedule. They get this app's secret key automatically.",
        actions: [h("button.btn.primary", { type: "button", onclick: newFunction }, icon("plus"), "New function"), h("button.btn", { type: "button", onclick: () => open("@env") }, icon("lock"), "Environment variables")],
      })
    );
  }

  try {
    await loadList();
  } catch (e) {
    mount(work, errorBox(e, () => location.reload()));
    return;
  }
  if (!ctx.alive()) return;
  if (current === "env") open("@env");
  else if (current && fns.find((f) => f.name === current)) open(current);
  else {
    current = null;
    showEmpty();
  }
  if (ctx.query.new) {
    replace(appPath(slug, "functions"));
    newFunction();
  }
}
