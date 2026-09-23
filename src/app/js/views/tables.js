import { get, post, patch, del, api, enc, qs, stream } from "../api.js";
import {
  h, mount, append, clear, icon, toast, toastError, modal, confirmDanger, drawer, menu, field, input, select, toggle, options, seg,
  empty, errorBox, loading, spinner, badge, fmtNum, fmtCompact, busy, pickFile, download, debounce, copyBtn,
} from "../ui.js";
import { appPath, replace } from "../state.js";

export const TYPES = ["text", "integer", "bigint", "numeric", "double", "boolean", "date", "timestamptz", "uuid", "jsonb", "text[]", "integer[]"];
const OPS = [
  ["eq", "equals"],
  ["neq", "not equal"],
  ["gt", "greater than"],
  ["gte", "at least"],
  ["lt", "less than"],
  ["lte", "at most"],
  ["ilike", "matches (ilike)"],
  ["like", "matches (like)"],
  ["in", "is one of"],
  ["is", "is"],
  ["cs", "contains"],
];
const READ = [
  { value: "secret", label: "Secret", hint: "Only secret keys and your servers" },
  { value: "public", label: "Public", hint: "Anyone with the publishable key" },
  { value: "authenticated", label: "Signed in", hint: "Any signed-in user" },
  { value: "owner", label: "Owner", hint: "Each user sees only their rows" },
];
const WRITE = READ.filter((r) => r.value !== "public");
const PAGE = 100;

