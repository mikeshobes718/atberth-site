const SVGNS = "http://www.w3.org/2000/svg";

// h("div.card#id", {onclick, class, style: {...}, dataset, attrs}, ...children). Text is always set as text.
export function h(sel, props, ...kids) {
  if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const tag = (m && m[1]) || "div";
  const el = document.createElement(tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === ".") el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props) setProps(el, props);
  append(el, kids);
  return el;
}

function setProps(el, props) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    else if (k === "style") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "text") el.textContent = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function mount(el, ...kids) {
  clear(el);
  return append(el, kids);
}

export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  overview: "M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z",
  table: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M3 15h18M9 9v12",
  sql: "M4 17l6-5-6-5M12 19h8",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  storage: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  fn: "M13 2 4 14h7l-1 8 9-12h-7z",
  webhook: "M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4",
  logs: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  account: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  plus: "M12 5v14M5 12h14",
  x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  copy: "M8 8h12v12H8zM4 16V4h12",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6",
  edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  play: "M6 4l14 8-14 8z",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54z",
  chev: "m9 18 6-6-6-6",
  chevd: "m6 9 6 6 6-6",
  updown: "m7 15 5 5 5-5M7 9l5-5 5 5",
  arrow: "M5 12h14M12 5l7 7-7 7",
  ext: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  menu: "M4 6h16M4 12h16M4 18h16",
  more: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  terminal: "M4 17l6-6-6-6M12 19h8",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  db: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3zM21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5",
  env: "M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeoff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  columns: "M12 3v18M3 3h18v18H3z",
  index: "M4 6h16M4 12h10M4 18h6",
  live: "M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2",
  cmd: "M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6z",
};

export function icon(name, cls = "") {
  const d = ICONS[name] || ICONS.info;
  return svg("svg", { class: "i " + cls, viewBox: "0 0 24 24", "aria-hidden": "true" }, svg("path", { d }));
}

export function logo() {
  return svg(
    "svg",
    { viewBox: "0 0 24 24", "aria-hidden": "true" },
    svg("rect", { x: 1.5, y: 1.5, width: 21, height: 21, rx: 6.5, fill: "none", stroke: "currentColor", "stroke-width": 1.6 }),
    svg("path", { d: "M6 14.5h12M8.5 14.5v3.5M12 14.5v3.5M15.5 14.5v3.5", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round" }),
    svg("path", { d: "M8 11.2c1.2-2.4 2.5-3.6 4-3.6s2.8 1.2 4 3.6", fill: "none", stroke: "var(--accent)", "stroke-width": 1.6, "stroke-linecap": "round" })
  );
}

export function avatar(name, cls = "") {
  let hsh = 0;
  for (const ch of name || "?") hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return h("span.avatar." + "v" + ((hsh % 6) + 1) + (cls ? "." + cls : ""), { "aria-hidden": "true" }, (name || "?").replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "?");
}

/* formatting */
export function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return Number(n).toLocaleString("en-US");
}
export function fmtCompact(n) {
  n = Number(n) || 0;
  if (Math.abs(n) < 1000) return String(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
export function fmtBytes(b) {
  b = Number(b) || 0;
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return (i === 0 ? b : b.toFixed(b < 10 ? 1 : 0)) + " " + u[i];
}
export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
export function fmtDateTime(s) {
  if (!s) return "";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}
export function ago(s) {
  if (!s) return "never";
  const sec = Math.round((Date.now() - Date.parse(s)) / 1000);
  const fut = sec < 0;
  const a = Math.abs(sec);
  let out;
  if (a < 45) out = "just now";
  else if (a < 90) out = "1 min";
  else if (a < 3600) out = Math.round(a / 60) + " min";
  else if (a < 86400) out = Math.round(a / 3600) + " h";
  else if (a < 86400 * 30) out = Math.round(a / 86400) + " d";
  else return fmtDate(s);
  if (out === "just now") return out;
  return fut ? "in " + out : out + " ago";
}
export function timeEl(s, mode = "ago") {
  return h("time", { datetime: s || "", title: s ? new Date(s).toLocaleString() : "" }, mode === "ago" ? ago(s) : fmtDateTime(s));
}
export function plural(n, word, many) {
  return fmtNum(n) + " " + (n === 1 ? word : many || word + "s");
}

/* feedback */
let toastRoot;
export function toast(msg, opts = {}) {
  if (!toastRoot) {
    toastRoot = h("div.toasts", { role: "status", "aria-live": "polite" });
    document.body.append(toastRoot);
  }
  const el = h("div.toast" + (opts.bad ? ".bad" : ""), icon(opts.bad ? "alert" : "check"), h("div", msg, opts.rid ? h("span.rid", opts.rid) : null));
  toastRoot.append(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s, transform .25s";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 260);
  }, opts.bad ? 6500 : 3200);
}
export function toastError(err) {
  if (err && err.name === "AbortError") return;
  toast(err && err.message ? err.message : String(err), { bad: true, rid: err && err.requestId });
}

export async function copy(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    const ta = h("textarea", { style: { position: "fixed", opacity: "0" } }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast(label);
  }
}

export function copyBtn(text, { label = "Copied", small = true, title = "Copy" } = {}) {
  const b = h("button.btn.ghost.icon" + (small ? ".sm" : ""), { type: "button", title, "aria-label": title }, icon("copy", "i-sm"));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    copy(typeof text === "function" ? text() : text, label);
    mount(b, icon("check", "i-sm"));
    setTimeout(() => mount(b, icon("copy", "i-sm")), 1200);
  });
  return b;
}

