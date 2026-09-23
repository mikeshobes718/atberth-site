import { post, enc } from "../api.js";
import { h, mount, icon, toast, toastError, seg, select, input, empty, badge, fmtNum, busy, download, spinner, copyBtn } from "../ui.js";

const TEMPLATES = [
  ["List tables", "select table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size\nfrom information_schema.tables\nwhere table_schema = 'public'\norder by pg_total_relation_size(quote_ident(table_name)) desc;"],
  ["Row counts", "select relname as table, n_live_tup as rows\nfrom pg_stat_user_tables\norder by n_live_tup desc;"],
  ["Columns of a table", "select column_name, data_type, is_nullable, column_default\nfrom information_schema.columns\nwhere table_schema = 'public' and table_name = 'notes'\norder by ordinal_position;"],
  ["Create a function", "create or replace function public.add(a int, b int)\nreturns int language sql as $$ select a + b $$;"],
  ["Slow queries", "select calls, round(mean_exec_time) as avg_ms, left(query, 120) as query\nfrom pg_stat_statements order by mean_exec_time desc limit 20;"],
];

export default async function sql(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug);
  const histKey = "berth-sql-history:" + slug;
  const draftKey = "berth-sql-draft:" + slug;
  const history = load(histKey, []);
  let mode = "sql";

  const page = h("div.page.flush");
  ctx.root.append(page);
  const pane = h("div.pane");
  const work = h("section.work");
  page.append(h("div.split", pane, work));

  const histList = h("div");
  const renderHist = () =>
    mount(
      histList,
      history.length
        ? history.slice(0, 40).map((q) => h("button.history-item", { type: "button", title: q.text, onclick: () => setText(q.text) }, q.text.replace(/\s+/g, " ").slice(0, 80)))
        : h("div.tiny.dim", { style: { padding: "6px 12px" } }, "Queries you run show up here.")
    );
  mount(
    pane,
    h("div.pane-h", h("h2", "SQL editor"), h("div.tiny.dim", "Runs as this app's own Postgres role, with row level security. 30 s max, 1,000 rows back.")),
    h(
      "div.pane-list",
      h("div.nav-title", { style: { padding: "10px 12px 6px" } }, "Templates"),
      TEMPLATES.map(([name, text]) => h("button.pane-item", { type: "button", onclick: () => setText(text) }, icon("sparkle", "i-sm"), h("span.nm", name))),
      h("div.nav-title", { style: { padding: "16px 12px 6px" } }, "History"),
      histList
    )
  );
  renderHist();

  const editor = h("textarea.editor", { spellcheck: "false", "aria-label": "SQL", placeholder: "select * from notes limit 20;" });
  editor.value = load(draftKey, "select now();");
  editor.addEventListener("input", () => save(draftKey, editor.value));
  editor.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const s = editor.selectionStart;
      editor.setRangeText("  ", s, editor.selectionEnd, "end");
    }
  });
  const setText = (t) => {
    editor.value = t;
    save(draftKey, t);
    editor.focus();
  };

  let readOnly = false;
  const ro = h("button.btn.sm", { type: "button", title: "Refuse writes for this run" }, icon("lock", "i-sm"), "Read only");
  ro.addEventListener("click", () => {
    readOnly = !readOnly;
    ro.classList.toggle("accent", readOnly);
  });
  const timeout = select([["10000", "10 s"], ["20000", "20 s"], ["30000", "30 s"]], "10000");
  timeout.classList.add("sm");
  timeout.style.width = "auto";
  const params = input({ placeholder: "params, like [1, \"a\"]", mono: true });
  params.classList.add("sm");
  params.style.width = "200px";
  const fnName = input({ placeholder: "function name", mono: true });
  fnName.classList.add("sm");
  fnName.style.width = "180px";
  const runBtn = h("button.btn.sm.primary", { type: "button", onclick: () => run() }, icon("play", "i-sm"), "Run", h("kbd", { style: { marginLeft: "4px", background: "transparent", color: "inherit", borderColor: "currentColor", opacity: ".5" } }, "⌘↵"));
  const sqlTools = h("div.row", ro, timeout, params);
  const rpcTools = h("div.row", fnName);
  rpcTools.style.display = "none";
  const results = h("div.sql-results");
  const resultBar = h("div.statusbar");

  mount(
    work,
    h(
      "div.sql-wrap",
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", minHeight: "0", borderBottom: "1px solid var(--line)" } },
        h(
          "div.toolbar",
          seg([["sql", "SQL"], ["rpc", "RPC"]], mode, (v) => {
            mode = v;
            sqlTools.style.display = v === "sql" ? "" : "none";
            rpcTools.style.display = v === "rpc" ? "" : "none";
            editor.placeholder = v === "rpc" ? '{"a": 1, "b": 2}' : "select * from notes limit 20;";
            if (v === "rpc" && !editor.value.trim().startsWith("{")) setText("{\n  \"a\": 1,\n  \"b\": 2\n}");
          }),
          sqlTools,
          rpcTools,
          h("span.spacer"),
          runBtn
        ),
        editor
      ),
      resultBar,
      results
    )
  );
  mount(results, empty({ icon: "sql", title: "Run a query", text: "Press Run or Cmd Enter. DDL like create table works too, and the table editor picks it up." }));

  async function run() {
    const text = editor.value.trim();
    if (!text) return;
    await busy(runBtn, async () => {
      mount(resultBar, spinner(), "Running");
      const t0 = performance.now();
      try {
        let out;
        if (mode === "rpc") {
          const fn = fnName.value.trim();
          if (!fn) throw new Error("Enter the function name to call.");
          let args = {};
          try {
            args = text ? JSON.parse(text) : {};
          } catch {
            throw new Error("Arguments must be a JSON object.");
          }
          out = await post(base + "/rpc/" + enc(fn), args);
          const ms = Math.round(performance.now() - t0);
          mount(resultBar, badge("rpc", "info"), h("span.mono", fn), h("span.spacer"), h("span.num", ms + " ms"));
          renderValue(out);
        } else {
          const body = { query: text, read_only: readOnly, timeout_ms: Number(timeout.value) };
          if (params.value.trim()) {
            try {
              body.params = JSON.parse(params.value);
              if (!Array.isArray(body.params)) throw 0;
            } catch {
              throw new Error("Params must be a JSON array, like [1, \"a\"].");
            }
          }
          out = await post(base + "/sql", body);
          renderResult(out);
        }
        remember(mode === "rpc" ? "-- rpc " + fnName.value.trim() + "\n" + text : text);
      } catch (e) {
        mount(resultBar, badge("error", "bad"), h("span.spacer"), e.requestId ? h("span.mono.tiny", e.requestId) : null);
        mount(results, h("div", { style: { padding: "18px" } }, h("div.bad-box", icon("alert"), h("div.mono.small", { style: { whiteSpace: "pre-wrap" } }, e.message))));
      }
    });
  }

  function remember(text) {
    const i = history.findIndex((x) => x.text === text);
    if (i >= 0) history.splice(i, 1);
    history.unshift({ text, at: Date.now() });
    history.length = Math.min(history.length, 50);
    save(histKey, history);
    renderHist();
  }

  function renderResult(out) {
    const cols = out.columns || [];
    const rows = out.rows || [];
    mount(
      resultBar,
      badge(out.command || "OK", "ok"),
      h("span.num", cols.length ? fmtNum(rows.length) + (rows.length === 1 ? " row" : " rows") : fmtNum(out.row_count ?? 0) + " affected"),
      out.truncated ? badge("truncated at 1,000", "warn") : null,
      h("span.spacer"),
      h("span.num", (out.duration_ms ?? 0) + " ms"),
      cols.length ? h("button.btn.ghost.sm", { type: "button", onclick: () => csv(cols, rows) }, icon("download", "i-sm"), "CSV") : null,
      cols.length ? copyBtn(() => JSON.stringify(rows.map((r) => (Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [colName(c), r[i]])) : r)), null, 2), { label: "Rows copied as JSON", title: "Copy as JSON" }) : null
    );
    if (!cols.length) {
      mount(results, h("div", { style: { padding: "18px" } }, h("div.info-box", icon("check"), h("div", (out.command || "Statement") + " ran. " + fmtNum(out.row_count ?? 0) + " rows affected."))));
      return;
    }
    const names = cols.map(colName);
    mount(
      results,
      h(
        "table.dg",
        h("thead", h("tr", names.map((n, i) => h("th", h("div.h", { style: { cursor: "default" } }, h("span", n), cols[i] && cols[i].type ? h("span.t", cols[i].type) : null))))),
        h(
          "tbody",
          rows.map((r) =>
            h(
              "tr",
              { style: { cursor: "default" } },
              names.map((n, i) => {
                const v = Array.isArray(r) ? r[i] : r[n];
                if (v === null || v === undefined) return h("td.null", "NULL");
                if (typeof v === "number") return h("td.n", String(v));
                if (typeof v === "boolean") return h("td." + (v ? "bool-t" : "bool-f"), String(v));
                const s = typeof v === "object" ? JSON.stringify(v) : String(v);
                return h("td", { title: s.length > 40 ? s.slice(0, 1000) : null }, s);
              })
            )
          )
        )
      )
    );
  }

  function renderValue(v) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] !== null) {
      const cols = Object.keys(v[0]).map((name) => ({ name }));
      return renderResult({ command: "RPC", columns: cols, rows: v.map((r) => cols.map((c) => r[c.name])), duration_ms: 0 });
    }
    mount(results, h("div", { style: { padding: "18px" } }, h("pre.code", JSON.stringify(v, null, 2))));
  }

  function colName(c) {
    return typeof c === "string" ? c : c.name;
  }

  function csv(cols, rows) {
    const names = cols.map(colName);
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const text = [names.join(","), ...rows.map((r) => names.map((n, i) => esc(Array.isArray(r) ? r[i] : r[n])).join(","))].join("\n");
    download(new Blob([text], { type: "text/csv" }), slug + "-query.csv");
    toast("Downloaded CSV");
  }

  requestAnimationFrame(() => editor.focus());
}

function load(k, dflt) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? dflt : JSON.parse(v);
  } catch {
    return dflt;
  }
}
function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}
