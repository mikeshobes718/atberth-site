// Adds an email to the waitlist. Public: the page calls it without a key,
// and it writes with the app's secret key, which never leaves the server.
// Berth answers CORS for every app route, so the function does not.
const base = Deno.env.get("BERTH_API_URL");
const app = Deno.env.get("BERTH_APP");

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const res = await fetch(`${base}/apps/${app}/tables/signups/rows`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("BERTH_SECRET_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, source: String(body.source ?? "").slice(0, 100) || null }),
  });
  // Already on the list counts as success, so the page never leaks who signed up.
  if (res.ok || res.status === 409) return Response.json({ ok: true });
  return Response.json({ error: "Could not add you right now. Try again." }, { status: 502 });
};
