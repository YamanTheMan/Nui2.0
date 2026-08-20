#!/usr/bin/env node
/**
 * Copies the environment variables this app needs from the repo-root .env
 * into the linked Vercel project. Run after `vercel link`.
 *
 * Values are piped over stdin, never printed.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "../../../.env");

const REQUIRED = [
  "GROQ_API_KEY",
  "LIVEAVATAR_API_KEY",
  "LIVEAVATAR_AVATAR_ID",
  "LIVEAVATAR_SANDBOX",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "ELEVENLABS_SECRET_ID",
  "ELEVENLABS_VOICE_ID",
];

const TARGETS = ["production", "preview", "development"];

if (!existsSync(ENV_FILE)) {
  console.error(`Could not find ${ENV_FILE}`);
  process.exit(1);
}

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    let value = rest.join("=").trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    values[key.trim()] = value;
  }
  return values;
}

const env = parseEnv(readFileSync(ENV_FILE, "utf8"));

const missing = REQUIRED.filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(`Missing from .env: ${missing.join(", ")}`);
  process.exit(1);
}

let failures = 0;

for (const key of REQUIRED) {
  for (const target of TARGETS) {
    const result = spawnSync("npx", ["vercel", "env", "add", key, target], {
      input: `${env[key]}\n`,
      encoding: "utf8",
    });

    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status === 0) {
      console.log(`  added   ${key} → ${target}`);
    } else if (/already exists/i.test(output)) {
      console.log(`  exists  ${key} → ${target}`);
    } else {
      failures += 1;
      console.log(`  FAILED  ${key} → ${target}`);
      console.log(`          ${output.trim().split("\n").slice(-2).join(" ")}`);
    }
  }
}

console.log(
  failures === 0
    ? "\nAll environment variables are in place. Deploy with: npx vercel --prod"
    : `\n${failures} variable(s) failed. Check that the project is linked (npx vercel link).`,
);
process.exit(failures > 0 ? 1 : 0);
