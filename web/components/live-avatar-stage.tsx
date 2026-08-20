"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { GRADE_CHANGE_PATTERN } from "@/lib/chat/intent";
import { gradeChangeDirection, gradeChangeLevel } from "@/lib/chat/persona";
import type { Citation } from "./citations-panel";

/**
 * Drives a LiveAvatar + ElevenLabs voice session.
 *
 * The SDK is browser-only, so it is imported dynamically once the component
 * mounts. Session state lives in refs because the SDK event callbacks are
 * registered once and must not close over stale React state.
 */

type Props = {
  sessionToken: string;
  openingMessage: string;
  studentFirstName: string;
  onCitation: (citation: Citation) => void;
  onEnded: () => void;
};

/** Minimal structural view of the LiveAvatar SDK session we actually use. */
type SdkSession = {
  on<T>(event: unknown, handler: (payload: T) => void): void;
  attach(element: HTMLVideoElement): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  interrupt(): void;
  voiceChat?: {
    on?<T>(event: unknown, handler: (payload: T) => void): void;
    mute?(): Promise<void>;
    unmute?(): Promise<void>;
  };
  sendContextualUpdate?(text: string): void;
  sendUserMessage?(text: string): void;
  sendUserActivity?(): void;
  sendClientToolResult?(payload: {
    toolCallId: string;
    result: string;
    sourceEventId?: unknown;
  }): void;
};

type TranscriptEvent = { text?: string };

