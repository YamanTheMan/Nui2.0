#!/usr/bin/env node
/**
 * Runs every suite against one target.
 *
 * Chaining the suites with `&&` in package.json looked equivalent, but npm
 * appends `--` arguments only to the end of the whole command, so a URL reached
 * the last suite and the earlier ones quietly tested localhost instead. Passing
 * the target explicitly to each child removes that trap.
 *
 * Usage: node scripts/test/all.mjs [baseUrl]
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://localhost:3000";

const SUITES = [
  ["routing + retrieval", "retrieval.mts", true],
  ["runtime safety", "runtime.mts", true],
  ["profile persistence", "profile.mts", true],
  ["answer facts", "smoke.mjs", false],
  ["tone + escalation", "scenarios.mjs", false],
  ["email hand-off", "email.mjs", false],
  ["cache behaviour", "cache.mjs", false],
];

console.log(`\nNui 2.0 test run — ${BASE}`);

const failed = [];

for (const [label, file, needsTsx] of SUITES) {
  console.log(`\n${"=".repeat(70)}\n${label}\n${"=".repeat(70)}`);

  const script = resolve(HERE, file);
  // The retrieval suite imports the library directly, so it needs no server
  // and takes no target.
  const [command, args] = needsTsx
    ? ["node", ["--import", "tsx", script]]
    : ["node", [script, BASE]];

  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) failed.push(label);
}

console.log(`\n${"=".repeat(70)}`);
if (failed.length === 0) {
  console.log(`All suites passed against ${BASE}.`);
} else {
  console.log(`Failed: ${failed.join(", ")}`);
}
process.exit(failed.length === 0 ? 0 : 1);
