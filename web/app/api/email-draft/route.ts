import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";

import {
  detectEmailNeed,
  draftGuidance,
  PROF_EMAIL,
  PROF_NAME,
  type EmailReason,
} from "@/lib/chat/email";
import { CHAT_MODEL, FAST_MODEL } from "@/lib/chat/prompt";
import { stripEmoji } from "@/lib/chat/sanitize";
import { EMPTY_PROFILE, firstName, type StudentProfile } from "@/lib/student/profile";

export const maxDuration = 30;

const SUBJECT_LIMIT = 120;

function normaliseProfile(value: unknown): StudentProfile {
  if (!value || typeof value !== "object") return EMPTY_PROFILE;
  const raw = value as Record<string, unknown>;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    major: typeof raw.major === "string" ? raw.major : "",
    year: typeof raw.year === "string" ? raw.year : "",
  };
}

function systemPrompt(profile: StudentProfile, reason: EmailReason): string {
  const student = profile.name.trim() || "the student";
  const details = [
    profile.name.trim() && `Name: ${profile.name.trim()}`,
    profile.major.trim() && `Major: ${profile.major.trim()}`,
    profile.year.trim() && `Year: ${profile.year.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `You write a short email from a student to their professor, ${PROF_NAME}, who teaches
digital transformation at CMU-Q.

WHAT THIS EMAIL IS FOR
${draftGuidance(reason)}

WHO IS WRITING
${details || "The student has not given their details."}
Sign off as ${student}.

HOW IT MUST READ
- Polite, direct and short. Four to eight sentences of body at most.
- A real student's voice: respectful but not grovelling, no flowery phrasing.
- Plain text only. No markdown, no bullet points, no emoji, no placeholders in
  angle brackets.
- Open with "Dear ${PROF_NAME}," and close with "Best regards," then the name.

NEVER INVENT FACTS
This is the part that matters most. Use only what the student actually told you.
If something important is missing — a date, an assignment name, a reason, a
proposed deadline — write it as [square brackets] describing exactly what they
should fill in, for example [the date you missed] or [your proposed new
deadline]. Never guess a detail and never state something they did not say.
A draft with honest blanks is useful; one with invented facts could embarrass
them in front of their professor.

FORMAT
Reply in exactly this shape and nothing else:
SUBJECT: <one line, under ${SUBJECT_LIMIT} characters>
BODY:
<the email>`;
}

/** Splits the model's reply into a subject and a body. */
function parseDraft(text: string): { subject: string; body: string } | null {
  const match = text.match(/SUBJECT:\s*(.+?)\s*\n+BODY:\s*\n?([\s\S]+)/i);
  if (!match) return null;

  const subject = stripEmoji(match[1].trim()).slice(0, SUBJECT_LIMIT);
  const body = stripEmoji(match[2].trim());
  if (!subject || !body) return null;

  return { subject, body };
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = (payload ?? {}) as Record<string, unknown>;
  const situation = typeof raw.situation === "string" ? raw.situation.trim() : "";
  const profile = normaliseProfile(raw.profile);

  if (!situation) {
    return Response.json({ error: "Nothing to write about yet." }, { status: 400 });
  }

  // The client sends the reason it was offered under; fall back to re-reading the
  // situation so a direct call still produces something sensible.
  const requested = typeof raw.reason === "string" ? (raw.reason as EmailReason) : undefined;
  const reason = requested ?? detectEmailNeed(situation)?.reason ?? "general";

  const system = systemPrompt(profile, reason);
  const prompt = `The student described it like this:\n\n"""${situation}"""\n\nWrite the email.`;

  // A short email to a tight spec is well within the small model, and keeping it
  // off the large one leaves that quota for answering questions. The large model
  // is the fallback for the rare draft the small one mangles.
  let lastError: unknown = null;
  for (const model of [FAST_MODEL, CHAT_MODEL]) {
    try {
      const { text } = await generateText({
        model: groq(model),
        system,
        prompt,
        temperature: 0.4,
        maxOutputTokens: 500,
        providerOptions: {
          groq: { reasoningEffort: "low", reasoningFormat: "hidden" },
        },
      });

      const draft = parseDraft(text);
      if (draft) {
        return Response.json({
          to: PROF_EMAIL,
          subject: draft.subject,
          body: draft.body,
          student: firstName(profile.name),
        });
      }
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Could not draft that one.";
  return Response.json({ error: message }, { status: 502 });
}
