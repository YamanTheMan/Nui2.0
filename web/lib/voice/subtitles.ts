/**
 * English subtitles for Nui's Arabic speech. A reply is shown one short
 * caption at a time, paced across how long she takes to say it, like film
 * subtitles: never a growing block of text.
 */

/** About two lines at kiosk width. */
export const MAX_CAPTION = 96;
const MIN_CAPTION = 32;

/**
 * Her Arabic speaking rate, in letters per second (spaces, punctuation and
 * diacritics excluded), until a session measures it. Taken from a real
 * session's transcript timings.
 */
export const ARABIC_CHARS_PER_SECOND = 8;

/** Remaining captions after she stops early are shown at this interval. */
export const CATCH_UP_MS = 1800;

/** How long the last caption stays up after she finishes speaking. */
export const LINGER_MS = 4000;

// Where to break a long sentence: the space nearest an even split, preferring
// one right after a comma, semicolon or colon. Never past MAX_CAPTION.
function breakPoint(text: string, target: number): number {
  let best = -1;
  let bestScore = Infinity;
  for (let index = 1; index <= Math.min(text.length - 1, MAX_CAPTION); index += 1) {
    if (text[index] !== " ") continue;
    const clause = /[,;:]/.test(text[index - 1]);
    const score = Math.abs(index - target) - (clause ? MAX_CAPTION / 4 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best > 0 ? best : MAX_CAPTION;
}

export function splitCaptions(text: string): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+(?=\S)/);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence.trim();
    // Split evenly, so a long sentence never leaves a stub to glue onto the next one.
    while (rest.length > MAX_CAPTION) {
      const cut = breakPoint(rest, rest.length / Math.ceil(rest.length / MAX_CAPTION));
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  }
  // A very short caption flashes past; it rides along with the next one when they fit.
  const captions: string[] = [];
  for (const piece of pieces) {
    const last = captions.at(-1);
    if (last && last.length < MIN_CAPTION && last.length + 1 + piece.length <= MAX_CAPTION) {
      captions[captions.length - 1] = `${last} ${piece}`;
    } else {
      captions.push(piece);
    }
  }
  return captions;
}

/** When each caption starts, sharing the speech duration in proportion to caption length. */
export function captionOffsets(captions: string[], durationMs: number): number[] {
  const total = captions.reduce((sum, caption) => sum + caption.length, 0) || 1;
  let elapsed = 0;
  return captions.map((caption) => {
    const start = elapsed;
    elapsed += (durationMs * caption.length) / total;
    return start;
  });
}

/** The caption that should be on screen `elapsedMs` into the reply. */
export function currentCaptionIndex(offsets: number[], elapsedMs: number): number {
  let index = 0;
  while (index + 1 < offsets.length && offsets[index + 1] <= elapsedMs) index += 1;
  return index;
}

/** Blend a measured speaking rate into the running estimate, ignoring implausible readings. */
export function updateSpeakingRate(current: number, characters: number, seconds: number): number {
  if (characters < 40 || seconds < 2) return current;
  const measured = characters / seconds;
  if (measured < 5 || measured > 30) return current;
  return current * 0.5 + measured * 0.5;
}

/**
 * ElevenLabs streams each reply's text as start, delta and stop parts, all
 * within a fraction of a second and before or as she starts speaking. That is
 * the earliest text for subtitles. Its complete-reply event can lag by seconds
 * or never arrive, and the avatar's own transcript only comes as she finishes.
 */
export type ResponsePart = { type?: unknown; text?: unknown };

/** Folds one streamed part into the reply text so far. */
export function foldResponsePart(text: string, part: ResponsePart): { text: string; done: boolean } {
  if (part.type === "start") return { text: "", done: false };
  if (part.type === "stop") return { text, done: true };
  return { text: part.type === "delta" && typeof part.text === "string" ? text + part.text : text, done: false };
}

/** A pause this long in the stream means the reply is complete even without a stop part. */
export const REPLY_QUIET_MS = 250;
