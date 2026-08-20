import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type ModelMessage,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { groq } from "@ai-sdk/groq";

import {
  answerCacheKey,
  DEGRADED_TTL_SECONDS,
  getCachedAnswer,
  setCachedAnswer,
} from "@/lib/chat/answer-cache";
import { buildGenerationPlan, FAST_MODEL, type ChatTurn, type GenerationPlan } from "@/lib/chat/prompt";
import { EMPTY_PROFILE, type StudentProfile } from "@/lib/student/profile";
import { createEmojiStripper } from "@/lib/chat/sanitize";

export const maxDuration = 30;

/**
 * How long to wait for visible text from the large model before answering with
 * the smaller one instead. Groq's shared tier regularly queues a request for
 * many seconds, and a slightly plainer answer beats staring at a blank screen.
 *
 * Raise it to favour answer quality, lower it to favour speed.
 */
const FIRST_TOKEN_TIMEOUT_MS = 5000;

const TEXT_PART_ID = "txt-0";

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

function toChatTurns(messages: UIMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: textFromMessage(m),
    }))
    .filter((turn) => turn.content.length > 0);
}

function normaliseProfile(input: unknown): StudentProfile {
  if (!input || typeof input !== "object") return EMPTY_PROFILE;
  const raw = input as Partial<Record<keyof StudentProfile, unknown>>;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    major: typeof raw.major === "string" ? raw.major : "",
    year: typeof raw.year === "string" ? raw.year : "",
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


/** Replays a cached answer as a stream so it reads like a live reply. */
async function replayCachedAnswer(writer: UIMessageStreamWriter, answer: string) {
  writer.write({ type: "text-start", id: TEXT_PART_ID });

  const chunks = answer.match(/[\s\S]{1,40}/g) ?? [answer];
  for (const chunk of chunks) {
    writer.write({ type: "text-delta", id: TEXT_PART_ID, delta: chunk });
    await sleep(6);
  }

  writer.write({ type: "text-end", id: TEXT_PART_ID });
}

const STALLED = Symbol("stalled");

/**
 * Streams the model's answer, switching to the smaller model if the large one
 * has not produced visible text yet.
 *
 * The budget is measured against the first *text* token rather than the SDK's
 * `firstChunkMs`, because Groq sends metadata immediately and can then spend
 * many seconds queued or reasoning before any text appears.
 */
async function streamAnswer(
  writer: UIMessageStreamWriter,
  plan: GenerationPlan,
  messages: ModelMessage[],
): Promise<{ answer: string; degraded: boolean }> {
  let started = false;
  let answer = "";

  const run = async (model: string, budgetMs?: number) => {
    const controller = new AbortController();
    const result = streamText({
      model: groq(model),
      system: plan.system,
      messages,
      temperature: plan.temperature,
      maxOutputTokens: plan.maxOutputTokens,
      abortSignal: controller.signal,
      providerOptions: {
        // gpt-oss models otherwise spend the output budget on reasoning tokens,
        // which both slows the first token and truncates the visible answer.
        groq: { reasoningEffort: "low", reasoningFormat: "hidden" },
      },
    });

    const iterator = result.textStream[Symbol.asyncIterator]();
    let step: IteratorResult<string>;

    if (budgetMs === undefined) {
      step = await iterator.next();
    } else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const pending = iterator.next();
      const raced = await Promise.race([
        pending,
        new Promise<typeof STALLED>((resolve) => {
          timer = setTimeout(() => resolve(STALLED), budgetMs);
        }),
      ]);
      clearTimeout(timer);

      if (raced === STALLED) {
        // Stop paying for a generation nobody will see. The abandoned read
        // rejects on abort, so swallow it to avoid an unhandled rejection.
        pending.catch(() => {});
        controller.abort();
        return;
      }
      step = raced;
    }

    const clean = createEmojiStripper();

    const emit = (delta: string) => {
      if (!delta) return;
      if (!started) {
        writer.write({ type: "text-start", id: TEXT_PART_ID });
        started = true;
      }
      answer += delta;
      writer.write({ type: "text-delta", id: TEXT_PART_ID, delta });
    };

    while (!step.done) {
      emit(clean.push(step.value));
      step = await iterator.next();
    }
    emit(clean.flush());
  };

  const canFallBack = plan.model !== FAST_MODEL;

  try {
    await run(plan.model, canFallBack ? FIRST_TOKEN_TIMEOUT_MS : undefined);
  } catch (error) {
    // Once tokens are on the wire we are committed; restarting would duplicate
    // half an answer.
    if (started || !canFallBack) throw error;
  }

  // Nothing written means the large model either stalled past its budget or
  // returned an empty answer. Either way the smaller model is the better bet.
  let degraded = false;
  if (!started && canFallBack) {
    degraded = true;
    await run(FAST_MODEL);
  }

  // Surfaces which model actually answered, so a stall is visible in the
  // response instead of only showing up as an unexplained slow reply.
  writer.write({
    type: "data-model",
    data: { model: degraded ? FAST_MODEL : plan.model, degraded },
    transient: true,
  });

  if (started) writer.write({ type: "text-end", id: TEXT_PART_ID });
  return { answer, degraded };
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages?: UIMessage[];
    profile?: unknown;
  };

  const messages = body.messages ?? [];
  const profile = normaliseProfile(body.profile);
  const turns = toChatTurns(messages);

  if (turns.length === 0) {
    return new Response("No message provided", { status: 400 });
  }

  const plan = buildGenerationPlan(turns, profile);

  // A cacheable plan carries no history or student details, so the model must
  // see only the question for the answer to match the cache key.
  const modelMessages: ModelMessage[] = plan.cacheable
    ? [{ role: "user", content: plan.query }]
    : await convertToModelMessages(messages);

  const cacheKey = plan.cacheable ? answerCacheKey(plan.query, plan.intent) : null;
  const cached = cacheKey ? await getCachedAnswer(cacheKey) : null;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });

      if (cached) {
        await replayCachedAnswer(writer, cached);
      } else {
        const { answer, degraded } = await streamAnswer(writer, plan, modelMessages);
        // Cache fallback answers too — the questions that stall are the ones
        // that most need caching — but only briefly, so the larger model gets
        // another chance to replace them.
        if (cacheKey) {
          await setCachedAnswer(cacheKey, answer, degraded ? DEGRADED_TTL_SECONDS : undefined);
        }
      }

      // She has closed the conversation. This part persists on the message so
      // the UI can lock the composer instead of letting the student keep going.
      if (plan.endsSession) {
        writer.write({ type: "data-session-end", data: { reason: "grade-change" } });
      }

      writer.write({ type: "finish" });
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "x-answer-cache": !cacheKey ? "bypass" : cached ? "hit" : "miss",
      "x-session-end": plan.endsSession ? "true" : "false",
    },
  });
}
