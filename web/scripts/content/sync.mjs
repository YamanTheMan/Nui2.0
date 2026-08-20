#!/usr/bin/env node
/**
 * One command to publish course content everywhere:
 *   1. Rebuild the text-chat search index from documents/
 *   2. Push documents + agent prompt to the ElevenLabs voice agent
 *
 * Step 2 shells out to the existing Python sync script, which holds the tuned
 * voice agent configuration (citation tool, end-call behaviour, voice settings).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIndex } from "./build-index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const VOICE_SYNC_SCRIPT = resolve(REPO_ROOT, "sync_elevenlabs_knowledge.py");

function step(label) {
  console.log(`\n\x1b[1m${label}\x1b[0m`);
}

step("1/2  Rebuilding text-chat search index");
const { files, chunkCount } = buildIndex();
console.log(`\nIndexed ${chunkCount} chunks from ${files.length} documents.`);

step("2/2  Syncing voice agent knowledge (ElevenLabs)");

if (!existsSync(VOICE_SYNC_SCRIPT)) {
  console.log("Skipped — sync_elevenlabs_knowledge.py not found.");
  process.exit(0);
}

/**
 * The sync needs `requests` and `python-dotenv`, and the machine's default
 * `python3` is often not the interpreter they were installed into. Picking the
 * first one that can actually import them turns a confusing crash mid-sync into
 * a working command.
 */
function findPython() {
  const candidates = process.env.PYTHON_BIN
    ? [process.env.PYTHON_BIN]
    : ["python3", "python3.13", "python3.12", "python3.11", "python"];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import requests, dotenv"], {
      stdio: "ignore",
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

const python = findPython();

if (!python) {
  console.error("\nNo Python interpreter found with the sync dependencies installed.");
  console.error("Install them with:  python3 -m pip install -r requirements.txt");
  console.error("Or point at the right interpreter:  PYTHON_BIN=python3.13 npm run sync");
  console.error("\nThe text index was still updated.");
  process.exit(1);
}

const result = spawnSync(python, [VOICE_SYNC_SCRIPT], {
  cwd: REPO_ROOT,
  stdio: "inherit",
});

if (result.error) {
  console.error(`\nCould not run ${python}: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error("\nVoice agent sync failed. The text index was still updated.");
  process.exit(result.status ?? 1);
}

console.log("\n\x1b[32mDone.\x1b[0m Commit the updated index and deploy.");
