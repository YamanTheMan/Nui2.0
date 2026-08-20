"use client";

import { useState } from "react";

import { gmailComposeUrl, mailtoUrl, PROF_EMAIL, type EmailReason } from "@/lib/chat/email";
import type { StudentProfile } from "@/lib/student/profile";

export type EmailOffer = {
  reason: EmailReason;
  summary: string;
  situation: string;
};

type Draft = { to: string; subject: string; body: string };
type Status = "idle" | "writing" | "ready" | "error";

/**
 * Sits under a reply about something only Prof Nui can settle. It writes the
 * email, lets the student edit it, and hands them a filled-in Gmail draft —
 * they still read it and press send themselves.
 */
export default function EmailDraftCard({
  offer,
  profile,
}: {
  offer: EmailOffer;
  profile: StudentProfile;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState(false);

  const write = async () => {
    setStatus("writing");
    try {
      const res = await fetch("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: offer.situation, reason: offer.reason, profile }),
      });
      if (!res.ok) throw new Error("draft failed");
      const data = (await res.json()) as Draft;
      setDraft(data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (status === "idle" || status === "writing" || status === "error") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={write}
          disabled={status === "writing"}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {status === "writing" ? "Writing the email…" : "Write this email for me"}
        </button>
        {status === "error" ? (
          <span className="text-xs text-red-600 dark:text-red-400">
            That didn&apos;t work. Try again?
          </span>
        ) : null}
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Draft email to {draft.to || PROF_EMAIL}
      </p>

      <label className="block text-xs text-slate-500 dark:text-slate-400">
        Subject
        <input
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300"
        />
      </label>

      <label className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
        Message
        <textarea
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          rows={9}
          className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-300"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Read it through and fill in anything in [brackets] before you send.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={gmailComposeUrl(draft)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          Open in Gmail
        </a>
        <a
          href={mailtoUrl(draft)}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Open in mail app
        </a>
        <button
          type="button"
          onClick={copy}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={write}
          className="text-xs text-slate-500 underline-offset-2 transition hover:underline dark:text-slate-400"
        >
          Rewrite
        </button>
      </div>
    </div>
  );
}
