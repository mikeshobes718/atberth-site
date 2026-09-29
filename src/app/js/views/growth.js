import { h } from "../ui.js";
import { webCard } from "./admin.js";

// Read-only traffic and signup numbers for atberth.com, for accounts marked as marketers.
export default async function growth(ctx) {
  const page = h("div.page");
  ctx.root.append(page);
  page.append(
    h("div.ph", h("div", h("div.eyebrow", "marketing"), h("h1", "Growth"), h("p", "Which links bring visitors to atberth.com, and which of them bring signups and paying accounts. Make a tagged link below for every place you share Berth."))),
    webCard("/account/growth")
  );
}
