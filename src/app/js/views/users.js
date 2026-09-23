import { get, post, patch, del, enc } from "../api.js";
import { h, mount, icon, toast, toastError, modal, confirmDanger, drawer, field, input, empty, errorBox, loading, badge, fmtNum, timeEl, fmtDateTime, avatar, busy, debounce, copyBtn, toggle } from "../ui.js";

const PAGE = 50;

export default async function users(ctx) {
  const { slug } = ctx;
  const base = "/apps/" + enc(slug) + "/auth/users";
  const page = h("div.page");
  ctx.root.append(page);
  let offset = 0;
  const q = input({ type: "search", placeholder: "Search by email", "aria-label": "Search users" });
  const list = h("div.card");
  const foot = h("div.row", { style: { marginTop: "12px" } });
  mount(
    page,
    h(
      "div.ph",
      h("div", h("h1", "Auth users"), h("p", "People who sign in to ", h("b", slug), " with email and password or an emailed code.")),
      h("div.ph-actions", h("button.btn.primary", { type: "button", onclick: () => createUser() }, icon("plus"), "Add user"))
    ),
    h("div.row", { style: { marginBottom: "14px" } }, h("div.search", { style: { width: "320px", maxWidth: "100%" } }, icon("search"), q)),
    list,
    foot
  );
  q.addEventListener("input", debounce(() => ((offset = 0), load()), 250));

  async function load() {
    mount(list, loading());
    const term = q.value.trim();
    let out;
    try {
      out = await get(base + "?limit=" + PAGE + "&offset=" + offset + (term ? "&email=" + enc("*" + term + "*") : ""));
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    if (!ctx.alive()) return;
    const rows = out.users || [];
    if (!rows.length) {
      mount(
        list,
        term
          ? empty({ icon: "search", title: "No users match", text: "Nobody with an email like " + term + "." })
          : empty({
              icon: "users",
              title: "No users yet",
              text: "Users appear when they sign up through your app with the publishable key, or when you add them here.",
              actions: [h("button.btn.primary", { type: "button", onclick: createUser }, icon("plus"), "Add user"), h("a.btn", { href: "/docs/auth/", target: "_blank", rel: "noopener" }, icon("book"), "Auth docs")],
            })
      );
      mount(foot);
      return;
    }
    mount(
      list,
      h(
        "div.tbl-wrap",
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "User"), h("th", "Status"), h("th", "Signed up"), h("th", "Last sign in"), h("th.actions", ""))),
          h(
            "tbody",
            rows.map((u) =>
              h(
                "tr.click",
                { onclick: () => userDrawer(u) },
                h("td", h("div.row", avatar(u.email), h("div", { style: { minWidth: 0 } }, h("div.strong", u.email), h("div.tiny.dim.mono", u.id)))),
                h("td", u.banned ? badge("banned", "bad") : u.email_verified_at ? badge("verified", "ok") : badge("unverified")),
                h("td.dim", timeEl(u.created_at)),
                h("td.dim", u.last_sign_in_at ? timeEl(u.last_sign_in_at) : "never"),
                h("td.actions", icon("chev", "i-sm"))
              )
            )
          )
        )
      )
    );
    const total = out.count || 0;
    mount(
      foot,
      h("span.dim.small.num", term ? fmtNum(rows.length) + " shown" : "Users " + fmtNum(offset + 1) + " to " + fmtNum(offset + rows.length) + " of " + fmtNum(total)),
      h("span.spacer"),
      h("button.btn.sm", { type: "button", disabled: offset === 0, onclick: () => ((offset = Math.max(0, offset - PAGE)), load()) }, "Previous"),
      h("button.btn.sm", { type: "button", disabled: rows.length < PAGE || offset + rows.length >= total, onclick: () => ((offset += PAGE), load()) }, "Next")
    );
  }

  function createUser() {
    const email = input({ type: "email", placeholder: "person@example.com", autofocus: true });
    const pw = input({ type: "password", placeholder: "optional, 8 characters or more", autocomplete: "new-password" });
    const data = h("textarea.textarea.mono", { rows: 3, placeholder: '{"name": "Ana"}' });
    modal({
      title: "Add a user",
      text: "The email is marked verified. Without a password they sign in with an emailed code.",
      body: h("div.form", field("Email", email), field("Password", pw), field("Data (JSON)", data)),
      actions: [
        { label: "Cancel" },
        {
          label: "Add user",
          kind: "primary",
          submit: true,
          onClick: async () => {
            const body = { email: email.value.trim() };
            if (pw.value) body.password = pw.value;
            if (data.value.trim()) body.data = parseJson(data.value);
            await post(base, body);
            toast("User added");
            offset = 0;
            load();
          },
        },
      ],
    });
  }

  function userDrawer(u) {
    const data = h("textarea.textarea.mono", { rows: 6 }, JSON.stringify(u.data || {}, null, 2));
    const pw = input({ type: "password", placeholder: "leave empty to keep", autocomplete: "new-password" });
    let banned = !!u.banned;
    const ban = toggle(banned, (v) => (banned = v), "Banned");
    drawer({
      title: u.email,
      sub: u.id,
      body: h(
        "div.form",
        h(
          "dl.kv",
          h("dt", "User id"),
          h("dd.row", { style: { gap: "4px" } }, h("span.mono.small", u.id), copyBtn(u.id)),
          h("dt", "Signed up"),
          h("dd", fmtDateTime(u.created_at)),
          h("dt", "Last sign in"),
          h("dd", u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : "never"),
          h("dt", "Email"),
          h("dd", u.email_verified_at ? "verified " + fmtDateTime(u.email_verified_at) : "not verified")
        ),
        h("div.hr"),
        h("label.check-row", ban, h("div", h("div", "Banned"), h("div.tiny.dim", "Banned users cannot sign in, and their sessions stop working."))),
        field("User data (JSON)", data, "Your app can read this from /auth/me."),
        field("Set a new password", pw)
      ),
      foot: (close) => [
        h(
          "button.btn.danger",
          {
            type: "button",
            onclick: () =>
              confirmDanger({
                title: "Delete " + u.email,
                text: "The user and every row they own (owner_id) are deleted.",
                confirm: "Delete user",
                typeToConfirm: u.email,
                onConfirm: async () => {
                  await del(base + "/" + enc(u.id));
                  toast("User deleted");
                  close();
                  load();
                },
              }),
          },
          icon("trash"),
          "Delete"
        ),
        h("span.spacer"),
        h("button.btn", { type: "button", onclick: close }, "Cancel"),
        h(
          "button.btn.primary",
          {
            type: "button",
            onclick: (e) =>
              busy(e.currentTarget, async () => {
                try {
                  const body = {};
                  const d = parseJson(data.value || "{}");
                  if (JSON.stringify(d) !== JSON.stringify(u.data || {})) body.data = d;
                  if (banned !== !!u.banned) body.banned = banned;
                  if (pw.value) body.password = pw.value;
                  if (Object.keys(body).length) {
                    await patch(base + "/" + enc(u.id), body);
                    toast("User saved");
                    load();
                  }
                  close();
                } catch (err) {
                  toastError(err);
                }
              }),
          },
          "Save"
        ),
      ],
    });
  }

  load();
}

function parseJson(s) {
  try {
    const v = JSON.parse(s);
    if (typeof v !== "object" || Array.isArray(v) || v === null) throw 0;
    return v;
  } catch {
    throw new Error("Data must be a JSON object.");
  }
}
