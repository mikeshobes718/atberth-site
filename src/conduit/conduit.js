// The Conduit admin page: signs in with the Berth email code for the Conduit
// app, exchanges it for a Conduit session the same way the phones do, and
// manages the assistant tokens. Only the owner's linked login gets past the
// session step; any other email is refused there.

const API = "https://api.atberth.com/v1";
const APP = "conduit";
// A publishable key: built into the apps too. It identifies the app and
// grants nothing on its own.
const PUBLISHABLE = "bpk_oUxul2MaGX33_f6o37FOLtJj3Ntp-i3cFvXg6Ozubng";
const CONDUIT = `${API}/apps/${APP}/functions/conduit-api`;
const SESSION_KEY = "conduit_admin_session";

const $ = (id) => document.getElementById(id);
let state = { token: null, email: null, pendingEmail: null };

function remember(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Private windows can refuse storage. The page still works for this visit.
  }
}

function recall() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function call(url, { method = "GET", body, token } = {}) {
  const headers = { apikey: PUBLISHABLE, accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(messageFor(data, response.status));
    error.status = response.status;
    error.code = data && data.error;
    throw error;
  }
  return data;
}

function messageFor(data, status) {
  const code = data && data.error;
  const known = {
    not_linked: "This Berth login is not the owner of Conduit.",
    bad_passcode: "This login is not linked to Conduit yet.",
    berth_token_invalid: "That sign-in expired. Start again.",
    email_not_verified: "Verify this email in Berth first.",
    too_many_attempts: "Too many tries. Wait a few minutes.",
    berth_unavailable: "Berth is not reachable right now. Try again shortly.",
    migration_pending: "Conduit is being updated. Try again shortly.",
    unauthorized: "Your session ended. Sign in again.",
    forbidden: "Not allowed.",
    not_found_or_revoked: "That token is already revoked.",
  };
  if (code && known[code]) return known[code];
  if (status === 429) return "Too many tries. Wait a few minutes.";
  return (data && (data.message || data.error)) || `Something went wrong (${status}).`;
}

function show(id, visible) {
  $(id).hidden = !visible;
}

function setMessage(id, text) {
  $(id).textContent = text || "";
}

function enterAdmin(session) {
  state = { token: session.token, email: session.email, pendingEmail: null };
  $("who").textContent = session.email || "";
  show("signout", true);
  show("gate", false);
  show("admin", true);
  refresh();
}

function leaveAdmin(message) {
  state = { token: null, email: null, pendingEmail: null };
  remember(null);
  $("who").textContent = "";
  show("signout", false);
  show("admin", false);
  show("gate", true);
  show("emailForm", true);
  show("codeForm", false);
  setMessage("gateMsg", message || "");
}

async function sendCode(event) {
  event.preventDefault();
  const email = $("email").value.trim();
  setMessage("gateMsg", "");
  $("sendCode").disabled = true;
  try {
    await call(`${API}/apps/${APP}/auth/code`, { method: "POST", body: { email } });
    state.pendingEmail = email;
    show("emailForm", false);
    show("codeForm", true);
    $("code").focus();
    setMessage("gateMsg", "Code sent. It expires in 10 minutes.");
  } catch (error) {
    setMessage("gateMsg", messageFor({ error: error.code, message: error.message }, error.status));
  } finally {
    $("sendCode").disabled = false;
  }
}

async function signIn(event) {
  event.preventDefault();
  const code = $("code").value.trim();
  setMessage("gateMsg", "");
  try {
    const session = await call(`${API}/apps/${APP}/auth/verify`, {
      method: "POST",
      body: { email: state.pendingEmail, code },
    });
    const exchanged = await call(`${CONDUIT}/session`, {
      method: "POST",
      body: { berth_token: session.access_token, device_name: "Admin page" },
    });
    const next = { token: exchanged.token, email: state.pendingEmail };
    remember(next);
    enterAdmin(next);
  } catch (error) {
    setMessage("gateMsg", messageFor({ error: error.code, message: error.message }, error.status));
  }
}

