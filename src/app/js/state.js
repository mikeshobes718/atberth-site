import { get } from "./api.js";

export const state = { me: null, apps: [] };

export const appNav = [
  { path: "", label: "Overview", icon: "overview" },
  { path: "tables", label: "Table editor", icon: "table" },
  { path: "sql", label: "SQL editor", icon: "sql" },
  { path: "users", label: "Auth users", icon: "users" },
  { path: "storage", label: "Storage", icon: "storage" },
  { path: "functions", label: "Functions", icon: "fn" },
  { path: "webhooks", label: "Webhooks", icon: "webhook" },
  { path: "keys", label: "API keys", icon: "key" },
  { path: "logs", label: "Logs", icon: "logs" },
  { path: "settings", label: "Settings", icon: "settings" },
];

const TITLES = { home: "Apps", account: "Account", admin: "Admin", overview: "Overview" };
export function sectionTitle(s) {
  const n = appNav.find((x) => x.path === s);
  return n ? n.label : TITLES[s] || s;
}

export function route() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ""));
  if (!parts.length) return { name: "home", query };
  if (parts[0] === "a" && parts[1]) {
    return { name: "app", slug: decodeURIComponent(parts[1]), section: parts[2] || "", rest: parts.slice(3), query };
  }
  return { name: parts[0], rest: parts.slice(1), query };
}

export function go(path) {
  const next = "#" + path;
  if (location.hash === next) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = next;
}

// Change the URL without re-rendering the page (for in-page selection like a table name).
export function replace(path) {
  history.replaceState(null, "", "#" + path);
}

export function onRoute(fn) {
  window.addEventListener("hashchange", fn);
}

export async function loadApps() {
  const out = await get("/apps");
  state.apps = (out.apps || []).slice().sort((a, b) => a.slug.localeCompare(b.slug));
  return state.apps;
}

export function appPath(slug, section = "", ...rest) {
  return "/a/" + encodeURIComponent(slug) + (section ? "/" + section : "") + rest.map((r) => "/" + encodeURIComponent(r)).join("");
}
