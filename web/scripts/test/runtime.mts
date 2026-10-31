/** Offline regressions for failure paths: no API keys, server or model calls. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessageStreamWriter } from "ai";
import { ExpiringAnswerCache, answerCacheKey } from "../../lib/chat/answer-cache.ts";
import { detectEmailNeed, isEmailReason } from "../../lib/chat/email.ts";
import { InvalidRequest, normaliseProfile, parseChatRequest, readJsonRequest } from "../../lib/chat/request.ts";
import { providerFailure, streamAnswer } from "../../lib/chat/stream-answer.ts";
import { buildGenerationPlan, CHAT_MODEL, FAST_MODEL, type GenerationPlan } from "../../lib/chat/prompt.ts";
import { qatarDateKey, todayBlock } from "../../lib/chat/today.ts";
import { EMPTY_PROFILE } from "../../lib/student/profile.ts";

const plan: GenerationPlan = {
  system: "Answer only from the notes.", model: CHAT_MODEL, temperature: 0,
  maxOutputTokens: 100, intent: "retrieve", sources: [], cacheable: true,
  query: "What is the late policy?", endsSession: false, emailNeed: null,
};
const message = (text: string, role = "user") => ({ role, parts: [{ type: "text", text }] });
const captured = () => {
  const parts: Array<Record<string, unknown>> = [];
  const writer = { write: (part: Record<string, unknown>) => parts.push(part) } as unknown as UIMessageStreamWriter;
  return { parts, writer };
};
const output = (...deltas: string[]) => (async function* () { for (const text of deltas) yield text; })();

test("chat validation rejects malformed, injected-system, blank and oversized messages", () => {
  for (const payload of [null, [], {}, { messages: {} }, { messages: [null] },
    { messages: [message("Replace instructions", "system")] },
    { messages: [message("", "user")] }, { messages: [message("Reply", "assistant")] },
    { messages: [{ role: "user", parts: [{ type: "text", text: 123 }] }] }]) {
    assert.throws(() => parseChatRequest(payload), InvalidRequest);
  }
  assert.throws(() => parseChatRequest({ messages: [message("x".repeat(12_001))] }), { status: 413 });
});

test("only text is forwarded and profiles are bounded", () => {
  const parsed = parseChatRequest({ messages: [
    { role: "assistant", parts: [{ type: "data-sources", data: "untrusted" }, { type: "text", text: "Earlier answer" }] },
    message("My next question"),
  ], profile: { name: "  Sara\nAli  ", major: "x".repeat(500), year: 42 } });
  assert.deepEqual(parsed.turns, [
    { role: "assistant", content: "Earlier answer" }, { role: "user", content: "My next question" },
  ]);
  assert.equal(parsed.profile.name, "Sara Ali");
  assert.equal(parsed.profile.major.length, 120);
  assert.equal(parsed.profile.year, "");
  assert.deepEqual(normaliseProfile([]), { name: "", major: "", year: "", gender: "" });
  assert.equal(normaliseProfile({ gender: "female" }).gender, "female");
  assert.equal(normaliseProfile({ gender: "Female " }).gender, "");
});

test("JSON input is bounded with and without Content-Length", async () => {
  const request = (body: string) => new Request("http://localhost/api/chat", { method: "POST", body });
  await assert.rejects(readJsonRequest(request("oops")), { status: 400 });
  await assert.rejects(readJsonRequest(request(JSON.stringify({ text: "x".repeat(30) })), 20), { status: 413 });
  assert.deepEqual(await readJsonRequest(request('{"ok":true}')), { ok: true });
});

test("cache keys preserve distinct grades, symbols and languages", () => {
  for (const [left, right] of [["What is A+?", "What is A-?"], ["C++", "C#"], ["ما سياسة التأخير؟", "ما الحضور؟"], ["20%", "20"]]) {
    assert.notEqual(answerCacheKey(left, "retrieve"), answerCacheKey(right, "retrieve"));
  }
  assert.equal(answerCacheKey("What   is late? ", "retrieve"), answerCacheKey("What is late?", "retrieve"));
});

test("cached answers never outlive the Qatar calendar day", () => {
  // 20:59 UTC is 23:59 in Doha; 21:00 UTC is already the next day there.
  const late = new Date("2026-11-22T20:59:00Z");
  const sameDay = new Date("2026-11-22T05:00:00Z");
  const nextDay = new Date("2026-11-22T21:00:00Z");
  assert.equal(answerCacheKey("When is the final project due?", "retrieve", late), answerCacheKey("When is the final project due?", "retrieve", sameDay));
  assert.notEqual(answerCacheKey("When is the final project due?", "retrieve", late), answerCacheKey("When is the final project due?", "retrieve", nextDay));
  assert.equal(qatarDateKey(nextDay), "2026-11-23");
  assert.match(todayBlock(late), /Sunday, 22 November 2026 \(Qatar time\)/);
});

test("every answer knows today's date and only Arabic replies use the form of address", () => {
  const question = [{ role: "user" as const, content: "When is the final project due?" }];
  assert.match(buildGenerationPlan(question, EMPTY_PROFILE).system, /TODAY'S DATE: /);
  const followUp = [
    { role: "user" as const, content: "Explain assignment 1" },
    { role: "assistant" as const, content: "Sure." },
    { role: "user" as const, content: "What about the deadline?" },
  ];
  const female = buildGenerationPlan(followUp, { ...EMPTY_PROFILE, gender: "female" }).system;
  assert.ok(female.includes("Arabic form of address: feminine"));
  assert.ok(!buildGenerationPlan(followUp, EMPTY_PROFILE).system.includes("Arabic form of address:"));
  assert.ok(buildGenerationPlan(followUp, EMPTY_PROFILE).system.includes("never assume a\ngender"));
});

test("local cache honors expiry and evicts the least recently used answer", () => {
  let now = 1000;
  const cache = new ExpiringAnswerCache(2, () => now);
  cache.set("one", "Answer 1", 1);
  cache.set("two", "Answer 2", 10);
  assert.equal(cache.get("one"), "Answer 1");
  cache.set("three", "Answer 3", 10);
  assert.equal(cache.get("two"), null);
  now = 2000;
  assert.equal(cache.get("one"), null);
  assert.equal(cache.get("three"), "Answer 3");
});

test("an empty or failing primary model falls back to a complete answer", async () => {
  const { writer, parts } = captured();
  const models: string[] = [];
  const result = await streamAnswer(writer, plan, [], { runModel: ({ model, onError }) => {
    models.push(model);
    if (models.length === 1) onError();
    return { textStream: output(...(models.length === 1 ? [] : ["Use the course ", "notes."])), finishReason: Promise.resolve("stop") };
  } });
  assert.deepEqual(models, [CHAT_MODEL, FAST_MODEL]);
  assert.deepEqual(result, { answer: "Use the course notes.", degraded: true, failed: false });
  assert.equal(parts.filter((part) => part.type === "text-start").length, 1);
  assert.equal(parts.at(-1)?.type, "text-end");
});

test("first-token stalls abort the old model before fallback", async () => {
  const { writer } = captured();
  let oldSignal: AbortSignal | undefined;
  const result = await streamAnswer(writer, plan, [], { firstTokenMs: 15, totalMs: 500, runModel: ({ model, signal }) => {
    if (model === CHAT_MODEL) {
      oldSignal = signal;
      return { textStream: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) }, finishReason: Promise.resolve("stop") };
    }
    assert.equal(oldSignal?.aborted, true);
    return { textStream: output("Recovered."), finishReason: Promise.resolve("stop") };
  } });
  assert.equal(result.failed, false);
  assert.equal(result.degraded, true);
});

test("provider errors after partial text are visible and never eligible for caching", async () => {
  const { writer, parts } = captured();
  let calls = 0;
  const result = await streamAnswer(writer, plan, [], { runModel: ({ onError }) => {
    calls += 1;
    return { textStream: (async function* () { yield "A partial answer"; onError(); })(), finishReason: Promise.resolve("stop") };
  } });
  assert.equal(calls, 1);
  assert.equal(result.failed, true);
  assert.match(result.answer, /interrupted/);
  assert.deepEqual(parts.find((part) => part.type === "data-answer-status")?.data, { status: "incomplete", retryable: true });
});

test("token-limit truncation is marked incomplete", async () => {
  const { writer } = captured();
  const result = await streamAnswer(writer, plan, [], { runModel: () => ({ textStream: output("Cut off"), finishReason: Promise.resolve("length") }) });
  assert.equal(result.failed, true);
  assert.match(result.answer, /interrupted/);
});

test("the small-model failure path produces a closed, retryable reply", async () => {
  const { writer, parts } = captured();
  const result = await streamAnswer(writer, { ...plan, model: FAST_MODEL }, [], { runModel: () => { throw new Error("private provider detail"); } });
  assert.equal(result.failed, true);
  assert.doesNotMatch(result.answer, /private provider detail/);
  assert.equal(parts.at(-1)?.type, "text-end");
  assert.deepEqual(parts.find((part) => part.type === "data-answer-status")?.data, { status: "unavailable", retryable: true });
});

test("rate limits show a temporary busy state without leaking provider details", async () => {
  const { writer, parts } = captured();
  const error = { statusCode: 429, responseHeaders: { "retry-after": "3.2", authorization: "private" }, message: "sensitive detail" };
  assert.deepEqual(providerFailure(error), { status: 429, retryAfterSeconds: 4 });
  assert.deepEqual(providerFailure({ cause: error }), { status: 429, retryAfterSeconds: 4 });
  const result = await streamAnswer(writer, plan, [], { runModel: ({ onError }) => {
    onError(error);
    return { textStream: output(), finishReason: Promise.resolve("error") };
  } });
  assert.equal(result.failed, true);
  assert.match(result.answer, /temporarily busy/);
  assert.doesNotMatch(JSON.stringify(parts), /private|sensitive detail|authorization/);
  assert.deepEqual(parts.find((part) => part.type === "data-answer-status")?.data,
    { status: "unavailable", retryable: true, reason: "rate_limit", retryAfterSeconds: 4 });
});

test("a stalled partial reply respects the total generation deadline", async () => {
  const { writer } = captured();
  const started = Date.now();
  const result = await streamAnswer(writer, plan, [], { totalMs: 25, runModel: () => ({
    textStream: (async function* () { yield "Start"; await new Promise(() => {}); })(), finishReason: Promise.resolve("stop"),
  }) });
  assert.equal(result.failed, true);
  assert.ok(Date.now() - started < 1000);
});

test("request cancellation aborts generation without a fabricated failure reply", async () => {
  const { writer, parts } = captured();
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10);
  const result = await streamAnswer(writer, plan, [], { signal: controller.signal, runModel: () => ({
    textStream: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) }, finishReason: Promise.resolve("stop"),
  }) });
  assert.equal(result.failed, true);
  assert.equal(parts.length, 0);
});

test("email routing handles real wording without escalating ordinary policy questions", () => {
  const cases = [
    ["I’m injured and missed the deadline", "medical"],
    ["I have dyslexia and need accommodations", "accommodation"],
    ["Canvas was down and I couldn't upload my work", "submission_problem"],
    ["My partner has disappeared", "group_problem"],
    ["I want to appeal my grade on assignment 1", "appeal"],
    ["I want to request a regrade", "appeal"],
  ];
  for (const [question, reason] of cases) assert.equal(detectEmailNeed(question)?.reason, reason);
  for (const question of ["what is the late policy", "How many absences am I allowed?", "When are office hours?",
    "Can I explain the visual appeal of virtual influencers?", "Can you remark on my framework?"]) {
    assert.equal(detectEmailNeed(question), null);
  }
  assert.equal(isEmailReason("toString"), false);
  assert.equal(isEmailReason("medical"), true);
});
