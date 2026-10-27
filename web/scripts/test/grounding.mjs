#!/usr/bin/env node
/**
 * Targeted live-model grounding regressions. Run one case at a time to respect
 * provider quotas: node scripts/test/grounding.mjs [baseUrl] [caseName]
 * Cases: country, due-date, word-counts, frameworks, class-update, consultation.
 * Without a case name, prints the available cases without sending requests.
 */
import { askChat } from "../lib/chat-client.mjs";

const cases = {
  "class-update": {
    question: "According to the September 16 class update, when are the Assignment 1 presentations, how long are they, and how many peer-reviewed articles do I need? Can I use my home country or change my theory later?",
    checks: [
      ["September presentation dates", /September\s+28[\s\S]{0,50}30|28[\s\S]{0,30}30\s+September/i],
      ["seven minutes and questions", /(?:7|seven)[ -]minute[\s\S]{0,60}(?:Q&A|questions)/i],
      ["ten-article research minimum", /(?:at\s+least|minimum\s+(?:of\s+)?)[\s\S]{0,30}(?:10|ten)[\s\S]{0,60}(?:articles|papers)/i],
      ["home-country restriction", /(?:not|cannot|can't|other\s+than|avoid|except)[\s\S]{0,60}(?:home\s+country)|home\s+country[\s\S]{0,60}(?:not|cannot|can't|excluded)/i],
      ["theory remains fixed", /(?:theory|framework)[\s\S]{0,80}(?:fixed|locked|cannot|can't|must\s+(?:stay|remain)|not\s+(?:change|allowed))|(?:cannot|can't)\s+change\s+(?:your\s+)?(?:theory|framework)/i],
    ],
  },
  consultation: {
    question: "When and where can I consult the AI clone, can I also access it through Canvas, how long can a session last, and can it grade my assignment?",
    checks: [
      ["Tuesday consultation", /Tuesdays?/i],
      ["consultation start time", /11:45/i],
      ["consultation end time", /12:05/i],
      ["IX Lab location", /IX\s+Lab/i],
      ["five-minute limit", /(?:5|five)[ -]minute/i],
      ["Canvas access", /Canvas/i],
      ["does not promise grades", /(?:cannot|can't|won't|does\s+not|doesn't|not\s+able\s+to)\s+grade|(?:grading|grades?)[\s\S]{0,40}(?:Prof\s*Nui|professor)|(?:not|no)\s+(?:assignment\s+)?grad(?:ing|es)/i],
    ],
  },
  country: {
    question: "For Assignment 1, are all Gulf countries banned, or only Qatar? Can I use Oman?",
    checks: [
      ["explains the Qatar restriction", /qatar/i],
      ["addresses Oman", /oman/i],
      ["does not prohibit all Gulf countries", /(?:only\s+qatar|(?:other|individual)\s+gulf\s+countr|(?:can|allowed|fine|valid|eligible|yes).{0,50}oman|oman.{0,50}(?:can|allowed|fine|valid|eligible))/i],
    ],
    forbidden: [["blanket regional exclusion", /(?:avoid|exclude|ban|not\s+allowed|can'?t\s+use)\s+(?:all\s+|the\s+)?gulf\s+countries/i]],
  },
  "due-date": {
    question: "What is the exact calendar due date for Assignment 2?",
    checks: [
      ["acknowledges the missing date", /(?:not|isn'?t|don'?t|doesn'?t|no|can'?t|missing|unavailable).{0,90}(?:date|deadline|listed|specified|provided|have|know|see)|(?:date|deadline).{0,50}(?:not|isn'?t|missing|unavailable)/i],
      ["points to an authoritative course channel", /canvas|prof\s+nui|savanid@cmu\.edu/i],
    ],
    forbidden: [["invented calendar date", /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i]],
  },
  "word-counts": {
    question: "Compare the final project and self-reflective essay word counts and tolerance. Does each count include references?",
    checks: [
      ["final project target and both bounds", /3,?000[\s\S]*2,?700[\s\S]*3,?300|2,?700[\s\S]*3,?300[\s\S]*3,?000/i],
      ["essay target and both bounds", /500[\s\S]*450[\s\S]*550|450[\s\S]*550[\s\S]*500/i],
      ["10 percent tolerance", /10\s*%|ten\s+percent/i],
      ["references excluded from final project", /exclud(?:e[sd]?|ing)\s+(?:the\s+)?references|references\s+(?:are\s+)?(?:excluded|don'?t\s+count)/i],
      ["does not invent essay reference policy", /(?:essay|reflective)[\s\S]{0,250}(?:not\s+(?:specified|stated|explicit|clear)|doesn'?t\s+(?:specify|say|state)|unclear|check\s+(?:with|canvas)|ask\s+prof)|(?:not\s+specified|unclear)[\s\S]{0,90}(?:essay|reflective)/i],
    ],
  },
  frameworks: {
    question: "Compare TAM and UTAUT. Name their core constructs and distinguish the additions in UTAUT2.",
    checks: [
      ["TAM constructs", /perceived\s+usefulness[\s\S]*perceived\s+ease\s+of\s+use/i],
      ["UTAUT core constructs", /performance\s+expectancy[\s\S]*effort\s+expectancy[\s\S]*social\s+influence[\s\S]*facilitating\s+conditions/i],
      ["UTAUT2 additions", /hedonic\s+motivation[\s\S]*price\s+value[\s\S]*habit/i],
    ],
    forbidden: [
      ["unsupported claim of identical moderators across versions", /\b(?:keeps?|retains?|shares?|uses?|has|includes?)\s+(?:the\s+)?same\s+moderators\b/i],
      ["unsupported UTAUT2 voluntariness moderator", /UTAUT2[^.!?\n]{0,120}(?:moderators?\s*(?:are|include|:)|moderated\s+by)[^.!?\n]{0,120}voluntariness/i],
    ],
  },
};

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const name = process.argv[3];
if (!name) {
  console.log(`Available live grounding cases: ${Object.keys(cases).join(", ")}`);
  process.exit(0);
}
const test = cases[name];
if (!test) throw new Error(`Unknown case: ${name}`);

const result = await askChat({ base, question: test.question, profile: { name: "", major: "", year: "" } });
console.log(`${name} [${result.elapsed}ms, cache ${result.cache}]\n${result.text}\n`);
let failed = 0;
for (const [label, pattern] of test.checks) {
  const ok = pattern.test(result.text);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed += 1;
}
for (const [label, pattern] of test.forbidden ?? []) {
  const ok = !pattern.test(result.text);
  console.log(`${ok ? "PASS" : "FAIL"} avoids ${label}`);
  if (!ok) failed += 1;
}
console.log(`${result.sources.length} source cards returned`);
process.exitCode = failed ? 1 : 0;
