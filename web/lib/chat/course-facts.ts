/**
 * Policy facts come directly from the generated document index. Updating a
 * source document and rebuilding the index also updates these facts: there is
 * no second hand-maintained copy of assignment rules to drift out of sync.
 */
import rawIndex from "../retrieval/course-index.json";
import type { Chunk } from "../retrieval";

const chunks = rawIndex.chunks as Chunk[];
const OVERVIEW = "D01_course_overview.txt";
const ASSIGNMENTS = "D02_assignments.txt";
const SEPTEMBER_UPDATE = "D13_2026_09_16_class_update.txt";
const FALL_2026 = "D14_fall_2026_deadlines_and_contacts.txt";
const CASES = "D15_fall_2026_cases_and_guest_talks.txt";

function sections(source: string, prefix: string): Chunk[] {
  return chunks.filter((chunk) => chunk.source === source && chunk.section.startsWith(prefix));
}

function fact(source: string, prefix: string): string {
  return sections(source, prefix).map((chunk) => chunk.text).join("\n\n");
}

export const GRADE_DISTRIBUTION = fact(OVERVIEW, "ASSESSMENTS AND GRADING");
export const WOW_FACTOR = fact("D09_prof_nui_persona.txt", "THE WOW FACTOR");
export const LATE_POLICY = [fact(OVERVIEW, "LATE PENALTY"), fact(ASSIGNMENTS, "IMPORTANT POLICY")].join("\n\n");
export const ASSIGNMENT_1 = [fact(SEPTEMBER_UPDATE, "ASSIGNMENT 1:"), fact(ASSIGNMENTS, "ASSIGNMENT 1:")].filter(Boolean).join("\n\n");
export const ASSIGNMENT_2 = fact(ASSIGNMENTS, "ASSIGNMENT 2:");
export const FINAL_PROJECT = fact(ASSIGNMENTS, "FINAL PROJECT");
export const SELF_REFLECTIVE = fact(ASSIGNMENTS, "SELF-REFLECTIVE ESSAY");
export const CLASS_PARTICIPATION = fact(OVERVIEW, "CLASS PARTICIPATION RUBRIC");
export const ATTENDANCE_POLICY = fact(OVERVIEW, "ATTENDANCE POLICY");
export const WORD_COUNT_POLICY = fact(OVERVIEW, "WORD COUNT POLICY");

const ASSIGNMENT_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:assignment\s*(?:1|one)|first\s+assignment|a1|cultural\s+framework\s+assignment)\b|الواجب\s+الأول|المهمة\s+الأولى/i, "ASSIGNMENT 1:"],
  [/\b(?:assignment\s*(?:2|two)|second\s+assignment|a2|it\s+adoption\s+framework\s+assignment)\b|الواجب\s+الثاني|المهمة\s+الثانية/i, "ASSIGNMENT 2:"],
  [/\bfinal\s+(?:project|report)|3,?000\s*words?|literature\s+review\s+project|المشروع\s+النهائي/i, "FINAL PROJECT"],
  [/self[\s-]?reflect|reflective\s+essay|500[\s-]?word|المقال\s+التأملي|مقال\s+تأملي/i, "SELF-REFLECTIVE ESSAY"],
];

