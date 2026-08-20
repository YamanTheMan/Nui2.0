/**
 * Sanity check for retrieval + intent routing.
 * Run with: npx tsx scripts/test/retrieval.mts
 */

import { classifyIntent, retrieveContext } from "../../lib/chat/prompt.ts";
import { chunkCount } from "../../lib/retrieval/index.ts";

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
];

console.log(`Index: ${chunkCount()} chunks\n`);

let failures = 0;

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

console.log(`\n${CASES.length - failures}/${CASES.length} passed`);
process.exit(failures > 0 ? 1 : 0);
