"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { firstName, type StudentProfile } from "@/lib/student/profile";
import { citationKey, type Citation } from "./citations-panel";

const LiveAvatarStage = dynamic(() => import("./live-avatar-stage"), {
  ssr: false,
});

type Voice = { id: string; name: string };

type SessionState = {
  sessionToken: string;
  openingMessage: string;
  profileKey: string;
};

function profileKeyOf(profile: StudentProfile): string {
  return `${profile.name}|${profile.major}|${profile.year}`;
}

type Props = {
  profile: StudentProfile;
  onCitation: (citation: Citation) => void;
};

export default function LiveAvatarPanel({ profile, onCitation }: Props) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices")
      .then((res) => res.json())
      .then((data: { voices?: Voice[]; defaultVoiceId?: string }) => {
        if (cancelled) return;
        setVoices(data.voices ?? []);
        setVoiceId(data.defaultVoiceId ?? "");
      })
      .catch(() => {
        if (!cancelled) setVoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A changed profile means a stale greeting, so an existing session no longer
  // applies. Derived during render rather than reset in an effect.
  const profileKey = profileKeyOf(profile);
  const activeSession = session?.profileKey === profileKey ? session : null;

  const startSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, voiceId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not start the session.");
      }
      setSession({
        sessionToken: data.sessionToken,
        openingMessage: data.openingMessage,
        profileKey,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the session.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {activeSession ? (
        <LiveAvatarStage
          key={activeSession.sessionToken}
          sessionToken={activeSession.sessionToken}
          openingMessage={activeSession.openingMessage}
          studentFirstName={firstName(profile.name)}
          onCitation={onCitation}
          onEnded={() => undefined}
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Talk to Prof Nui with your voice
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {profile.name
                ? `She'll greet you as ${firstName(profile.name)}.`
                : "Add your name in the profile panel for a personal greeting."}
            </p>
          </div>

          {voices.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              Voice
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => void startSession()}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {loading ? "Connecting…" : "Start live session"}
          </button>

          {error ? (
            <p className="max-w-sm text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Allow microphone access when prompted. You can interrupt her any time by
        speaking, or use <strong>Stop speaking</strong>.
      </p>
    </div>
  );
}

export { citationKey };
