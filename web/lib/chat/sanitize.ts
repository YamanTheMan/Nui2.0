/**
 * Cleanup applied to every reply before it reaches the student.
 *
 * The persona forbids emoji, but a prompt rule is a request rather than a
 * guarantee — one slipped through in testing — so it is also enforced here
 * where the outcome is certain.
 */

const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** Removes emoji from a complete string. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI, "");
}

/**
 * Strips emoji from a stream of deltas.
 *
 * An emoji can straddle two deltas, so a trailing half of a surrogate pair is
 * held back until the rest of it arrives rather than being emitted as a broken
 * character and escaping the filter.
 */
export function createEmojiStripper() {
  let held = "";

  const isDangling = (text: string) => {
    const code = text.charCodeAt(text.length - 1);
    // A high surrogate awaiting its pair, or a joiner awaiting what it joins.
    return (code >= 0xd800 && code <= 0xdbff) || code === 0x200d || code === 0xfe0f;
  };

  return {
    push(delta: string): string {
      let text = held + delta;
      held = "";
      while (text.length > 0 && isDangling(text)) {
        held = text.slice(-1) + held;
        text = text.slice(0, -1);
      }
      return stripEmoji(text);
    },
    /** Emits anything still held back once the stream is finished. */
    flush(): string {
      const rest = held;
      held = "";
      return stripEmoji(rest);
    },
  };
}
