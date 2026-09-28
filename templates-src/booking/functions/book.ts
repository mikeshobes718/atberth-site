// Public booking endpoint. GET ?date=YYYY-MM-DD lists the start times already
// taken that day (times only, never who booked). POST books a time. It writes
// with the app's secret key; the unique starts_at column blocks double bookings.
const base = Deno.env.get("BERTH_API_URL");
const app = Deno.env.get("BERTH_APP");
const auth = { Authorization: `Bearer ${Deno.env.get("BERTH_SECRET_KEY")}`, "Content-Type": "application/json" };
const rows = (table: string, query = "") => `${base}/apps/${app}/tables/${table}/rows${query}`;

export default async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const date = url.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Pass date=YYYY-MM-DD." }, { status: 400 });
    const from = `${date}T00:00:00Z`, to = new Date(Date.parse(from) + 86400000).toISOString();
    const res = await fetch(rows("bookings", `?select=starts_at&starts_at=gte.${from}&starts_at=lt.${to}&limit=200`), { headers: auth });
    const out = await res.json();
    return Response.json({ taken: (out.rows ?? []).map((r: { starts_at: string }) => new Date(r.starts_at).toISOString()) });
  }
  if (req.method !== "POST") return Response.json({ error: "Use GET or POST." }, { status: 405 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim(), email = String(b.email ?? "").trim().toLowerCase();
  const startsAt = new Date(String(b.starts_at ?? ""));
  if (!name || name.length > 100) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now()) return Response.json({ error: "Pick a time in the future." }, { status: 400 });
  const svc = await fetch(rows("services", `?id=eq.${encodeURIComponent(String(b.service ?? ""))}`), { headers: auth }).then((r) => r.json());
  const service = svc.rows?.[0];
  if (!service) return Response.json({ error: "Pick a service." }, { status: 400 });
  const res = await fetch(rows("bookings"), {
    method: "POST", headers: auth,
    body: JSON.stringify({ service: service.name, starts_at: startsAt.toISOString(), name, email, notes: String(b.notes ?? "").slice(0, 500) || null }),
  });
  if (res.status === 409) return Response.json({ error: "That time was just taken. Pick another." }, { status: 409 });
  if (!res.ok) return Response.json({ error: "Could not book right now. Try again." }, { status: 502 });
  return Response.json({ ok: true, service: service.name, starts_at: startsAt.toISOString() }, { status: 201 });
};
