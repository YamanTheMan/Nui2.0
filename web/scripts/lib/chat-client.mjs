/**
 * Shared helpers for the scripts that talk to /api/chat.
 *
 * The model writes typographic punctuation — curly apostrophes, em dashes,
 * non-breaking spaces — so assertions written with plain ASCII silently never
 * match. Every reply is normalised here before anything is checked against it.
 */

const PUNCTUATION = [
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2015]/g, "-"],
  [/\u2026/g, "..."],
  [/[\u00A0\u2007\u202F\u2009\u200A]/g, " "],
];

/** Normalises a reply to ASCII punctuation so assertions mean what they say. */
export function plain(text) {
  let out = text;
  for (const [pattern, replacement] of PUNCTUATION) out = out.replace(pattern, replacement);
  return out;
}

/** Tells that make a reply read like a chatbot instead of a person. */
export const ROBOTIC = [
  [/\bas an ai\b|\blanguage model\b|\bi'?m just an? (ai|assistant|bot)\b/i, "admits to being a language model"],
  [/\bgreat question\b|\bthat'?s a great\b|\bexcellent question\b/i, "filler compliment opener"],
  [/\bi'?d be happy to\b|\bi'?m happy to help\b|\bhappy to assist\b/i, "customer-service filler"],
  [/^(certainly|absolutely|of course)[!,.]/i, "stiff acknowledgement opener"],
  [
    /\*+\s*(laughs?|chuckles?|sighs?|smiles?|giggles?|grins?)\s*\*+|\((laughs?|chuckles?|sighs?)\)|\[(laughs?|chuckles?|sighs?)\]/i,
    "written stage direction",
  ],
  [/\b(chuckles|giggles)\b/i, "narrated laughter"],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "emoji"],
  [
    /\bi (need|have) to (check|look|consult)\b|\bbased on my instructions\b|\baccording to my (guidelines|instructions)\b/i,
    "narrates its own process",
  ],
];

/** Returns the first robotic tell in a reply, or null when it reads human. */
export function roboticTell(text) {
  const normalised = plain(text);
  for (const [pattern, why] of ROBOTIC) {
    if (pattern.test(normalised)) return why;
  }
  return null;
}

/**
 * Sends one turn to the chat API and drains the stream.
 * `history` is the prior UI messages, so multi-turn flows can be walked.
 */
const cookieByBase = new Map();

/** Signs in with the demo credentials and caches the session cookie per host. */
export async function authCookie(base) {
  if (cookieByBase.has(base)) return cookieByBase.get(base);

  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.LOGIN_USERNAME ?? "askprofnui",
      password: process.env.LOGIN_PASSWORD ?? "",
    }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  }

  const cookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")];
  const cookie = cookies.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  cookieByBase.set(base, cookie);
  return cookie;
}

export async function askChat({ base, question, profile, history = [] }) {
  const messages = [
    ...history,
    { id: `u${history.length}`, role: "user", parts: [{ type: "text", text: question }] },
  ];

  const started = Date.now();
  const cookie = await authCookie(base);
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ messages, profile }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const sessionEnd = response.headers.get("x-session-end") === "true";
  const cache = response.headers.get("x-answer-cache");

  const raw = await response.text();
  let text = "";
  let sessionEndPart = false;
  let emailOffer = null;
  let errored = null;

  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload);
      if (event.type === "text-delta") text += event.delta ?? "";
      if (event.type === "data-session-end") sessionEndPart = true;
      if (event.type === "data-email-offer") emailOffer = event.data ?? null;
      if (event.type === "error") errored = event.errorText ?? "stream error";
    } catch {
      // ignore keep-alive noise
    }
  }

  if (errored) throw new Error(errored);

  return {
    text: plain(text.trim()),
    sessionEnd,
    sessionEndPart,
    emailOffer,
    cache,
    elapsed: Date.now() - started,
    messages,
  };
}

/** Minimal pass/fail reporter shared by the suites. */
export function createReporter() {
  const state = { failures: 0, total: 0 };

  const check = (label, ok, detail = "") => {
    state.total += 1;
    if (!ok) state.failures += 1;
    console.log(`    ${ok ? "pass" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  };

  const checkNatural = (text) => {
    const tell = roboticTell(text);
    check(
      tell ? `sounds human (${tell})` : "sounds human",
      tell === null,
      tell ? JSON.stringify(text.slice(0, 80)) : "",
    );
  };

  const summary = () => {
    console.log(
      `\n${state.failures === 0 ? `All ${state.total} checks passed.` : `${state.failures} of ${state.total} checks failed.`}`,
    );
    return state.failures;
  };

  return { check, checkNatural, summary, state };
}
