/**
 * Sanity check for retrieval + intent routing.
 * Run with: npx tsx scripts/test/retrieval.mts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildGenerationPlan, classifyIntent, retrieveContext, retrievalQueryForTurns } from "../../lib/chat/prompt.ts";
import { getFactsForQuery, FINAL_PROJECT } from "../../lib/chat/course-facts.ts";
import { chunkCount, search, tokenize } from "../../lib/retrieval/index.ts";
import { EMPTY_PROFILE } from "../../lib/student/profile.ts";
import { chunkText } from "../content/build-index.mjs";

const CASES: Array<{ query: string; expectIntent?: string; mustContain?: string[] }> = [
  {
    query: "What country should I choose for Assignment 1?",
    expectIntent: "retrieve",
    mustContain: ["other than Qatar"],
  },
  {
    query: "what is the late policy",
    expectIntent: "retrieve",
    mustContain: ["72 hours", "dance"],
  },
  {
    query: "how do I get an A",
    expectIntent: "retrieve",
    mustContain: ["wow"],
  },
  {
    query: "what is the grade distribution",
    expectIntent: "retrieve",
    mustContain: ["40%", "10%"],
  },
  {
    query: "explain assignment 2",
    expectIntent: "retrieve",
    mustContain: ["virtual influencer"],
  },
  {
    query: "how many words is the final project",
    expectIntent: "retrieve",
    mustContain: ["3,000", "2,700"],
  },
  {
    query: "what happens if I miss class",
    expectIntent: "retrieve",
    mustContain: ["absence"],
  },
  { query: "why did Renren fail", expectIntent: "retrieve", mustContain: ["Renren"] },
  { query: "explain Hofstede uncertainty avoidance", expectIntent: "retrieve", mustContain: ["uncertainty avoidance"] },
  { query: "what is the IS strategy triangle", expectIntent: "retrieve", mustContain: ["Strategy Triangle"] },
  { query: "hi", expectIntent: "social" },
  { query: "how's the weather today", expectIntent: "offtopic_humor" },
  { query: "can you change my grade", expectIntent: "grade_change" },
  { query: "what is the capital of France", expectIntent: "offtopic_redirect" },

  // Emotional state has to win over the course words in the same sentence.
  { query: "I'm so stressed I think I'm going to fail this class", expectIntent: "distress" },
  { query: "I got an A on assignment 1!!", expectIntent: "celebration" },
  { query: "I'm sorry, I missed the deadline for assignment 2", expectIntent: "apology" },
  { query: "can you just write my final project for me", expectIntent: "integrity" },
  { query: "you're useless, this is stupid", expectIntent: "disrespect" },

  // A formal appeal is a real process, not begging, and must reach the professor.
  { query: "I want to appeal my grade on assignment 1", expectIntent: "escalate" },

  // Identity questions survive a hedging adverb, without swallowing course
  // questions that happen to open the same way.
  { query: "wait are you actually an AI or a real person?", expectIntent: "about_assistant" },
  { query: "am i talking to a bot", expectIntent: "about_assistant" },
  { query: "do you have feelings", expectIntent: "about_assistant" },
  { query: "are you able to explain the AI adoption framework", expectIntent: "retrieve" },
  { query: "TAM", expectIntent: "retrieve", mustContain: ["Perceived Usefulness", "Perceived Ease of Use"] },
  { query: "UTAUT2", expectIntent: "retrieve", mustContain: ["hedonic motivation", "price value", "habit"] },
  { query: "How can I get a better grade?", expectIntent: "retrieve" },
  { query: "How do I raise my grade through my next assignment?", expectIntent: "retrieve" },
  { query: "Please professor, explain TAM", expectIntent: "retrieve" },
  { query: "Could you regrade my assignment?", expectIntent: "escalate" },
  { query: "Can you give me a higher grade?", expectIntent: "grade_change" },
  { query: "How is AI used in processing information?", expectIntent: "retrieve" },
  { query: "Explain Netflix's business strategy", expectIntent: "retrieve" },
  { query: "What model should I use for virtual influencers?", expectIntent: "retrieve" },
  { query: "What is plagiarism?", expectIntent: "retrieve", mustContain: ["ACADEMIC INTEGRITY"] },
  { query: "What is the word count and referencing style for the final project?", expectIntent: "retrieve", mustContain: ["excluding references", "Harvard referencing style", "2,700", "3,300"] },
  { query: "What country should I choose for the final project?", expectIntent: "retrieve", mustContain: ["Qatari banking", "INDIVIDUAL"] },
  { query: "Compare TAM and UTAUT", expectIntent: "retrieve", mustContain: ["Perceived Ease of Use", "Performance Expectancy", "Facilitating Conditions"] },
  { query: "Compare Hall and Schwartz", expectIntent: "retrieve", mustContain: ["High-context", "Self-Direction", "Universalism"] },
  { query: "How does Zara use information resources?", expectIntent: "retrieve", mustContain: ["15 days", "POS system"] },
  { query: "Explain the managerial levers framework", expectIntent: "retrieve", mustContain: ["Organizational Variables", "Control Variables", "Cultural Variables"] },
  { query: "Explain matrix and networked organizational structures", expectIntent: "retrieve", mustContain: ["two or more supervisors", "decentralized decision rights"] },
  { query: "What are Kotter's eight steps?", expectIntent: "retrieve", mustContain: ["Create urgency", "Anchor the changes"] },
  { query: "What are the challenges of virtual teams?", expectIntent: "retrieve", mustContain: ["Team diversity", "time zones"] },
  { query: "Compare chargeback, allocation and corporate budget", expectIntent: "retrieve", mustContain: ["actual usage", "free-rider problem", "corporate bottom line"] },
  { query: "What does TCO include?", expectIntent: "retrieve", mustContain: ["Training costs", "System retirement costs", "Informal support costs"] },
  { query: "What are the balanced scorecard perspectives?", expectIntent: "retrieve", mustContain: ["Customer", "Internal Business", "Innovation and Learning", "Financial"] },
  { query: "Explain Guanxi and ERP adoption", expectIntent: "retrieve", mustContain: ["Renqing", "Ganqing", "Mianzi"] },
  { query: "Why do people follow virtual influencers?", expectIntent: "retrieve", mustContain: ["Social influence", "Hedonic motivation"] },
  // Fall 2026 syllabus and Canvas pages (D14).
  { query: "When is the final project due?", expectIntent: "retrieve", mustContain: ["November 23, 2026", "11:59 p.m."] },
  { query: "When is the reflective essay due?", expectIntent: "retrieve", mustContain: ["November 30, 2026"] },
  { query: "What is the deadline for Assignment 2?", expectIntent: "retrieve", mustContain: ["October 29, 2026"] },
  { query: "What are all the deadlines this semester?", expectIntent: "retrieve", mustContain: ["October 1, 2026", "October 29, 2026", "November 23, 2026", "November 30, 2026"] },
  { query: "When are the TA office hours?", expectIntent: "retrieve", mustContain: ["Mazeeda Alihassan", "1:15 p.m.", "room 3199"] },
  { query: "Who are the course assistants and when can I see them?", expectIntent: "retrieve", mustContain: ["Deema Al-Khalifa", "Laiba Sameer"] },
  { query: "What time is class?", expectIntent: "retrieve", mustContain: ["14:30–15:45", "16:00–17:15"] },
  { query: "How does the peer evaluation work?", expectIntent: "retrieve", mustContain: ["Workload", "Receiving feedback"] },
  { query: "متى موعد تسليم المشروع النهائي؟", expectIntent: "retrieve", mustContain: ["November 23, 2026"] },
  { query: "ما هي ساعات المكتب للمساعد؟", expectIntent: "retrieve", mustContain: ["Mazeeda Alihassan"] },
  { query: "مرحبا", expectIntent: "social" },
  { query: "أريد أن أفهم الفرق بين النظريتين", expectIntent: "retrieve" },
  // Fall 2026 cases, guest talks and example presentations (D15, D16).
  { query: "What is the TOE framework?", expectIntent: "retrieve", mustContain: ["Tornatzky and Fleischer (1990)"] },
  { query: "Explain the Lewis model", expectIntent: "retrieve", mustContain: ["Multi-active"] },
  { query: "Who won AGT 2026, the robots or the human?", mustContain: ["Nene Royal"] },
  { query: "How does iX Consulting automate proposals?", mustContain: ["advocate agent"] },
  { query: "What did Jamil from Accenture talk about?", mustContain: ["user acceptance testing"] },
  { query: "How is the bathroom different from doing the ninja?", expectIntent: "retrieve", mustContain: ["Coffee Bean", "Talabat", "0.5", "bathroom is fine"] },
  { query: "What happens if I submit 25 hours late?", expectIntent: "retrieve", mustContain: ["40% penalty", "72 hours", "K-Pop"] },
  { query: "Which textbook do we use?", expectIntent: "retrieve", mustContain: ["7th Edition"] },
  { query: "What is covered in week 6?", expectIntent: "retrieve", mustContain: ["Week 6: Work Design"] },
  { query: "What explains the visual appeal of virtual influencers?", expectIntent: "retrieve" },
  { query: "I got an A! Can you explain UTAUT now?", expectIntent: "retrieve" },
  { query: "When are the Assignment 1 group presentations?", expectIntent: "retrieve", mustContain: ["September 28", "September 30, 2026", "September 16–27", "7 minutes plus Q&A"] },
  { query: "How many peer-reviewed articles do we need for Assignment 1?", expectIntent: "retrieve", mustContain: ["at least 10 peer-reviewed articles", "same theory", "same selected country", "Technologies may vary"] },
  { query: "Can I change my country or theory for Assignment 1?", expectIntent: "retrieve", mustContain: ["country change is allowed", "assigned theory is fixed", "home country", "excludes Qatar"] },
  { query: "How many teams are there for Assignment 1?", expectIntent: "retrieve", mustContain: ["five teams", "three teams of three", "two teams of four", "September 16 class"] },
  { query: "Where can I find the sample papers for Assignment 1?", expectIntent: "retrieve", mustContain: ["will be released on Canvas", "not confirmation that they are already available", "does not guarantee their quality"] },
  { query: "How do I research Assignment 1 using original theory sources?", expectIntent: "retrieve", mustContain: ["original publication", "university library and AIS", "not cosmetic"] },
  { query: "When are the AI clone office hours and how long can I use it?", expectIntent: "retrieve", mustContain: ["Tuesdays", "11:45am–12:05pm", "IX Lab", "5 minutes maximum", "Canvas under", "does not grade"] },
  { query: "What feedback form is shared after AI clone sessions?", expectIntent: "retrieve", mustContain: ["will be shared after each session", "do not supply a feedback-form URL"] },
  { query: "What are the IX Lab office hours?", expectIntent: "retrieve", mustContain: ["AI-clone office hours", "Tuesdays", "11:45am–12:05pm", "5 minutes maximum"] },
];

console.log(`Index: ${chunkCount()} chunks\n`);

let failures = 0;
let invariantCount = 0;

for (const testCase of CASES) {
  const intent = classifyIntent(testCase.query);
  const intentOk = !testCase.expectIntent || intent === testCase.expectIntent;

  let contentOk = true;
  const missing: string[] = [];
  if (testCase.mustContain) {
    const { context } = retrieveContext(testCase.query);
    const haystack = context.toLowerCase();
    for (const needle of testCase.mustContain) {
      if (!haystack.includes(needle.toLowerCase())) {
        contentOk = false;
        missing.push(needle);
      }
    }
  }

  const ok = intentOk && contentOk;
  if (!ok) failures += 1;

  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${testCase.query}`);
  if (!intentOk) console.log(`      intent: got "${intent}", expected "${testCase.expectIntent}"`);
  if (!contentOk) console.log(`      missing from context: ${missing.join(", ")}`);
}

const invariant = (label: string, check: () => void) => {
  invariantCount += 1;
  try {
    check();
    console.log(`PASS  ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

invariant("unknown words cannot create perfect retrieval confidence", () => {
  assert.deepEqual(search("blorptastic zyxwvut"), []);
  assert.ok((search("course blorptastic quantum entanglement")[0]?.score ?? 0) < 0.55);
  assert.ok((search("chargeback")[0]?.score ?? 0) > 0.9);
});

invariant("ordinary plurals preserve their stems", () => {
  assert.deepEqual(tokenize("sources source policies policy strategies strategy costs cost business"),
    ["source", "source", "policy", "policy", "strategy", "strategy", "cost", "cost", "business"]);
});

invariant("assignment facts are focused and preserve course-specific exceptions", () => {
  const a1 = getFactsForQuery("What are the deliverables for Assignment 1?");
  assert.ok(a1.includes("other than Qatar"));
  assert.ok(!a1.includes("FINAL PROJECT"));
  assert.ok(!a1.includes("ASSIGNMENT 2:"));
  const countryPlan = buildGenerationPlan([{ role: "user", content: "Can I choose Oman for Assignment 1?" }], EMPTY_PROFILE);
  assert.ok(countryPlan.system.includes("other than Qatar AND other than the student"));
  assert.ok(countryPlan.system.includes("home country"));
  assert.ok(countryPlan.system.includes("this is NOT a ban on other Gulf countries"));
  assert.ok(countryPlan.system.includes("Never turn this into a blanket Gulf/GCC ban"));
  const final = getFactsForQuery("What country should I choose for the final project?");
  assert.ok(final.includes("Qatari banking"));
  assert.ok(!final.includes("Qatar is NOT allowed"));
  assert.ok(FINAL_PROJECT.includes("Methodology:"));
  assert.ok(FINAL_PROJECT.includes("excluding references"));
  const comparison = getFactsForQuery("Compare assignments 1 and 2");
  assert.ok(comparison.includes("ASSIGNMENT 1:"));
  assert.ok(comparison.includes("ASSIGNMENT 2:"));
  const all = getFactsForQuery("List all assignment requirements");
  for (const title of ["ASSIGNMENT 1:", "ASSIGNMENT 2:", "FINAL PROJECT", "SELF-REFLECTIVE ESSAY"]) {
    assert.ok(all.includes(title), `All assignments request omitted ${title}`);
  }
});

invariant("simple policies exclude irrelevant framework evidence", () => {
  const grades = retrieveContext("what is the grade distribution");
  assert.equal(grades.sources.length, 1);
  assert.equal(grades.sources[0].section, "ASSESSMENTS AND GRADING");
  assert.ok(!grades.context.includes("HOFSTEDE"));
  assert.ok(!grades.context.includes("ASSIGNMENT 1:"));
  const late = retrieveContext("what is the late policy");
  assert.ok(late.sources.length <= 2);
  assert.ok(late.context.includes("before the deadline"));
  assert.ok(late.context.includes("K-Pop"));
});

invariant("context trimming preserves every part of a broad policy question", () => {
  const result = retrieveContext("Compare Assignment 1, Assignment 2, the final project and self-reflective essay. Include grades, attendance and late policy.");
  for (const section of ["ASSIGNMENT 1:", "ASSIGNMENT 2:", "FINAL PROJECT", "SELF-REFLECTIVE ESSAY", "ASSESSMENTS AND GRADING", "ATTENDANCE POLICY", "LATE PENALTY"]) {
    assert.ok(result.sources.some((source) => source.section.startsWith(section)), `Missing ${section}`);
  }
  assert.ok(result.context.includes("Harvard referencing style"));
  assert.ok(result.context.includes("450 to 550"));
});

invariant("the dated Assignment 1 update precedes older requirements without erasing their scope", () => {
  const result = retrieveContext("How many articles and case studies are required for Assignment 1?");
  assert.equal(result.sources[0].source, "D13_2026_09_16_class_update.txt");
  assert.ok(result.sources[0].text.includes("Effective date: September 16, 2026"));
  assert.ok(result.context.includes("minimum of 10 peer-reviewed articles"));
  assert.ok(result.context.includes("can coexist as a distinct case-study requirement"));
  assert.ok(result.context.includes("do not satisfy the newer 10-article research minimum"));
  assert.ok(result.sources.some((source) => source.source === "D02_assignments.txt"));
});

invariant("Assignment 1 dates and article counts never become another assignment's facts", () => {
  for (const query of ["What is the deadline for Assignment 2?", "How many scholarly articles does Assignment 2 require?", "When is the final project due?", "When is the self-reflective essay due?"]) {
    const result = retrieveContext(query);
    assert.ok(!result.sources.some((source) => source.source === "D13_2026_09_16_class_update.txt"), `Wrong dated update attached to ${query}`);
    assert.ok(!result.context.includes("September 28"));
  }
  // Each brief now carries its own Fall 2026 dates; the all-assignments table stays out.
  const a2 = retrieveContext("What is the deadline for Assignment 2?");
  assert.ok(a2.context.includes("October 29, 2026"));
  assert.ok(!a2.sources.some((source) => source.section.startsWith("DUE DATES")));
  assert.ok(getFactsForQuery("How many articles for Assignment 2?").includes("three peer-reviewed journal articles"));
});

invariant("announced resources do not imply current availability", () => {
  const assignment = getFactsForQuery("Where are the sample papers for Assignment 1?");
  assert.ok(assignment.includes("will be released on Canvas"));
  assert.ok(assignment.includes("not confirmation that they are already available"));
  const clone = getFactsForQuery("How do I access AI clone office hours and its feedback form?");
  assert.ok(clone.includes('Canvas under "Office Hours"'));
  assert.ok(clone.includes("A feedback form will be shared after each session"));
  assert.ok(clone.includes("not specify a booking method"));
});

invariant("removed lab opportunities stay out of the course update and retrieval while office hours remain", () => {
  const document = readFileSync(new URL("../../../documents/D13_2026_09_16_class_update.txt", import.meta.url), "utf8");
  assert.ok(!/optional lab opportunities|OPTIONAL IX LAB OPPORTUNITIES|hologram|computer vision|Pittsburgh/i.test(document));
  assert.equal(getFactsForQuery("holograms, computer vision and Pittsburgh opportunities"), "");
  const retrieval = retrieveContext("What optional hologram and computer vision opportunities are in the IX Lab?");
  assert.ok(!/OPTIONAL IX LAB OPPORTUNITIES|hologram|computer vision|Pittsburgh/i.test(retrieval.context));
  const officeHours = getFactsForQuery("What are the IX Lab office hours?");
  assert.ok(officeHours.includes("Tuesdays, 11:45am–12:05pm"));
  assert.ok(officeHours.includes("5 minutes maximum"));
  assert.ok(officeHours.includes('Canvas under "Office Hours"'));
});

invariant("word-count comparisons distinguish a stated exclusion from an unspecified scope", () => {
  const plan = buildGenerationPlan([{ role: "user", content: "Compare the final project and self-reflective essay word counts and tolerance. Does each count include references?" }], EMPTY_PROFILE);
  const final = plan.sources.find((source) => source.source === "D02_assignments.txt" && source.section.startsWith("FINAL PROJECT"));
  const essay = plan.sources.find((source) => source.source === "D02_assignments.txt" && source.section.startsWith("SELF-REFLECTIVE ESSAY"));
  assert.ok(final?.text.includes("excluding references"));
  assert.ok(essay && !/references|bibliography/i.test(essay.text));
  assert.ok(plan.system.includes("Final project — explicit source statement:"));
  assert.ok(plan.system.includes("Self-reflective essay — the supplied brief does NOT specify whether references count"));
  assert.ok(plan.system.includes("An omission is not an exclusion"));
  assert.ok(plan.system.includes("Silence in one brief does not adopt a rule from another brief"));
});

invariant("follow-up retrieves the actual previous assignment, without shared cache", () => {
  const turns = [
    { role: "user" as const, content: "Explain the final project" },
    { role: "assistant" as const, content: "The project is individual." },
    { role: "user" as const, content: "What about its word count and references?" },
  ];
  const plan = buildGenerationPlan(turns, EMPTY_PROFILE);
  assert.equal(plan.cacheable, false);
  assert.equal(plan.intent, "retrieve");
  assert.ok(plan.sources.some((source) => source.section.startsWith("FINAL PROJECT") && source.text.includes("Harvard")));
  assert.ok(plan.system.includes("This is a follow-up"));
  assert.ok(!retrievalQueryForTurns(turns).includes("The project is individual."));
});

invariant("a comparison follow-up retains both named frameworks", () => {
  const turns = [
    { role: "user" as const, content: "Explain TAM" },
    { role: "user" as const, content: "How is it different from UTAUT?" },
  ];
  const result = retrieveContext(retrievalQueryForTurns(turns));
  assert.ok(result.context.includes("Perceived Ease of Use"));
  assert.ok(result.context.includes("Performance Expectancy"));
  const versionPlan = buildGenerationPlan([{ role: "user", content: "Compare UTAUT and UTAUT2, including their moderators." }], EMPTY_PROFILE);
  assert.ok(versionPlan.system.includes("The supplied notes do NOT specify UTAUT2's moderators"));
  assert.ok(versionPlan.system.includes("Never claim UTAUT2 keeps the same moderators or inherits voluntariness of use"));
});

invariant("an acknowledgement stays conversational after a course question", () => {
  const plan = buildGenerationPlan([
    { role: "user", content: "Explain assignment 1" },
    { role: "user", content: "Okay!" },
  ], EMPTY_PROFILE);
  assert.equal(plan.intent, "social");
  assert.deepEqual(plan.sources, []);
});

invariant("the second assignment follow-up switches to Assignment 2", () => {
  const query = retrievalQueryForTurns([
    { role: "user", content: "Explain assignment 1" },
    { role: "user", content: "What about the second one?" },
  ]);
  assert.ok(query.includes("Assignment 2"));
  assert.ok(!query.toLowerCase().includes("assignment 1"));
});

invariant("empty evidence and missing dates trigger honest grounding rules", () => {
  const plan = buildGenerationPlan([{ role: "user", content: "Explain blorptastic zyxwvut" }], EMPTY_PROFILE);
  assert.equal(plan.sources.length, 0);
  assert.ok(plan.system.includes("Lexical overlap with the question is limited"));
  assert.ok(plan.system.includes("only when the evidence explicitly supplies them"));
  assert.ok(!plan.system.includes('opening with "According to'));
  assert.ok(!plan.system.includes('> "[one short specific quote]"'));
});

invariant("an Arabic question is classified and searched through its English translation", () => {
  const arabic = "ما الفرق بين نموذج قبول التكنولوجيا والنظرية الموحدة؟";
  const plan = buildGenerationPlan([{ role: "user", content: arabic }], EMPTY_PROFILE, "What is the difference between TAM and UTAUT?");
  assert.equal(plan.intent, "retrieve");
  assert.equal(plan.query, arabic);
  assert.ok(plan.sources.some((source) => source.source === "D11_it_adoption_theories_scholarly.txt"));
  assert.ok(!plan.system.includes("This is a follow-up."));
  assert.ok(plan.system.includes("Reply in the language the student writes in"));
});

invariant("legitimate grade questions and appeals do not advance the begging ladder", () => {
  const plan = buildGenerationPlan([
    { role: "user", content: "How can I get a better grade?" },
    { role: "user", content: "I want to appeal my grade" },
    { role: "user", content: "Could you regrade my assignment?" },
    { role: "user", content: "Can you change my grade?" },
  ], EMPTY_PROFILE);
  assert.equal(plan.endsSession, false);
  assert.ok(plan.system.includes("first time"));
});

invariant("every generated source has a real document and section, with no authoring placeholders", () => {
  const index = JSON.parse(readFileSync(new URL("../../lib/retrieval/course-index.json", import.meta.url), "utf8"));
  assert.equal(index.documentCount, 16);
  assert.equal(index.contentHash, createHash("sha256").update(JSON.stringify(index.chunks)).digest("hex"));
  const rebuilt = [];
  const sourceNames = [...new Set<string>(index.chunks.map((chunk: { source: string }) => chunk.source))];
  for (const source of sourceNames) {
    const document = readFileSync(new URL(`../../../documents/${source}`, import.meta.url), "utf8");
    rebuilt.push(...chunkText(document, source));
  }
  assert.deepEqual(index.chunks, rebuilt, "The committed index is stale; run npm run index.");
  for (const chunk of index.chunks) {
    assert.ok(chunk.title && chunk.section);
    assert.ok(chunk.text.startsWith(chunk.section));
    assert.ok(!chunk.text.includes("ADD SCHOLARLY PDF SUMMARIES HERE"));
    assert.ok(!chunk.text.includes("ADD NEW JOURNAL SUMMARIES HERE"));
    assert.ok(!chunk.text.includes("EXACT SCRIPT"));
  }
});

console.log(`\n${CASES.length} routing/content cases + ${invariantCount} grounding/index regressions; ${failures} failures`);
process.exit(failures > 0 ? 1 : 0);
