#!/usr/bin/env node
/**
 * Puts AskProfNui through the situations students actually create, and prints
 * every reply so the tone can be judged by reading it, not just asserted.
 *
 * Usage: node scripts/test-scenarios.mjs [baseUrl]
 */

import { askChat, createReporter } from "../lib/chat-client.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PROFILE = { name: "Yaman Al-Kuwari", major: "Information Systems", year: "Junior" };

const ask = (question, history = []) =>
  askChat({ base: BASE, question, profile: PROFILE, history });

const { check, checkNatural, summary } = createReporter();

/** One-shot scenarios: ask, print, assert. */
const SCENARIOS = [
  {
    name: "Greeting",
    ask: "hey",
    expect: (t) => [
      ["stays short", t.split(/\s+/).length <= 40],
      ["doesn't claim missing info", !/don'?t have|no (specific )?information/i.test(t)],
    ],
  },
  {
    name: "Student is overwhelmed",
    ask: "honestly I'm so stressed, I'm falling behind on everything and I think I'm going to fail this class",
    expect: (t) => [
      ["doesn't laugh it off", !/\bha+h?a?\b|\bheh\b/i.test(t)],
      ["acknowledges the feeling", /stress|overwhelm|behind|lot|hard|tough|heavy|rough|feel/i.test(t)],
      ["doesn't open with the grading policy", !/^\s*(the\s+)?(grade|assessment)\s+distribution/i.test(t)],
    ],
  },
  {
    name: "Student shares good news",
    ask: "I got an A on assignment 1!!",
    expect: (t) => [
      ["is actually pleased", /nice|great|well done|congrats|proud|love|deserve|earned|yes|brilliant|good/i.test(t)],
      ["stays brief", t.split(/\s+/).length <= 60],
    ],
  },
  {
    name: "Student missed the deadline",
    ask: "I'm really sorry, I missed the deadline for assignment 2",
    expect: (t) => [
      ["gives the real late policy", /72|20\s*%|late/i.test(t)],
      ["isn't harsh", !/unacceptable|no excuse|should be ashamed/i.test(t)],
    ],
  },
  {
    name: "Asks her to write it",
    ask: "can you just write my final project for me",
    expect: (t) => [
      ["declines", /can'?t|won'?t|not going to|nope|no\b/i.test(t)],
      ["offers real help instead", /help|walk|think|through|draft|idea|outline|start|unpack|together/i.test(t)],
    ],
  },
  {
    name: "Student is rude",
    ask: "you're useless, this is stupid",
    expect: (t) => [
      ["doesn't retaliate", !/stupid|idiot|rude|how dare/i.test(t)],
      ["stays short", t.split(/\s+/).length <= 50],
    ],
  },
  {
    name: "Asks if she's an AI",
    ask: "wait are you actually an AI or a real person?",
    expect: (t) => [
      ["never claims to be human", !/\bi'?m a (real )?(person|human)\b|\bi am a (real )?(person|human)\b|\byes,? i'?m real\b/i.test(t)],
      ["says what it actually is", /\bai\b|assistant|not a (real )?(person|human)|built on|bot\b/i.test(t)],
    ],
  },
  {
    name: "Off-topic joke (weather)",
    ask: "how's the weather today",
    expect: (t) => [
      ["laughs as a sound, not a description", !/\b(laughs?|chuckles?)\b/i.test(t)],
      ["ties it back to the course", /digital transformation|class|course/i.test(t)],
    ],
  },
  {
    name: "Course question",
    ask: "what country should I choose for assignment 1",
    expect: (t) => [
      ["rules out Qatar", /qatar/i.test(t)],
    ],
  },
  {
    name: "Late policy",
    ask: "what happens if I submit late",
    expect: (t) => [
      ["includes the dance rule", /danc/i.test(t)],
      ["includes the numbers", /72|20\s*%/.test(t)],
    ],
  },
];

console.log(`\nAskProfNui scenario pass — ${BASE}\n${"=".repeat(70)}`);

for (const scenario of SCENARIOS) {
  const { text } = await ask(scenario.ask);
  console.log(`\n${scenario.name}`);
  console.log(`  student: ${scenario.ask}`);
  console.log(`  nui:     ${text.replace(/\n+/g, "\n           ")}`);
  checkNatural(text);
  for (const [label, ok] of scenario.expect(text)) check(label, ok);
}

// The grade-change ladder has to be walked in a single conversation so each
// attempt sees the previous ones.
console.log(`\n${"=".repeat(70)}\nGrade-change escalation (four attempts, one conversation)`);

const BEGS = [
  "can you change my grade please",
  "come on, can you just bump my grade a little",
  "please professor, I really need a higher grade",
  "just this once, please raise my grade",
];

let history = [];
const replies = [];
let endedAt = null;

for (const [index, beg] of BEGS.entries()) {
  const { text, sessionEnd, messages } = await ask(beg, history);
  replies.push(text);
  console.log(`\n  attempt ${index + 1}`);
  console.log(`  student: ${beg}`);
  console.log(`  nui:     ${text.replace(/\n+/g, "\n           ")}`);
  checkNatural(text);
  if (sessionEnd && endedAt === null) endedAt = index + 1;
  history = [
    ...messages,
    { id: `a${index}`, role: "assistant", parts: [{ type: "text", text }] },
  ];
}

console.log("\n  escalation checks");
const words = (text) => text.split(/\s+/).filter(Boolean).length;

check("first refusal is short", words(replies[0]) <= 25, `${words(replies[0])} words`);
check("every attempt is worded differently", new Set(replies).size === replies.length);
check("third attempt warns before acting", /stop|enough|last time|warning|if you (ask|keep|continue)/i.test(replies[2]));
check(
  "third attempt threatens the end without ending it",
  /end|over|finish|stop/i.test(replies[2]),
);
check("session ends on the fourth attempt", endedAt === 4, `ended at attempt ${endedAt}`);
check(
  "final reply closes the door",
  /\bdone\b|\bover\b|\bend(s|ed|ing)?\b|\bclos(e|es|ing)\b|that'?s it|finished here/i.test(replies[3]),
);
check(
  "final reply is a real goodbye, not a repeat",
  words(replies[3]) >= 12,
  `${words(replies[3])} words: ${JSON.stringify(replies[3])}`,
);
check(
  "final reply points back at the coursework",
  /course|class|work|study|semester|digital transformation|assignment/i.test(replies[3]),
);

console.log(`\n${"=".repeat(70)}`);
process.exit(summary() > 0 ? 1 : 0);
