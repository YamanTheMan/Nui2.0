"use client";
import { useEffect, useRef, useState } from "react";
import {
  gmailComposeUrl,
  mailtoUrl,
  PROF_EMAIL,
  type EmailReason,
} from "@/lib/chat/email";
import type { StudentProfile } from "@/lib/student/profile";
import Icon from "./ui-icon";

export type EmailOffer = {
  reason: EmailReason;
  summary: string;
  situation: string;
};
type Draft = { to: string; subject: string; body: string };
export default function EmailDraftCard({
  offer,
  profile,
}: {
  offer: EmailOffer;
  profile: StudentProfile;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const write = async () => {
    if (writing) return;
    const request = new AbortController();
    controller.current = request;
    setWriting(true);
    setError("");
    setCopyStatus("");
    try {
      const response = await fetch("/api/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation: offer.situation,
          reason: offer.reason,
          profile,
        }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Draft;
      if (!request.signal.aborted) setDraft(data);
    } catch {
      if (!request.signal.aborted)
        setError("The draft couldn't be created. Please try again.");
    } finally {
      if (!request.signal.aborted) setWriting(false);
    }
  };
  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(
        `Subject: ${draft.subject}\n\n${draft.body}`,
      );
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Select the draft text to copy it.");
    }
  };
  if (!draft)
    return (
      <div className="email-offer">
        <button
          className="button secondary"
          onClick={() => void write()}
          disabled={writing}
        >
          <Icon name="spark" size={14} />
          {writing ? "Writing your draft…" : "Help me write the email"}
        </button>
        {error && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <section className="email-draft">
      <span className="eyebrow">YOUR EMAIL DRAFT</span>
      <h3>A starting point for your message.</h3>
      <p className="small muted">
        To {PROF_EMAIL} · Review the draft and fill in any [brackets].
      </p>
      <label>
        Subject
        <input
          value={draft.subject}
          onChange={(e) => {
            setDraft({ ...draft, subject: e.target.value });
            setCopyStatus("");
          }}
        />
      </label>
      <label>
        Message
        <textarea
          rows={9}
          value={draft.body}
          onChange={(e) => {
            setDraft({ ...draft, body: e.target.value });
            setCopyStatus("");
          }}
        />
      </label>
      <div className="email-actions">
        <a
          className="button primary"
          href={gmailComposeUrl(draft)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Gmail
          <Icon name="external" size={13} />
        </a>
        <a className="button secondary" href={mailtoUrl(draft)}>
          Mail app
        </a>
        <button className="button secondary" onClick={() => void copy()}>
          <Icon name="copy" size={13} />
          Copy
        </button>
        <button
          className="text-button"
          disabled={writing}
          onClick={() => void write()}
        >
          {writing ? "Rewriting…" : "Rewrite"}
        </button>
      </div>
      {copyStatus && (
        <p className="small muted" role="status">
          {copyStatus}
        </p>
      )}
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      <p className="small muted">
        You review and send it. Nothing is sent automatically.
      </p>
    </section>
  );
}