type AgentToolEvent = {
  event_id?: unknown;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

/** How long to wait for her to finish the final goodbye before cutting the session. */
const FINAL_GOODBYE_GRACE_MS = 14000;

function extractCitationFromSpeech(text: string): Citation | null {
  if (!text) return null;
  const according = text.match(
    /According to\s+([^:.!?]+?)(?:[:\-—,]|\s+—\s+)\s*["'“]?([^"'”]+?)["'”]?(?:[.!?]|$)/i,
  );
  if (according) {
    return { source: according[1].trim(), quote: according[2].trim() };
  }
  const course = text.match(
    /(?:From|In)\s+(our\s+)?course materials[^\-:]*[:\-—]\s*["'“]?([^"'”]+?)["'”]?(?:[.!?]|$)/i,
  );
  if (course) {
    return { source: "Course materials", quote: course[2].trim() };
  }
  return null;
}

export default function LiveAvatarStage({
  sessionToken,
  openingMessage,
  studentFirstName,
  onCitation,
  onEnded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<SdkSession | null>(null);

  const startedRef = useRef(false);
  const greetingSentRef = useRef(false);
  const streamAttachedRef = useRef(false);
  const avatarSpeakingRef = useRef(false);
  const gradeAttemptsRef = useRef(0);
  const lastGradeCueAtRef = useRef(0);
  const forceEndRef = useRef(false);
  const endingRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState("Connecting to AskProfNui…");
  const [overlay, setOverlay] = useState<string | null>("Loading AskProfNui…");
  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);

  const onCitationRef = useRef(onCitation);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onCitationRef.current = onCitation;
    onEndedRef.current = onEnded;
  });

  const forceEndSession = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    forceEndRef.current = false;
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    setStatus("Ending session…");
    try {
      try {
        sessionRef.current?.interrupt?.();
      } catch {
        // interrupt is best-effort
      }
      await sessionRef.current?.stop?.();
    } catch {
      // stop is best-effort
    }
    setIsLive(false);
    setOverlay("Session ended. AskProfNui closed the office hours.");
    onEndedRef.current();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const sdk = (await import("@heygen/liveavatar-web-sdk")) as unknown as {
        ElevenLabsAgentSession?: new (token: string, options: unknown) => SdkSession;
        LiveAvatarSession: new (token: string, options: unknown) => SdkSession;
        SessionEvent: Record<string, unknown>;
        SessionState: Record<string, unknown>;
        VoiceChatEvent: Record<string, unknown>;
        AgentEventsEnum: Record<string, unknown>;
      };
      if (cancelled) return;

      const {
        ElevenLabsAgentSession,
        LiveAvatarSession,
        SessionEvent,
        SessionState,
        VoiceChatEvent,
        AgentEventsEnum,
      } = sdk;

      const SessionClass = ElevenLabsAgentSession ?? LiveAvatarSession;
      const session = new SessionClass(sessionToken, {
        voiceChat: { defaultMuted: false },
      });
      sessionRef.current = session;

      const enforceGradeChange = (transcript: string) => {
        if (!transcript || endingRef.current) return;
        if (!GRADE_CHANGE_PATTERN.test(transcript)) return;

        const now = Date.now();
        if (now - lastGradeCueAtRef.current < 4500) return;
        lastGradeCueAtRef.current = now;

        gradeAttemptsRef.current += 1;
        const attempt = Math.min(gradeAttemptsRef.current, 4);
        const level = gradeChangeLevel(attempt);
        const direction = gradeChangeDirection(level, studentFirstName);
        const cue =
          `OVERRIDE — the student is asking you to change their grade, attempt ${attempt} of 4. ` +
          `This takes priority over everything else.\n${direction}` +
          (level === "over" ? "\nAfter you finish speaking, immediately call end_call." : "");

        try {
          session.sendContextualUpdate?.(cue);
        } catch {
          // contextual updates are best-effort
        }

        if (level === "over") {
          // The wording of her goodbye varies, so the session end is driven by
          // the attempt count rather than by listening for particular words.
          forceEndRef.current = true;
          setStatus("She's ending the session…");
          if (endTimerRef.current) clearTimeout(endTimerRef.current);
          endTimerRef.current = setTimeout(() => void forceEndSession(), FINAL_GOODBYE_GRACE_MS);
        } else {
          setStatus(`Grade-change attempt ${attempt} of 4.`);
        }
      };

      const handleAgentEvent = (raw: AgentToolEvent) => {
        const data = (raw?.data ?? raw ?? {}) as Record<string, unknown>;
        const name = String(data.tool_name ?? data.toolName ?? data.name ?? "");
        const toolCallId = String(data.tool_call_id ?? data.toolCallId ?? "");
        if (!name && !toolCallId) return;

        const rawParams = data.parameters ?? data.tool_params ?? data.arguments ?? {};
        let params: Record<string, unknown> = {};
        if (typeof rawParams === "string") {
          try {
            params = JSON.parse(rawParams) as Record<string, unknown>;
          } catch {
            params = {};
          }
        } else if (rawParams && typeof rawParams === "object") {
          params = rawParams as Record<string, unknown>;
        }

        if (name.toLowerCase() === "show_citation") {
          const source = params.source ?? params.Source;
          const quote = params.quote ?? params.Quote;
          if (source && quote) {
            onCitationRef.current({ source: String(source), quote: String(quote) });
          }
        }

        if (toolCallId) {
          try {
            session.sendClientToolResult?.({
              toolCallId,
              result: "ok",
              sourceEventId: raw?.event_id,
            });
          } catch {
            // tool results are best-effort
          }
        }
      };

      const triggerGreeting = () => {
        if (greetingSentRef.current) return;
        greetingSentRef.current = true;
        try {
          session.sendContextualUpdate?.(
            "The student can see and hear you now. Respond with ONLY this opening greeting, warmly, then wait: " +
              `${openingMessage} Never say 'are you still there'.`,
          );
          setTimeout(() => {
            try {
              if (typeof session.sendUserMessage === "function") {
                session.sendUserMessage("Hi — I'm ready, please greet me.");
              } else {
                session.sendUserActivity?.();
              }
            } catch {
              // nudge is best-effort
            }
          }, 500);
          setStatus("AskProfNui is introducing herself…");
        } catch {
          setStatus("Connected — say hi if AskProfNui is quiet.");
        }
      };

      session.on(SessionEvent.SESSION_STATE_CHANGED, (state: unknown) => {
        if (state === SessionState.CONNECTED) {
          setIsLive(true);
          setStatus("Connected — finishing setup…");
        } else if (state === SessionState.INACTIVE || state === SessionState.DISCONNECTED) {
          setIsLive(false);
          setAvatarSpeaking(false);
          startedRef.current = false;
          streamAttachedRef.current = false;
          greetingSentRef.current = false;
          avatarSpeakingRef.current = false;
          setStatus("Session ended.");
          setOverlay("Session ended. Start a new session when you're ready.");
          onEndedRef.current();
        }
      });

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (!streamAttachedRef.current && videoRef.current) {
          session.attach(videoRef.current);
          streamAttachedRef.current = true;
        }
        setOverlay("Almost ready — starting your greeting…");
        setTimeout(() => {
          setOverlay(null);
          setStatus("Ready — go ahead and ask.");
          triggerGreeting();
        }, 2000);
      });

      session.voiceChat?.on?.(VoiceChatEvent.MUTED, () => setIsMuted(true));
      session.voiceChat?.on?.(VoiceChatEvent.UNMUTED, () => setIsMuted(false));

      session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
        if (avatarSpeakingRef.current) {
          try {
            session.interrupt();
            avatarSpeakingRef.current = false;
            setAvatarSpeaking(false);
          } catch {
            // interrupt is best-effort
          }
        }
        setStatus("Listening…");
      });

      session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => setStatus("Thinking…"));

      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        avatarSpeakingRef.current = true;
        setAvatarSpeaking(true);
        setStatus("AskProfNui is speaking…");
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        avatarSpeakingRef.current = false;
        setAvatarSpeaking(false);
        setStatus("Your turn — ask a question.");
        if (forceEndRef.current && !endingRef.current) {
          setTimeout(() => void forceEndSession(), 2800);
        }
      });

      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (evt: TranscriptEvent) => {
        const citation = extractCitationFromSpeech(evt?.text ?? "");
        if (citation) onCitationRef.current(citation);
      });

      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (evt: TranscriptEvent) =>
        enforceGradeChange(evt?.text ?? ""),
      );
      if (AgentEventsEnum.USER_TRANSCRIPTION_CHUNK) {
        session.on(AgentEventsEnum.USER_TRANSCRIPTION_CHUNK, (evt: TranscriptEvent) =>
          enforceGradeChange(evt?.text ?? ""),
        );
      }
      if (AgentEventsEnum.ELEVENLABS_AGENT_EVENT) {
        session.on(AgentEventsEnum.ELEVENLABS_AGENT_EVENT, handleAgentEvent);
      }

      // Auto-start so the student only has to allow the microphone.
      if (!startedRef.current) {
        startedRef.current = true;
        setOverlay("Connecting audio & video — please wait…");
        try {
          await session.start();
          try {
            await session.voiceChat?.unmute?.();
          } catch {
            // mic may already be live
          }
        } catch (error) {
          startedRef.current = false;
          const message = error instanceof Error ? error.message : String(error);
          setOverlay("Could not start the session.");
          setStatus(`Failed to start: ${message}`);
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      try {
        sessionRef.current?.stop?.();
      } catch {
        // teardown is best-effort
      }
    };
  }, [sessionToken, openingMessage, studentFirstName, forceEndSession]);

  const handleInterrupt = () => {
    if (!avatarSpeakingRef.current) return;
    try {
      sessionRef.current?.interrupt?.();
      avatarSpeakingRef.current = false;
      setAvatarSpeaking(false);
      setStatus("Interrupted — go ahead, I'm listening.");
    } catch {
      setStatus("Could not interrupt.");
    }
  };

  const handleMuteToggle = async () => {
    try {
      if (isMuted) await sessionRef.current?.voiceChat?.unmute?.();
      else await sessionRef.current?.voiceChat?.mute?.();
    } catch {
      setStatus("Microphone error.");
    }
  };

  const handleStop = async () => {
    try {
      await sessionRef.current?.stop?.();
    } catch {
      setStatus("Could not stop the session.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm dark:border-slate-800">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
        {overlay ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/85 px-6 text-center backdrop-blur-sm">
            <p className="text-sm font-medium text-slate-100">{overlay}</p>
          </div>
        ) : null}
        {isLive && !overlay ? (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleInterrupt}
          disabled={!avatarSpeaking}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Stop speaking
        </button>
        <button
          type="button"
          onClick={() => void handleMuteToggle()}
          disabled={!isLive}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {isMuted ? "Unmute mic" : "Mute mic"}
        </button>
        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={!isLive}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          End session
        </button>
        <p className="ml-auto text-sm text-slate-500 dark:text-slate-400">{status}</p>
      </div>
    </div>
  );
}
