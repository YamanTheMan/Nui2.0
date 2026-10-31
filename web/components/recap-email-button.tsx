"use client";

import { useState } from "react";

import { sendRecap } from "@/lib/recap/client";
import type { RecapTurn } from "@/lib/recap/summarize";
import { normaliseAndrewEmail, type StudentProfile } from "@/lib/student/profile";
import Icon from "./ui-icon";

/** "Email me a recap" for a text chat, which has no natural end to trigger one. */
export default function RecapEmailButton({
  profile,
  turns,
}: {
  profile: StudentProfile;
  turns: () => RecapTurn[];
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(profile.email);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="text-button recap-open" onClick={() => setOpen(true)}>
        <Icon name="send" size={12} /> Email me a recap
      </button>
    );
  }
  return (
    <form
      className="recap-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const to = normaliseAndrewEmail(email);
        if (!to) {
          setNote("Use your @andrew.cmu.edu address.");
          return;
        }
        setSending(true);
        setNote(null);
        const result = await sendRecap(to, profile.name, turns());
        setSending(false);
        setNote(result.sent ? `Recap sent to ${to}.` : result.error);
      }}
    >
      <label>
        Send a short recap and your next deadlines to
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={100}
          value={email}
          placeholder="you@andrew.cmu.edu"
          disabled={sending}
          onChange={(event) => {
            setEmail(event.target.value);
            setNote(null);
          }}
        />
      </label>
      <div className="recap-actions">
        <button type="submit" className="button primary" disabled={sending}>
          {sending ? "Sending…" : "Send recap"}
        </button>
        <button type="button" className="text-button" onClick={() => setOpen(false)} disabled={sending}>
          Close
        </button>
      </div>
      {note ? (
        <p className="small" role="status">
          {note}
        </p>
      ) : null}
    </form>
  );
}
