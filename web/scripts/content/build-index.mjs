#!/usr/bin/env node
/**
 * Builds the course search index from documents/ into lib/retrieval/course-index.json.
 * The generated file is committed so the deployed app never touches documents/.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCUMENTS_DIR = resolve(HERE, "../../../documents");
const OUTPUT_FILE = resolve(HERE, "../../lib/retrieval/course-index.json");

const CHUNK_SIZE = 800;
const OVERLAP = 100;

function splitLongSection(text, source, baseIndex) {
  const chunks = [];
  let start = 0;
  let subIndex = 0;
  while (start < text.length) {
    const chunk = text.slice(start, start + CHUNK_SIZE).trim();
    if (chunk) {
      chunks.push({ text: chunk, source, chunkIndex: baseIndex + subIndex });
      subIndex += 1;
    }
    start += CHUNK_SIZE - OVERLAP;
  }
  return chunks;
}

function chunkText(text, source) {
  const chunks = [];
  let index = 0;
  for (const rawSection of text.split(/\n---\n/)) {
    const section = rawSection.trim();
    if (!section) continue;
    if (section.length <= CHUNK_SIZE) {
      chunks.push({ text: section, source, chunkIndex: index });
      index += 1;
    } else {
      const sub = splitLongSection(section, source, index);
      chunks.push(...sub);
      index += sub.length;
    }
  }
  return chunks;
}

export function buildIndex() {
  const files = readdirSync(DOCUMENTS_DIR)
    .filter((name) => name.endsWith(".txt"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No .txt files found in ${DOCUMENTS_DIR}`);
  }

  const chunks = [];
  for (const file of files) {
    const text = readFileSync(join(DOCUMENTS_DIR, file), "utf8");
    const fileChunks = chunkText(text, file);
    chunks.push(...fileChunks);
    console.log(`  ${file} → ${fileChunks.length} chunks`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    documentCount: files.length,
    chunks,
  };

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { files, chunkCount: chunks.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Building course index from documents/");
  const { files, chunkCount } = buildIndex();
  console.log(`\nIndexed ${chunkCount} chunks from ${files.length} documents.`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}
