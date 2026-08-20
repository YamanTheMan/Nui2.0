#!/usr/bin/env node
/**
 * Renders the same line through several voice models and settings so the
 * options can be compared by ear.
 *
 * The v3 models are the only ones that speak audio tags like [laughs] as real
 * sound, but they also re-colour the whole delivery. Raising stability and
 * similarity pulls v3 back toward the original cloned voice, so these samples
 * exist to find the point where the laughter is real and the speaking voice
 * still sounds like her.
 *
 * Usage: node scripts/ops/voice-samples.mjs
 * Writes mp3 files to voice-samples/ at the repo root.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const OUT_DIR = resolve(REPO_ROOT, "voice-samples");

function loadEnv() {
  const env = {};
  for (const file of [resolve(REPO_ROOT, ".env"), resolve(REPO_ROOT, "web/.env.local")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.ELEVENLABS_API_KEY;
const AGENT_ID = env.ELEVENLABS_AGENT_ID;

if (!API_KEY || !AGENT_ID) {
  console.error("Need ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env");
  process.exit(1);
}

const agent = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
  headers: { "xi-api-key": API_KEY },
}).then((r) => r.json());

const tts = agent.conversation_config.tts;
const VOICE_ID = tts.voice_id;

console.log(`Voice: ${VOICE_ID}`);
console.log(`Currently live: ${tts.model_id}  stability=${tts.stability}  similarity=${tts.similarity_boost}\n`);

// Tagged for v3, plain for the models that would read the brackets aloud.
const TAGGED =
  "[laughs] Okay, that's a new one. The weather has nothing to do with digital transformation. " +
  "So, what's the actual class question you've got for me?";
const PLAIN =
  "Ha, that's a new one. The weather has nothing to do with digital transformation. " +
  "So, what's the actual class question you've got for me?";

const SAMPLES = [
  {
    file: "1-original-flash.mp3",
    label: "Flash v2 — what she sounded like before (written laugh)",
    model: "eleven_flash_v2",
    text: PLAIN,
    stability: 0.5,
    similarity: 0.8,
  },
  {
    file: "2-v3-current.mp3",
    label: "v3 at current settings — what you're hearing now",
    model: "eleven_v3_conversational",
    text: TAGGED,
    stability: 0.5,
    similarity: 0.8,
  },
  {
    file: "3-v3-closer.mp3",
    label: "v3, steadier — pulled back toward the original voice",
    model: "eleven_v3_conversational",
    text: TAGGED,
    stability: 0.8,
    similarity: 0.95,
  },
  {
    file: "4-v3-closest.mp3",
    label: "v3, most faithful — closest to the clone, least dramatic",
    model: "eleven_v3_conversational",
    text: TAGGED,
    stability: 1.0,
    similarity: 1.0,
  },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const sample of SAMPLES) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: sample.text,
        model_id: sample.model,
        voice_settings: {
          stability: sample.stability,
          similarity_boost: sample.similarity,
          speed: 1,
        },
      }),
    },
  );

  if (!response.ok) {
    console.log(`SKIP  ${sample.file} — ${response.status} ${(await response.text()).slice(0, 160)}`);
    continue;
  }

  writeFileSync(resolve(OUT_DIR, sample.file), Buffer.from(await response.arrayBuffer()));
  console.log(`ok    ${sample.file}  ${sample.label}`);
}

console.log(`\nSamples in: ${OUT_DIR}`);