export default async function tables(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug);
  const page = h("div.page.flush");
  ctx.root.append(page);
  const pane = h("div.pane");
  const work = h("section.work");
  page.append(h("div.split", pane, work));

  let list = [];
  let current = ctx.rest[0] ? decodeURIComponent(ctx.rest[0]) : null;
  let stopLive = null;
  ctx.onCleanup(() => stopLive && stopLive());

  const search = input({ type: "search", placeholder: "Search tables", "aria-label": "Search tables" });
  const listEl = h("div.pane-list");
  mount(
    pane,
    h(
      "div.pane-h",
      h("div.row", h("h2", "Tables"), h("span.spacer"), h("button.btn.sm", { type: "button", onclick: () => newTable() }, icon("plus", "i-sm"), "New")),
      h("div.search", icon("search"), search)
    ),
    listEl
  );
  search.addEventListener("input", () => renderList());

  function renderList() {
    const term = search.value.trim().toLowerCase();
    const items = list.filter((t) => !term || t.name.includes(term));
    mount(
      listEl,
      items.length
        ? items.map((t) =>
            h(
              "button.pane-item" + (t.name === current ? ".on" : ""),
              { type: "button", onclick: () => open(t.name), title: t.name },
              icon(t.kind === "view" ? "eye" : "table", "i-sm"),
              h("span.nm", t.name),
              t.kind === "view" ? h("span.meta", "view") : policyDot(t.policy)
            )
          )
        : h("div.dim.small", { style: { padding: "12px 10px" } }, term ? "No tables match." : "No tables yet.")
    );
  }

  async function loadList() {
    mount(listEl, h("div.center", spinner()));
    const out = await get(base + "/tables");
    list = out.tables || [];
    renderList();
  }

  function open(name) {
    current = name;
    replace(appPath(slug, "tables", name));
    ctx.chrome();
    renderList();
    showTable(name);
  }

  async function showTable(name, tab = "data") {
    stopLive && stopLive();
    stopLive = null;
    const meta = list.find((t) => t.name === name);
    if (!meta) {
      mount(work, empty({ icon: "table", title: "Table not found", text: "There is no table called " + name + "." }));
      return;
    }
    mount(work, loading("Loading " + name));
    let detail = null;
    if (meta.kind !== "view") {
      try {
        detail = (await get(base + "/tables/" + enc(name))).table;
      } catch (e) {
        mount(work, errorBox(e, () => showTable(name, tab)));
        return;
      }
    }
    if (current !== name) return;
    const t = detail || { ...meta, indexes: [], foreign_keys: [] };
    const host = h("div", { style: { display: "flex", flexDirection: "column", flex: "1", minHeight: "0" } });
    const tabs = seg([["data", "Data"], ["structure", "Structure"]], tab, (v) => render(v));
    const actions = h("div.row");
    mount(
      work,
      h(
        "div.toolbar",
        h("div.title", icon(t.kind === "view" ? "eye" : "table"), t.name),
        t.kind === "view" ? badge("view", "info") : policyBadge(t.policy),
        h("span.spacer"),
        actions,
        tabs,
        t.kind !== "view"
          ? h(
              "button.btn.ghost.icon",
              {
                type: "button",
                "aria-label": "Table actions",
                onclick: (e) =>
                  menu(
                    e.currentTarget,
                    [
                      { label: "Rename table", icon: "edit", onClick: () => renameTable(t) },
                      { label: "Change policy", icon: "lock", onClick: () => editPolicy(t) },
                      { label: "Copy table name", icon: "copy", onClick: () => navigator.clipboard.writeText(t.name).then(() => toast("Copied")) },
                      "-",
                      { label: "Drop table", icon: "trash", danger: true, onClick: () => dropTable(t) },
                    ],
                    { align: "right" }
                  ),
              },
              icon("more")
            )
          : null
      ),
      host
    );
    function render(which) {
      stopLive && stopLive();
      stopLive = null;
      clear(actions);
      if (which === "data") dataView(t, host, actions);
      else structureView(t, host);
    }
    render(tab);
  }

  /* ---------- data grid ---------- */

  function dataView(t, host, actions) {
    const cols = t.columns;
    const pk = [...(t.primary_key || [])];
    const editable = t.kind !== "view";
    const st = { filters: [], order: null, offset: 0, rows: [], count: null, selected: new Set(), live: false };

    const chips = h("div.chips");
    const grid = h("div.gridwrap");
    const status = h("div.statusbar");
    const bulk = h("div.row");
    const liveBtn = h("button.btn.sm", { type: "button", title: "Stream inserts, updates and deletes as they happen" }, icon("live", "i-sm"), "Live");
    liveBtn.addEventListener("click", () => setLive(!st.live));

    append(actions, [
      bulk,
      h("button.btn.sm", { type: "button", onclick: (e) => addFilter(e.currentTarget) }, icon("filter", "i-sm"), "Filter"),
      liveBtn,
      h("button.btn.sm.icon", { type: "button", "aria-label": "Refresh", title: "Refresh", onclick: () => load() }, icon("refresh", "i-sm")),
      h(
        "button.btn.sm.icon",
        {
          type: "button",
          "aria-label": "More",
          onclick: (e) =>
            menu(
              e.currentTarget,
              [
                editable ? { label: "Import CSV or NDJSON", icon: "upload", onClick: () => importRows(t, load) } : null,
                { label: "Download this page as CSV", icon: "download", onClick: () => exportCsv(t, st.rows) },
                { label: "Copy as cURL", icon: "terminal", onClick: () => navigator.clipboard.writeText(curlFor(t, st)).then(() => toast("Copied")) },
              ].filter(Boolean),
              { align: "right" }
            ),
        },
        icon("more", "i-sm")
      ),
      editable ? h("button.btn.sm.primary", { type: "button", onclick: () => rowDrawer(t, null, load) }, icon("plus", "i-sm"), "Insert row") : null,
    ]);
    mount(host, h("div", { style: { padding: "0 14px" } }, chips), grid, status);

    function query() {
      const q = new URLSearchParams();
      for (const f of st.filters) q.append(f.col, (f.not ? "not." : "") + f.op + "." + f.value);
      if (st.order) q.set("order", st.order.col + "." + st.order.dir);
      q.set("limit", PAGE);
      q.set("offset", st.offset);
      q.set("count", "exact");
      return q.toString();
    }

    async function load() {
      mount(grid, loading());
      try {
        const out = await get(base + "/tables/" + enc(t.name) + "/rows?" + query());
        st.rows = out.rows || [];
        st.count = out.count ?? null;
        st.selected.clear();
        draw();
      } catch (e) {
        mount(grid, errorBox(e, load));
        mount(status);
      }
    }

    function renderChips() {
      mount(
        chips,
        st.filters.map((f, i) =>
          h(
            "span.chip",
            { style: { marginTop: "10px" } },
            f.col + " " + (f.not ? "not " : "") + f.op + " " + f.value,
            h("button", { type: "button", "aria-label": "Remove filter", onclick: () => { st.filters.splice(i, 1); st.offset = 0; renderChips(); load(); } }, icon("x", "i-sm"))
          )
        ),
        st.filters.length ? h("button.btn.ghost.sm", { type: "button", style: { marginTop: "10px" }, onclick: () => { st.filters = []; st.offset = 0; renderChips(); load(); } }, "Clear") : null
      );
    }

    function addFilter(anchor) {
      const col = select(cols.map((c) => c.name), cols[0] && cols[0].name);
      const op = select(OPS.map(([v, l]) => [v, l]), "eq");
      const not = h("input", { type: "checkbox" });
      const val = input({ placeholder: "value", mono: true });
      const hint = h("div.hint");
      const upd = () => {
        hint.textContent =
          op.value === "in" ? "Comma separated, like a,b,c" : op.value === "is" ? "null, true or false" : op.value.includes("like") ? "Use * as the wildcard, like *ann*" : op.value === "cs" ? 'JSON, like ["tag"] or {"k":1}' : "";
      };
      op.addEventListener("change", upd);
      upd();
      modal({
        title: "Add filter",
        body: h("div.form", h("div.form-row", field("Column", col), field("Operator", op)), field("Value", val, hint), h("label.check-row", not, "Negate (not)")),
        actions: [
          { label: "Cancel" },
          {
            label: "Apply filter",
            kind: "primary",
            submit: true,
            onClick: async () => {
              let v = val.value.trim();
              if (op.value === "in") v = "(" + v.replace(/^\(|\)$/g, "") + ")";
              st.filters.push({ col: col.value, op: op.value, value: v, not: not.checked });
              st.offset = 0;
              renderChips();
              await load();
            },
          },
        ],
      });
    }

    function draw() {
      const thead = h(
        "tr",
        h("th.ck", editable && pk.length ? h("input", { type: "checkbox", "aria-label": "Select all", checked: st.rows.length && st.selected.size === st.rows.length, onchange: (e) => { st.selected = e.target.checked ? new Set(st.rows.map(keyOf)) : new Set(); draw(); } }) : null),
        cols.map((c) => {
          const sorted = st.order && st.order.col === c.name;
          return h(
            "th",
            h(
              "div.h",
              {
                title: "Sort by " + c.name,
                onclick: () => {
                  if (!sorted) st.order = { col: c.name, dir: "asc" };
                  else if (st.order.dir === "asc") st.order.dir = "desc";
                  else st.order = null;
                  st.offset = 0;
                  load();
                },
              },
              pk.includes(c.name) ? h("span.pk", { title: "Primary key" }, icon("key", "i-sm")) : null,
              h("span", c.name),
              h("span.t", c.type),
              sorted ? h("span.sort", st.order.dir === "asc" ? "↑" : "↓") : null
            )
          );
        })
      );
      const body = st.rows.map((r) => {
        const k = keyOf(r);
        const tr = h(
          "tr" + (st.selected.has(k) ? ".sel" : ""),
          { dataset: { key: k } },
          h(
            "td.ck",
            { onclick: (e) => e.stopPropagation() },
            editable && pk.length
              ? h("input", { type: "checkbox", "aria-label": "Select row", checked: st.selected.has(k), onchange: (e) => { e.target.checked ? st.selected.add(k) : st.selected.delete(k); tr.classList.toggle("sel", e.target.checked); drawBulk(); } })
              : null
          ),
          cols.map((c) => cell(r[c.name], c))
        );
        tr.addEventListener("click", () => rowDrawer(t, r, load));
        return tr;
      });
      if (!st.rows.length) {
        mount(
          grid,
          h("table.dg", h("thead", thead)),
          empty({
            icon: "table",
            title: st.filters.length ? "No rows match" : "This table is empty",
            text: st.filters.length ? "Try removing a filter." : editable ? "Insert a row, or import a CSV or NDJSON file." : "",
            actions: editable && !st.filters.length ? [h("button.btn.primary", { type: "button", onclick: () => rowDrawer(t, null, load) }, icon("plus"), "Insert row"), h("button.btn", { type: "button", onclick: () => importRows(t, load) }, icon("upload"), "Import")] : null,
          })
        );
      } else mount(grid, h("table.dg", h("thead", thead), h("tbody", body)));
      drawStatus();
      drawBulk();
    }

    function keyOf(r) {
      return pk.length ? JSON.stringify(pk.map((p) => r[p])) : JSON.stringify(r);
    }

    function drawBulk() {
      const n = st.selected.size;
      mount(
        bulk,
        n
          ? h(
              "button.btn.sm.danger",
              {
                type: "button",
                onclick: () =>
                  confirmDanger({
                    title: "Delete " + n + (n === 1 ? " row" : " rows"),
                    text: "This deletes the selected rows from " + t.name + ". It cannot be undone.",
                    confirm: "Delete rows",
                    onConfirm: async () => {
                      const rows = st.rows.filter((r) => st.selected.has(keyOf(r)));
                      for (let i = 0; i < rows.length; i += 10) {
                        await Promise.all(rows.slice(i, i + 10).map((r) => deleteRow(t, r, pk)));
                      }
                      toast("Deleted " + rows.length + (rows.length === 1 ? " row" : " rows"));
                      await load();
                    },
                  }),
              },
              icon("trash", "i-sm"),
              "Delete " + n
            )
          : null
      );
    }

    function drawStatus() {
      const from = st.rows.length ? st.offset + 1 : 0;
      const to = st.offset + st.rows.length;
      const total = st.count;
      mount(
        status,
        h("span.num", total !== null ? `Rows ${fmtNum(from)} to ${fmtNum(to)} of ${fmtNum(total)}` : `${fmtNum(st.rows.length)} rows`),
        st.live ? h("span.row", { style: { gap: "6px" } }, h("span.pulse"), "Live") : null,
        h("span.spacer"),
        h("button.btn.sm", { type: "button", disabled: st.offset === 0, onclick: () => { st.offset = Math.max(0, st.offset - PAGE); load(); } }, icon("chev", "i-sm"), "Previous"),
        h("button.btn.sm", { type: "button", disabled: total !== null ? to >= total : st.rows.length < PAGE, onclick: () => { st.offset += PAGE; load(); } }, "Next", icon("chev", "i-sm"))
      );
      const prev = status.querySelector("button .i");
      if (prev) prev.style.transform = "rotate(180deg)";
    }

    function setLive(on) {
      st.live = on;
      liveBtn.classList.toggle("accent", on);
      stopLive && stopLive();
      stopLive = null;
      if (on) {
        stopLive = stream(
          base + "/tables/" + enc(t.name) + "/stream",
          (ev, e) => {
            const rec = e.record || e.old_record;
            if (!rec) return;
            const k = pk.length ? JSON.stringify(pk.map((p) => rec[p])) : null;
            if (e.type === "insert" && st.offset === 0 && !st.filters.length) {
              st.rows.unshift(e.record);
              if (st.count !== null) st.count++;
              draw();
              flashRow(k);
            } else if (e.type === "update" && k) {
              const i = st.rows.findIndex((r) => keyOf(r) === k);
              if (i >= 0) {
                st.rows[i] = e.record;
                draw();
                flashRow(k);
              }
            } else if (e.type === "delete" && k) {
              const i = st.rows.findIndex((r) => keyOf(r) === k);
              if (i >= 0) {
                st.rows.splice(i, 1);
                if (st.count !== null) st.count--;
                draw();
              }
            } else toast(e.type + " in " + t.name);
          },
          (s, code) => {
            if (s === "error" && code) {
              toast("Live stream stopped (" + code + ").", { bad: true });
              st.live = false;
              liveBtn.classList.remove("accent");
            }
            drawStatus();
          }
        );
        toast("Live: changes to " + t.name + " stream in.");
      }
      drawStatus();
    }

    function flashRow(k) {
      if (!k) return;
      const tr = [...grid.querySelectorAll("tbody tr")].find((x) => x.dataset.key === k);
      tr && tr.querySelectorAll("td").forEach((td) => td.classList.add("flash"));
    }

    renderChips();
    load();
  }

  async function deleteRow(t, r, pk) {
    if (pk.length === 1) return del(base + "/tables/" + enc(t.name) + "/rows/" + enc(String(r[pk[0]])));
    const q = pk.map((p) => enc(p) + "=eq." + enc(String(r[p]))).join("&");
    return del(base + "/tables/" + enc(t.name) + "/rows?" + q);
  }

  /* ---------- row drawer ---------- */

  function rowDrawer(t, row, reload) {
    const isNew = !row;
    const pk = t.primary_key || [];
    const editable = t.kind !== "view" && (isNew || pk.length);
    const inputs = {};
    const form = h("div.form");
    for (const c of t.columns) {
      const val = row ? row[c.name] : undefined;
      const auto = isNew && c.default !== null && c.default !== undefined;
      const ctl = valueInput(c, val, isNew);
      inputs[c.name] = ctl;
      const label = h(
        "div.row",
        { style: { gap: "8px" } },
        h("label", { style: { fontSize: "12.5px", fontWeight: "500" } }, c.name),
        h("span.badge.mono", c.type),
        pk.includes(c.name) ? badge("primary key", "warn") : null,
        !c.nullable ? h("span.tiny.dim", "required") : null,
        h("span.spacer"),
        c.nullable && editable ? ctl.nullToggle : null
      );
      form.append(h("div.field", label, ctl.el, auto ? h("div.hint", "Leave empty to use the default: ", h("code", String(c.default).slice(0, 60))) : null));
    }
    if (!editable) form.prepend(h("div.info-box", icon("info"), h("div.small", t.kind === "view" ? "Views are read only." : "This table has no primary key, so rows cannot be edited one at a time here. Use the SQL editor.")));
    const close = drawer({
      title: isNew ? "Insert row" : "Edit row",
      sub: t.name + (row && pk.length ? " · " + pk.map((p) => row[p]).join(", ") : ""),
      body: form,
      width: 560,
      foot: (close) => [
        !isNew && editable
          ? h(
              "button.btn.danger",
              {
                type: "button",
                onclick: () =>
                  confirmDanger({
                    title: "Delete this row",
                    text: "The row is removed from " + t.name + ". It cannot be undone.",
                    confirm: "Delete row",
                    onConfirm: async () => {
                      await deleteRow(t, row, pk);
                      toast("Row deleted");
                      close();
                      reload();
                    },
                  }),
              },
              icon("trash"),
              "Delete"
            )
          : null,
        !isNew ? copyBtn(() => JSON.stringify(row, null, 2), { label: "Row JSON copied", small: false, title: "Copy row as JSON" }) : null,
        h("span.spacer"),
        h("button.btn", { type: "button", onclick: close }, "Cancel"),
        editable
          ? h(
              "button.btn.primary",
              {
                type: "button",
                onclick: (e) =>
                  busy(e.currentTarget, async () => {
                    try {
                      const body = {};
                      for (const c of t.columns) {
                        const r = inputs[c.name].read();
                        if (r === undefined) continue;
                        if (!isNew && JSON.stringify(r) === JSON.stringify(row[c.name])) continue;
                        body[c.name] = r;
                      }
                      if (isNew) {
                        await post(base + "/tables/" + enc(t.name) + "/rows", body);
                        toast("Row inserted");
                      } else {
                        if (!Object.keys(body).length) return close();
                        if (pk.length === 1) await patch(base + "/tables/" + enc(t.name) + "/rows/" + enc(String(row[pk[0]])), body);
                        else await patch(base + "/tables/" + enc(t.name) + "/rows?" + pk.map((p) => enc(p) + "=eq." + enc(String(row[p]))).join("&"), body);
                        toast("Row saved");
                      }
                      close();
                      reload();
                    } catch (err) {
                      toastError(err);
                    }
                  }),
              },
              isNew ? "Insert" : "Save changes"
            )
          : null,
      ],
    });
    return close;
  }

  function valueInput(c, val, isNew) {
    let isNull = !isNew && (val === null || val === undefined);
    const type = c.type;
    let el;
    const isJson = type === "jsonb" || type === "json" || type.endsWith("[]");
    if (type === "boolean") {
      el = select([["", isNew ? "(default)" : "(unchanged)"], ["true", "true"], ["false", "false"]], val === true ? "true" : val === false ? "false" : "");
    } else if (isJson) {
      el = h("textarea.textarea.mono", { rows: 4, spellcheck: "false", placeholder: type.endsWith("[]") ? '["a", "b"]' : '{"key": "value"}' }, val !== undefined && val !== null ? JSON.stringify(val, null, 2) : "");
    } else {
      el = input({ mono: true, value: val !== undefined && val !== null ? String(val) : "", placeholder: isNull ? "NULL" : type === "timestamptz" ? "2026-09-22T10:00:00Z" : type === "date" ? "2026-09-22" : type === "uuid" ? "auto" : "" });
      if (String(val || "").length > 80 && type === "text") {
        const ta = h("textarea.textarea.mono", { rows: 5 }, String(val));
        el = ta;
      }
    }
    const nullToggle = h("label.check-row.tiny.dim", { style: { fontSize: "12px" } }, h("input", { type: "checkbox", checked: isNull, onchange: (e) => { isNull = e.target.checked; el.disabled = isNull; } }), "NULL");
    el.disabled = isNull;
    const read = () => {
      if (isNull) return null;
      const raw = el.value;
      if (type === "boolean") return raw === "" ? undefined : raw === "true";
      if (raw === "") return isNew ? undefined : type === "text" ? "" : undefined;
      if (isJson) {
        try {
          return JSON.parse(raw);
        } catch {
          throw new Error(c.name + " must be valid JSON.");
        }
      }
      if (type === "integer" || type === "double" || type === "smallint" || type === "real") {
        const n = Number(raw);
        if (isNaN(n)) throw new Error(c.name + " must be a number.");
        return n;
      }
      if (type === "bigint" || type === "numeric") {
        const n = Number(raw);
        if (isNaN(n)) throw new Error(c.name + " must be a number.");
        return Number.isSafeInteger(n) || type === "numeric" ? (String(n) === raw.trim() ? n : raw.trim()) : raw.trim();
      }
      return raw;
    };
    return { el, read, nullToggle };
  }

  /* ---------- structure ---------- */

  function structureView(t, host) {
    const wrap = h("div", { style: { overflow: "auto", flex: "1" } });
    const inner = h("div.stack", { style: { padding: "20px", maxWidth: "1100px", gap: "18px" } });
    wrap.append(inner);
    mount(host, wrap);
    const view = t.kind === "view";
    const pk = t.primary_key || [];

    inner.append(
      h(
        "section.card",
        h("div.card-h", h("div", h("h2", "Columns"), h("div.sub", t.columns.length + " columns")), view ? null : h("button.btn.sm.primary", { type: "button", onclick: () => addColumn(t) }, icon("plus", "i-sm"), "Add column")),
        h(
          "div.tbl-wrap",
          h(
            "table.tbl",
            h("thead", h("tr", h("th", "Name"), h("th", "Type"), h("th", "Nullable"), h("th", "Default"), h("th.actions", ""))),
            h(
              "tbody",
              t.columns.map((c) =>
                h(
                  "tr",
                  h("td.strong.mono", pk.includes(c.name) ? h("span.row", { style: { gap: "6px" } }, h("span", { style: { color: "var(--amber)" } }, icon("key", "i-sm")), c.name) : c.name),
                  h("td", h("span.badge.mono", c.type)),
                  h("td", c.nullable ? h("span.dim", "yes") : "no"),
                  h("td.mono.small.dim.trunc", { title: c.default || "" }, c.default || ""),
                  h(
                    "td.actions",
                    view
                      ? null
                      : h(
                          "button.btn.ghost.icon.sm",
                          {
                            type: "button",
                            "aria-label": "Column actions",
                            onclick: (e) =>
                              menu(
                                e.currentTarget,
                                [
                                  { label: "Edit column", icon: "edit", onClick: () => editColumn(t, c) },
                                  "-",
                                  {
                                    label: "Drop column",
                                    icon: "trash",
                                    danger: true,
                                    onClick: () =>
                                      confirmDanger({
                                        title: "Drop column " + c.name,
                                        text: "Every value in " + t.name + "." + c.name + " is deleted.",
                                        confirm: "Drop column",
                                        typeToConfirm: c.name,
                                        onConfirm: async () => {
                                          await del(base + "/tables/" + enc(t.name) + "/columns/" + enc(c.name));
                                          toast("Column dropped");
                                          await refreshTable(t.name, "structure");
                                        },
                                      }),
                                  },
                                ],
                                { align: "right" }
                              ),
                          },
                          icon("more")
                        )
                  )
                )
              )
            )
          )
        )
      )
    );
    if (view) return;

    inner.append(
      h(
        "div.grid.g2",
        h(
          "section.card",
          h("div.card-h", h("div", h("h2", "Indexes")), h("button.btn.sm", { type: "button", onclick: () => addIndex(t) }, icon("plus", "i-sm"), "Add index")),
          (t.indexes || []).length
            ? h(
                "div",
                t.indexes.map((ix) =>
                  h(
                    "div.list-row",
                    h("span.dim", icon("index")),
                    h("div", { style: { minWidth: 0 } }, h("div.mono.small", ix.name), h("div.tiny.dim", (ix.columns || []).join(", "))),
                    h("span.spacer"),
                    ix.primary ? badge("primary", "warn") : ix.unique ? badge("unique", "info") : null,
                    ix.primary
                      ? null
                      : h(
                          "button.btn.ghost.icon.sm",
                          {
                            type: "button",
                            "aria-label": "Drop index",
                            onclick: () =>
                              confirmDanger({
                                title: "Drop index " + ix.name,
                                text: "Queries that used this index may get slower.",
                                confirm: "Drop index",
                                onConfirm: async () => {
                                  await del(base + "/tables/" + enc(t.name) + "/indexes/" + enc(ix.name));
                                  toast("Index dropped");
                                  await refreshTable(t.name, "structure");
                                },
                              }),
                          },
                          icon("trash", "i-sm")
                        )
                  )
                )
              )
            : h("div.card-b.dim.small", "No indexes.")
        ),
        h(
          "section.card",
          h("div.card-h", h("div", h("h2", "Access policy"), h("div.sub", "Who can use publishable keys and user tokens on this table")), h("button.btn.sm", { type: "button", onclick: () => editPolicy(t) }, icon("edit", "i-sm"), "Change")),
          h(
            "div.card-b",
            h(
              "dl.kv",
              h("dt", "Read"),
              h("dd", policyBadge({ read: t.policy.read, write: "" }, "read"), h("div.tiny.dim", { style: { marginTop: "4px" } }, (READ.find((r) => r.value === t.policy.read) || {}).hint || "")),
              h("dt", "Write"),
              h("dd", policyBadge({ read: "", write: t.policy.write }, "write"), h("div.tiny.dim", { style: { marginTop: "4px" } }, (WRITE.find((r) => r.value === t.policy.write) || {}).hint || "")),
              h("dt", "Rows (estimate)"),
              h("dd.num", fmtNum(t.row_estimate || 0))
            )
          )
        )
      )
    );
    if ((t.foreign_keys || []).length)
      inner.append(
        h(
          "section.card",
          h("div.card-h", h("h2", "Foreign keys")),
          h(
            "div",
            t.foreign_keys.map((fk) =>
              h(
                "div.list-row",
                h("span.dim", icon("link")),
                h("span.mono.small", fk.columns.join(", ")),
                icon("arrow", "i-sm"),
                h("a.link.mono.small", { href: "#" + appPath(slug, "tables", fk.references.table) }, fk.references.table + "(" + fk.references.columns.join(", ") + ")"),
                h("span.spacer"),
                badge("on delete " + fk.on_delete)
              )
            )
          )
        )
      );
  }

  async function refreshTable(name, tab) {
    await loadList();
    if (!list.find((t) => t.name === name)) {
      current = null;
      replace(appPath(slug, "tables"));
      ctx.chrome();
      return showEmpty();
    }
    current = name;
    renderList();
    showTable(name, tab);
  }

  function addColumn(t) {
    const name = input({ placeholder: "column_name", mono: true, autofocus: true });
    const type = select(TYPES, "text");
    const def = input({ placeholder: "optional", mono: true });
    const nn = h("input", { type: "checkbox" });
    const uq = h("input", { type: "checkbox" });
    const refT = select([["", "None"], ...list.filter((x) => x.kind !== "view").map((x) => x.name)], "");
    const onDel = select([["", "no action"], "cascade", "restrict", ["set null", "set null"]], "");
    modal({
      title: "Add column to " + t.name,
      body: h(
        "div.form",
        h("div.form-row", field("Name", name), field("Type", type)),
        field("Default", def, "A JSON value, or now(), gen_random_uuid(), current_date, auth.uid()"),
        h("div.row", h("label.check-row", nn, "Not null"), h("label.check-row", uq, "Unique")),
        h("div.form-row", field("References table", refT), field("On delete", onDel))
      ),
      actions: [
        { label: "Cancel" },
        {
          label: "Add column",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const body = { name: name.value.trim(), type: type.value };
            const d = parseDefault(def.value, type.value);
            if (d !== undefined) body.default = d;
            if (nn.checked) body.not_null = true;
            if (uq.checked) body.unique = true;
            if (refT.value) body.references = { table: refT.value, ...(onDel.value ? { on_delete: onDel.value } : {}) };
            await post(base + "/tables/" + enc(t.name) + "/columns", body);
            toast("Column added");
            await refreshTable(t.name, "structure");
          },
        },
      ],
    });
  }

  function editColumn(t, c) {
    const name = input({ value: c.name, mono: true, autofocus: true });
    const type = select(TYPES.includes(c.type) ? TYPES : [c.type, ...TYPES], c.type);
    const def = input({ placeholder: c.default ? "current: " + c.default : "none", mono: true });
    const dropDef = h("input", { type: "checkbox" });
    const nn = h("input", { type: "checkbox", checked: !c.nullable });
    modal({
      title: "Edit " + c.name,
      body: h(
        "div.form",
        h("div.form-row", field("Name", name), field("Type", type, "Changing type converts existing values.")),
        field("New default", def, "Leave empty to keep the current default."),
        c.default ? h("label.check-row", dropDef, "Remove the default") : null,
        h("label.check-row", nn, "Not null")
      ),
      actions: [
        { label: "Cancel" },
        {
          label: "Save column",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const body = {};
            if (name.value.trim() !== c.name) body.name = name.value.trim();
            if (type.value !== c.type) body.type = type.value;
            const d = parseDefault(def.value, type.value);
            if (d !== undefined) body.default = d;
            if (dropDef.checked) body.drop_default = true;
            if (nn.checked === c.nullable) body.not_null = nn.checked;
            if (!Object.keys(body).length) return;
            await patch(base + "/tables/" + enc(t.name) + "/columns/" + enc(c.name), body);
            toast("Column updated");
            await refreshTable(t.name, "structure");
          },
        },
      ],
    });
  }

  function addIndex(t) {
    const picks = t.columns.map((c) => ({ c, box: h("input", { type: "checkbox" }) }));
    const uq = h("input", { type: "checkbox" });
    const name = input({ placeholder: "optional", mono: true });
    modal({
      title: "Add index to " + t.name,
      text: "Pick columns in the order you query them.",
      body: h(
        "div.form",
        h("div.field", h("label", "Columns"), h("div.stack", { style: { gap: "8px", maxHeight: "220px", overflow: "auto" } }, picks.map((p) => h("label.check-row", p.box, h("span.mono.small", p.c.name), h("span.tiny.dim", p.c.type))))),
        h("label.check-row", uq, "Unique"),
        field("Name", name)
      ),
      actions: [
        { label: "Cancel" },
        {
          label: "Create index",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const columns = picks.filter((p) => p.box.checked).map((p) => p.c.name);
            if (!columns.length) throw new Error("Pick at least one column.");
            await post(base + "/tables/" + enc(t.name) + "/indexes", { columns, unique: uq.checked, ...(name.value.trim() ? { name: name.value.trim() } : {}) });
            toast("Index created");
            await refreshTable(t.name, "structure");
          },
        },
      ],
    });
  }

  function editPolicy(t) {
    const r = options(READ, t.policy.read);
    const w = options(WRITE, t.policy.write);
    modal({
      title: "Access policy for " + t.name,
      text: "Secret keys always have full access. These rules apply to publishable keys and signed-in users.",
      wide: true,
      body: h("div.form", field("Read", r), field("Write", w), h("div.info-box", icon("info"), h("div.small", "Owner adds an owner_id column, filled with the signed-in user, and row level security so each user only reaches their own rows."))),
      actions: [
        { label: "Cancel" },
        {
          label: "Save policy",
          kind: "primary",
          submit: true,
          onClick: async () => {
            await patch(base + "/tables/" + enc(t.name), { policy: { read: r.get(), write: w.get() } });
            toast("Policy saved");
            await refreshTable(t.name, "structure");
          },
        },
      ],
    });
  }

  function renameTable(t) {
    const name = input({ value: t.name, mono: true, autofocus: true });
    modal({
      title: "Rename " + t.name,
      text: "Apps and functions that use the old name will stop working until you update them.",
      body: field("New name", name),
      actions: [
        { label: "Cancel" },
        {
          label: "Rename",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const n = name.value.trim();
            if (n === t.name) return;
            await patch(base + "/tables/" + enc(t.name), { name: n });
            toast("Renamed to " + n);
            await loadList();
            open(n);
          },
        },
      ],
    });
  }

  function dropTable(t) {
    let cascade = false;
    confirmDanger({
      title: "Drop table " + t.name,
      text: "The table and every row in it are deleted. Export the app first if you might need them.",
      confirm: "Drop table",
      typeToConfirm: t.name,
      onConfirm: async () => {
        await del(base + "/tables/" + enc(t.name) + (cascade ? "?cascade=true" : ""));
        toast("Dropped " + t.name);
        current = null;
        await loadList();
        replace(appPath(slug, "tables"));
        ctx.chrome();
        showEmpty();
      },
    });
  }

  function newTable() {
    const name = input({ placeholder: "notes", mono: true, autofocus: true });
    const rows = h("div.stack", { style: { gap: "8px" } });
    const addRow = (n = "", ty = "text") => {
      const nm = input({ placeholder: "column_name", mono: true, value: n });
      nm.classList.add("sm");
      const tp = select(TYPES, ty);
      tp.classList.add("sm");
      const nn = h("input", { type: "checkbox", title: "Not null" });
      const uq = h("input", { type: "checkbox", title: "Unique" });
      const df = input({ placeholder: "default", mono: true });
      df.classList.add("sm");
      const r = h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr auto auto auto", gap: "8px", alignItems: "center" } },
        nm,
        tp,
        df,
        h("label.check-row.tiny", { title: "Not null" }, nn, "req"),
        h("label.check-row.tiny", { title: "Unique" }, uq, "uniq"),
        h("button.btn.ghost.icon.sm", { type: "button", "aria-label": "Remove column", onclick: () => r.remove() }, icon("x", "i-sm"))
      );
      r.read = () => {
        const cname = nm.value.trim();
        if (!cname) return null;
        const c = { name: cname, type: tp.value };
        if (nn.checked) c.not_null = true;
        if (uq.checked) c.unique = true;
        const d = parseDefault(df.value, tp.value);
        if (d !== undefined) c.default = d;
        return c;
      };
      rows.append(r);
      return nm;
    };
    addRow("title", "text");
    const ts = toggle(true, null, "created_at");
    const upd = toggle(false, null, "updated_at");
    const r = options(READ, "secret");
    const w = options(WRITE, "secret");
    modal({
      title: "New table",
      text: "Every table gets id uuid primary key. Row level security is always on.",
      wide: true,
      body: h(
        "div.form",
        field("Table name", name),
        h(
          "div.field",
          h("div.row", h("label", "Columns"), h("span.spacer"), h("button.btn.sm", { type: "button", onclick: () => addRow().focus() }, icon("plus", "i-sm"), "Add column")),
          h("div.row.tiny.dim", { style: { gap: "8px" } }, h("span", { style: { flex: "1.3" } }, "id uuid, primary key, gen_random_uuid()")),
          rows
        ),
        h("div.row", h("label.check-row", ts, "created_at timestamp"), h("label.check-row", upd, "updated_at, touched on every update")),
        field("Who can read with a publishable key", r),
        field("Who can write with a publishable key", w)
      ),
      actions: [
        { label: "Cancel" },
        {
          label: "Create table",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const tname = name.value.trim();
            const columns = [...rows.children].map((x) => x.read()).filter(Boolean);
            await post(base + "/tables", { name: tname, columns, policy: { read: r.get(), write: w.get() }, timestamps: ts.get(), updated_at: upd.get() });
            toast("Created " + tname);
            await loadList();
            open(tname);
          },
        },
      ],
    });
  }

  function showEmpty() {
    mount(
      work,
      list.length
        ? empty({ icon: "table", title: "Pick a table", text: "Choose a table on the left to browse and edit its rows.", actions: [h("button.btn.primary", { type: "button", onclick: newTable }, icon("plus"), "New table")] })
        : empty({ icon: "table", title: "No tables yet", text: "Create a table from here or with SQL. Every table has row level security on.", actions: [h("button.btn.primary", { type: "button", onclick: newTable }, icon("plus"), "New table"), h("a.btn", { href: "#" + appPath(slug, "sql") }, icon("sql"), "Open SQL editor")] })
    );
  }

  try {
    await loadList();
  } catch (e) {
    mount(work, errorBox(e, () => tables(ctx)));
    return;
  }
  if (!ctx.alive()) return;
  if (current && list.find((t) => t.name === current)) showTable(current);
  else {
    current = null;
    showEmpty();
  }
  if (ctx.query.new) {
    replace(appPath(slug, "tables"));
    newTable();
  }

  async function importRows(t, reload) {
    const f = await pickFile(".csv,.ndjson,.jsonl,text/csv,application/x-ndjson");
    if (!f) return;
    const isCsv = /\.csv$/i.test(f.name) || f.type === "text/csv";
    const ok = await modal({
      title: "Import into " + t.name,
      text: f.name + " (" + fmtCompact(f.size) + " bytes). " + (isCsv ? "The first row must be the column names." : "One JSON object per line."),
      body: h("div.info-box", icon("info"), h("div.small", "All or nothing: if one row fails, nothing is written. Up to 20 MB.")),
      actions: [{ label: "Cancel", value: false }, { label: "Import", kind: "primary", value: true }],
    });
    if (!ok) return;
    try {
      const out = await api("POST", base + "/tables/" + enc(t.name) + "/import", { raw: f, headers: { "Content-Type": isCsv ? "text/csv" : "application/x-ndjson" } });
      toast("Imported " + fmtNum(out.inserted) + " rows");
      reload();
    } catch (e) {
      toastError(e);
    }
  }

  function curlFor(t, st) {
    const q = new URLSearchParams();
    for (const f of st.filters) q.append(f.col, (f.not ? "not." : "") + f.op + "." + f.value);
    if (st.order) q.set("order", st.order.col + "." + st.order.dir);
    q.set("limit", 20);
    return `curl "${"https://api.atberth.com/v1"}/apps/${slug}/tables/${t.name}/rows?${q}" \\\n  -H "Authorization: Bearer $BERTH_SECRET_KEY"`;
  }
}

