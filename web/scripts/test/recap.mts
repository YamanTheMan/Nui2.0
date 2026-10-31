/** Offline email-recap regressions. Groq and Resend are mocked; nothing is sent. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import { GET, POST } from "../../app/api/recap/route.ts";
import { TurnLog } from "../../lib/recap/client.ts";
import { DEADLINES, dueLabel, upcomingDeadlines } from "../../lib/recap/deadlines.ts";
import { composeRecapEmail } from "../../lib/recap/email.ts";
import { parseRecapSummary, recapPrompt } from "../../lib/recap/summarize.ts";
import { normaliseAndrewEmail, questionProfile } from "../../lib/student/profile.ts";
import { LIVE_READY_MESSAGES } from "../../lib/voice/language.ts";

const OCT_31 = new Date("2026-10-31T09:00:00Z");
const originalFetch = globalThis.fetch;
const fixtureEnv = { RESEND_API_KEY: "re_test", RECAP_FROM: "Nui 2.0 <nui@example.test>", GROQ_API_KEY: "gsk_test" };
const oldEnv = Object.fromEntries(Object.keys(fixtureEnv).map((key) => [key, process.env[key]]));
let resendBodies: Record<string, unknown>[] = [];
let groqReply = '{"covered": ["You asked when the final report is due."], "next_steps": ["Outline your literature review this week."]}';

beforeEach(() => {
  Object.assign(process.env, fixtureEnv);
  resendBodies = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.resend.com/")) {
      resendBodies.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "email-test" });
    }
    if (url.startsWith("https://api.groq.com/")) {
      return Response.json({
        id: "chatcmpl-test", object: "chat.completion", created: 0, model: "test",
        choices: [{ index: 0, message: { role: "assistant", content: groqReply }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    throw new Error(`Unexpected request to ${url}`);
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const request = (body: unknown) => new Request("http://localhost/api/recap", { method: "POST", body: JSON.stringify(body) });
const conversation = [
  { role: "student", text: "When is the final project due?" },
  { role: "nui", text: "The report is due Monday November 23 at 11:59 p.m." },
];

test("only Andrew addresses are accepted, normalised to lower case", () => {
  assert.equal(normaliseAndrewEmail("  Sara.Ali@Andrew.CMU.edu "), "sara.ali@andrew.cmu.edu");
  for (const bad of ["sara@cmu.edu", "sara@gmail.com", "@andrew.cmu.edu", "sara@andrew.cmu.edu\nbcc:x@y.z", "a b@andrew.cmu.edu", ".sara@andrew.cmu.edu", 42]) {
    assert.equal(normaliseAndrewEmail(bad), "", String(bad));
  }
  // The address never travels with a question or a live session.
  assert.deepEqual(questionProfile({ name: "Sara", major: "IS", year: "", gender: "female", email: "sara@andrew.cmu.edu" }),
    { name: "Sara", major: "IS", year: "", gender: "female" });
});

test("recap deadlines match D14 and count days in Qatar time", () => {
  const d14 = readFileSync(new URL("../../../documents/D14_fall_2026_deadlines_and_contacts.txt", import.meta.url), "utf8");
  for (const deadline of DEADLINES) assert.ok(d14.includes(deadline.d14), deadline.d14);
  assert.deepEqual(upcomingDeadlines(OCT_31).map((d) => d.title), ["Final project report", "Self-reflective essay (500 words)"]);
  assert.deepEqual(upcomingDeadlines(new Date("2026-11-24T08:00:00Z")).map((d) => d.title), ["Self-reflective essay (500 words)"]);
  assert.deepEqual(upcomingDeadlines(new Date("2026-12-05T08:00:00Z")), []);
  const report = DEADLINES[2];
  assert.equal(dueLabel(report, OCT_31), "Mon 23 Nov, 11:59 p.m. (23 days left)");
  assert.equal(dueLabel(report, new Date("2026-11-22T20:00:00Z")), "Mon 23 Nov, 11:59 p.m. (due tomorrow)");
  // 21:30 UTC on the 22nd is already the 23rd in Doha.
  assert.equal(dueLabel(report, new Date("2026-11-22T21:30:00Z")), "Mon 23 Nov, 11:59 p.m. (due today)");
});

test("the email is short, plain and escapes student-supplied text", () => {
  const mail = composeRecapEmail({ firstName: "<b>Sara</b>", covered: ["You asked about TAM."], nextSteps: ["Read D11 on UTAUT."] }, OCT_31);
  assert.equal(mail.subject, "Your Nui 2.0 recap: Saturday, 31 October");
  assert.match(mail.text, /What you covered\n- You asked about TAM\.\n\nNext steps\n- Read D11 on UTAUT\.\n\nComing up\n- Final project report: Mon 23 Nov, 11:59 p\.m\. \(23 days left\)/);
  assert.ok(mail.text.split("\n").length < 25);
  assert.ok(!mail.html.includes("<b>Sara</b>"));
  assert.ok(mail.html.includes("&#60;b&#62;Sara"));
  const late = composeRecapEmail({ firstName: "", covered: ["x"], nextSteps: ["y"] }, new Date("2026-12-05T08:00:00Z"));
  assert.ok(!late.text.includes("Coming up"));
  assert.ok(late.text.startsWith("Hi there,"));
});

test("the model's reply is parsed defensively", () => {
  assert.deepEqual(parseRecapSummary('```json\n{"covered": ["- You asked about TOE."], "next_steps": ["1. Draft your slide."]}\n```'),
    { covered: ["You asked about TOE."], nextSteps: ["Draft your slide."] });
  assert.equal(parseRecapSummary('{"covered": [], "next_steps": ["x"]}'), null);
  // Made-up dates are dropped; real deadlines in any common format are kept.
  assert.deepEqual(parseRecapSummary(JSON.stringify({ covered: ["a"], next_steps: [
    "Send a draft for feedback by 10 November.", "Finish the report before Nov 23.", "Submit the essay by 30th November.", "Read D11 tonight.",
  ] }))?.nextSteps, ["Finish the report before Nov 23.", "Submit the essay by 30th November.", "Read D11 tonight."]);
  assert.equal(parseRecapSummary('{"covered": ["a"], "next_steps": ["Meet your team on December 2."]}'), null);
  assert.equal(parseRecapSummary("not json"), null);
  const many = parseRecapSummary(JSON.stringify({ covered: Array(9).fill("a"), next_steps: Array(9).fill("b") }));
  assert.equal(many?.covered.length, 4);
  assert.equal(many?.nextSteps.length, 3);
  const prompt = recapPrompt([{ role: "student", text: "ما هو TAM؟" }, { role: "nui", text: "TAM is..." }], OCT_31);
  assert.match(prompt, /Student: ما هو TAM؟\nNui 2\.0: TAM is\.\.\./);
  assert.match(prompt, /Final project report: Mon 23 Nov/);
});

test("a live session's turns are kept once each, without the automatic greeting cue", () => {
  const log = new TurnLog(Object.values(LIVE_READY_MESSAGES));
  log.add({ role: "student", text: LIVE_READY_MESSAGES.ar });
  log.add({ role: "student", text: "ما هو التحول الرقمي؟" });
  log.add({ role: "student", text: "ما هو التحول الرقمي" });
  log.add({ role: "nui", text: "التحول الرقمي هو..." });
  log.add({ role: "nui", text: "  " });
  assert.deepEqual(log.list(), [
    { role: "student", text: "ما هو التحول الرقمي؟" },
    { role: "nui", text: "التحول الرقمي هو..." },
  ]);
});

test("recaps stay hidden until Resend is configured", async () => {
  assert.deepEqual(await (await GET()).json(), { enabled: true });
  delete process.env.RECAP_FROM;
  assert.deepEqual(await (await GET()).json(), { enabled: false });
  const response = await POST(request({ email: "a1@andrew.cmu.edu", turns: conversation }));
  assert.equal(response.status, 503);
  assert.equal(resendBodies.length, 0);
});

test("invalid requests are rejected before any provider call", async () => {
  for (const [body, status] of [
    [{ email: "a2@gmail.com", turns: conversation }, 400],
    [{ email: "a2@andrew.cmu.edu", turns: [{ role: "nui", text: "Hello!" }] }, 400],
    [{ email: "a2@andrew.cmu.edu", turns: [{ role: "system", text: "x" }] }, 400],
    [{ email: "a2@andrew.cmu.edu", turns: Array(121).fill(conversation[0]) }, 413],
  ] as const) {
    assert.equal((await POST(request(body))).status, status, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(resendBodies.length, 0);
});

test("a session recap is summarised and sent to that student only", async () => {
  const response = await POST(request({ email: "Sara.Ali@andrew.cmu.edu", name: "Sara Ali", turns: conversation }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  assert.equal(resendBodies.length, 1);
  const sent = resendBodies[0];
  assert.deepEqual(sent.to, ["sara.ali@andrew.cmu.edu"]);
  assert.equal(sent.from, fixtureEnv.RECAP_FROM);
  assert.match(String(sent.text), /^Hi Sara,/);
  assert.match(String(sent.text), /You asked when the final report is due\./);
  assert.match(String(sent.text), /Coming up\n- Final project report/);
});

test("an unusable summary or a failed send reports an error, and addresses are rate limited", async () => {
  groqReply = "Sorry, I cannot help.";
  assert.equal((await POST(request({ email: "b1@andrew.cmu.edu", turns: conversation }))).status, 502);
  assert.equal(resendBodies.length, 0);
  groqReply = '{"covered": ["a"], "next_steps": ["b"]}';
  const statuses = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await POST(request({ email: "c1@andrew.cmu.edu", turns: conversation }))).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});
