import { InvalidRequest, readJsonRequest } from "@/lib/chat/request";
import { composeRecapEmail } from "@/lib/recap/email";
import { allowRecap, recapConfigured, sendRecapEmail } from "@/lib/recap/send";
import { summarizeSession, type RecapTurn } from "@/lib/recap/summarize";
import { firstName, normaliseAndrewEmail } from "@/lib/student/profile";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_TURNS = 120;
const MAX_TURN_CHARACTERS = 2000;
const MAX_TOTAL_CHARACTERS = 30_000;

/** Whether the app should offer recaps at all. */
export async function GET() {
  return Response.json({ enabled: recapConfigured() }, { headers: noStore });
}

function readTurns(value: unknown): RecapTurn[] {
  if (!Array.isArray(value) || value.length > MAX_TURNS) {
    throw new InvalidRequest("This session is too long to recap.", 413);
  }
  const turns: RecapTurn[] = [];
  for (const item of value) {
    const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    if ((raw.role !== "student" && raw.role !== "nui") || typeof raw.text !== "string") {
      throw new InvalidRequest("Invalid session transcript.");
    }
    const text = raw.text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (text) turns.push({ role: raw.role, text: text.slice(0, MAX_TURN_CHARACTERS) });
  }
  // Keep the end of a long session: that is where next steps come from.
  let total = 0;
  const kept: RecapTurn[] = [];
  for (const turn of [...turns].reverse()) {
    total += turn.text.length;
    if (total > MAX_TOTAL_CHARACTERS) break;
    kept.unshift(turn);
  }
  return kept;
}

export async function POST(req: Request) {
  let email = "";
  let turns: RecapTurn[] = [];
  let name = "";
  try {
    const input = await readJsonRequest(req, 96_000);
    const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    email = normaliseAndrewEmail(raw.email);
    if (!email) throw new InvalidRequest("Use your @andrew.cmu.edu address.");
    turns = readTurns(raw.turns);
    if (!turns.some((turn) => turn.role === "student")) throw new InvalidRequest("There is nothing to recap yet.");
    name = typeof raw.name === "string" ? firstName(raw.name.replace(/[^\p{L}\p{M}'’ -]/gu, " ")).slice(0, 40) : "";
  } catch (error) {
    return Response.json(
      { error: error instanceof InvalidRequest ? error.message : "Invalid request." },
      { status: error instanceof InvalidRequest ? error.status : 400, headers: noStore },
    );
  }
  if (!recapConfigured()) {
    return Response.json({ error: "Email recaps are not set up yet." }, { status: 503, headers: noStore });
  }
  if (!allowRecap(email)) {
    return Response.json({ error: "Too many recaps for this address. Try again in an hour." }, { status: 429, headers: noStore });
  }

  // The transcript is used for this one email and never stored or logged.
  const summary = await summarizeSession(turns, req.signal);
  if (!summary) {
    return Response.json({ error: "We couldn't write your recap. Please try again." }, { status: 502, headers: noStore });
  }
  const sent = await sendRecapEmail(email, composeRecapEmail({ firstName: name, ...summary }));
  if (!sent) {
    console.error("Recap email delivery failed");
    return Response.json({ error: "We couldn't send your recap. Please try again later." }, { status: 502, headers: noStore });
  }
  return Response.json({ sent: true }, { headers: noStore });
}
