/**
 * The recap email: short, plain, and readable on a phone. Plain text is the
 * real content; the HTML version is the same text with minimal formatting.
 */
import { qatarDateLabel } from "../chat/today";
import { dueLabel, upcomingDeadlines } from "./deadlines";

export type RecapContent = {
  firstName: string;
  covered: string[];
  nextSteps: string[];
};

export type RecapEmail = { subject: string; text: string; html: string };

const SIGN_OFF =
  "Questions? Email Prof Nui at savanid@cmu.edu, or see Mazeeda in TA office hours (Mondays 1:15-2:15 p.m., room 3199).";
const FOOTNOTE = "Nui 2.0 is an AI assistant. Check anything important with Prof Nui.";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function composeRecapEmail(content: RecapContent, now = new Date()): RecapEmail {
  const day = qatarDateLabel(now).replace(/ \d{4}$/, "");
  const coming = upcomingDeadlines(now).map((deadline) => `${deadline.title}: ${dueLabel(deadline, now)}`);
  const sections: Array<[string, string[]]> = [
    ["What you covered", content.covered],
    ["Next steps", content.nextSteps],
    ["Coming up", coming],
  ];
  const greeting = `Hi ${content.firstName || "there"},`;
  const intro = "Here's a quick recap of your session with Nui 2.0.";
  const filled = sections.filter(([, items]) => items.length > 0);

  const text = [
    greeting,
    "",
    intro,
    ...filled.flatMap(([heading, items]) => ["", heading, ...items.map((item) => `- ${item}`)]),
    "",
    SIGN_OFF,
    "",
    "Nui 2.0",
    FOOTNOTE,
  ].join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2b1a24;max-width:520px">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
${filled.map(([heading, items]) => `<p style="margin:18px 0 6px"><strong>${escapeHtml(heading)}</strong></p>
<ul style="margin:0;padding-left:20px">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`).join("\n")}
<p style="margin-top:18px">${escapeHtml(SIGN_OFF)}</p>
<p>Nui 2.0<br><span style="color:#795a6e;font-size:12px">${escapeHtml(FOOTNOTE)}</span></p>
</div>`;

  return { subject: `Your Nui 2.0 recap: ${day}`, text, html };
}