export function spinner() {
  return h("span.spin", { role: "status", "aria-label": "Loading" });
}
export function loading(label = "Loading") {
  return h("div.center", h("div.row.dim", spinner(), label));
}
export function skeleton(rows = 4, height = 44) {
  return h("div.stack", { style: { gap: "10px" } }, Array.from({ length: rows }, () => h("div.sk", { style: { height: height + "px" } })));
}
export function empty({ icon: ic = "grid", title, text, actions }) {
  return h("div.empty", h("div.empty-ico", icon(ic, "i-lg")), h("h3", title), text ? h("p", text) : null, actions ? h("div.row", actions) : null);
}
export function errorBox(err, retry) {
  return h(
    "div.empty",
    h("div.empty-ico", icon("alert", "i-lg")),
    h("h3", "That did not load"),
    h("p", err.message || String(err)),
    err.requestId ? h("p.mono.tiny.dim", err.requestId) : null,
    retry ? h("div.row", h("button.btn", { onclick: retry }, icon("refresh"), "Try again")) : null
  );
}

export function badge(text, kind = "") {
  return h("span.badge" + (kind ? "." + kind : ""), text);
}

export async function busy(btn, fn) {
  if (btn.disabled) return;
  const kids = [...btn.childNodes];
  btn.disabled = true;
  mount(btn, spinner(), kids.filter((k) => k.nodeType === 3).map((k) => k.textContent).join("") || "");
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    mount(btn, kids);
  }
}

/* overlays */
const stack = [];
const persistent = new WeakSet();
export function closeOverlays() {
  for (const close of stack.slice().reverse()) if (!persistent.has(close)) close();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) {
    e.preventDefault();
    stack[stack.length - 1]();
  }
});

function layer(el, close, withScrim = true) {
  const scrim = withScrim ? h("div.scrim", { onclick: () => close() }) : null;
  if (scrim) document.body.append(scrim);
  document.body.append(el);
  stack.push(close);
  const prev = document.activeElement;
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
    scrim && scrim.remove();
    el.remove();
    if (prev && prev.focus) prev.focus();
  };
}

function focusFirst(el) {
  requestAnimationFrame(() => {
    const f = el.querySelector("[autofocus]") || el.querySelector("input:not([type=checkbox]),textarea,select");
    if (f) f.focus();
  });
}

