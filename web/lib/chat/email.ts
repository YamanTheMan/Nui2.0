/**
 * Helping a student write to Prof Nui.
 *
 * Some things genuinely cannot be settled here — an extension, a formal appeal,
 * a medical absence. Pointing at an email address is where most assistants stop,
 * and it is exactly the moment a stressed student stalls: they know who to write
 * to and not how to say it. So she offers to draft it and hands them something
 * they only have to check and send.
 */

export const PROF_EMAIL = "savanid@cmu.edu";
export const PROF_NAME = "Prof Nui";

/** Why a message belongs with the professor, used to steer the draft. */
export type EmailReason =
  | "extension"
  | "appeal"
  | "absence"
  | "medical"
  | "accommodation"
  | "submission_problem"
  | "meeting"
  | "topic_approval"
  | "group_problem"
  | "general";

type Rule = { reason: EmailReason; pattern: RegExp; summary: string };

/**
 * The difference between "what is the late policy" and "I was in hospital and
 * missed the deadline" is that the second one is about them. Without this the
 * offer fires on ordinary policy questions she can answer herself, which is
 * both wrong and annoying.
 */
const FIRST_PERSON = /\b(i|i'?m|i'?ve|my|me|we|our)\b/i;

/**
 * Ordered most specific first: a student writing about a hospital stay that made
 * them miss a deadline should be handled as medical, not as a generic extension.
 */
const RULES: Rule[] = [
  {
    reason: "medical",
    pattern:
      /\b(sick|ill|illness|hospital|surgery|injur|covid|fever|emergency|family emergency|bereave|funeral|passed away|death in|mental health|panic attack)\b/i,
    summary: "a medical or personal emergency affecting their work",
  },
  {
    reason: "accommodation",
    pattern:
      /\b(accommodation|disability|dyslexi|adhd|accessibility|extra time on (the )?(exam|test)|learning support)\b/i,
    summary: "a request for accommodations",
  },
  {
    reason: "appeal",
    pattern:
      /\b(appeal|dispute|contest(ing)?\s+(my|the)\s+grade|grade review|remark|re-?mark|regrade|re-?grade|formal complaint|unfair)\b/i,
    summary: "a formal request to have work re-examined",
  },
  {
    reason: "extension",
    pattern:
      /\b(extension|more time|extra time|special consideration|push (back )?the deadline|deadline extended|can'?t (finish|submit) (it )?(in|on) time|late submission)\b/i,
    summary: "a request for more time on an assignment",
  },
  {
    reason: "submission_problem",
    pattern:
      /\b(canvas (is )?(down|broken|not working)|couldn'?t upload|upload failed|submission failed|wrong file|submitted the wrong|didn'?t go through|technical (issue|problem))\b/i,
    summary: "a technical problem with a submission",
  },
  {
    reason: "absence",
    pattern:
      /\b(miss(ed|ing)? (the )?(class|lecture|session)|absent|absence|can'?t (make|attend) (it|class|the lecture)|travel(ling|ing)?\b.*\bclass)\b/i,
    summary: "missing a class",
  },
  {
    reason: "topic_approval",
    // Deliberately narrow. "Can I choose X" is an ordinary course question she
    // answers from the material; only asking to have a choice signed off needs
    // the professor.
    pattern:
      /\b(approve|approval|permission|sign off|is (it|this) ok(ay)? (with|for) (her|prof|the professor)|change my (topic|country|case|company))\b/i,
    summary: "asking for a topic or country to be approved",
  },
  {
    reason: "group_problem",
    pattern:
      /\b(my (group|team|partner)|group ?mate|teammate)\b.*\b(not|isn'?t|won'?t|refus|prob|issue|doing nothing|disappear)\b/i,
    summary: "a problem with a group or partner",
  },
  {
    reason: "meeting",
    // "When are office hours" is a factual question; asking to arrange a time
    // is not.
    pattern:
      /\b(meet (with )?(prof|professor|her|nui)|talk to (prof|professor|her) in person|schedule a (call|meeting|time)|book a (time|slot|meeting)|come to office hours)\b/i,
    summary: "asking to meet the professor",
  },
];

/** A student explicitly asking for the email itself. */
const EXPLICIT_REQUEST =
  /\b(write|draft|compose|help me (with|write)|can you write|make me)\b[^.?!]{0,40}\b(email|e-mail|message|mail)\b|\bemail (prof|professor|her|nui)\b|\bhow (do|should) i (word|write|phrase|say)\b/i;

export type EmailNeed = {
  reason: EmailReason;
  /** Plain-language description of what the email is about. */
  summary: string;
  /** True when they asked for the email outright rather than just describing the problem. */
  explicit: boolean;
};

/**
 * Works out whether this message is something Prof Nui has to handle personally.
 * Returns null for anything she can answer from the course material herself,
 * so the offer stays rare enough to feel useful rather than like an upsell.
 */
export function detectEmailNeed(message: string): EmailNeed | null {
  const text = message.trim();
  if (!text) return null;

  const explicit = EXPLICIT_REQUEST.test(text);

  if (FIRST_PERSON.test(text)) {
    for (const rule of RULES) {
      if (rule.pattern.test(text)) {
        return { reason: rule.reason, summary: rule.summary, explicit };
      }
    }
  }

  if (explicit) {
    return { reason: "general", summary: "something they need to raise with the professor", explicit: true };
  }

  return null;
}

/** What the draft should cover, per situation. */
const DRAFT_GUIDANCE: Record<EmailReason, string> = {
  extension:
    "Ask for an extension. State which assignment, why more time is needed, and propose a specific new date. Do not invent the reason or the date if the student has not given one — leave a clearly marked blank instead.",
  appeal:
    "Ask for the work to be looked at again. Name the assignment, say specifically which part seems mis-assessed and why, and ask for a review rather than demanding a higher grade.",
  absence:
    "Explain missing a class, give the date if known, say the reason briefly, and ask what was covered and how to catch up.",
  medical:
    "Explain, briefly and without oversharing, that a medical or personal situation affected their work. Ask what the options are and offer to provide documentation.",
  accommodation:
    "Ask about accommodations, mention any formal documentation, and ask how to arrange it for this class.",
  submission_problem:
    "Explain what went wrong technically, when it happened, and ask how to submit. Mention that evidence such as a screenshot can be provided.",
  meeting:
    "Ask for a short meeting, say what it's about in one line, and offer flexibility on timing.",
  topic_approval:
    "Describe the topic, country or case they want to use, say briefly why, and ask for approval before going further.",
  group_problem:
    "Describe the group situation factually, without attacking anyone, and ask for guidance on how to proceed.",
  general: "Explain the situation clearly and ask the specific question they need answered.",
};

export function draftGuidance(reason: EmailReason): string {
  return DRAFT_GUIDANCE[reason] ?? DRAFT_GUIDANCE.general;
}

export type EmailDraft = { to: string; subject: string; body: string };

/**
 * Gmail's compose URL. Everything is encoded, so newlines in the body survive
 * and the student lands on a filled-in draft they only have to read and send.
 */
export function gmailComposeUrl({ to, subject, body }: EmailDraft): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** Fallback for anyone not on Gmail — opens their default mail client. */
export function mailtoUrl({ to, subject, body }: EmailDraft): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${to}?${params.toString()}`;
}
