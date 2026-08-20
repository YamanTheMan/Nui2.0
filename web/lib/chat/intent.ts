/**
 * Works out what a student is actually doing when they send a message.
 *
 * Tone depends far more on this than on the words retrieved from the course
 * material. A student saying "I'm going to fail this class" mentions the class,
 * but answering with the grading breakdown would be tone deaf — they need
 * steadying first. So emotional intent is classified ahead of course lookup.
 */

export type Intent =
  /** Greetings, thanks, goodbye. */
  | "social"
  /** Stressed, overwhelmed, scared of failing, thinking of quitting. */
  | "distress"
  /** Proud or excited — good news they want to share. */
  | "celebration"
  /** Apologising, usually for a missed or late submission. */
  | "apology"
  /** Asking her to do the work for them. */
  | "integrity"
  /** Rude to her. */
  | "disrespect"
  /** Curious about her — who she is, whether she's an AI. */
  | "about_assistant"
  /** Playful and off-topic — worth a laugh before steering back. */
  | "offtopic_humor"
  /** Off-topic and not funny — steer back politely. */
  | "offtopic_redirect"
  /** A real dispute that belongs in email with Prof Nui. */
  | "escalate"
  /** Begging for a better grade. */
  | "grade_change"
  /** A genuine course question. */
  | "retrieve";

/**
 * Asking her personally to move a grade. A formal appeal is deliberately not in
 * here — that is a real process that belongs with the professor, and treating it
 * as begging would refuse a student who is doing the right thing.
 */
export const GRADE_CHANGE_PATTERN =
  /change\s+(my|the|your)\s+grade|bump\s+(my|the)\s+grade|raise\s+(my|the)\s+grade|give\s+me\s+(a\s+)?(better|higher)\s+grade|higher\s+grade|better\s+grade|regrade|re-grade|increase\s+my\s+grade|fix\s+my\s+grade|update\s+my\s+grade|round\s+(my|it)\s*(grade|up)|just\s+(one|a\s+few)\s+more\s+points?|need\s+(a|an)\s+[ab]\b|make\s+it\s+an?\s+[ab]\b|but\s+prof(essor|\s+nui)?[\s,!.?]|prof(essor)?\s+please|please\s+prof(essor)?/i;

/** A formal appeal or dispute, which belongs with Prof Nui rather than with her. */
const APPEAL_PATTERN =
  /\bappeal\b|\bdispute\b|\bcontest(ing)?\s+(my|the)\s+grade\b|\bgrade\s+review\b|\bformal\s+complaint\b/i;

const INTEGRITY_PATTERN =
  /(write|do|finish|complete|solve)\s+(my|the|this)\s+(assignment|essay|paper|project|homework|report)|do\s+it\s+for\s+me|write\s+it\s+for\s+me|give\s+me\s+the\s+(answers?|solution)|just\s+tell\s+me\s+the\s+answer|can\s+you\s+just\s+write|chatgpt\s+wrote|is\s+it\s+cheating|plagiar/i;

