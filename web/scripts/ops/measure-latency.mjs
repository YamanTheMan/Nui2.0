#!/usr/bin/env node
/**
 * Measures time-to-first-token, which is what the student actually feels, and
 * reports whether the answer came from the cache and which model produced it.
 *
 * Pass --repeat to ask each question twice, showing the cached second pass.
 */

import { authCookie } from "../lib/chat-client.mjs";

const args = process.argv.slice(2);
const REPEAT = args.includes("--repeat");
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const PROFILE = { name: "Yaman", major: "Information Systems", year: "Junior" };

const QUERIES = [
  "hi",
  "what is the late policy",
  "how do I get an A",
  "explain the IS strategy triangle",
  "how is the weather today",
];

async function measure(question) {
  const started = Date.now();
  const cookie = await authCookie(BASE);
  const response = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: question }] }],
      profile: PROFILE,
    }),
  });

  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

  const cache = response.headers.get("x-answer-cache");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let firstToken = null;
  let buffer = "";
  let model = cache === "hit" ? "cache" : "?";

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

      let part;
      try {
        part = JSON.parse(payload);
      } catch {
        continue;
      }

      if (part.type === "text-delta" && firstToken === null) {
        firstToken = Date.now() - started;
      }
      if (part.type === "data-model") {
        model = part.data.degraded ? `${part.data.model} (fallback)` : part.data.model;
      }
    }
  }

  return { firstToken, total: Date.now() - started, cache, model };
}

const header = "Query                              first token     complete   cache    model";
console.log(`\n${BASE}\n`);
console.log(header);
console.log("-".repeat(header.length + 12));

for (const query of QUERIES) {
  const passes = REPEAT ? 2 : 1;
  for (let pass = 0; pass < passes; pass += 1) {
    const { firstToken, total, cache, model } = await measure(query);
    const label = query.length > 32 ? `${query.slice(0, 29)}...` : query.padEnd(32);
    console.log(
      `${label}   ${String(firstToken ?? "-").padStart(7)}ms   ${String(total).padStart(7)}ms   ` +
        `${(cache ?? "-").padEnd(7)}  ${model}`,
    );
  }
}
console.log();
