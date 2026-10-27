/**
 * Where do the tokens actually go? Reports prompt composition per query so
 * optimisation targets the real cost rather than guesswork.
 *
 * Run with: npx tsx scripts/analyze-prompt.mts
 */

import { buildGenerationPlan, retrieveContext, classifyIntent } from "../../lib/chat/prompt.ts";
import { getFactChunksForQuery } from "../../lib/chat/course-facts.ts";

const PROFILE = { name: "Yaman Hemmoudeh", major: "Information Systems", year: "Junior" };

const QUERIES = [
  "hi",
  "how is the weather today",
  "what is the late policy",
  "explain assignment 1",
  "tell me about the assignments",
  "what is the grade distribution",
  "how do I get an A",
  "explain the IS strategy triangle",
  "why did Renren fail",
];

// Rough estimates only: the provider's tokenizer and usage fields are authoritative.
const tokens = (text: string) => Math.round(text.length / 4);

console.log(
  "query                          intent            facts  extra  system  sources",
);
console.log("-".repeat(78));

let totalTokens = 0;

for (const query of QUERIES) {
  const intent = classifyIntent(query);
  const plan = buildGenerationPlan([{ role: "user", content: query }], PROFILE);

  let factTokens = 0;
  let ragTokens = 0;
  let sourceCount = 0;

  if (intent === "retrieve" || intent === "escalate") {
    const facts = getFactChunksForQuery(query);
    const retrieval = retrieveContext(query);
    const factKeys = new Set(facts.map((chunk) => `${chunk.source}:${chunk.chunkIndex}`));
    factTokens = tokens(retrieval.sources.filter((chunk) => factKeys.has(`${chunk.source}:${chunk.chunkIndex}`)).map((chunk) => chunk.text).join("\n"));
    ragTokens = tokens(retrieval.sources.filter((chunk) => !factKeys.has(`${chunk.source}:${chunk.chunkIndex}`)).map((chunk) => chunk.text).join("\n"));
    sourceCount = retrieval.sources.length;
  }

  const total = tokens(plan.system);
  totalTokens += total;

  const label = query.length > 28 ? `${query.slice(0, 25)}...` : query.padEnd(28);
  console.log(
    `${label}   ${intent.padEnd(16)} ${String(factTokens).padStart(5)}  ${String(ragTokens).padStart(5)}  ${String(total).padStart(6)}  ${String(sourceCount).padStart(3)}`,
  );
}

console.log("-".repeat(78));
console.log(`average system prompt: ${Math.round(totalTokens / QUERIES.length)} tokens`);
console.log("Facts and extra evidence are disjoint; system also includes persona, grounding rules and source labels.");