// modal({title, text, body, actions: [{label, kind, onClick(close) -> truthy to keep open}], wide})
// persist: stays open across page navigation (used for secrets shown once).
export function modal({ title, text, body, actions = [], wide = false, onClose, persist = false }) {
  let done;
  const p = new Promise((r) => (done = r));
  const el = h("div.modal" + (wide ? ".wide" : ""), { role: "dialog", "aria-modal": "true", "aria-label": title });
  let remove;
  const close = (v) => {
    remove();
    onClose && onClose(v);
    done(v);
  };
  const foot = actions.length
    ? h(
        "div.modal-f",
        actions.map((a) => {
          const b = h("button.btn" + (a.kind ? "." + a.kind : ""), { type: a.submit ? "submit" : "button", form: a.submit ? "modal-form" : null }, a.label);
          if (!a.submit)
            b.addEventListener("click", async () => {
              if (!a.onClick) return close(a.value);
              try {
                const keep = await busy(b, () => a.onClick(close));
                if (!keep) close(a.value === undefined ? true : a.value);
              } catch (err) {
                toastError(err);
              }
            });
          else b.dataset.submit = "1";
          return b;
        })
      )
    : null;
  append(el, [
    h("div.modal-h", h("div", h("h2", title), text ? h("p", text) : null), h("button.btn.ghost.icon.sm.x", { type: "button", "aria-label": "Close", onclick: () => close() }, icon("x"))),
    body ? h("div.modal-b", body) : null,
    foot,
  ]);
  const submitAction = actions.find((a) => a.submit);
  if (submitAction) {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") {
        e.preventDefault();
        el.querySelector("[data-submit]").click();
      }
    });
    el.querySelector("[data-submit]").addEventListener("click", async (e) => {
      const b = e.currentTarget;
      try {
        const keep = await busy(b, () => submitAction.onClick(close));
        if (!keep) close(true);
      } catch (err) {
        toastError(err);
      }
    });
  }
  const closer = () => close();
  if (persist) persistent.add(closer);
  remove = layer(el, closer);
  focusFirst(el);
  return p;
}

export function confirmDanger({ title, text, confirm = "Delete", typeToConfirm, onConfirm }) {
  const input = typeToConfirm ? h("input.input.mono", { placeholder: typeToConfirm, autocomplete: "off", spellcheck: "false", autofocus: true }) : null;
  const body = h(
    "div.stack",
    { style: { gap: "12px" } },
    h("div.bad-box", icon("alert"), h("div", text)),
    input ? h("div.field", h("label", "Type ", h("code", typeToConfirm), " to confirm"), input) : null
  );
  return modal({
    title,
    body,
    actions: [
      { label: "Cancel", value: false },
      {
        label: confirm,
        kind: "danger",
        submit: true,
        onClick: async () => {
          if (input && input.value.trim() !== typeToConfirm) {
            input.focus();
            throw new Error("Type " + typeToConfirm + " to confirm.");
          }
          await onConfirm();
        },
      },
    ],
  });
}

export function drawer({ title, sub, body, foot, width }) {
  const el = h("aside.drawer", { role: "dialog", "aria-modal": "true", "aria-label": title });
  if (width) el.style.width = "min(" + width + "px,100vw)";
  let remove;
  const close = () => remove();
  append(el, [
    h("div.drawer-h", h("div", { style: { minWidth: 0, flex: "1" } }, h("h2", title), sub ? h("div.tiny.dim.mono", sub) : null), h("button.btn.ghost.icon.sm", { type: "button", "aria-label": "Close", onclick: close }, icon("x"))),
    h("div.drawer-b", typeof body === "function" ? body(close) : body),
    foot ? h("div.drawer-f", typeof foot === "function" ? foot(close) : foot) : null,
  ]);
  remove = layer(el, close);
  focusFirst(el);
  return close;
}

