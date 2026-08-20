/**
 * BM25 retrieval over the prebuilt course index.
 *
 * The corpus is small (a few hundred short chunks), so the index is built in
 * memory on first use and cached for the life of the process. This keeps the
 * runtime free of a vector database or embedding model.
 */

import rawIndex from "./course-index.json";

export type Chunk = {
  text: string;
  source: string;
  chunkIndex: number;
};

export type ScoredChunk = Chunk & { score: number };

const CHUNKS = rawIndex.chunks as Chunk[];

const K1 = 1.5;
const B = 0.75;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does",
  "for", "from", "had", "has", "have", "how", "i", "if", "in", "is", "it", "its",
  "me", "my", "of", "on", "or", "our", "so", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "will", "with", "you", "your",
]);

function normaliseToken(token: string): string {
  // Light suffix stripping so "assignments" matches "assignment".
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9%]+/g) ?? [];
  const tokens: string[] = [];
  for (const raw of matches) {
    if (STOPWORDS.has(raw)) continue;
    tokens.push(normaliseToken(raw));
  }
  return tokens;
}

type Bm25Index = {
  termFreqs: Array<Map<string, number>>;
  lengths: number[];
  avgLength: number;
  docFreq: Map<string, number>;
  total: number;
};

let index: Bm25Index | null = null;

function buildIndex(): Bm25Index {
  const termFreqs: Array<Map<string, number>> = [];
  const lengths: number[] = [];
  const docFreq = new Map<string, number>();

  for (const chunk of CHUNKS) {
    const tokens = tokenize(chunk.text);
    const freqs = new Map<string, number>();
    for (const token of tokens) {
      freqs.set(token, (freqs.get(token) ?? 0) + 1);
    }
    for (const token of freqs.keys()) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
    termFreqs.push(freqs);
    lengths.push(tokens.length);
  }

  const total = CHUNKS.length;
  const avgLength = total > 0 ? lengths.reduce((a, b) => a + b, 0) / total : 0;

  return { termFreqs, lengths, avgLength, docFreq, total };
}

function getIndex(): Bm25Index {
  if (!index) index = buildIndex();
  return index;
}

function idf(term: string, idx: Bm25Index): number {
  const df = idx.docFreq.get(term) ?? 0;
  if (df === 0) return 0;
  return Math.log(1 + (idx.total - df + 0.5) / (df + 0.5));
}

/**
 * Rank chunks against a query. Scores are normalised to 0–1 relative to the
 * best hit so callers can reason about retrieval confidence.
 */
export function search(query: string, topK = 12): ScoredChunk[] {
  const idx = getIndex();
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const uniqueTerms = [...new Set(queryTokens)];
  const scores = new Array<number>(idx.total).fill(0);

  for (const term of uniqueTerms) {
    const termIdf = idf(term, idx);
    if (termIdf === 0) continue;
    for (let docId = 0; docId < idx.total; docId += 1) {
      const tf = idx.termFreqs[docId].get(term);
      if (!tf) continue;
      const norm = 1 - B + (B * idx.lengths[docId]) / (idx.avgLength || 1);
      scores[docId] += (termIdf * (tf * (K1 + 1))) / (tf + K1 * norm);
    }
  }

  const ranked: ScoredChunk[] = [];
  for (let docId = 0; docId < idx.total; docId += 1) {
    if (scores[docId] > 0) {
      ranked.push({ ...CHUNKS[docId], score: scores[docId] });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, topK);
  const best = top[0]?.score ?? 0;
  if (best > 0) {
    for (const chunk of top) chunk.score = chunk.score / best;
  }
  return top;
}

export function chunkCount(): number {
  return CHUNKS.length;
}