const POLICY_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b(?:grades?|grading|assessments?)\b|\b(?:assignment|project|essay|participation)\b.*\b(?:weight|worth|percent)/i, OVERVIEW, "ASSESSMENTS AND GRADING"],
  [/wow|(?:get|earn|achieve)\s+an?\s+a\b|improv.*(?:grade|mark)/i, "D09_prof_nui_persona.txt", "THE WOW FACTOR"],
  [/\blate\b|penalt|deduct|overdue|deadline|dance|k[\s-]?pop|special\s+consideration/i, OVERVIEW, "LATE PENALTY"],
  [/\blate\b|penalt|deduct|overdue|deadline|special\s+consideration|group.*problem/i, ASSIGNMENTS, "IMPORTANT POLICY"],
  [/participation|attend|absen/i, OVERVIEW, "CLASS PARTICIPATION RUBRIC"],
  [/attend|tardy|tardiness|late\s+to\s+class|ninja|coffee\s+bean|talabat|absen|mazeeda|bathroom|toilet|restroom|leav(?:e|ing)\s+(?:the\s+)?class|miss.*class|participation\s+mark|k[\s-]?pop/i, OVERVIEW, "ATTENDANCE POLICY"],
  [/word\s+count|how\s+many\s+words|10\s*(?:percent|%)|2,?700|3,?300|450|550/i, OVERVIEW, "WORD COUNT POLICY"],
  [/academic\s+integrity|plagiar|cheating|acknowledg|cite.*ai|using\s+ai/i, OVERVIEW, "ACADEMIC INTEGRITY"],
  [/textbook|reading\s+book|course\s+description|flipped\s+class/i, OVERVIEW, "COURSE DESCRIPTION"],
  [/schedule|week\s*\d|syllabus/i, OVERVIEW, "WEEKLY SCHEDULE"],
  [/class\s+(?:hours|time)|when.*class|instructor|professor.*email/i, OVERVIEW, "COURSE OVERVIEW"],
  [/office\s*hours?|ai[ -]?clone|clone\s+(?:session|appointment)|feedback\s+form|tuesdays?|11[:.]45|12[:.]05|\bix\s*lab\b/i, SEPTEMBER_UPDATE, "AI-CLONE OFFICE HOURS:"],
  // Fall 2026 syllabus and Canvas pages. Arabic patterns cover typed Arabic questions,
  // which the English BM25 index cannot match on its own.
  [/deadline|\bdue\b(?!\s+to\b)|when\s+(?:is|are|do|should|must).{0,40}(?:submit|upload|hand|present)|submission\s+date|presentation\s+(?:date|day)|موعد|مواعيد|تسليم|متى/i, FALL_2026, "DUE DATES"],
  [/schedule|week\s*\d|this\s+week|next\s+week|syllabus|الجدول|الأسبوع|المنهج/i, FALL_2026, "FALL 2026 WEEK-BY-WEEK"],
  [/class\s+(?:hours|time)|when.*class|instructor|professor.*(?:email|office|phone)|prof(?:essor)?\s+nui.*(?:office|phone|room|zoom|appointment|meet)|room\s*3192|موعد\s+المحاضرة|المحاضرات|مكتب/i, FALL_2026, "CLASS TIMES"],
  [/office\s*hours?|\bta\b|teaching\s+assistant|course\s+assistants?|\bdeema\b|\blaiba\b|mazeeda.*(?:email|office|room|phone|contact|hours)|consultation|appointment|who\s+(?:can|do|should)\s+i\s+(?:ask|contact|email)|contact|kiosk|ساعات\s+المكتب|المساعد|مساعدة\s+التدريس|للتواصل/i, FALL_2026, "OFFICE HOURS"],
  [/peer\s+(?:evaluation|review|assessment)|team\s*mates?|group\s+(?:work|member|participation)|free[\s-]?rid|تقييم\s+الزملاء/i, FALL_2026, "PEER EVALUATION"],
  [/disabilit|accommodat|wellness|wellbeing|well-being|counsel|mental\s+health|anxiety|depress|stressed|\bcaps(?:-?q)?\b|إعاقة|الصحة\s+النفسية|ضغط/i, FALL_2026, "STUDENT SUPPORT"],
  [/prerequisite|prior\s+knowledge|textbook|grading\s+(?:scale|policy)|letter\s+grade|curve/i, FALL_2026, "SYLLABUS DETAILS"],
  // Fall 2026 case sessions and guest talks.
  // Named cases only: a general influencer question belongs to the scholarly notes in D12.
  [/ai\s+vs\.?\s+human|case\s+session|lil\s+miquela|aitana|xania|velvet\s+sundown|unitree|nene\s+royal|got\s+talent|\bagt\b/i, CASES, "AI VS HUMAN CASE SESSION"],
  [/lil\s+miquela|aitana|xania|velvet\s+sundown|ai\s+(?:music|artists?)/i, CASES, "CASE 3"],
  [/unitree|nene\s+royal|got\s+talent|\bagt\b|robots?\s+(?:vs|versus|dance)/i, CASES, "CASE 2"],
  [/\bix\s+consulting|agentic|rfp|request\s+for\s+proposal|consulting\s+proposal|lilli|jagged/i, CASES, "IX CONSULTING CASE"],
  [/\bjamil\b|accenture|hukoomi|\buat\b|user\s+acceptance\s+testing/i, CASES, "GUEST TALK — JAMIL"],
  [/fragomen|\bwitr\b|immigration\s+trends|myka/i, CASES, "GUEST TALK — FRAGOMEN"],
  // Typed Arabic versions of the core policy questions.
  [/تأخير|متأخر|خصم|عقوبة/i, OVERVIEW, "LATE PENALTY"],
  [/حضور|غياب|الغياب|الرقص|رقصة/i, OVERVIEW, "ATTENDANCE POLICY"],
  [/الدرجات|الدرجة|نسبة|التقييم|العلامات/i, OVERVIEW, "ASSESSMENTS AND GRADING"],
];