function act(body) {
  return call(CONDUIT, { method: "POST", body, token: state.token });
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function when(value) {
  return value ? new Date(value).toLocaleString() : "";
}

function renderTokens(tokens) {
  const body = $("tokens");
  body.replaceChildren();
  show("tokensEmpty", tokens.length === 0);
  for (const token of tokens) {
    const row = document.createElement("tr");
    row.append(
      cell(token.label),
      cell((token.scopes || []).join(", ")),
      cell(when(token.created_at)),
      cell(when(token.last_used_at) || "never"),
      cell(token.revoked_at ? "revoked" : "active", token.revoked_at ? "no" : "ok"),
    );
    const action = document.createElement("td");
    if (!token.revoked_at) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "danger";
      button.textContent = "Revoke";
      button.addEventListener("click", () => revoke(token));
      action.append(button);
    }
    row.append(action);
    body.append(row);
  }
}

function renderAudit(rows, names) {
  const body = $("audit");
  body.replaceChildren();
  show("auditEmpty", rows.length === 0);
  for (const entry of rows) {
    const row = document.createElement("tr");
    row.append(
      cell(when(entry.at)),
      cell(names.get(entry.token_id) || "removed token"),
      cell(entry.action),
      cell(entry.slug || ""),
      cell(entry.allowed ? "allowed" : (entry.detail || "refused"), entry.allowed ? "ok" : "no"),
    );
    body.append(row);
  }
}

async function refresh() {
  try {
    const data = await act({ action: "assistant_list" });
    const names = new Map((data.tokens || []).map((token) => [token.id, token.label]));
    renderTokens(data.tokens || []);
    renderAudit(data.audit || [], names);
  } catch (error) {
    if (error.status === 401) {
      leaveAdmin("Your session ended. Sign in again.");
      return;
    }
    setMessage("createMsg", messageFor({ error: error.code, message: error.message }, error.status));
  }
}

async function create(event) {
  event.preventDefault();
  setMessage("createMsg", "");
  const label = $("label").value.trim();
  const scopes = [...document.querySelectorAll('input[name="scope"]:checked')].map((box) => box.value);
  if (scopes.length === 0) {
    setMessage("createMsg", "Choose at least one permission.");
    return;
  }
  try {
    const data = await act({ action: "assistant_create", label, scopes });
    $("tokenValue").textContent = data.token;
    show("tokenBox", true);
    refresh();
  } catch (error) {
    if (error.status === 401) leaveAdmin("Your session ended. Sign in again.");
    else setMessage("createMsg", messageFor({ error: error.code, message: error.message }, error.status));
  }
}

async function revoke(token) {
  if (!window.confirm(`Revoke "${token.label}"? It stops on its next call and cannot be undone.`)) return;
  try {
    await act({ action: "assistant_revoke", id: token.id });
    refresh();
  } catch (error) {
    if (error.status === 401) leaveAdmin("Your session ended. Sign in again.");
    else setMessage("createMsg", messageFor({ error: error.code, message: error.message }, error.status));
  }
}

function hideToken() {
  $("tokenValue").textContent = "";
  show("tokenBox", false);
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText($("tokenValue").textContent);
    $("copyToken").textContent = "Copied";
  } catch {
    $("copyToken").textContent = "Select and copy by hand";
  }
}

function init() {
  $("emailForm").addEventListener("submit", sendCode);
  $("codeForm").addEventListener("submit", signIn);
  $("createForm").addEventListener("submit", create);
  $("signout").addEventListener("click", () => leaveAdmin("Signed out."));
  $("hideToken").addEventListener("click", hideToken);
  $("copyToken").addEventListener("click", copyToken);
  const saved = recall();
  if (saved && saved.token) enterAdmin(saved);
}

init();
