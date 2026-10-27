import { streamText, type ModelMessage, type UIMessageStreamWriter } from "ai";
import { groq } from "@ai-sdk/groq";
import { FAST_MODEL, type GenerationPlan } from "./prompt";
import { createEmojiStripper } from "./sanitize";

export const TEXT_PART_ID = "txt-0";
const UNAVAILABLE = "I couldn't generate a complete answer just now. Please try again in a moment.";
const BUSY = "The answer service is temporarily busy. Please try again shortly.";
const INTERRUPTED = "\n\nThis answer was interrupted before it finished. Please try again.";

type RunOptions = {
  model: string;
  plan: GenerationPlan;
  messages: ModelMessage[];
  signal: AbortSignal;
  onError: (error?: unknown) => void;
};
type ModelRun = { textStream: AsyncIterable<string>; finishReason: PromiseLike<string> };
type StreamOptions = {
  signal?: AbortSignal;
  firstTokenMs?: number;
  totalMs?: number;
  idleMs?: number;
  runModel?: (options: RunOptions) => ModelRun;
};

/** Extract only an HTTP status and retry duration; never log provider payloads. */
export function providerFailure(error: unknown): { status: number; retryAfterSeconds?: number } | null {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return null;
    const details = current as Record<string, unknown>;
    if (typeof details.statusCode === "number" && details.statusCode >= 400 && details.statusCode <= 599) {
      const headers = details.responseHeaders;
      const retry = headers && typeof headers === "object"
        ? (headers as Record<string, unknown>)["retry-after"] : undefined;
      const seconds = typeof retry === "string" && /^\d+(?:\.\d+)?$/.test(retry) ? Math.ceil(Number(retry)) : NaN;
      return { status: details.statusCode, ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterSeconds: seconds } : {}) };
    }
    current = details.cause;
  }
  return null;
}

const runModel = ({ model, plan, messages, signal, onError }: RunOptions): ModelRun => streamText({
  model: groq(model),
  system: plan.system,
  messages,
  temperature: plan.temperature,
  maxOutputTokens: plan.maxOutputTokens,
  maxRetries: 0,
  abortSignal: signal,
  // textStream intentionally hides SDK errors; record them so partial answers
  // cannot be mistaken for a complete response and stored in the shared cache.
  onError: ({ error }) => {
    const failure = providerFailure(error);
    if (failure) console.warn("[chat] provider request failed", { model, ...failure });
    onError(error);
  },
  providerOptions: { groq: { reasoningEffort: "low", reasoningFormat: "hidden" } },
});

function within<T>(pending: PromiseLike<T>, milliseconds: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const clear = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { clear(); reject(new Error("Generation cancelled")); };
    const timer = setTimeout(() => { clear(); reject(new Error("Generation timed out")); }, Math.max(0, milliseconds));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(pending).then(
      (value) => { clear(); resolve(value); },
      (error) => { clear(); reject(error); },
    );
    if (signal.aborted) abort();
  });
}

/** Bound both first-token and mid-answer stalls; never cache partial text. */
export async function streamAnswer(
  writer: UIMessageStreamWriter,
  plan: GenerationPlan,
  messages: ModelMessage[],
  options: StreamOptions = {},
): Promise<{ answer: string; degraded: boolean; failed: boolean }> {
  const deadline = Date.now() + (options.totalMs ?? 24_000);
  let started = false;
  let answer = "";
  let degraded = false;
  let complete = false;
  let rateLimited: { retryAfterSeconds?: number } | null = null;
  const recordFailure = (error?: unknown) => {
    const failure = providerFailure(error);
    if (failure?.status === 429) rateLimited = failure;
  };
  const emit = (delta: string) => {
    if (!delta) return;
    if (!started) {
      if (!delta.trim()) return;
      writer.write({ type: "text-start", id: TEXT_PART_ID });
      started = true;
    }
    answer += delta;
    writer.write({ type: "text-delta", id: TEXT_PART_ID, delta });
  };

  const candidates = plan.model === FAST_MODEL ? [plan.model] : [plan.model, FAST_MODEL];
  for (const [index, model] of candidates.entries()) {
    if (started || options.signal?.aborted || Date.now() >= deadline) break;
    degraded = index > 0;
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let errored = false;
    const firstDeadline = Math.min(deadline, Date.now() + (options.firstTokenMs ?? 7_000));
    try {
      const result = (options.runModel ?? runModel)({
        model, plan, messages, signal: controller.signal,
        onError: (error) => { errored = true; recordFailure(error); },
      });
      const iterator = result.textStream[Symbol.asyncIterator]();
      const clean = createEmojiStripper();
      for (;;) {
        const timeLeft = (started ? deadline : firstDeadline) - Date.now();
        const step = await within(iterator.next(), Math.min(timeLeft, options.idleMs ?? 8_000), controller.signal);
        if (options.signal?.aborted) break;
        if (step.done) {
          emit(clean.flush());
          const reason = await within(result.finishReason, deadline - Date.now(), controller.signal);
          complete = started && !errored && reason === "stop";
          break;
        }
        emit(clean.push(step.value));
      }
    } catch (error) {
      recordFailure(error);
      // A second model can replace an empty reply. Once text is visible, mark
      // the interruption instead of joining two unrelated generations.
    } finally {
      controller.abort();
      options.signal?.removeEventListener("abort", abort);
    }
    if (complete) break;
  }

  if (options.signal?.aborted) return { answer, degraded, failed: true };
  if (!complete) {
    const status = started ? "incomplete" : "unavailable";
    emit(started ? INTERRUPTED : rateLimited ? BUSY : UNAVAILABLE);
    const retryAfterSeconds = (rateLimited as { retryAfterSeconds?: number } | null)?.retryAfterSeconds;
    writer.write({ type: "data-answer-status", data: {
      status, retryable: true,
      ...(rateLimited ? { reason: "rate_limit" } : {}),
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    } });
  }
  writer.write({ type: "data-model", data: { model: degraded ? FAST_MODEL : plan.model, degraded }, transient: true });
  if (started) writer.write({ type: "text-end", id: TEXT_PART_ID });
  return { answer, degraded, failed: !complete };
}
