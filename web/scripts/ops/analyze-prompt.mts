/**
 * Where do the tokens actually go? Reports prompt composition per query so
 * optimisation targets the real cost rather than guesswork.
 *
 * Run with: npx tsx scripts/analyze-prompt.mts
 */

import { buildGenerationPlan, retrieveContext, classifyIntent } from "../../lib/chat/prompt.ts";
import { getFactsForQuery } from "../../lib/chat/course-facts.ts";

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

// Rough but consistent: ~4 characters per token for English prose.
const tokens = (text: string) => Math.round(text.length / 4);

/** How much of the retrieved chunk text is already present in the facts block? */
function overlapRatio(facts: string, rag: string): number {
  if (!facts || !rag) return 0;
  const factLines = new Set(
    facts.split("\n").map((l) => l.trim()).filter((l) => l.length > 40),
  );
  const ragLines = rag.split("\n").map((l) => l.trim()).filter((l) => l.length > 40);
  if (ragLines.length === 0) return 0;
  const duplicated = ragLines.filter((l) => factLines.has(l)).length;
  return duplicated / ragLines.length;
}

console.log(
  "query                          intent            facts    rag   total  dup",
);
console.log("-".repeat(78));

let totalTokens = 0;

for (const query of QUERIES) {
  const intent = classifyIntent(query);
  const plan = buildGenerationPlan([{ role: "user", content: query }], PROFILE);

  let factTokens = 0;
  let ragTokens = 0;
  let dup = 0;

  if (intent === "retrieve" || intent === "escalate") {
    const facts = getFactsForQuery(query);
    const retrieval = retrieveContext(query);
    const ragOnly = retrieval.context.split("=== RETRIEVED COURSE MATERIAL ===")[1] ?? "";
    factTokens = tokens(facts);
    ragTokens = tokens(ragOnly);
    dup = overlapRatio(facts, ragOnly);
  }

  const total = tokens(plan.system);
  totalTokens += total;

  const label = query.length > 28 ? `${query.slice(0, 25)}...` : query.padEnd(28);
  console.log(
    `${label}   ${intent.padEnd(16)} ${String(factTokens).padStart(5)}  ${String(ragTokens).padStart(5)}  ${String(total).padStart(6)}  ${(dup * 100).toFixed(0).padStart(3)}%`,
  );
}

console.log("-".repeat(78));
console.log(`average system prompt: ${Math.round(totalTokens / QUERIES.length)} tokens`);
console.log("(whole corpus is ~32,000 tokens for comparison)");
