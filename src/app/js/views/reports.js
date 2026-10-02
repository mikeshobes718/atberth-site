import { get, post, patch } from "../api.js";
import { h, mount, icon, toast, toastError, drawer, field, input, select, errorBox, loading, badge, busy, toggle, timeEl } from "../ui.js";

const TITLES = { daily: "Daily report", weekly: "Weekly report", monthly: "Monthly report" };
const BLURB = {
  daily: "A short morning check: yesterday compared with the day before.",
  weekly: "The week in review, compared with the week before.",
  monthly: "The month in review, plus a yes or no on whether to upgrade Oracle.",
};
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const pad = (n) => String(n).padStart(2, "0");
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]);

function when(r) {
  const t = pad(r.hour) + ":" + pad(r.minute);
  const where = r.tz.replace(/_/g, " ").split("/").pop();
  if (r.kind === "daily") return "Every day at " + t + " (" + where + ")";
  if (r.kind === "weekly") return "Every " + DAYS[r.weekday ?? 0] + " at " + t + " (" + where + ")";
  return "On the " + ordinal(r.day || 1) + " of every month at " + t + " (" + where + ")";
}

// Owner only: the daily, weekly and monthly reports that Berth emails. Turn them on or off, change when and to whom, choose what they show.
export default async function reports(ctx) {
  const page = h("div.page");
  ctx.root.append(page);
  const list = h("div.stack", { style: { gap: "16px", maxWidth: "860px" } });
  mount(page, h("div.ph", h("div", h("div.eyebrow", "platform"), h("h1", "Reports"), h("p", "Plain-English emails about how Berth is doing: what happened, who's using it, and whether the server is healthy. Everything here is saved instantly."))), list);
  let data = { reports: [], sections: [], timezones: [] };

  async function load() {
    mount(list, loading());
    try {
      data = await get("/admin/reports");
    } catch (e) {
      mount(list, errorBox(e, load));
      return;
    }
    mount(list, ...data.reports.map(card));
  }

  function card(r) {
    const on = toggle(r.enabled, async (v) => {
      try {
        await patch("/admin/reports/" + r.kind, { enabled: v });
        toast(v ? TITLES[r.kind] + " is on" : TITLES[r.kind] + " is off");
        load();
      } catch (err) {
        toastError(err);
        load();
      }
    }, "Send " + r.kind + " report");
    return h(
      "section.card",
      h("div.card-h", h("div", h("h2", TITLES[r.kind]), h("div.sub", BLURB[r.kind])), h("label.row", { style: { gap: "10px" } }, h("span.small.dim", r.enabled ? "On" : "Off"), on)),
      h(
        "div.card-b.stack",
        { style: { gap: "10px" } },
        h("dl.kv", h("dt", "When"), h("dd", when(r)), h("dt", "Next one"), h("dd", r.enabled && r.next_run_at ? timeEl(r.next_run_at).textContent + " (" + new Date(r.next_run_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ")" : "Not scheduled"), h("dt", "Last sent"), h("dd", r.last_sent_at ? new Date(r.last_sent_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"), h("dt", "Goes to"), h("dd", r.recipients.join(", ") || "Nobody yet"), h("dt", "Shows"), h("dd", r.sections.map((s) => (data.sections.find((x) => x.id === s) || { label: s }).label).join(", "))),
        h(
          "div.row",
          { style: { gap: "8px", flexWrap: "wrap" } },
          h("button.btn.sm.primary", { type: "button", onclick: () => edit(r) }, "Change"),
          h("button.btn.sm", { type: "button", onclick: () => preview(r, r.sections) }, icon("eye"), "Preview"),
          h("button.btn.sm", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
            try {
              const x = await post("/admin/reports/" + r.kind + "/send", { to: "me" });
              toast("Sending to " + x.to.join(", ") + ". It takes about 10 seconds.");
            } catch (err) { toastError(err); }
          }) }, icon("send"), "Send me one now")
        )
      )
    );
  }

  async function preview(r, sections) {
    const frame = h("iframe", { style: { width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: "12px", background: "#fff" }, title: "Report preview" });
    drawer({ title: "Preview: " + TITLES[r.kind], sub: "How it looks right now, with live numbers. Nothing is sent.", width: 680, body: h("div", frame), foot: (close) => [h("span.spacer"), h("button.btn", { type: "button", onclick: close }, "Close")] });
    try {
      const p = await get("/admin/reports/" + r.kind + "/preview?sections=" + encodeURIComponent(sections.join(",")));
      frame.srcdoc = p.html;
    } catch (err) {
      toastError(err);
    }
  }

  function edit(r) {
    const time = input({ type: "time", value: pad(r.hour) + ":" + pad(r.minute) });
    const wd = select(DAYS.map((d, i) => [String(i), d]), String(r.weekday ?? 0));
    const dayOfMonth = select(Array.from({ length: 28 }, (_, i) => [String(i + 1), ordinal(i + 1)]), String(r.day || 1));
    const tzs = data.timezones.includes(r.tz) ? data.timezones : [r.tz, ...data.timezones];
    const tz = select(tzs.map((z) => [z, z.replace(/_/g, " ")]), r.tz);
    const to = h("textarea.input", { rows: "3", placeholder: "one email per line" });
    to.value = r.recipients.join("\n");
    const picked = new Set(r.sections);
    const boxes = data.sections.filter((s) => !s.monthly_only || r.kind === "monthly").map((s) => {
      const cb = h("input", { type: "checkbox", checked: picked.has(s.id) ? true : null });
      cb.addEventListener("change", () => (cb.checked ? picked.add(s.id) : picked.delete(s.id)));
      return h("label.check-row", cb, h("div", h("div", s.label), h("div.tiny.dim", s.text)));
    });
    drawer({
      title: "Change the " + r.kind + " report",
      sub: "The headline and traffic light are always included.",
      width: 560,
      body: h(
        "div.form",
        field("Time of day", time),
        r.kind === "weekly" ? field("Day of the week", wd) : null,
        r.kind === "monthly" ? field("Day of the month", dayOfMonth, "Up to the 28th so every month has it.") : null,
        field("Time zone", tz),
        field("Send to", to, "Up to 5 addresses, one per line."),
        h("div.hr"),
        h("h3", { style: { fontSize: "14px", fontWeight: "600" } }, "What it shows"),
        ...boxes
      ),
      foot: (close) => [
        h("button.btn", { type: "button", onclick: () => preview(r, [...picked]) }, icon("eye"), "Preview"),
        h("span.spacer"),
        h("button.btn", { type: "button", onclick: close }, "Cancel"),
        h("button.btn.primary", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
          try {
            const [hh, mm] = (time.value || "07:30").split(":").map(Number);
            const body = { hour: hh, minute: mm, tz: tz.value, recipients: to.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean), sections: [...picked] };
            if (r.kind === "weekly") body.weekday = Number(wd.value);
            if (r.kind === "monthly") body.day = Number(dayOfMonth.value);
            await patch("/admin/reports/" + r.kind, body);
            toast("Saved");
            close();
            load();
          } catch (err) { toastError(err); }
        }) }, "Save"),
      ],
    });
  }

  load();
}
