import { h, mount, icon } from "./ui.js";
import { state, go, route, appNav, appPath } from "./state.js";

let open = false;

function score(q, text) {
  if (!q) return 1;
  text = text.toLowerCase();
  q = q.toLowerCase();
  if (text.startsWith(q)) return 3;
  if (text.includes(q)) return 2;
  let i = 0;
  for (const ch of text) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export async function openPalette() {
  if (open) return;
  open = true;
  const main = await import("./main.js");
  const r = route();
  const slug = r.slug;
  const commands = [];
  if (slug) {
    for (const n of appNav) commands.push({ group: slug, label: n.label, icon: n.icon, run: () => go(appPath(slug, n.path)) });
  }
  for (const a of state.apps) commands.push({ group: "Apps", label: a.slug, icon: "db", hint: "Open app", run: () => go(appPath(a.slug)) });
  if (slug) {
    commands.push({ group: "Actions", label: "New table in " + slug, icon: "plus", run: () => go(appPath(slug, "tables") + "?new=1") });
    commands.push({ group: "Actions", label: "Run SQL in " + slug, icon: "sql", run: () => go(appPath(slug, "sql")) });
    commands.push({ group: "Actions", label: "Create API key for " + slug, icon: "key", run: () => go(appPath(slug, "keys") + "?new=1") });
    commands.push({ group: "Actions", label: "Deploy a function to " + slug, icon: "fn", run: () => go(appPath(slug, "functions") + "?new=1") });
  }
  commands.push({ group: "Actions", label: "Create app", icon: "plus", run: () => go("/?new=1") });
  commands.push({ group: "Actions", label: "Toggle theme", icon: "sun", run: () => main.toggleTheme() });
  commands.push({ group: "Go to", label: "All apps", icon: "grid", run: () => go("/") });
  commands.push({ group: "Go to", label: "Account and keys", icon: "account", run: () => go("/account") });
  if (state.me && state.me.role === "admin") commands.push({ group: "Go to", label: "Admin", icon: "shield", run: () => go("/admin") });
  commands.push({ group: "Go to", label: "Documentation", icon: "book", run: () => window.open("/docs/", "_blank", "noopener") });
  commands.push({ group: "Go to", label: "Sign out", icon: "logout", run: () => main.signOut() });

  const inp = h("input", { placeholder: "Search apps, pages and actions", "aria-label": "Search", autocomplete: "off", spellcheck: "false" });
  const list = h("div.palette-list", { role: "listbox" });
  const el = h(
    "div.palette",
    { role: "dialog", "aria-modal": "true", "aria-label": "Command menu" },
    h("div.palette-in", icon("search"), inp, h("kbd", "esc")),
    list,
    h("div.palette-foot", h("span", h("kbd", "↑↓"), " move"), h("span", h("kbd", "enter"), " open"), h("span", h("kbd", "esc"), " close"))
  );
  const scrim = h("div.scrim", { onclick: () => close() });
  document.body.append(scrim, el);
  let hl = 0;
  let shown = [];
  const close = () => {
    open = false;
    scrim.remove();
    el.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const render = () => {
    const q = inp.value.trim();
    shown = commands
      .map((c) => ({ c, s: score(q, c.label + " " + (c.group || "")) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.c);
    if (!q) shown = commands.slice(0, 40);
    hl = Math.min(hl, Math.max(0, shown.length - 1));
    const kids = [];
    let last = null;
    shown.forEach((c, i) => {
      if (c.group !== last) {
        kids.push(h("div.palette-group", c.group));
        last = c.group;
      }
      kids.push(
        h(
          "button.palette-item" + (i === hl ? ".hl" : ""),
          {
            type: "button",
            role: "option",
            "aria-selected": String(i === hl),
            onmouseenter: () => {
              hl = i;
              list.querySelectorAll(".palette-item").forEach((b, k) => b.classList.toggle("hl", k === hl));
            },
            onclick: () => {
              close();
              c.run();
            },
          },
          icon(c.icon),
          c.label,
          c.hint ? h("span.hint2", c.hint) : null
        )
      );
    });
    if (!shown.length) kids.push(h("div.empty", { style: { padding: "30px" } }, h("p", "No matches.")));
    mount(list, kids);
    const cur = list.querySelector(".hl");
    cur && cur.scrollIntoView({ block: "nearest" });
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      hl = Math.min(shown.length - 1, hl + 1);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      hl = Math.max(0, hl - 1);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = shown[hl];
      if (c) {
        close();
        c.run();
      }
    }
  };
  document.addEventListener("keydown", onKey, true);
  inp.addEventListener("input", () => {
    hl = 0;
    render();
  });
  render();
  inp.focus();
}