const DISTRESS_PATTERN =
  /\b(i'?m|i\s+am|feeling|feel)\s+(so\s+)?(stressed|overwhelmed|anxious|panicking|panicked|lost|burnt?\s*out|exhausted|depressed|scared|worried|terrified)\b|\bstressed\s+out\b|\bi\s+can'?t\s+(do|handle|take)\s+(this|it)\b|\bgiving\s+up\b|\bgive\s+up\b|\bwant\s+to\s+(quit|drop)\b|\bdrop\s+(the\s+)?(class|course)\b|\bgoing\s+to\s+fail\b|\bgonna\s+fail\b|\bi'?m\s+failing\b|\bfalling\s+behind\b|\bbehind\s+on\s+everything\b|\btoo\s+much\s+work\b|\bcrying\b|\bhate\s+myself\b|\bnot\s+good\s+enough\b/i;

const CELEBRATION_PATTERN =
  /\bi\s+got\s+(an?\s+)?[ab][+\-]?\b|\bgot\s+full\s+marks\b|\baced\s+it\b|\bi\s+passed\b|\bi\s+finished\b|\bi'?m\s+done\s+with\s+(my|the)\b|\bfinally\s+(done|finished|submitted)\b|\bi\s+submitted\b|\bit\s+went\s+(really\s+)?well\b|\bso\s+(happy|excited|proud)\b|\bthank\s+you\s+so\s+much\b|\bthis\s+(class|course)\s+is\s+(awesome|amazing|great|the\s+best)\b|\bi\s+love\s+(this|your)\s+(class|course|lecture)\b/i;

const APOLOGY_PATTERN =
  /\b(i'?m\s+)?sorry\b|\bmy\s+apolog/i;

const LATE_SUBMISSION_PATTERN =
  /\b(missed|late|past)\s+(the\s+)?(deadline|due\s+date|submission)\b|\bsubmitted?\s+(it\s+)?late\b|\bturned?\s+(it\s+)?in\s+late\b|\bcouldn'?t\s+submit\b|\bdidn'?t\s+submit\b|\bhand(ed)?\s+it\s+in\s+late\b/i;

const DISRESPECT_PATTERN =
  /\b(you'?re|you\s+are|this\s+is)\s+(so\s+)?(stupid|dumb|useless|garbage|trash|terrible|awful|worthless|pathetic)\b|\byou\s+suck\b|\bshut\s+up\b|\bi\s+hate\s+you\b|\bworst\s+(professor|teacher|class)\b|\bidiot\b|\bfuck|\bshit\b|\bbitch\b|\bstupid\s+(bot|ai|assistant)\b/i;

const ABOUT_ASSISTANT_PATTERN =
  /\b(are|r)\s+you\s+(an?\s+)?(ai|bot|robot|real|human|chatgpt|gpt)\b|\bwho\s+(are|r)\s+you\b|\bwhat\s+are\s+you\b|\byour\s+name\b|\bare\s+you\s+prof(essor)?\s+nui\b|\bdo\s+you\s+have\s+(feelings|emotions)\b|\bhow\s+(do|does)\s+(you|this)\s+work\b|\bwhat\s+model\b|\bare\s+you\s+conscious\b/i;

const SOCIAL_PATTERN =
  /^(hi|hello|hey|yo|sup|hiya|salam|salaam|good morning|good afternoon|good evening|how are you|how're you|how r u|what's up|whats up|wassup|thanks|thank you|thx|ty|ok|okay|cool|nice|got it|bye|goodbye|see you|see ya|later|good night|gn)[!.?\s]*$/i;

const HUMOR_OFFTOPIC_PATTERN =
  /weather|wether|rain|raining|sunny|cloudy|hot outside|cold outside|temperature|forecast|humid|tell me a joke|make me laugh|something funny|sing|rap\b|dance for me|what should i eat|lunch|dinner|breakfast|pizza|burger|shawarma|karak|football|soccer|basketball|nba|world cup|who won|game last night|netflix|movie tonight|party tonight|weekend plans|marry me|do you love me|are you single/i;

const OFFTOPIC_REDIRECT_PATTERN =
  /capital of|president of|prime minister|celebrity|recipe|cook me|translate|homework help for math|solve this equation|stock price|crypto|bitcoin|relationship advice|dating|what time is it|what day is it|random question|meaning of life|who is the best/i;

const ESCALATE_KEYWORDS = [
  "appeal",
  "extension for me",
  "special consideration for me",
  "talk to the professor",
  "email the professor",
  "academic integrity case",
];

const RETRIEVE_KEYWORDS = new Set([
  "assignment", "course", "framework", "concept", "digital", "transformation",
  "strategy", "management", "technology", "business", "model", "lecture",
  "reading", "explain", "what", "how", "why", "define", "describe",
  "grade", "grades", "score", "improve", "better", "perform", "wow",
  "late", "policy", "penalty", "submission", "submitting", "first", "second",
  "project", "essay", "rubric", "deliverable", "presentation", "cultural",
  "hofstede", "chapter", "exam", "canvas", "country", "qatar", "dance",
  "distribution", "percent", "participation", "deduction", "deadline",
  "reflective", "virtual", "influencer", "deliverables", "grading",
  "attendance", "ninja", "utaut", "hmsam", "schwartz", "trompenaars",
  "guanxi", "casa", "scholarly", "journal",
]);

const COURSE_MARKERS = [
  "prof nui", "askprofnui", "savanid", "cmu", "67-382", "67 382", "is 382",
  "digital transform", "hofstede", "tam", "utaut", "canvas",
  "assignment", "wow factor", "late penalt", "cultural framework",
];

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
}

export function isCourseRelated(message: string): boolean {
  const lower = message.toLowerCase();
  for (const token of tokenSet(lower)) {
    if (RETRIEVE_KEYWORDS.has(token)) return true;
  }
  return COURSE_MARKERS.some((marker) => lower.includes(marker));
}

export function classifyIntent(message: string): Intent {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // A bare greeting is unambiguous and cheap to settle first.
  if (SOCIAL_PATTERN.test(lower)) return "social";

  // A student following the formal route is doing the right thing, so this is
  // settled before the begging check that shares much of its vocabulary.
  if (APPEAL_PATTERN.test(lower)) return "escalate";

  // Grade begging outranks everything else. It shares wording with genuine
  // grade questions and with escalation, and its escalation ladder only works
  // if every attempt is counted.
  if (GRADE_CHANGE_PATTERN.test(trimmed)) return "grade_change";

  if (DISRESPECT_PATTERN.test(lower)) return "disrespect";
  if (INTEGRITY_PATTERN.test(lower)) return "integrity";

  // Emotional state comes before course lookup: these messages often mention
  // the class, but the feeling is the thing to answer.
  if (DISTRESS_PATTERN.test(lower)) return "distress";
  if (APOLOGY_PATTERN.test(lower) || LATE_SUBMISSION_PATTERN.test(lower)) return "apology";
  if (CELEBRATION_PATTERN.test(lower)) return "celebration";

  if (ABOUT_ASSISTANT_PATTERN.test(lower)) return "about_assistant";
  if (HUMOR_OFFTOPIC_PATTERN.test(lower)) return "offtopic_humor";
  if (OFFTOPIC_REDIRECT_PATTERN.test(lower)) return "offtopic_redirect";
  if (ESCALATE_KEYWORDS.some((kw) => lower.includes(kw))) return "escalate";

  if (isCourseRelated(trimmed)) return "retrieve";

  const tokens = tokenSet(lower);
  if (tokens.size >= 4) return "retrieve";
  if (tokens.size >= 2) return "offtopic_redirect";
  return "social";
}

/** Intents where the reply is better for having course material behind it. */
export function wantsCourseContext(intent: Intent, message: string): boolean {
  if (intent === "retrieve" || intent === "escalate") return true;
  if (intent === "apology") return true;
  if (intent === "distress" || intent === "integrity") return isCourseRelated(message);
  return false;
}