function cell(v, c) {
  if (v === null || v === undefined) return h("td.null", "NULL");
  if (typeof v === "boolean") return h("td." + (v ? "bool-t" : "bool-f"), String(v));
  if (typeof v === "number") return h("td.n", String(v));
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return h("td", { title: s.slice(0, 500) }, s);
  }
  const s = String(v);
  return h("td", { title: s.length > 40 ? s.slice(0, 500) : null }, c.type === "timestamptz" ? s.replace("T", " ").replace(/\.\d+/, "") : s);
}

function parseDefault(raw, type) {
  const v = raw.trim();
  if (!v) return undefined;
  if (["now()", "gen_random_uuid()", "current_date", "auth.uid()"].includes(v)) return v;
  if (type === "text" || type === "uuid" || type === "date" || type === "timestamptz") {
    try {
      const j = JSON.parse(v);
      if (typeof j === "string") return j;
    } catch {}
    return v;
  }
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function policyDot(p) {
  if (!p) return null;
  const map = { public: "var(--accent)", authenticated: "var(--blue)", owner: "var(--violet)", secret: "var(--dim)" };
  const d = h("span", { title: "read " + p.read + ", write " + p.write, style: { marginLeft: "auto", width: "6px", height: "6px", borderRadius: "50%", background: map[p.read] || "var(--dim)", flex: "none" } });
  return d;
}

function policyBadge(p, only) {
  const txt = only === "read" ? p.read : only === "write" ? p.write : "read " + p.read + " · write " + p.write;
  const kind = (only === "write" ? p.write : p.read) === "public" ? "ok" : (only === "write" ? p.write : p.read) === "secret" ? "" : "info";
  return h("span.badge" + (kind ? "." + kind : ""), icon("lock", "i-sm"), txt);
}

function exportCsv(t, rows) {
  if (!rows.length) return toast("Nothing to download on this page.");
  const cols = t.columns.map((c) => c.name);
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  download(new Blob([csv], { type: "text/csv" }), t.name + ".csv");
}
