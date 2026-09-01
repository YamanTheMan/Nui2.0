#!/usr/bin/env node
/**
 * Pre-asks the questions students ask most, so the first real visitor gets a
 * cached answer instead of paying the cold model latency.
 *
 * Run after a deploy or after `npm run sync`:
 *   node scripts/warm-cache.mjs https://askprofnui.vercel.app
 */

import { authCookie } from "../lib/chat-client.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";

const QUESTIONS = [
  // Policies
  "what is the late policy",
  "how can I remove my late penalties",
  "what is the attendance policy",
  "what happens if I am late to class",
  "what is the word count policy",
  "what is the dance policy",
  "how do I remove my absences",
  "what is doing the ninja",
  "how is participation recorded each class",
  "can I go to the bathroom during class",
  // Grades
  "what is the grade distribution",
  "how is the course graded",
  "how do I get an A",
  "what is the wow factor",
  "how is class participation graded",
  // Assignments
  "explain assignment 1",
  "what country should I choose for assignment 1",
  "explain assignment 2",
  "what is the technology adoption framework assignment",
  "what is the final project",
  "what should I include in the final project",
  "what is the self reflective essay",
  // Course concepts
  "what is digital transformation",
  "explain the IS strategy triangle",
  "what are the learning objectives of this course",
];

async function warm(question) {
  const started = Date.now();
  const cookie = await authCookie(BASE);
  const response = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: question }] }],
      profile: { name: "", major: "", year: "" },
    }),
  });

  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

  const cache = response.headers.get("x-answer-cache");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chars = 0;
  let degraded = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const part = JSON.parse(payload);
        if (part.type === "text-delta") chars += part.delta.length;
        if (part.type === "data-model" && part.data.degraded) degraded = true;
      } catch {
        // partial frame, ignore
      }
    }
  }

  return { cache, chars, degraded, total: Date.now() - started };
}

console.log(`\nWarming ${QUESTIONS.length} questions on ${BASE}\n`);

let warmed = 0;
let alreadyCached = 0;
let bypassed = 0;
let fellBack = 0;
let empty = 0;

for (const question of QUESTIONS) {
  const { cache, chars, degraded, total } = await warm(question);

  if (cache === "hit") alreadyCached += 1;
  else if (cache === "miss") warmed += 1;
  else bypassed += 1;
  if (degraded) fellBack += 1;
  if (!chars) empty += 1;

  const label = question.length > 46 ? `${question.slice(0, 43)}...` : question.padEnd(46);
  const flags = [cache, degraded ? "fallback, short TTL" : null].filter(Boolean).join(", ");
  console.log(`  ${label}  ${String(total).padStart(6)}ms  ${chars ? "" : "EMPTY " }${flags}`);
}

console.log(
  `\nDone. ${warmed} newly cached, ${alreadyCached} already cached, ` +
    `${bypassed} not cacheable by design.`,
);

if (empty > 0) console.log(`WARNING: ${empty} question(s) returned no answer.`);

if (fellBack > 0) {
  console.log(
    `${fellBack} answer(s) came from the smaller model because Groq was slow, and are\n` +
      `cached for 30 minutes only. Re-run this later to try replacing them.`,
  );
}
console.log();
