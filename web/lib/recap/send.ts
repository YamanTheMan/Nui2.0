/** Sends recap emails through Resend. Server-only. */
import type { RecapEmail } from "./email";

const RESEND_API = "https://api.resend.com/emails";

type RecapConfig = { apiKey: string; from: string; replyTo: string };

function config(): RecapConfig {
  return {
    apiKey: (process.env.RESEND_API_KEY ?? "").trim(),
    // e.g. "Nui 2.0 <nui@your-verified-domain.com>"
    from: (process.env.RECAP_FROM ?? "").trim(),
    replyTo: (process.env.RECAP_REPLY_TO ?? "").trim(),
  };
}

/** Recaps stay hidden in the app until both settings exist. */
export function recapConfigured(): boolean {
  const { apiKey, from } = config();
  return Boolean(apiKey && from);
}

export async function sendRecapEmail(to: string, mail: RecapEmail, signal?: AbortSignal): Promise<boolean> {
  const { apiKey, from, replyTo } = config();
  if (!apiKey || !from) return false;
  try {
    const response = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: signal ?? AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// A shared site login means anyone signed in could target an address, so each
// address gets a few recaps an hour. Per server instance: a guard, not a quota.
const RECAPS_PER_HOUR = 5;
const recent = new Map<string, number[]>();

export function allowRecap(email: string, now = Date.now()): boolean {
  const hourAgo = now - 60 * 60 * 1000;
  const sent = (recent.get(email) ?? []).filter((time) => time > hourAgo);
  if (sent.length >= RECAPS_PER_HOUR) {
    recent.set(email, sent);
    return false;
  }
  sent.push(now);
  recent.set(email, sent);
  if (recent.size > 5000) recent.delete(recent.keys().next().value!);
  return true;
}
