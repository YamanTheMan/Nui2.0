#!/usr/bin/env node
/**
 * The email hand-off, end to end.
 *
 * Two things break this feature in ways nobody notices until a student is
 * looking at it: the offer firing on ordinary policy questions, and the draft
 * inventing a date or a reason the student never gave. Both are checked here.
 *
 * Usage: node scripts/test/email.mjs [baseUrl]
 */

import { askChat, createReporter, plain } from "../lib/chat-client.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PROFILE = { name: "Yaman Ali", major: "Information Systems", year: "Junior" };

const report = createReporter();

const ask = (question) => askChat({ base: BASE, question, profile: PROFILE });

async function draft(offer) {
  const res = await fetch(`${BASE}/api/email-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ situation: offer.situation, reason: offer.reason, profile: PROFILE }),
  });
  return res.json();
}

/** Questions that must produce an offer, with the reason they should carry. */
const NEEDS_EMAIL = [
  ["i was in the hospital last week and missed the assignment 1 deadline", "medical"],
  ["can i get an extension on assignment 2", "extension"],
  ["canvas was down last night and my submission didnt go through", "submission_problem"],
  ["i want to appeal my grade on assignment 1", "appeal"],
  ["my group partner has disappeared and isnt doing any work", "group_problem"],
];

/** Ordinary course questions she answers herself. An offer here is noise. */
const NO_EMAIL = [
  "what is the late policy",
  "how do i get an A",
  "what country should i choose for assignment 1",
  "whats the grade distribution",
  "when are office hours",
];

console.log(`\nEmail hand-off — ${BASE}\n`);

for (const [question, expected] of NEEDS_EMAIL) {
  const { text, emailOffer: offer } = await ask(question);
  console.log(`  student: ${question}`);
  console.log(`  nui:     ${text.replace(/\n+/g, " ")}`);

  // The offer is a data part, so it survives an empty reply. Without this the
  // whole suite passes green while every bubble renders blank.
  report.check("she actually replied", text.trim().length > 20, `${text.length} chars`);
  report.check("offers the email", Boolean(offer), offer ? "" : "no offer");
  if (offer) report.check(`reason is ${expected}`, offer.reason === expected, offer.reason);
  report.check(
    "says she can write it",
    /write|draft|put (it )?together|email/i.test(text),
    "never mentions the email",
  );

  // She points at the draft button; she must not start writing the email in the
  // chat, which would duplicate it and bury it mid-conversation.
  report.check(
    "does not write the email inline",
    !/^\s*(dear|subject:)/im.test(text),
    "wrote a draft in the reply",
  );
  console.log("");
}

for (const question of NO_EMAIL) {
  const { emailOffer } = await ask(question);
  report.check(`no offer for "${question}"`, emailOffer === null, `offered ${emailOffer?.reason}`);
}

console.log("");

// The draft itself: shaped like an email, addressed correctly, and honest about
// what the student did not tell it.
const { emailOffer } = await ask("can i get an extension on assignment 2");
if (emailOffer) {
  const d = await draft(emailOffer);
  console.log(`  subject: ${d.subject}`);
  console.log(`  body:\n${(d.body ?? "").split("\n").map((l) => `    ${l}`).join("\n")}\n`);

  const body = plain(d.body ?? "");
  report.check("addressed to the professor", d.to === "savanid@cmu.edu", d.to);
  report.check("has a subject", Boolean(d.subject?.trim()));
  report.check("opens with a greeting", /^dear\b/i.test(body.trim()));
  report.check("signs off as the student", /yaman/i.test(body));
  report.check("no markdown crept in", !/[*#_]{2}|^\s*[-*]\s/m.test(body));
  // The student never gave a reason or a new date, so the draft has to leave
  // those blank rather than making them up.
  report.check("leaves unknown details blank", /\[[^\]]+\]/.test(body), "no blanks to fill in");
} else {
  report.check("draft path reachable", false, "no offer to draft from");
}

process.exit(report.summary() === 0 ? 0 : 1);
