#!/usr/bin/env node
/**
 * Checks the answer cache: repeated course questions must be fast and reusable,
 * and must never carry one student's name into another student's chat.
 */

import { askChat } from "../lib/chat-client.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";

const YAMAN = { name: "Yaman", major: "Information Systems", year: "Junior" };
const SARA = { name: "Sara Al-Thani", major: "Business Administration", year: "Senior" };

async function ask(question, profile, history = []) {
  // The shared client rejects stream errors and incomplete/unavailable answers.
  // Two identical fallback apologies must never pass as a successful cache hit.
  const result = await askChat({ base: BASE, question, profile, history });
  return { ...result, total: result.elapsed };
}

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

console.log("\nCourse question is cached and shared across students");
const first = await ask("what is the late policy", YAMAN);
const second = await ask("what is the late policy", SARA);

console.log(`  first: ${first.total}ms (${first.cache})   repeat: ${second.total}ms (${second.cache})`);
check("answer mentions the dance rule", /danc/i.test(first.text));
check("repeat answer is identical", first.text === second.text);
check("repeat served from cache", second.cache === "hit");
check("no name leaked to the second student", !/yaman/i.test(second.text), second.text.slice(0, 60));

console.log("\nSecond course question");
const gradesCold = await ask("how is the grade distribution", YAMAN);
const gradesWarm = await ask("how is the grade distribution", SARA);
console.log(`  first: ${gradesCold.total}ms (${gradesCold.cache})   repeat: ${gradesWarm.total}ms (${gradesWarm.cache})`);
check("mentions the 40% final project", /40\s*%/.test(gradesCold.text));
check("repeat answer is identical", gradesCold.text === gradesWarm.text);
check("repeat served from cache", gradesWarm.cache === "hit");

console.log("\nPersonal replies stay personal (never cached)");
const helloA = await ask("hi", YAMAN);
const helloB = await ask("hi", SARA);
check("greetings skip the cache entirely", helloA.cache === "bypass" && helloB.cache === "bypass");
check("Sara's greeting does not mention Yaman", !/yaman/i.test(helloB.text), helloB.text.slice(0, 60));

console.log("\nFollow-up questions are not cached");
const followUp = await ask("what about the second one", YAMAN, [
  { id: "0", role: "user", parts: [{ type: "text", text: "explain assignment 1" }] },
  { id: "0a", role: "assistant", parts: [{ type: "text", text: "Assignment 1 is the cultural framework analysis." }] },
]);
check("follow-up skips the cache", followUp.cache === "bypass", String(followUp.cache));
check("follow-up still answers", followUp.text.length > 0);

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
