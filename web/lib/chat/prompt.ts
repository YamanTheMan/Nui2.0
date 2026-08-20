/**
 * Assembles the prompt for a single reply: who she is (persona), what the
 * student is doing (intent), and what the course material says (retrieval).
 */

import { getCoreFactsBlock, getFactsForQuery } from "./course-facts";
import { detectEmailNeed, PROF_EMAIL, type EmailNeed, type EmailReason } from "./email";
import {
  classifyIntent,
  wantsCourseContext,
  GRADE_CHANGE_PATTERN,
  type Intent,
} from "./intent";
import {
  gradeChangeDirection,
  gradeChangeLevel,
  LAUGHTER_GUIDANCE,
  PERSONA_BASE,
  toneFor,
} from "./persona";
import { search, type ScoredChunk } from "../retrieval";
import { firstName, type StudentProfile } from "../student/profile";

export const CHAT_MODEL = "openai/gpt-oss-120b";
export const FAST_MODEL = "openai/gpt-oss-20b";

export { classifyIntent };
export type { Intent };

export type ChatTurn = { role: "user" | "assistant"; content: string };

const PRIORITY_SOURCES = new Set([
  "D01_course_overview.txt",
  "D02_assignments.txt",
  "D09_prof_nui_persona.txt",
  "D10_cultural_theories_scholarly.txt",
  "D11_it_adoption_theories_scholarly.txt",
  "D12_virtual_influencer_scholarly.txt",
]);

const QUERY_EXPANSIONS: Array<[RegExp, string]> = [
  [/assignment\s*1|country|cultural\s+framework/i, "Assignment 1 cultural framework choose country other than Qatar step 2"],
  [/assignment\s*2|virtual\s+influencer/i, "Assignment 2 IT adoption framework virtual influencers five factors"],
  [/final\s+project/i, "Final project individual 3000 words literature review digital transformation"],
  [/late|penalt|deduct|dance|missed.*deadline|submitted.*late/i, "late policy 72 hours 20% deduction dance remove late penalties special consideration"],
  [/grade\s+distribut|how\s+much|worth|assessment|percent/i, "grade distribution 40% 40% 10% 10% assessments grading"],
  [/wow|get\s+an?\s+a|how\s+to\s+get|improve|do\s+better/i, "wow factor A grade C average professor says wow"],
  [/attend|ninja|coffee\s+bean|talabat|race.*class/i, "attendance race arrive before professor ninja Coffee Bean Talabat"],
  [/word\s+count|10\s*percent|10%/i, "word count 10 percent less more 2700 3300 450 550"],
];

const POLICY_PATTERN =
  /assignment|late|penalt|dance|wow\s+factor|grade\s+distribut|word\s+count|attendance|ninja|participation|reflective|final\s+project|deliverable|rubric|deadline|72\s+hour|20\s*%/i;

const WEAK_RETRIEVAL_THRESHOLD = 0.55;

function expandQuery(query: string): string {
  const extra = QUERY_EXPANSIONS.filter(([pattern]) => pattern.test(query)).map(
    ([, expansion]) => expansion,
  );
  return extra.length > 0 ? `${query} ${extra.join(" ")}` : query;
}

function mergeChunks(...lists: ScoredChunk[][]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const list of lists) {
    for (const chunk of list) {
      const text = chunk.text.trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        parts.push(text);
      }
    }
  }
  return parts.join("\n\n---\n\n");
}

export type RetrievalResult = {
  context: string;
  topScore: number;
  sources: ScoredChunk[];
};

export function retrieveContext(query: string): RetrievalResult {
  const expanded = expandQuery(query);
  const hits = search(expanded, 12);

  const boosted = hits.filter((c) => PRIORITY_SOURCES.has(c.source));
  const other = hits.filter((c) => !PRIORITY_SOURCES.has(c.source));
  const ragContext = mergeChunks(boosted, other);

  const topicFacts = getFactsForQuery(query) || getFactsForQuery(expanded);

  const sections: string[] = [];
  if (topicFacts) {
    sections.push(`=== AUTHORITATIVE COURSE FACTS (use these first) ===\n${topicFacts}`);
  }
  sections.push(`=== RETRIEVED COURSE MATERIAL ===\n${ragContext}`);

  return {
    context: sections.join("\n\n"),
    topScore: hits[0]?.score ?? 0,
    sources: hits,
  };
}

function conversationStyleBlock(turns: ChatTurn[]): string {
  const userCount = turns.filter((t) => t.role === "user").length;
  if (userCount <= 1) {
    return "\n\nThis is your first reply in this conversation. Greet them only if they greeted you.";
  }
  return `\n\nYou are mid-conversation. Do not greet them again, do not re-introduce yourself,
and do not open with their name. Start with the substance.`;
}

