#!/usr/bin/env node
/**
 * Checks that the answers students rely on are factually right.
 *
 * Tone is covered by test-scenarios.mjs. This suite only asserts the facts that
 * must appear, so it stays green while the wording is free to vary.
 *
 * Usage: node scripts/smoke-chat.mjs [baseUrl]
 */

import { askChat, createReporter, roboticTell } from "../lib/chat-client.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PROFILE = { name: "Yaman Hemmoudeh", major: "Information Systems", year: "Junior" };

const CASES = [
  {
    label: "greeting stays human",
    q: "hi",
    must: [[/./, "answers at all"]],
    mustNot: [[/don'?t have|no (specific )?information/i, "claims missing information"]],
  },
  {
    label: "late policy + dance rule",
    q: "what is the late policy",
    must: [
      [/danc/i, "the dance rule"],
      [/72/, "the 72-hour window"],
      [/20\s*%/, "the 20% deduction"],
    ],
  },
  {
    label: "Assignment 1 country rule",
    q: "What country should I choose for Assignment 1?",
    must: [[/qatar/i, "the Qatar exclusion"]],
  },
  {
    label: "wow factor",
    q: "how do I get an A",
    must: [[/wow/i, "the wow factor"]],
  },
  {
    label: "grade distribution",
    q: "what is the grade distribution",
    must: [
      [/40\s*%/, "the 40% weights"],
      [/10\s*%/, "the 10% weights"],
    ],
  },
  {
    label: "word count tolerance",
    q: "how many words should the self reflective essay be",
    must: [[/10\s*%|450|550/, "the 10% tolerance"]],
  },
  {
    label: "off-topic humor",
    q: "how is the weather today",
    must: [[/digital transformation|class|course/i, "a route back to the course"]],
    mustNot: [[/\b(laughs?|chuckles?)\b/i, "narrated laughter"]],
  },
  {
    label: "grade change is refused",
    q: "can you change my grade",
    must: [[/can'?t|cannot|not something i|won'?t|no\b/i, "a clear refusal"]],
    mustNot: [[/email|savanid@/i, "an email hand-off on the first refusal"]],
  },
];

const { check, summary } = createReporter();

for (const testCase of CASES) {
  let answer;
  try {
    const result = await askChat({ base: BASE, question: testCase.q, profile: PROFILE });
    answer = result.text;
    console.log(`\n${testCase.label}  [${result.elapsed}ms]`);
    console.log(`  Q: ${testCase.q}`);
    console.log(`  A: ${answer.replace(/\n+/g, " ").slice(0, 200)}`);
  } catch (error) {
    console.log(`\n${testCase.label}`);
    check("request succeeds", false, error.message);
    continue;
  }

  for (const [pattern, what] of testCase.must ?? []) {
    check(`includes ${what}`, pattern.test(answer));
  }
  for (const [pattern, what] of testCase.mustNot ?? []) {
    check(`avoids ${what}`, !pattern.test(answer));
  }
  const tell = roboticTell(answer);
  check(tell ? `sounds human (${tell})` : "sounds human", tell === null);
}

process.exit(summary() > 0 ? 1 : 0);
