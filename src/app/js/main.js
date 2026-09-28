import { api, get, post, session, login, loginProvider, useKey, logout, setUnauthorizedHandler, ApiError, enc } from "./api.js";
import { h, mount, clear, append, icon, logo, avatar, toast, toastError, menu, modal, field, input, busy, spinner, fmtNum, closeOverlays } from "./ui.js";
import { state, go, route, onRoute, loadApps, appNav, sectionTitle } from "./state.js";
import { openPalette } from "./palette.js";

const root = document.getElementById("root");
let shell = null;
let cleanups = [];

setUnauthorizedHandler(() => {
  if (!session.token) return;
  session.clear();
  state.me = null;
  toast("Your session ended. Sign in again.", { bad: true });
  go("/login");
});

function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem("berth-theme", t);
  } catch {}
}
export function toggleTheme() {
  setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

export async function signOut() {
  await logout();
  state.me = null;
  state.apps = [];
  shell = null;
  go("/login");
}

/* ---------- auth screens ---------- */

function authArt() {
  return h(
    "div.auth-art",
    h("a.brand", { href: "/" }, logo(), "Berth"),
    h(
      "div.auth-quote",
      h("h2", "Your backend,", h("br"), "one console."),
      h("p", "Postgres per app, keys, end-user auth, row policies, realtime, storage, functions and webhooks. Everything the CLI does, in your browser."),
      h(
        "div.auth-feats",
        ["Tables", "SQL", "Auth", "Storage", "Functions", "Webhooks", "Keys", "Logs"].map((f) => h("span.badge", f))
      ),
      h(
        "div.auth-term",
        h("div.auth-term-h", h("i"), h("i"), h("i")),
        h("pre", h("span.p", "$ "), "berth apps create notes\n", h("span.p", "$ "), "berth tables create notes title:text\n", h("span.p", "$ "), "berth rows add notes title=hello\n", h("span.dim", "Or skip the terminal. Sign in here."))
      )
    )
  );
}

function renderAuth(mode = "signin") {
  cleanupPage();
  shell = null;
  document.title = (mode === "signup" ? "Create account" : "Sign in") + " · Berth";
  const side = h("div.auth-side");
  mount(root, h("div.auth", authArt(), side));
  emailStep(side, mode);
}

/* ---------- Apple and Google sign in ---------- */

const GOOGLE_CLIENT_ID = "76444625720-iqqsh3nnc7m3r5652rm923kg1ia3pmov.apps.googleusercontent.com";
const APPLE_SERVICES_ID = "com.atberth.signin";
const scripts = {};
function loadScript(src) {
  return (scripts[src] ||= new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = ok;
    s.onerror = () => {
      delete scripts[src];
      fail(new Error("Could not load sign in. Check your connection or content blocker."));
    };
    document.head.appendChild(s);
  }));
}
// A ?ref= code saved by atberth.com in the last 30 days, sent with sign up so the referrer gets credit.
function referralCode() {
  try {
    const r = JSON.parse(localStorage.getItem("berth-ref") || "null");
    return r && Date.now() - r.at < 30 * 86400000 ? r.code : undefined;
  } catch {
    return undefined;
  }
}
// Shows "Invite applied" on the sign in screens when a valid referral code is saved.
function inviteNote(mode) {
  const note = h("div.invite-note", { hidden: true });
  const code = referralCode();
  if (code) {
    fetch("https://api.atberth.com/v1/referral/" + encodeURIComponent(code))
      .then((r) => r.json())
      .then((d) => {
        if (!d.valid) return;
        note.textContent = mode === "signup"
          ? "Invite applied: $12 off your first month of Pro when you upgrade."
          : "You have an invite: $12 off your first month of Pro. It applies when you create a new account.";
        note.hidden = false;
      })
      .catch(() => {});
  }
  return note;
}
const nonce = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

async function finishProvider(provider, idToken, raw, err) {
  try {
    const out = await loginProvider(provider, idToken, raw, referralCode());
    if (out.created) toast("Welcome to Berth. Your account is ready.");
    await boot();
  } catch (e) {
    err.textContent = e.message;
  }
}

const GLYPHS = {
  google: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.3-.8 1.5 0 1.9.8 3.3.8 1.4 0 2.2-1.2 3-2.4 1-1.4 1.3-2.7 1.4-2.8-.1 0-2.4-.9-2.4-4.3zM13.9 5.1c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>',
};
function glyph(name) {
  const span = h("span.provider-glyph");
  span.innerHTML = GLYPHS[name];
  return span;
}

