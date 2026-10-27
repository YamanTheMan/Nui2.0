#!/usr/bin/env node
/**
 * Builds the course search index from documents/ into lib/retrieval/course-index.json.
 * The generated file is committed so the deployed app never touches documents/.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCUMENTS_DIR = resolve(HERE, "../../../documents");
const OUTPUT_FILE = resolve(HERE, "../../lib/retrieval/course-index.json");

// Keep a complete framework, assignment rubric, or policy together whenever
// possible. Splitting every 800 characters cut words, lists, and their headings.
const SECTION_LIMIT = 3800;
const PERSONA_FACTS = /WOW FACTOR|ATTENDANCE|THE DANCE|WORD COUNT/;

export function chunkText(text, source) {
  const chunks = [];
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const title = normalized.split("\n")[0].trim();
  for (const rawSection of normalized.split(/\n\s*---\s*\n/)) {
    const content = rawSection.trim();
    if (!content) continue;
    const section = content.split("\n")[0].trim();
    // These are authoring templates, not actual scholarly evidence. Behavioral
    // instructions from the persona are supplied by the system prompt instead.
    if (/^ADD .*SUMMARIES HERE$/i.test(section)) continue;
    if (source === "D09_prof_nui_persona.txt" && !PERSONA_FACTS.test(section)) continue;

    const add = (body) => chunks.push({
      text: body.trim(), source, title, section, chunkIndex: chunks.length,
    });
    if (content.length <= SECTION_LIMIT) {
      add(content);
      continue;
    }

    // Split only between whole paragraphs. Every continuation carries its
    // section heading so a retrieved factor never loses its framework identity.
    const paragraphs = content.slice(section.length).trim().split(/\n\s*\n/);
    let body = section;
    for (const paragraph of paragraphs) {
      if (body.length > section.length && body.length + paragraph.length > SECTION_LIMIT) {
        add(body);
        body = section;
      }
      body += `\n\n${paragraph}`;
    }
    if (body.length > section.length) add(body);
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
    version: 2,
    contentHash: createHash("sha256").update(JSON.stringify(chunks)).digest("hex"),
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