export function getFactChunksForQuery(query: string): Chunk[] {
  const matched = new Map<string, Chunk>();
  const add = (source: string, prefix: string) => {
    // Keep the update adjacent to its older brief, and place it first. The
    // older document still supplies unchanged deliverables and rubric weights.
    if (source === ASSIGNMENTS && prefix === "ASSIGNMENT 1:") {
      for (const chunk of sections(SEPTEMBER_UPDATE, "ASSIGNMENT 1:")) {
        matched.set(`${chunk.source}:${chunk.chunkIndex}`, chunk);
      }
    }
    for (const chunk of sections(source, prefix)) {
      matched.set(`${chunk.source}:${chunk.chunkIndex}`, chunk);
    }
  };

  const assignmentQuery = query
    .replace(/\bassignments?\s*(1|one|2|two)\s*(?:and|&|,|vs\.?|versus|\/)\s*(1|one|2|two)\b/gi, "assignment $1 assignment $2")
    .replace(/\bfirst\s+(?:and|&)\s+second\s+assignments?\b/gi, "assignment 1 assignment 2");
  const allAssignments = /\b(?:all|each|every)\s+(?:the\s+)?assignments?\b|\bcompare\b.*\bassignments\b/i.test(query);
  const specificAssignments = ASSIGNMENT_PATTERNS.filter(([pattern]) => pattern.test(assignmentQuery));
  for (const [, prefix] of specificAssignments) add(ASSIGNMENTS, prefix);
  if (allAssignments && specificAssignments.length === 0) {
    for (const [, prefix] of ASSIGNMENT_PATTERNS) add(ASSIGNMENTS, prefix);
  }
  // These distinctive phrases refer to the dated A1 announcement even when
  // the student omits the assignment number. Never infer A1 when another task
  // was explicitly named in the same query.
  if (specificAssignments.length === 0 && /home\s+country|(?:10|ten)\s+peer[ -]reviewed|original\s+theory\s+publication|sample\s+papers?|(?:september|sept?\.?)\s*(?:16|28|30)|(?:change|switch).{0,30}(?:country|theory)|(?:country|theory).{0,30}(?:change|switch)|how\s+(?:many|big|large).{0,15}(?:teams?|groups?)/i.test(query)) {
    add(ASSIGNMENTS, "ASSIGNMENT 1:");
  }
  // A country choice is not automatically Assignment 1: Qatar IS an example
  // context in the final project brief. Only infer A1 when no other task is named.
  if (specificAssignments.length === 0 && /(?:which|what|choose\s+a)\s+country|cultural\s+framework\s+assignment/i.test(query)) {
    add(ASSIGNMENTS, "ASSIGNMENT 1:");
  }
  if (specificAssignments.length === 0 && /virtual\s+influencer.*(?:assignment|five\s+factors)|(?:assignment|five\s+factors).*virtual\s+influencer/i.test(query)) {
    add(ASSIGNMENTS, "ASSIGNMENT 2:");
  }
  if (specificAssignments.length === 0 && !allAssignments && /\bassignments?\b|deliverable|rubric/i.test(query)) {
    // An unnamed assignment needs clarification, not every full rubric.
    add(OVERVIEW, "CULTURAL AND TECHNOLOGY ADOPTION FRAMEWORKS ASSIGNMENTS");
    add(OVERVIEW, "FINAL PROJECT");
    add(OVERVIEW, "SELF-REFLECTIVE ESSAY");
  }
  for (const [pattern, source, prefix] of POLICY_PATTERNS) {
    // A named assignment's brief carries its own dates; the all-assignments
    // table would put other assignments' dates beside it.
    if (source === FALL_2026 && prefix === "DUE DATES" && specificAssignments.length > 0) continue;
    if (pattern.test(query)) add(source, prefix);
  }
  return [...matched.values()];
}

export function getFactsForQuery(query: string): string {
  return getFactChunksForQuery(query).map((chunk) => chunk.text).join("\n\n---\n\n");
}

export function getCoreFactsBlock(): string {
  return [GRADE_DISTRIBUTION, LATE_POLICY].join("\n\n---\n\n");
}