function studentContextBlock(profile: StudentProfile): string {
  const parts: string[] = [];
  const name = profile.name.trim();
  const major = profile.major.trim();
  const year = profile.year.trim();

  if (name) parts.push(`First name: ${firstName(name)}`);
  if (major) parts.push(`Major: ${major}`);
  if (year) parts.push(`Year: ${year}`);
  if (parts.length === 0) return "";

  return `WHO YOU'RE TALKING TO:\n${parts.join("\n")}`;
}

function gradeChangeAttemptCount(turns: ChatTurn[]): number {
  return turns.filter((t) => t.role === "user" && GRADE_CHANGE_PATTERN.test(t.content)).length;
}

/**
 * Details students previously reported as missing. When the question touches
 * one of these, the answer is not complete without it.
 */
const MANDATORY_DETAILS: Array<[RegExp, string]> = [
  [
    /late|penalt|deduct|overdue|past\s+the\s+deadline|missed\s+the\s+deadline/i,
    'the dance rule — dancing in front of the class at the end of the semester removes ALL accumulated late penalties',
  ],
  [
    /assignment\s*1|which\s+country|what\s+country|choose\s+a\s+country|cultural\s+framework/i,
    'that Qatar is NOT allowed as the country for Assignment 1 (Qatar is only where the class is taught)',
  ],
  [
    /how\s+(to|do\s+i)\s+get\s+an?\s+a|get\s+an?\s+a\b|wow/i,
    'the wow factor — what separates an A from an average C',
  ],
  [
    /word\s+count|how\s+many\s+words/i,
    'the 10% tolerance above or below the stated word count',
  ],
  [
    /grade\s+distribut|grading\s+breakdown|assessment|how\s+much\s+is.*worth|what.*worth|weight/i,
    'the assessment weights first — Cultural and Technology Adoption Frameworks 20% x 2 = 40%, ' +
      'Final Project 40%, Self-Reflective Essay 10%, Class Participation 10%. ' +
      'Only mention the A/B/C/D letter scale afterwards if they asked about letter grades',
  ],
];

/** Situations where the student is describing a circumstance, not asking about the work. */
const SITUATION_NOT_COURSEWORK = new Set<EmailReason>([
  "medical",
  "absence",
  "accommodation",
  "submission_problem",
  "group_problem",
  "meeting",
]);

/**
 * The offer is made in her own words, but the UI is what actually produces the
 * draft. So she must not start writing the email in the chat — that would
 * duplicate the draft and bury it in the middle of a conversation.
 */
function emailOfferBlock(summary: string): string {
  return `THIS ONE NEEDS PROF NUI
This is ${summary}, which you can't settle yourself — it has to go to Prof Nui at ${PROF_EMAIL}.
Help them as far as you can first: tell them anything the course material actually says about it.
Then offer, in one short sentence and in your own words, to write the email for them.
There's a button under your reply that drafts it, so say something like "want me to write it?"
and leave it there.
Do NOT write the email here. No subject line, no "Dear Prof Nui", no draft in the chat.
Do not promise to send it — they send it themselves.`;
}

function mandatoryDetailBlock(query: string): string {
  const required = MANDATORY_DETAILS.filter(([pattern]) => pattern.test(query)).map(
    ([, detail]) => detail,
  );
  if (required.length === 0) return "";
  return (
    "\n\nMUST INCLUDE in your answer (students complain when this is left out):\n" +
    required.map((detail) => `- ${detail}`).join("\n")
  );
}

export type GenerationPlan = {
  system: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  intent: Intent;
  sources: ScoredChunk[];
  /**
   * True when the answer depends only on the question and the course
   * materials, so it can be reused for any student. Callers must send only
   * the current question to the model when this is set — the prompt carries
   * no conversation history or student details.
   */
  cacheable: boolean;
  /** The question this plan answers, used to build the cache key. */
  query: string;
  /** Set once she has ended the conversation; the session must close after it. */
  endsSession: boolean;
  /** Set when this belongs with Prof Nui and she should offer to draft the email. */
  emailNeed: EmailNeed | null;
};

/**
 * Questions that lean on what was said earlier. Their answers are not reusable,
 * so they are never cached. False positives only cost a cache miss.
 */
const FOLLOW_UP_PATTERN =
  /^(and|but|so|also|what about|how about|ok|okay|yes|no)\b|\b(it|that|those|these|them|the second|the first|the other|previous|earlier|you said|you mentioned|instead)\b/i;

/** Intents whose replies are short and conversational rather than researched. */
const CONVERSATIONAL_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "social",
  "celebration",
  "about_assistant",
  "offtopic_humor",
  "offtopic_redirect",
  "disrespect",
]);