function providerButtons(mode, err) {
  const word = mode === "signup" ? "Sign up" : "Continue";
  // Apple: our own button opens Apple's popup. The script loads now so the
  // click still counts as a user gesture and the popup is not blocked.
  const appleBtn = h("button.btn.lg.block.provider", { type: "button" }, glyph("apple"), word + " with Apple");
  loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js").catch(() => {});
  appleBtn.addEventListener("click", () => {
    err.textContent = "";
    if (!window.AppleID) {
      err.textContent = "Apple sign in is still loading. Try again in a moment.";
      return;
    }
    const raw = nonce();
    window.AppleID.auth.init({ clientId: APPLE_SERVICES_ID, scope: "email", redirectURI: location.origin + "/app/", nonce: raw, usePopup: true });
    busy(appleBtn, async () => {
      try {
        const res = await window.AppleID.auth.signIn();
        await finishProvider("apple", res.authorization.id_token, raw, err);
      } catch (e) {
        if (e && e.error && /popup_closed|user_cancelled/.test(e.error)) return;
        err.textContent = (e && e.message) || "Apple sign in did not finish. Try again.";
      }
    });
  });

  // Google only hands out ID tokens through its own button, so its button sits
  // invisibly on top of ours and takes the click.
  const googleFace = h("button.btn.lg.block.provider", { type: "button", tabindex: "-1", "aria-hidden": "true" }, glyph("google"), word + " with Google");
  const googleHit = h("div.provider-hit");
  const googleWrap = h("div.provider-wrap", googleFace, googleHit);
  loadScript("https://accounts.google.com/gsi/client").then(() => {
    const raw = nonce();
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: raw,
      ux_mode: "popup",
      callback: (r) => {
        err.textContent = "";
        busy(googleFace, () => finishProvider("google", r.credential, raw, err));
      },
    });
    const width = Math.min(400, Math.max(200, Math.round(googleWrap.getBoundingClientRect().width || 360)));
    window.google.accounts.id.renderButton(googleHit, { type: "standard", size: "large", width, text: mode === "signup" ? "signup_with" : "continue_with" });
  }).catch((e) => {
    googleFace.disabled = true;
    googleFace.title = e.message;
  });

  return h("div.providers", googleWrap, appleBtn);
}

function emailStep(side, mode, preset = "") {
  const email = input({ type: "email", placeholder: "you@company.com", autocomplete: "email", value: preset, autofocus: true, inputmode: "email" });
  const err = h("div.hint.bad-text", { role: "alert" });
  const btn = h("button.btn.primary.lg.block", { type: "submit" }, "Continue with email", icon("arrow"));
  const form = h(
    "form.form",
    {
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const v = email.value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) {
          err.textContent = "Enter a valid email address.";
          email.focus();
          return;
        }
        busy(btn, async () => {
          try {
            await post(mode === "signup" ? "/signup" : "/login", mode === "signup" ? { email: v, ref: referralCode() } : { email: v }, { token: null, noAuthRedirect: true });
            codeStep(side, mode, v);
          } catch (e2) {
            err.textContent = e2.message;
          }
        });
      },
    },
    field("Email", email),
    err,
    btn
  );
  mount(
    side,
    h(
      "div.auth-card",
      h("a.brand", { href: "/", style: { marginBottom: "36px", display: "inline-flex" } }, logo(), "Berth"),
      h("h1", mode === "signup" ? "Create your account" : "Sign in to Berth"),
      h("p", mode === "signup" ? "Use Google or Apple, or we email you a 6 digit code. No password to remember." : "Use Google or Apple, or we email you a 6 digit code."),
      inviteNote(mode),
      providerButtons(mode, err),
      h("div.divider", { style: { margin: "20px 0" } }, "or use email"),
      form,
      h("div.divider", { style: { margin: "22px 0" } }, "or"),
      h("button.btn.block", { type: "button", onclick: () => keyStep(side, mode) }, icon("key"), "Use an account key"),
      h(
        "p.auth-alt",
        mode === "signup" ? "Already have an account? " : "New to Berth? ",
        h("a.link", { href: mode === "signup" ? "#/login" : "#/signup" }, mode === "signup" ? "Sign in" : "Create an account")
      ),
      h("p.auth-alt.tiny.dim", "By continuing you agree to the ", h("a.link", { href: "/terms/" }, "terms"), " and ", h("a.link", { href: "/privacy/" }, "privacy policy"), ".")
    )
  );
}

