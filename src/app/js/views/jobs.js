import { get, post, del, enc } from "../api.js";
import { h, mount, icon, seg, toast, toastError, drawer, field, input, select, empty, errorBox, loading, badge, timeEl, fmtDateTime, busy } from "../ui.js";

// Background jobs: a function run outside a request, for minutes, with retries.
export default async function jobs(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug) + "/jobs";
  const page = h("div.page");
  ctx.root.append(page);
  let status = "";
  const list = h("div.card");
  const counts = h("div.row.small.dim", { style: { marginBottom: "10px", gap: "14px" } });
  let timer = setInterval(() => load(true), 5000);
  ctx.onCleanup(() => clearInterval(timer));
  mount(
    page,
    h("div.ph",
      h("div", h("h1", "Jobs"), h("p", "Run a function in the background for up to 15 minutes, with retries. ", h("a", { href: "https://atberth.com/docs/jobs/", target: "_blank", rel: "noopener" }, "How jobs work"))),
      h("div.ph-actions", h("button.btn.primary", { type: "button", onclick: () => queue() }, icon("plus"), "Queue a job"))),
    h("div.row.wrap", { style: { marginBottom: "12px", gap: "10px" } },
      seg([["", "All"], ["queued", "Queued"], ["running", "Running"], ["succeeded", "Succeeded"], ["failed", "Failed"]], status, (v) => ((status = v), load()))),
    counts,
    list
  );
  const kind = (s) => ({ succeeded: "ok", failed: "bad", running: "info", queued: "", cancelled: "" })[s] || "";

  async function load(quiet) {
    if (!quiet) mount(list, loading());
    let d;
    try {
      d = await get(base + "?limit=100" + (status ? "&status=" + status : ""));
    } catch (e) {
      if (!quiet) mount(list, errorBox(e, load));
      return;
    }
    mount(counts, Object.entries(d.counts || {}).map(([k, v]) => h("span", h("b", String(v)), " " + k)));
    if (!d.jobs.length) {
      mount(list, empty({ icon: "clock", title: "No jobs", text: "Queue one here, from your server with the secret key, or from a function." }));
      return;
    }
    mount(list, h("div.tbl-wrap", h("table.tbl",
      h("thead", h("tr", h("th", "Function"), h("th", "Status"), h("th", "Attempts"), h("th", "Queued"), h("th", "Runs at"), h("th", "Error"), h("th.actions", ""))),
      h("tbody", d.jobs.map((j) => h("tr.click", { onclick: () => show(j) },
        h("td.strong.mono.small", j.function),
        h("td", badge(j.status, kind(j.status))),
        h("td.dim", j.attempts + " of " + j.max_attempts),
        h("td.dim", timeEl(j.created_at)),
        h("td.dim", j.status === "queued" ? timeEl(j.run_at) : ""),
        h("td.small.dim.trunc", { style: { maxWidth: "260px" } }, j.error || ""),
        h("td.actions", icon("chev", "i-sm"))))))));
  }

  function show(j) {
    drawer({
      title: j.function, sub: j.id, width: 620,
      body: h("div.form",
        h("dl.kv", h("dt", "Status"), h("dd", badge(j.status, kind(j.status))), h("dt", "Attempts"), h("dd", j.attempts + " of " + j.max_attempts),
          h("dt", "Queued"), h("dd", fmtDateTime(j.created_at)), h("dt", "Started"), h("dd", j.started_at ? fmtDateTime(j.started_at) : "not yet"),
          h("dt", "Finished"), h("dd", j.finished_at ? fmtDateTime(j.finished_at) : "not yet"), h("dt", "Time limit"), h("dd", j.timeout_seconds + " s"),
          j.idempotency_key ? [h("dt", "Idempotency key"), h("dd.mono.small", j.idempotency_key)] : null),
        h("div.small.strong", "Payload"), h("pre.code", h("code", JSON.stringify(j.payload, null, 2))),
        j.result !== null && j.result !== undefined ? [h("div.small.strong", "Result" + (j.result_status ? " (" + j.result_status + ")" : "")), h("pre.code", h("code", typeof j.result === "string" ? j.result : JSON.stringify(j.result, null, 2)))] : null,
        j.error ? h("div.bad-box", icon("alert"), j.error) : null),
      foot: (close) => [
        j.status === "queued" ? h("button.btn.danger", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
          try { await del(base + "/" + j.id); toast("Job cancelled"); close(); load(); } catch (err) { toastError(err); }
        }) }, "Cancel job") : null,
        h("span.spacer"), h("button.btn", { type: "button", onclick: close }, "Close"),
      ],
    });
  }

  async function queue() {
    let fns = [];
    try { fns = (await get("/apps/" + enc(slug) + "/functions")).functions || []; } catch (e) { return toastError(e); }
    if (!fns.length) return toastError(new Error("Deploy a function first: a job runs one of the app's functions."));
    const fn = select(fns.map((f) => [f.name, f.name]), fns[0].name);
    const payload = h("textarea.input.mono", { rows: "6", placeholder: '{"user": 42}' });
    const delay = input({ type: "number", min: "0", placeholder: "0", mono: true });
    const attempts = input({ type: "number", min: "1", max: "10", value: "3", mono: true });
    drawer({
      title: "Queue a job", width: 520,
      body: h("div.form", field("Function", fn), field("Payload (JSON)", payload, "Sent as the request body."), h("div.grid.g2", field("Start after (seconds)", delay), field("Attempts", attempts))),
      foot: (close) => [h("span.spacer"), h("button.btn", { type: "button", onclick: close }, "Cancel"),
        h("button.btn.primary", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
          try {
            const body = { function: fn.value, max_attempts: Number(attempts.value || 3), delay_seconds: Number(delay.value || 0) };
            if (payload.value.trim()) body.payload = JSON.parse(payload.value);
            await post(base, body);
            toast("Job queued"); close(); load();
          } catch (err) { toastError(err); }
        }) }, "Queue")],
    });
  }

  load();
}