// menu(anchor, [{label, icon, onClick, danger} | "-" | {group}])
export function menu(anchor, items, { align = "left" } = {}) {
  const el = h("div.menu", { role: "menu" });
  let remove;
  const close = () => remove();
  for (const it of items) {
    if (it === "-") el.append(h("div.menu-sep"));
    else if (it.group) el.append(h("div.menu-label", it.group));
    else
      el.append(
        h(
          "button.menu-item" + (it.danger ? ".danger" : ""),
          {
            type: "button",
            role: "menuitem",
            onclick: () => {
              close();
              it.onClick && it.onClick();
            },
          },
          it.icon ? icon(it.icon) : null,
          it.label,
          it.hint ? h("span.dim.tiny", { style: { marginLeft: "auto" } }, it.hint) : null
        )
      );
  }
  const r = anchor.getBoundingClientRect();
  el.style.top = Math.min(r.bottom + 6, window.innerHeight - 20) + "px";
  if (align === "right") el.style.right = Math.max(8, window.innerWidth - r.right) + "px";
  else el.style.left = Math.max(8, r.left) + "px";
  const scrim = h("div", { style: { position: "fixed", inset: "0", zIndex: "119" }, onclick: () => close() });
  document.body.append(scrim);
  const rm = layer(el, close, false);
  remove = () => {
    scrim.remove();
    rm();
  };
  requestAnimationFrame(() => {
    const mr = el.getBoundingClientRect();
    if (mr.bottom > window.innerHeight - 8) el.style.top = Math.max(8, r.top - mr.height - 6) + "px";
    const first = el.querySelector(".menu-item");
    first && first.focus();
  });
  el.addEventListener("keydown", (e) => {
    const items = [...el.querySelectorAll(".menu-item")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    }
  });
  return close;
}

/* form helpers */
export function field(label, input, hint) {
  return h("div.field", h("label", label), input, hint ? h("div.hint", hint) : null);
}
export function input(props = {}) {
  return h("input.input" + (props.mono ? ".mono" : ""), { type: "text", autocomplete: "off", spellcheck: "false", ...props, mono: null });
}
export function select(options, value, props = {}) {
  const s = h("select.select", props);
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    s.append(h("option", { value: v, selected: v === value ? true : null }, l));
  }
  if (value !== undefined) s.value = value;
  return s;
}
export function toggle(on, onChange, label) {
  const t = h("button.toggle" + (on ? ".on" : ""), { type: "button", role: "switch", "aria-checked": String(!!on), "aria-label": label || "Toggle" });
  t.addEventListener("click", () => {
    on = !on;
    t.classList.toggle("on", on);
    t.setAttribute("aria-checked", String(on));
    onChange && onChange(on);
  });
  t.get = () => on;
  return t;
}
export function options(choices, value, onChange) {
  const wrap = h("div.opt-grid", { role: "radiogroup" });
  const render = () =>
    mount(
      wrap,
      choices.map((c) =>
        h(
          "button.opt" + (c.value === value ? ".on" : ""),
          {
            type: "button",
            role: "radio",
            "aria-checked": String(c.value === value),
            onclick: () => {
              value = c.value;
              render();
              onChange && onChange(value);
            },
          },
          h("b", c.label),
          c.hint ? h("span", c.hint) : null
        )
      )
    );
  render();
  wrap.get = () => value;
  return wrap;
}
export function seg(choices, value, onChange) {
  const wrap = h("div.seg", { role: "tablist" });
  const render = () =>
    mount(
      wrap,
      choices.map(([v, l]) =>
        h(
          "button" + (v === value ? ".on" : ""),
          {
            type: "button",
            role: "tab",
            "aria-selected": String(v === value),
            onclick: () => {
              if (v === value) return;
              value = v;
              render();
              onChange(v);
            },
          },
          l
        )
      )
    );
  render();
  wrap.get = () => value;
  return wrap;
}

export function secretReveal(value, note) {
  return h(
    "div.stack",
    { style: { gap: "12px" } },
    h("div.warn-box", icon("alert"), h("div", note || "Copy this now. Berth only shows it once and stores a hash.")),
    h("div.secret", h("span", value), copyBtn(value, { label: "Copied to clipboard" }))
  );
}

export function codeBlock(text) {
  return h("div.code", h("button.btn.ghost.icon.sm.code-copy", { type: "button", "aria-label": "Copy", onclick: () => copy(text) }, icon("copy", "i-sm")), text);
}