function codeStep(side, mode, email) {
  const boxes = Array.from({ length: 6 }, (_, i) =>
    h("input", { inputmode: "numeric", autocomplete: i === 0 ? "one-time-code" : "off", maxlength: "6", "aria-label": "Digit " + (i + 1), pattern: "[0-9]*" })
  );
  const otp = h("div.otp", boxes);
  const err = h("div.hint.bad-text", { role: "alert" });
  const btn = h("button.btn.primary.lg.block", { type: "submit" }, "Verify and continue");
  const resend = h("button.link", { type: "button" });
  let left = 60;
  const tick = () => {
    if (!resend.isConnected) return;
    if (left > 0) {
      resend.textContent = "Resend in " + left + "s";
      resend.disabled = true;
      left--;
      setTimeout(tick, 1000);
    } else {
      resend.textContent = "Resend code";
      resend.disabled = false;
    }
  };
  resend.addEventListener("click", async () => {
    try {
      await post(mode === "signup" ? "/signup" : "/login", { email }, { token: null, noAuthRedirect: true });
      toast("A new code is on its way.");
      left = 60;
      tick();
    } catch (e) {
      toastError(e);
    }
  });
  const code = () => boxes.map((b) => b.value).join("");
  const submit = () =>
    busy(btn, async () => {
      err.textContent = "";
      otp.classList.remove("err");
      try {
        await login(email, code());
        await boot();
      } catch (e) {
        otp.classList.add("err");
        err.textContent =
          e.status === 401 && mode === "signin" ? "That code is wrong or expired. If you are new, create an account first." : e.message;
        boxes.forEach((b) => (b.value = ""));
        boxes[0].focus();
      }
    });
  boxes.forEach((b, i) => {
    b.addEventListener("input", () => {
      const digits = b.value.replace(/\D/g, "");
      if (digits.length > 1) {
        digits.split("").slice(0, 6 - i).forEach((d, k) => (boxes[i + k].value = d));
        boxes[Math.min(5, i + digits.length)].focus();
      } else {
        b.value = digits;
        if (digits && i < 5) boxes[i + 1].focus();
      }
      if (code().length === 6) submit();
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !b.value && i > 0) {
        boxes[i - 1].focus();
        boxes[i - 1].value = "";
      } else if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
      else if (e.key === "ArrowRight" && i < 5) boxes[i + 1].focus();
    });
    b.addEventListener("paste", (e) => {
      const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (!t) return;
      e.preventDefault();
      t.split("").forEach((d, k) => boxes[k] && (boxes[k].value = d));
      boxes[Math.min(5, t.length)].focus();
      if (t.length === 6) submit();
    });
  });
  mount(
    side,
    h(
      "div.auth-card",
      h("button.btn.ghost.sm", { type: "button", style: { marginBottom: "28px", marginLeft: "-10px" }, onclick: () => emailStep(side, mode, email) }, icon("chev", "i-sm"), "Back"),
      h("div.empty-ico", { style: { marginBottom: "18px" } }, icon("mail", "i-lg")),
      h("h1", "Check your email"),
      h("p", "Enter the 6 digit code we sent to ", h("b", { style: { color: "var(--text)" } }, email), ". It expires in 10 minutes."),
      h(
        "form.form",
        {
          onsubmit: (e) => {
            e.preventDefault();
            if (code().length === 6) submit();
          },
        },
        otp,
        err,
        btn
      ),
      h("p.auth-alt", "Did not get it? Check spam, or ", resend)
    )
  );
  tick();
  requestAnimationFrame(() => boxes[0].focus());
}

