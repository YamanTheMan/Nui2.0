/**
 * Caches answers to repeated course questions.
 *
 * Course questions repeat heavily across a class, and a cache hit skips the
 * model entirely — which also sidesteps the occasional multi-second queue on
 * Groq's shared tier.
 *
 * Only student-independent answers are cached (see `cacheable` in prof-nui.ts),
 * so one student's name can never appear in another student's reply.
 *
 * The key embeds a content fingerprint, so editing documents/ and re-running
 * `npm run sync` produces new keys instead of serving stale answers.
 */

import { createHash } from "node:crypto";

import courseIndex from "../retrieval/course-index.json";

/** Bump when prompt wording changes in a way that should invalidate answers. */
const PROMPT_VERSION = "v8-nui-2";

const CONTENT_VERSION = createHash("sha256")
  .update(JSON.stringify(courseIndex.chunks))
  .digest("hex")
  .slice(0, 12);

const TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Answers from the fallback model are cached only briefly. They still spare the
 * next student a long wait, but they expire soon so the larger model gets
 * another chance to replace them.
 */
export const DEGRADED_TTL_SECONDS = 60 * 30;

const CACHE_TAG = "course-answers";

const CACHE_OPERATION_MS = 400;

/** A bounded fallback with the same expiry rules as the production cache. */
export class ExpiringAnswerCache {
  private readonly entries = new Map<string, { answer: string; expiresAt: number }>();

  constructor(private readonly capacity = 256, private readonly now = Date.now) {}

  get(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return null;
    this.entries.set(key, entry);
    return entry.answer;
  }

  set(key: string, answer: string, ttlSeconds: number): void {
    if (!answer.trim() || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { answer: answer.trim(), expiresAt: this.now() + ttlSeconds * 1000 });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}

const memoryCache = new ExpiringAnswerCache();

function normaliseQuestion(question: string): string {
  return question
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

async function bestEffort<T>(pending: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending.catch(() => null),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), CACHE_OPERATION_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function answerCacheKey(question: string, intent: string): string {
  const digest = createHash("sha256")
    .update(normaliseQuestion(question))
    .digest("hex")
    .slice(0, 24);
  return `answer:${PROMPT_VERSION}:${CONTENT_VERSION}:${intent}:${digest}`;
}

type VercelCache = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: number; tags?: string[] }): Promise<void>;
};

async function runtimeCache(): Promise<VercelCache | null> {
  try {
    const { getCache } = await import("@vercel/functions");
    return getCache() as unknown as VercelCache;
  } catch {
    return null;
  }
}

export async function getCachedAnswer(key: string): Promise<string | null> {
  const memory = memoryCache.get(key);
  if (memory) return memory;
  const cache = await bestEffort(runtimeCache());
  if (cache) {
    try {
      const value = await bestEffort(cache.get(key));
      if (typeof value === "string" && value.length > 0) return value;
    } catch {
      // fall through to the in-memory copy
    }
  }
  return null;
}

export async function setCachedAnswer(
  key: string,
  answer: string,
  ttlSeconds: number = TTL_SECONDS,
): Promise<void> {
  const trimmed = answer.trim();
  if (!trimmed) return;

  memoryCache.set(key, trimmed, ttlSeconds);

  const cache = await bestEffort(runtimeCache());
  if (!cache) return;
  try {
    await bestEffort(cache.set(key, trimmed, { ttl: ttlSeconds, tags: [CACHE_TAG] }));
  } catch {
    // caching is an optimisation; never fail the request over it
  }
}
