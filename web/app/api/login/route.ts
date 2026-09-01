import { credentialsMatch, sessionCookieValue } from "@/lib/auth/session";

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = (payload ?? {}) as Record<string, unknown>;
  const username = typeof raw.username === "string" ? raw.username : "";
  const password = typeof raw.password === "string" ? raw.password : "";

  if (!credentialsMatch(username, password)) {
    return Response.json({ error: "Wrong username or password." }, { status: 401 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieValue(),
    },
  });
}