function keyStep(side, mode) {
  const key = input({ type: "password", placeholder: "bak_...", mono: true, autofocus: true, autocomplete: "off" });
  const remember = h("input", { type: "checkbox" });
  const err = h("div.hint.bad-text", { role: "alert" });
  const btn = h("button.btn.primary.lg.block", { type: "submit" }, "Sign in with key");
  mount(
    side,
    h(
      "div.auth-card",
      h("button.btn.ghost.sm", { type: "button", style: { marginBottom: "28px", marginLeft: "-10px" }, onclick: () => emailStep(side, mode) }, icon("chev", "i-sm"), "Back"),
      h("div.empty-ico", { style: { marginBottom: "18px" } }, icon("key", "i-lg")),
      h("h1", "Use an account key"),
      h("p", "Paste an account key from ", h("code", "berth account keys create"), ". The platform admin token works too."),
      h(
        "form.form",
        {
          onsubmit: (e) => {
            e.preventDefault();
            busy(btn, async () => {
              try {
                await useKey(key.value.trim(), remember.checked);
                await boot();
              } catch (e2) {
                err.textContent = e2.message;
              }
            });
          },
        },
        field("Key", key),
        h("label.check-row", remember, "Remember on this device"),
        h("div.info-box", icon("info"), h("div.small", "Without remember, the key is kept only until you close this tab. Email sign in is safer: it makes a key that expires in 7 days.")),
        err,
        btn
      )
    )
  );
}

/* ---------- shell ---------- */

function renderShell() {
  const side = h("aside.side", { "aria-label": "Sidebar" });
  const top = h("header.top");
  const content = h("main.content", { id: "content", tabindex: "-1" });
  const el = h("div.shell", side, h("div.main", top, content));
  mount(root, el);
  shell = { el, side, top, content };
  refreshStatus();
}

let statusCache = null;
async function refreshStatus() {
  try {
    statusCache = await get("/status", { token: null, noAuthRedirect: true });
  } catch {
    statusCache = { ok: false };
  }
  if (shell) renderTop();
}
setInterval(() => shell && refreshStatus(), 60000);

function closeSide() {
  shell.side.classList.remove("open");
  const s = document.querySelector(".side-scrim");
  s && s.remove();
}

function renderSide() {
  const r = route();
  const slug = r.slug;
  const app = slug ? state.apps.find((a) => a.slug === slug) : null;
  const isAdmin = state.me && state.me.role === "admin";
  const email = session.data && session.data.email;
  const nav = h("nav.side-nav");
  const item = (href, ic, label, on, extra) =>
    h("a.nav-item" + (on ? ".on" : ""), { href: "#" + href, "aria-current": on ? "page" : null, onclick: closeSide }, icon(ic), label, extra || null);

  append(nav, [
    h(
      "div",
      item("/", "grid", "All apps", r.name === "home", state.apps.length ? h("span.count", String(state.apps.length)) : null),
      item("/account", "account", "Account", r.name === "account"),
      isAdmin ? item("/admin", "shield", "Admin", r.name === "admin") : null
    ),
  ]);
  if (slug) {
    append(nav, [
      h(
        "div.nav-group",
        h("div.nav-title", "App"),
        appNav.map((n) => item("/a/" + slug + (n.path ? "/" + n.path : ""), n.icon, n.label, r.section === n.path))
      ),
    ]);
  }
  append(nav, [
    h(
      "div.nav-group",
      h("div.nav-title", "Resources"),
      h("a.nav-item", { href: "/docs/", target: "_blank", rel: "noopener" }, icon("book"), "Docs", icon("ext", "i-sm")),
      h("a.nav-item", { href: "/docs/cli/", target: "_blank", rel: "noopener" }, icon("terminal"), "CLI", icon("ext", "i-sm")),
      h("a.nav-item", { href: "/docs/api/", target: "_blank", rel: "noopener" }, icon("sql"), "API reference", icon("ext", "i-sm"))
    ),
  ]);

  const switcher = h(
    "button.switcher",
    { type: "button", "aria-haspopup": "menu", onclick: (e) => appMenu(e.currentTarget) },
    app ? avatar(app.slug, "sq") : h("span.avatar.sq", { style: { background: "var(--surface-3)", color: "var(--muted)" } }, icon("grid", "i-sm")),
    h("span.switcher-text", h("span.switcher-label", app ? "App" : "Workspace"), h("span.switcher-name", app ? app.slug : isAdmin ? "Platform admin" : "Your apps")),
    icon("updown", "i-sm")
  );

  const me = h(
    "button.me",
    {
      type: "button",
      onclick: (e) =>
        menu(
          e.currentTarget,
          [
            { group: email || "Signed in" },
            { label: "Account", icon: "account", onClick: () => go("/account") },
            { label: "Command menu", icon: "search", hint: "Ctrl K", onClick: openPalette },
            { label: document.documentElement.getAttribute("data-theme") === "dark" ? "Light theme" : "Dark theme", icon: "sun", onClick: toggleTheme },
            "-",
            { label: "Sign out", icon: "logout", danger: true, onClick: signOut },
          ],
          { align: "left" }
        ),
    },
    avatar(email || "b"),
    h("span.me-text", h("div.me-email", email || "Signed in"), h("div.me-role", isAdmin ? "Platform admin" : "Account")),
    icon("more")
  );

  mount(
    shell.side,
    h("div.side-head", h("a.brand", { href: "#/" }, logo(), "Berth")),
    switcher,
    nav,
    h("div.side-foot", me)
  );
}

