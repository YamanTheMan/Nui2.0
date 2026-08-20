#!/usr/bin/env node
/**
 * Prints replies across a wide spread of student situations so the tone can be
 * read and judged. This is a listening tool, not a pass/fail suite.
 *
 * Usage: node scripts/probe-tone.mjs [baseUrl]
 */

import { askChat, roboticTell } from "../lib/chat-client.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PROFILE = { name: "Yaman Al-Kuwari", major: "Information Systems", year: "Junior" };

const PROMPTS = [
  ["humor", "how's the weather today"],
  ["humor", "tell me a joke"],
  ["humor", "do you like pizza or shawarma"],
  ["humor", "will you marry me"],
  ["humor", "who's winning the world cup"],
  ["sad", "I'm really struggling, I think I want to drop this class"],
  ["sad", "I studied so hard and still did badly, I feel like I'm not good enough"],
  ["happy", "I got an A on assignment 1!!"],
  ["happy", "I finally submitted my final project, so relieved"],
  ["angry-at-her", "you're useless, this is stupid"],
  ["angry-at-her", "this bot is garbage, you never help"],
  ["identity", "wait are you actually an AI or a real person?"],
  ["identity", "do you have feelings"],
  ["apology", "I'm really sorry, I missed the deadline for assignment 2"],
  ["integrity", "can you just write my final project for me"],
  ["confused", "I don't understand the cultural framework at all, it makes no sense"],
  ["escalate", "I want to appeal my grade on assignment 1"],
  ["offtopic", "what's the capital of France"],
];

console.log(`\nTone probe — ${BASE}\n${"=".repeat(72)}`);

const laughs = [];

for (const [bucket, prompt] of PROMPTS) {
  const { text } = await askChat({ base: BASE, question: prompt, profile: PROFILE });
  const tell = roboticTell(text);
  console.log(`\n[${bucket}] ${prompt}`);
  console.log(`  ${text.replace(/\n+/g, "\n  ")}`);
  if (tell) console.log(`  >> ROBOTIC: ${tell}`);

  const laugh = text.match(/\b(ha+h?a*|heh+|hah)\b/i);
  if (laugh) laughs.push(laugh[0].toLowerCase());
}

console.log(`\n${"=".repeat(72)}`);
console.log(`laughs used: ${laughs.join(", ") || "none"}`);
console.log(`distinct: ${new Set(laughs).size} of ${laughs.length}`);