export function buildGenerationPlan(
  turns: ChatTurn[],
  profile: StudentProfile,
): GenerationPlan {
  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const query = lastUser?.content ?? "";
  const intent = classifyIntent(query);

  // Something that has to go to Prof Nui is a description of this student's own
  // situation, so the answer is theirs alone and must never be served to anyone
  // else from the cache.
  const emailNeed = detectEmailNeed(query);

  const cacheable = intent === "retrieve" && !FOLLOW_UP_PATTERN.test(query) && !emailNeed;

  // A cacheable answer is shared across students, so it must not be shaped by
  // this student's name or by where they are in the conversation.
  let system = cacheable
    ? `${PERSONA_BASE}\n\nAnswer the question directly. Do not greet them, do not use their name, ` +
      "and do not re-introduce yourself. Start with the answer itself."
    : PERSONA_BASE + conversationStyleBlock(turns);

  if (!cacheable) {
    const studentBlock = studentContextBlock(profile);
    if (studentBlock) system += `\n\n${studentBlock}`;
  }

  let sources: ScoredChunk[] = [];
  let model = CHAT_MODEL;
  let temperature = 0.6;
  let maxOutputTokens = 320;
  let endsSession = false;

  if (intent === "grade_change") {
    const level = gradeChangeLevel(gradeChangeAttemptCount(turns));
    system += `\n\n${gradeChangeDirection(level, firstName(profile.name))}`;
    endsSession = level === "over";
    temperature = 0.75;
    maxOutputTokens = level === "first" ? 90 : 200;
    return {
      system,
      model,
      temperature,
      maxOutputTokens,
      intent,
      sources,
      cacheable: false,
      query,
      endsSession,
      // Someone begging for marks is not writing a considered appeal, and
      // offering to help would undercut the refusal she just gave.
      emailNeed: null,
    };
  }

  system += `\n\n${toneFor(intent)}`;

  if (emailNeed) system += `\n\n${emailOfferBlock(emailNeed.summary)}`;

  if (intent === "offtopic_humor") {
    system += `\n\n${LAUGHTER_GUIDANCE}`;
  }

  if (wantsCourseContext(intent, query)) {
    const retrieval = retrieveContext(query);
    sources = retrieval.sources;
    const context = retrieval.context || getCoreFactsBlock();
    const weakRetrieval = retrieval.topScore > 0 && retrieval.topScore < WEAK_RETRIEVAL_THRESHOLD;

    if (intent !== "retrieve") {
      // Emotional replies still need the real numbers behind them, but the
      // feeling leads and the facts support it.
      system +=
        `\n\n=== COURSE MATERIAL (use for any facts you give) ===\n${context}\n=== END ===\n` +
        "Lead with the human response. Bring in only the facts that actually help them right now.";
    } else if (POLICY_PATTERN.test(query)) {
      system +=
        `\n\n=== COURSE MATERIAL (use these for policies/assignments) ===\n${context}\n=== END ===\n` +
        "Answer from course facts. Include exact percentages and rules when relevant. " +
        "Do not invent policies.";
    } else if (weakRetrieval) {
      system +=
        `\n\n=== COURSE MATERIAL (may be incomplete) ===\n${context}\n=== END ===\n` +
        "If the course materials do not fully answer this digital transformation question, " +
        'answer from trusted outside knowledge, opening with "According to [source]…" ' +
        "and closing with the **Source:** citation block. " +
        "Still never invent this class's grades, deadlines, or assignment rules.";
    } else {
      system +=
        `\n\n=== COURSE MATERIAL ===\n${context}\n=== END ===\n` +
        "Prefer the course materials. If a genuinely helpful concept is missing, you may add " +
        '"According to [trusted source]…" and close with the **Source:** citation block.';
    }

    // Someone explaining a hospital stay that made them miss Assignment 1 is not
    // asking which country to pick, and reciting the rule at them reads as
    // tone-deaf. The nudge still applies where the assignment itself is the
    // question, such as an appeal or a topic approval.
    if (!emailNeed || !SITUATION_NOT_COURSEWORK.has(emailNeed.reason)) {
      system += mandatoryDetailBlock(query);
    }
    maxOutputTokens = intent === "retrieve" ? 600 : 320;
  }

  if (CONVERSATIONAL_INTENTS.has(intent)) {
    // Small talk is short and benefits from looser, more varied phrasing.
    model = FAST_MODEL;
    // Humour needs room to be surprising, but past ~0.8 the small model starts
    // inventing coursework to be playful about.
    temperature = intent === "offtopic_humor" ? 0.75 : 0.8;
    maxOutputTokens = 220;
  }

  if (intent === "distress") {
    // Warmth here should be steady, not improvised into something strange.
    temperature = 0.7;
  }

  // The offer needs room for the answer plus the one-line offer at the end.
  if (emailNeed) maxOutputTokens = Math.max(maxOutputTokens, 400);

  return {
    system,
    model,
    temperature,
    maxOutputTokens,
    intent,
    sources,
    cacheable,
    query,
    endsSession,
    emailNeed,
  };
}
