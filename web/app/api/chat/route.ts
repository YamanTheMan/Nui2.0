import { createUIMessageStream, createUIMessageStreamResponse, type ModelMessage } from "ai";

import {
  answerCacheKey,
  DEGRADED_TTL_SECONDS,
  getCachedAnswer,
  setCachedAnswer,
} from "@/lib/chat/answer-cache";
import { buildGenerationPlan } from "@/lib/chat/prompt";
import { InvalidRequest, parseChatRequest, readJsonRequest } from "@/lib/chat/request";
import { streamAnswer, TEXT_PART_ID } from "@/lib/chat/stream-answer";

export const maxDuration = 30;

export async function POST(req: Request) {
  let input;
  try {
    input = parseChatRequest(await readJsonRequest(req));
  } catch (error) {
    const message = error instanceof InvalidRequest ? error.message : "Invalid request.";
    return Response.json({ error: message }, { status: error instanceof InvalidRequest ? error.status : 400 });
  }
  const { turns, profile } = input;
  const plan = buildGenerationPlan(turns, profile);
  // Only validated text reaches the model: client-supplied system messages,
  // tool calls and source metadata are never converted into instructions.
  const modelMessages: ModelMessage[] = plan.cacheable
    ? [{ role: "user", content: plan.query }]
    : turns.map(({ role, content }) => ({ role, content }));

  const cacheKey = plan.cacheable ? answerCacheKey(plan.query, plan.intent) : null;
  const cached = cacheKey ? await getCachedAnswer(cacheKey) : null;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });

      // These are the notes supplied to the answerer, not a claim that every
      // sentence was independently verified against a citation.
      const seen = new Set<string>();
      const sources = plan.sources.filter((chunk) => {
        const key = `${chunk.source}:${"section" in chunk ? chunk.section : ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 6).map((chunk) => ({
        source: chunk.source,
        text: chunk.text.slice(0, 2400),
        score: chunk.score,
        ...("section" in chunk && typeof chunk.section === "string" ? { section: chunk.section } : {}),
        ...("title" in chunk && typeof chunk.title === "string" ? { title: chunk.title } : {}),
      }));
      if (sources.length) writer.write({ type: "data-sources", data: sources });

      let complete = Boolean(cached);
      if (cached) {
        writer.write({ type: "text-start", id: TEXT_PART_ID });
        writer.write({ type: "text-delta", id: TEXT_PART_ID, delta: cached });
        writer.write({ type: "text-end", id: TEXT_PART_ID });
      } else {
        const { answer, degraded, failed } = await streamAnswer(writer, plan, modelMessages, { signal: req.signal });
        complete = !failed;
        if (cacheKey && !failed) {
          await setCachedAnswer(cacheKey, answer, degraded ? DEGRADED_TTL_SECONDS : undefined);
        }
      }
      if (req.signal.aborted) return;

      if (plan.emailNeed) {
        writer.write({
          type: "data-email-offer",
          data: {
            reason: plan.emailNeed.reason,
            summary: plan.emailNeed.summary,
            situation: plan.query,
          },
        });
      }

      if (plan.endsSession && complete) {
        writer.write({ type: "data-session-end", data: { reason: "grade-change" } });
      }
      writer.write({ type: "finish" });
    },
    onError: () => "Something interrupted this reply. Please try again.",
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "x-answer-cache": !cacheKey ? "bypass" : cached ? "hit" : "miss",
      "Cache-Control": "no-store",
    },
  });
}