/* charts */
export function areaChart(points, { label = "Requests", color } = {}) {
  const wrap = h("div.chart");
  const tip = h("div.chart-tip");
  wrap.append(tip);
  const draw = () => {
    const W = Math.max(wrap.clientWidth, 200);
    const H = wrap.clientHeight || 220;
    const pad = { l: 36, r: 10, t: 12, b: 24 };
    const max = Math.max(1, ...points.map((p) => p.v));
    const nice = niceMax(max);
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const x = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v) => pad.t + ih - (v / nice) * ih;
    const gid = "g" + Math.random().toString(36).slice(2, 8);
    const line = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
    const area = line + ` L${x(points.length - 1).toFixed(1)} ${pad.t + ih} L${x(0).toFixed(1)} ${pad.t + ih} Z`;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": label + " chart" });
    const defs = svg("defs", {}, svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, svg("stop", { offset: "0%", "stop-color": color || "var(--accent)", "stop-opacity": 0.28 }), svg("stop", { offset: "100%", "stop-color": color || "var(--accent)", "stop-opacity": 0 })));
    s.append(defs);
    for (let k = 0; k <= 3; k++) {
      const v = (nice / 3) * k;
      s.append(svg("line", { class: "gridline", x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
      s.append(svg("text", { class: "axis", x: pad.l - 8, y: y(v) + 3, "text-anchor": "end" }, document.createTextNode(fmtCompact(Math.round(v)))));
    }
    const ticks = Math.min(6, points.length);
    for (let k = 0; k < ticks; k++) {
      const i = Math.round((k / Math.max(1, ticks - 1)) * (points.length - 1));
      s.append(svg("text", { class: "axis", x: x(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === ticks - 1 ? "end" : "middle" }, document.createTextNode(points[i].label)));
    }
    s.append(svg("path", { d: area, fill: `url(#${gid})` }));
    const lp = svg("path", { d: line, class: "line" });
    if (color) lp.style.stroke = color;
    s.append(lp);
    const cross = svg("line", { class: "cross", y1: pad.t, y2: pad.t + ih, opacity: 0 });
    const dot = svg("circle", { class: "dotp", r: 4, opacity: 0 });
    if (color) dot.style.stroke = color;
    s.append(cross, dot);
    const hit = svg("rect", { x: pad.l, y: 0, width: iw, height: H, fill: "transparent" });
    s.append(hit);
    const move = (e) => {
      const r = s.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - pad.l) / iw) * (points.length - 1))));
      const p = points[i];
      cross.setAttribute("x1", x(i));
      cross.setAttribute("x2", x(i));
      cross.setAttribute("opacity", 1);
      dot.setAttribute("cx", x(i));
      dot.setAttribute("cy", y(p.v));
      dot.setAttribute("opacity", 1);
      mount(tip, h("b", fmtNum(p.v)), h("span.dim", p.full || p.label));
      tip.style.left = (x(i) / W) * 100 + "%";
      tip.style.top = (y(p.v) / H) * 100 + "%";
      tip.style.opacity = "1";
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("opacity", 0);
      dot.setAttribute("opacity", 0);
      tip.style.opacity = "0";
    });
    const old = wrap.querySelector("svg");
    old ? old.replaceWith(s) : wrap.prepend(s);
  };
  const ro = new ResizeObserver(() => draw());
  requestAnimationFrame(() => {
    draw();
    ro.observe(wrap);
  });
  return wrap;
}

function niceMax(v) {
  if (v <= 3) return 3;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function miniBars(values, n = 14) {
  const vals = values.slice(-n);
  const max = Math.max(1, ...vals);
  return h(
    "div.bars",
    { "aria-hidden": "true" },
    vals.map((v) => {
      const b = h("i" + (v ? "" : ".z"));
      b.style.height = Math.max(6, (v / max) * 100) + "%";
      return b;
    })
  );
}

export function meter(value, max) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const m = h("div.meter" + (pct > 90 ? ".bad" : pct > 70 ? ".warn" : ""), h("i"));
  requestAnimationFrame(() => (m.firstChild.style.width = pct + "%"));
  return m;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const f = h("input", { type: "file", accept: accept || null, style: { display: "none" } });
    f.addEventListener("change", () => {
      resolve(f.files[0] || null);
      f.remove();
    });
    document.body.append(f);
    f.click();
  });
}
