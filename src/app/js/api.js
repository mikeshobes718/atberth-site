export const API = "https://api.atberth.com/v1";
const KEY = "berth-console-session";
const SESSION_TTL = 7 * 86400;

export class ApiError extends Error {
  constructor(status, code, message, requestId) {
    super(message || "Something went wrong.");
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function readStore(store) {
  try {
    const raw = store.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const session = {
  data: null,
  load() {
    const s = readStore(sessionStorage) || readStore(localStorage);
    if (s && s.expires_at && Date.parse(s.expires_at) < Date.now()) {
      this.clear();
      return null;
    }
    this.data = s;
    return s;
  },
  save(data, remember = true) {
    this.data = data;
    try {
      (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(data));
    } catch {}
  },
  clear() {
    this.data = null;
    try { localStorage.removeItem(KEY); } catch {}
    try { sessionStorage.removeItem(KEY); } catch {}
  },
  get token() {
    return this.data && this.data.token;
  },
};

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.append(k, String(v));
  }
  const s = u.toString();
  return s ? "?" + s : "";
}

export function enc(s) {
  return encodeURIComponent(s);
}

export function encKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export async function api(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = opts.token !== undefined ? opts.token : session.token;
  if (token) headers.Authorization = "Bearer " + token;
  let body;
  if (opts.raw !== undefined) {
    body = opts.raw;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(API + path, { method, headers, body, signal: opts.signal, cache: "no-store" });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, "network", "Could not reach Berth. Check your connection and try again.");
  }
  const rid = res.headers.get("X-Request-Id") || "";
  if (opts.response) {
    if (!res.ok) await raise(res, rid, opts);
    return res;
  }
  if (!res.ok) await raise(res, rid, opts);
  if (opts.blob) return res.blob();
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function raise(res, rid, opts) {
  let data = {};
  try {
    data = await res.json();
  } catch {}
  const err = new ApiError(res.status, data.error || "error", data.message || res.statusText || "Request failed.", data.request_id || rid);
  if (res.status === 401 && !opts.noAuthRedirect) onUnauthorized(err);
  throw err;
}

export const get = (p, o) => api("GET", p, o);
export const post = (p, body, o = {}) => api("POST", p, { ...o, body });
export const patch = (p, body, o = {}) => api("PATCH", p, { ...o, body });
export const put = (p, body, o = {}) => api("PUT", p, { ...o, body });
export const del = (p, o) => api("DELETE", p, o);

export function browserLabel() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return ("Console, " + b + (os ? " on " + os : "")).slice(0, 60);
}

export async function login(email, code) {
  const out = await post("/login", { email, code, key_name: browserLabel(), expires_in: SESSION_TTL }, { token: null, noAuthRedirect: true });
  session.save({ token: out.key, key_id: out.key_info.id, email, expires_at: out.key_info.expires_at, kind: "session" }, true);
  return out;
}

export async function useKey(token, remember) {
  const me = await get("/me", { token, noAuthRedirect: true });
  if (!["admin", "account"].includes(me.role)) {
    throw new ApiError(403, "forbidden", "Use an account key (bak_) or the admin token. App keys only reach one app; use the CLI for those.");
  }
  session.save({ token, email: me.account ? me.account.email : "Platform admin", kind: "key" }, remember);
  return me;
}

export async function logout() {
  const s = session.data;
  if (s && s.kind === "session" && s.key_id) {
    try {
      await del("/account/keys/" + enc(s.key_id), { noAuthRedirect: true });
    } catch {}
  }
  session.clear();
}

// Server-sent events over fetch, so the key stays in a header instead of the URL.
export function stream(path, onEvent, onState) {
  const ctrl = new AbortController();
  let lastId = "";
  let stopped = false;
  async function run() {
    while (!stopped) {
      try {
        onState && onState("connecting");
        const headers = { Authorization: "Bearer " + session.token, Accept: "text/event-stream" };
        if (lastId) headers["Last-Event-ID"] = lastId;
        const res = await fetch(API + path, { headers, signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) {
          onState && onState("error", res.status);
          if (res.status === 401 || res.status === 403 || res.status === 404) return;
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        onState && onState("live");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let ev = "message", data = "";
            for (const line of chunk.split("\n")) {
              if (line.startsWith("event:")) ev = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
              else if (line.startsWith("id:")) lastId = line.slice(3).trim();
            }
            if (data) {
              try { onEvent(ev, JSON.parse(data)); } catch {}
            }
          }
        }
      } catch (err) {
        if (stopped || err.name === "AbortError") return;
        onState && onState("error");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  run();
  return () => {
    stopped = true;
    ctrl.abort();
  };
}