function appMenu(anchor) {
  const items = [{ group: "Switch app" }];
  for (const a of state.apps.slice(0, 30)) items.push({ label: a.slug, icon: "db", onClick: () => go("/a/" + a.slug) });
  if (!state.apps.length) items.push({ label: "No apps yet", icon: "info" });
  items.push("-", { label: "All apps", icon: "grid", onClick: () => go("/") }, { label: "Create app", icon: "plus", onClick: () => go("/?new=1") });
  if (state.apps.length > 30) items.splice(31, 0, { label: "Search all " + state.apps.length + " apps", icon: "search", onClick: openPalette });
  menu(anchor, items);
}

function renderTop() {
  const r = route();
  const crumbs = h("nav.crumbs", { "aria-label": "Breadcrumb" });
  const parts = [["#/", "Apps"]];
  if (r.slug) parts.push(["#/a/" + r.slug, r.slug]);
  if (r.slug && r.section) parts.push(["#/a/" + r.slug + "/" + r.section, sectionTitle(r.section)]);
  if (r.slug && r.rest && r.rest.length) parts.push([null, decodeURIComponent(r.rest.join("/"))]);
  if (r.name === "account") parts.push([null, "Account"]);
  if (r.name === "admin") parts.push([null, "Admin"]);
  parts.forEach(([href, label], i) => {
    if (i) crumbs.append(h("span.sep", "/"));
    if (href && i < parts.length - 1) crumbs.append(h("a", { href }, label));
    else crumbs.append(h("span.here", label));
  });
  const st = statusCache;
  const pill = h(
    "a.status-pill",
    { href: "https://api.atberth.com/v1/status", target: "_blank", rel: "noopener", title: st && st.version ? "API " + st.version : "" },
    h("span.status-dot" + (!st ? ".warn" : st.ok ? "" : ".bad")),
    h("span", !st ? "Checking" : st.ok ? "All systems normal" : "Degraded")
  );
  mount(
    shell.top,
    h(
      "button.btn.ghost.icon.burger",
      {
        type: "button",
        "aria-label": "Open menu",
        onclick: () => {
          shell.side.classList.add("open");
          document.body.append(h("div.side-scrim", { onclick: closeSide }));
        },
      },
      icon("menu")
    ),
    crumbs,
    h(
      "div.top-right",
      h("button.search-btn", { type: "button", onclick: openPalette, "aria-label": "Search and commands" }, icon("search", "i-sm"), h("span", "Search or jump to"), h("kbd", navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K")),
      pill
    )
  );
}

function cleanupPage() {
  closeOverlays();
  for (const fn of cleanups) {
    try {
      fn();
    } catch {}
  }
  cleanups = [];
}

const VIEWS = {
  home: () => import("./views/home.js"),
  account: () => import("./views/account.js"),
  admin: () => import("./views/admin.js"),
  overview: () => import("./views/overview.js"),
  tables: () => import("./views/tables.js"),
  sql: () => import("./views/sql.js"),
  users: () => import("./views/users.js"),
  storage: () => import("./views/storage.js"),
  functions: () => import("./views/functions.js"),
  webhooks: () => import("./views/webhooks.js"),
  sites: () => import("./views/sites.js"),
  keys: () => import("./views/keys.js"),
  logs: () => import("./views/logs.js"),
  settings: () => import("./views/settings.js"),
};

let navSeq = 0;
async function render() {
  const r = route();
  if (r.name === "login" || r.name === "signup") {
    if (session.token && state.me) return go("/");
    return renderAuth(r.name === "signup" ? "signup" : "signin");
  }
  if (!session.token || !state.me) return go("/login");
  if (!shell) renderShell();
  cleanupPage();
  renderSide();
  renderTop();
  const seq = ++navSeq;
  let key = r.name;
  if (r.name === "app") key = r.section || "overview";
  if (r.name === "admin" && state.me.role !== "admin") return go("/");
  const loader = VIEWS[key];
  const content = shell.content;
  if (!loader) {
    mount(content, h("div.page", h("div.empty", h("div.empty-ico", icon("info", "i-lg")), h("h3", "Page not found"), h("p", "That page does not exist."), h("div.row", h("a.btn", { href: "#/" }, "Back to apps")))));
    return;
  }
  let app = null;
  if (r.slug) {
    app = state.apps.find((a) => a.slug === r.slug);
    if (!app) {
      try {
        app = (await get("/apps/" + enc(r.slug))).app;
      } catch (e) {
        if (seq !== navSeq) return;
        mount(content, h("div.page", h("div.empty", h("div.empty-ico", icon("alert", "i-lg")), h("h3", "App not found"), h("p", e.status === 404 ? "There is no app called " + r.slug + " in your account." : e.message), h("div.row", h("a.btn", { href: "#/" }, "Back to apps")))));
        return;
      }
    }
  }
  document.title = (r.slug ? r.slug + " · " + (r.section ? sectionTitle(r.section) : "Overview") : key === "home" ? "Apps" : sectionTitle(key)) + " · Berth";
  const mod = await loader();
  if (seq !== navSeq) return;
  clear(content);
  content.scrollTop = 0;
  const ctx = {
    root: content,
    app,
    slug: r.slug,
    rest: r.rest || [],
    query: r.query,
    onCleanup: (fn) => cleanups.push(fn),
    alive: () => seq === navSeq,
    chrome: () => renderTop(),
    refreshShell: async () => {
      await loadApps();
      renderSide();
    },
  };
  try {
    await mod.default(ctx);
  } catch (e) {
    if (seq !== navSeq) return;
    console.error(e);
    toastError(e);
  }
}

async function boot() {
  session.load();
  if (!session.token) {
    state.me = null;
    return render();
  }
  try {
    state.me = await get("/me", { noAuthRedirect: true });
    if (!["admin", "account"].includes(state.me.role)) throw new ApiError(403, "forbidden", "That key is not an account key.");
    await loadApps();
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      session.clear();
      state.me = null;
    } else {
      mount(root, h("div.auth", h("div.auth-side", { style: { gridColumn: "1/-1" } }, h("div.auth-card", h("h1", "Berth is unreachable"), h("p", e.message), h("div.row", { style: { marginTop: "20px" } }, h("button.btn.primary", { onclick: () => boot() }, icon("refresh"), "Try again"))))));
      return;
    }
  }
  const r = route();
  if (state.me && pendingBilling() && r.name !== "account") return go("/account");
  if (state.me && (r.name === "login" || r.name === "signup")) return go("/");
  render();
}

onRoute(render);

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    if (!shell) return;
    e.preventDefault();
    openPalette();
  }
});

// Stripe sends people back with ?billing=...; the pricing page links to #/signup?plan=pro. Both land on the account page.
function captureBillingIntent() {
  try {
    const sp = new URLSearchParams(location.search);
    if (sp.has("billing")) {
      sessionStorage.setItem("berth.billing", JSON.stringify({ status: sp.get("billing"), session_id: sp.get("session_id") || "" }));
      history.replaceState(null, "", location.pathname + "#/account");
    }
    const r = route();
    const ref = sp.get("ref") || (r.query && r.query.ref);
    if (ref && /^[a-z0-9]{4,16}$/i.test(ref)) localStorage.setItem("berth-ref", JSON.stringify({ code: ref.toLowerCase(), at: Date.now() }));
    if (r.query && (r.query.plan === "pro" || r.query.plan === "agency")) {
      sessionStorage.setItem("berth.upgrade", JSON.stringify({ plan: r.query.plan, interval: r.query.interval === "year" ? "year" : "month" }));
    }
  } catch {}
}

function pendingBilling() {
  try {
    return !!(sessionStorage.getItem("berth.billing") || sessionStorage.getItem("berth.upgrade"));
  } catch {
    return false;
  }
}

captureBillingIntent();
boot();
