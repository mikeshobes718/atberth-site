import { get, post, patch, del, enc } from "../api.js";
import { h, mount, icon, toast, toastError, drawer, field, input, select, empty, errorBox, loading, badge, timeEl, busy, avatar, copyBtn, confirmDanger } from "../ui.js";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", support: "Support", marketing: "Marketing" };

// Owner only: who else can use the admin pages, with which role, and invites for people who have not signed in yet.
export default async function team(ctx) {
  const page = h("div.page");
  ctx.root.append(page);
  const list = h("div.card");
  let data = { members: [], roles: [], invite_days: 14 };
  mount(
    page,
    h("div.ph", h("div", h("div.eyebrow", "platform"), h("h1", "Team"), h("p", "Who can use the admin pages, and what each role can do. Only you can change this. Every change is recorded in the activity log.")), h("div.actions", h("button.btn.primary", { type: "button", onclick: () => addDrawer() }, icon("plus"), "Add member"))),
    list
  );

  async function load() {
    mount(list, loading());
    try {
      data = await get("/admin/team");
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    draw();
  }

  const statusBadge = (m) => (m.status === "active" ? badge("active", "ok") : m.status === "pending" ? badge("invited", "info") : m.status === "expired" ? badge("invite expired", "bad") : badge(m.status, "bad"));

  function draw() {
    mount(
      list,
      h(
        "div.tbl-wrap",
        h(
          "table.tbl",
          h("thead", h("tr", h("th", "Person"), h("th", "Role"), h("th", "Status"), h("th", "Note"), h("th", "Last sign in"), h("th.actions", ""))),
          h(
            "tbody",
            data.members.map((m) =>
              h(
                "tr" + (m.locked ? "" : ".click"),
                { onclick: m.locked ? null : () => rowDrawer(m) },
                h("td", h("div.row", avatar(m.email), h("div.strong", m.email))),
                h("td", badge(ROLE_LABEL[m.role] || m.role, m.role === "owner" ? "info" : "")),
                h("td", statusBadge(m)),
                h("td.dim", m.note || "-"),
                h("td.dim", m.last_login_at ? timeEl(m.last_login_at) : m.expires_at ? h("span", "invite ends ", timeEl(m.expires_at)) : "-"),
                h("td.actions", m.locked ? null : icon("chev", "i-sm"))
              )
            )
          )
        )
      ),
      h("div.card-b", h("h3", { style: { fontSize: "14px", fontWeight: "600", marginBottom: "8px" } }, "What each role can do"), h("dl.kv", ...(data.roles || []).flatMap((r) => [h("dt", r.label), h("dd", r.text)]), h("dt", "Owner"), h("dd", "You. Set on the server, so the team can never lock you out. Only the owner manages the team, deletes accounts, reads login codes and removes test traffic.")))
    );
  }

  const roleOptions = () => (data.roles || []).map((r) => [r.id, r.label]);

  function addDrawer() {
    const email = input({ type: "email", placeholder: "person@example.com" });
    const role = select(roleOptions(), "support");
    const note = input({ placeholder: "Optional: why they have access", maxlength: "200" });
    const hint = h("div.hint");
    const sync = () => (hint.textContent = (data.roles.find((r) => r.id === role.value) || {}).text || "");
    role.addEventListener("change", sync);
    sync();
    drawer({
      title: "Add a team member",
      sub: "If they already have a verified Berth account they get access at once. Otherwise they get an invite, good for " + data.invite_days + " days.",
      body: h("div.form", field("Email", email, "Access is matched to this exact verified email."), field("Role", role), hint, field("Note", note)),
      foot: (close) => [
        h("span.spacer"),
        h("button.btn", { type: "button", onclick: close }, "Cancel"),
        h("button.btn.primary", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
          try {
            const r = await post("/admin/team", { email: email.value.trim(), role: role.value, note: note.value.trim() || undefined });
            close();
            await load();
            if (r.status === "pending") inviteDrawer(r.member, r.invite_text);
            else toast(email.value.trim() + " now has access");
          } catch (err) {
            toastError(err);
          }
        }) }, "Add"),
      ],
    });
  }

  function inviteDrawer(m, text) {
    drawer({
      title: "Invite saved",
      sub: m.email,
      body: h("div.form", h("p.small", "They have also been emailed. You can send this text yourself too."), h("pre.mono.small", { style: { whiteSpace: "pre-wrap", padding: "12px", border: "1px solid var(--line)", borderRadius: "8px" } }, text), h("div.row", copyBtn(text, { label: "Invite copied", small: false }), h("span.small.dim", "Copy invite text"))),
      foot: (close) => [h("span.spacer"), h("button.btn.primary", { type: "button", onclick: close }, "Done")],
    });
  }

  function rowDrawer(m) {
    const role = select(roleOptions(), m.role);
    const note = input({ value: m.note || "", maxlength: "200" });
    drawer({
      title: m.email,
      sub: m.status === "active" ? "Team member" : "Invite, access starts at their first sign in",
      body: h("div.form", field("Role", role), field("Note", note), m.invite_text ? h("div", h("div.small.dim", "Invite text"), h("pre.mono.small", { style: { whiteSpace: "pre-wrap" } }, m.invite_text), copyBtn(m.invite_text, { label: "Invite copied", small: false })) : null),
      foot: (close) => [
        h("button.btn.danger", { type: "button", onclick: () => confirmDanger({
          title: m.status === "active" ? "Remove " + m.email : "Cancel the invite for " + m.email,
          text: m.status === "active" ? "Their access to the admin pages ends at once. Their account and apps are not affected." : "They will not get access when they sign in.",
          confirm: m.status === "active" ? "Remove" : "Cancel invite",
          onConfirm: async () => { await del("/admin/team/" + enc(m.email)); toast("Removed"); close(); load(); },
        }) }, icon("trash"), m.status === "active" ? "Remove" : "Cancel invite"),
        h("span.spacer"),
        h("button.btn", { type: "button", onclick: close }, "Close"),
        h("button.btn.primary", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
          try {
            await patch("/admin/team/" + enc(m.email), { role: role.value, note: note.value.trim() || null });
            toast("Saved");
            close();
            load();
          } catch (err) {
            toastError(err);
          }
        }) }, "Save"),
      ],
    });
  }

  load();
}
