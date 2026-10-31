"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  firstName,
  normaliseAndrewEmail,
  questionProfile,
  type StudentGender,
  type StudentProfile,
} from "@/lib/student/profile";
import { sendRecap, TurnLog, useRecapEnabled } from "@/lib/recap/client";
import { LIVE_READY_MESSAGES, type LiveLanguage } from "@/lib/voice/language";
import { citationKey, type Citation } from "./citations-panel";
import Icon from "./ui-icon";

const LiveAvatarStage = dynamic(() => import("./live-avatar-stage"), {
  ssr: false,
});
type Voice = { id: string; name: string };
type SessionState = {
  sessionToken: string;
  openingMessage: string;
  language: LiveLanguage;
  gender: StudentGender;
  /** Where to send the recap when this session ends; empty for none. */
  recapTo: string;
};

// Arabic grammar differs for men and women. This choice applies to one session
// and defaults to the saved profile; leaving it unset makes Nui ask and explain.
const ADDRESS_OPTIONS: Array<[StudentGender, string]> = [
  ["", "تسألني نُوي في البداية"],
  ["female", "بصيغة المؤنث (طالبة)"],
  ["male", "بصيغة المذكر (طالب)"],
];
const ADDRESS_COPY = {
  legend: "كيف تخاطبك نُوي بالعربية؟",
  why: "تختلف الكلمات في العربية عند مخاطبة الطالب والطالبة، لذلك تستخدم نُوي هذا الاختيار فقط لتتحدث معك بالصيغة الصحيحة.",
  subtitles: "English subtitles appear on the video while Nui 2.0 speaks Arabic.",
} as const;
type Props = {
  profile: StudentProfile;
  onCitation: (citation: Citation) => void;
};
const COPY = {
  en: {
    eyebrow: "A LITTLE MORE PERSONAL",
    title: "Some things are easier out loud.",
    intro:
      "Start a voice conversation, ask your question, and take it one idea at a time.",
    language: "Choose your conversation language",
    start: "Start a conversation",
    connecting: "Connecting…",
    checking: "Checking live conversation availability…",
    unavailable:
      "Live conversations in English are currently unavailable. Please try again later.",
    availabilityError:
      "We couldn't check live conversation availability. Please try again.",
    retry: "Check again",
    startError: "Could not start the session. Please try again.",
    tip: "Allow microphone access when prompted. You can interrupt by speaking, mute your mic, or end the session at any time. Leaving this view ends the live session.",
    recapLabel: "Email me a recap (optional)",
    recapHelp:
      "When the session ends, Nui 2.0 emails a short recap and your next deadlines.",
    recapInvalid: "Use your @andrew.cmu.edu address, or leave it empty.",
    recapSending: "Sending your recap…",
    recapSent: "Recap sent to",
  },
  ar: {
    eyebrow: "لنتحدث معًا",
    title: "بعض الأفكار تتضح أكثر بالحوار.",
    intro:
      "ابدأ محادثة صوتية بالعربية الفصحى، واطرح سؤالك، ولنناقش الأفكار خطوة بخطوة.",
    language: "اختر لغة المحادثة",
    start: "ابدأ المحادثة",
    connecting: "جارٍ الاتصال…",
    checking: "جارٍ التحقق من إتاحة المحادثة المباشرة…",
    unavailable:
      "المحادثة بالعربية غير متاحة حاليًا. يمكنك اختيار الإنجليزية أو المحاولة لاحقًا.",
    availabilityError:
      "تعذر التحقق من إتاحة المحادثة المباشرة. يرجى المحاولة مرة أخرى.",
    retry: "تحقق مرة أخرى",
    startError: "تعذر بدء المحادثة بالعربية. يرجى المحاولة مرة أخرى.",
    tip: "اسمح باستخدام الميكروفون عند الطلب. يمكنك المقاطعة بالتحدث، أو كتم الميكروفون، أو إنهاء الجلسة في أي وقت. مغادرة هذه الصفحة تنهي الجلسة المباشرة.",
    recapLabel: "أرسل لي ملخصًا بالبريد (اختياري)",
    recapHelp:
      "عند انتهاء الجلسة، ترسل نُوي 2.0 ملخصًا قصيرًا ومواعيد التسليم القادمة إلى بريد Andrew.",
    recapInvalid: "استخدم بريدك @andrew.cmu.edu أو اترك الحقل فارغًا.",
    recapSending: "جارٍ إرسال الملخص…",
    recapSent: "تم إرسال الملخص إلى",
  },
} as const;

export default function LiveAvatarPanel(props: Props) {
  // A profile change owns a new session lifecycle without modifying saved profiles.
  return <LiveConversation key={JSON.stringify(props.profile)} {...props} />;
}

function LiveConversation({ profile, onCitation }: Props) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [language, setLanguage] = useState<LiveLanguage>("en");
  const [gender, setGender] = useState<StudentGender>(profile.gender);
  const recapEnabled = useRecapEnabled();
  // Per session and visible before starting, so a shared kiosk never
  // silently emails the previous student.
  const [recapEmail, setRecapEmail] = useState(profile.email);
  const [recapNote, setRecapNote] = useState<string | null>(null);
  const turns = useRef<TurnLog | null>(null);
  const [languages, setLanguages] = useState<Record<
    LiveLanguage,
    boolean
  > | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const copy = COPY[language];

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/voices", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data: { voices?: Voice[]; defaultVoiceId?: string }) => {
        if (controller.signal.aborted) return;
        setVoices(data.voices ?? []);
        setVoiceId(data.defaultVoiceId ?? "");
      })
      .catch(() => {});
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/live-session", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (
          typeof data.languages?.en !== "boolean" ||
          typeof data.languages?.ar !== "boolean"
        )
          throw new Error();
        if (!controller.signal.aborted) setLanguages(data.languages);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailabilityError(true);
      });
    return () => controller.abort();
  }, [availabilityAttempt]);

  const startSession = async () => {
    if (loading || !languages?.[language]) return;
    const recapTo = recapEnabled ? normaliseAndrewEmail(recapEmail) : "";
    if (recapEnabled && recapEmail.trim() && !recapTo) {
      setError(copy.recapInvalid);
      return;
    }
    setRecapNote(null);
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            ...questionProfile(profile),
            ...(language === "ar" ? { gender } : {}),
          },
          language,
          ...(language === "en" ? { voiceId } : {}),
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          language === "en" && typeof data.error === "string"
            ? data.error
            : copy.startError,
        );
      if (
        data.language !== language ||
        typeof data.sessionToken !== "string" ||
        !data.sessionToken ||
        typeof data.openingMessage !== "string" ||
        !data.openingMessage
      )
        throw new Error(copy.startError);
      if (!controller.signal.aborted)
        setSession({
          sessionToken: data.sessionToken,
          openingMessage: data.openingMessage,
          language,
          gender: language === "ar" ? gender : "",
          recapTo,
        });
      turns.current = new TurnLog(Object.values(LIVE_READY_MESSAGES));
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : copy.startError);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <div
      className="live-conversation"
      lang={language}
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      {session?.language === language ? (
        <LiveAvatarStage
          key={`${language}:${session.sessionToken}`}
          language={language}
          gender={session.gender}
          sessionToken={session.sessionToken}
          openingMessage={session.openingMessage}
          studentFirstName={firstName(profile.name)}
          onCitation={onCitation}
          onTurn={(turn) => turns.current?.add(turn)}
          onEnded={(reason) => {
            setSession(null);
            setError(reason || null);
            const said = turns.current?.list() ?? [];
            turns.current = null;
            if (!session.recapTo || !said.some((turn) => turn.role === "student")) return;
            const to = session.recapTo;
            setRecapNote(copy.recapSending);
            void sendRecap(to, profile.name, said).then((result) =>
              setRecapNote(result.sent ? `${copy.recapSent} ${to}` : result.error),
            );
          }}
        />
      ) : (
        <div className="live-welcome">
          <div className="voice-orb">
            <Icon name="voice" size={36} />
          </div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>
            {profile.name ? (
              language === "ar" ? (
                <>
                  أهلًا <bdi>{firstName(profile.name)}</bdi>، أنا هنا
                  لمساعدتك.{" "}
                </>
              ) : (
                `Ready when you are, ${firstName(profile.name)}. `
              )
            ) : null}
            {copy.intro}
          </p>
          <fieldset className="live-language-select" disabled={loading}>
            <legend>{copy.language}</legend>
            <div className="live-language-options" dir="ltr">
              {(["en", "ar"] as const).map((option) => (
                <label
                  key={option}
                  className={language === option ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="live-language"
                    value={option}
                    checked={language === option}
                    onChange={() => {
                      setLanguage(option);
                      setSession(null);
                      setError(null);
                    }}
                  />
                  <span lang={option} dir={option === "ar" ? "rtl" : "ltr"}>
                    {option === "en" ? "English" : "العربية الفصحى"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {language === "en" && voices.length > 0 ? (
            <label className="voice-select">
              Voice
              <select
                value={voiceId}
                disabled={loading}
                onChange={(e) => setVoiceId(e.target.value)}
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </label>
          ) : language === "ar" ? (
            <>
              <p className="live-language-voice">الصوت: نُوي · العربية الفصحى</p>
              <fieldset className="live-language-select live-address-select" disabled={loading}>
                <legend>{ADDRESS_COPY.legend}</legend>
                <div className="live-language-options">
                  {ADDRESS_OPTIONS.map(([value, label]) => (
                    <label key={value || "ask"} className={gender === value ? "selected" : ""}>
                      <input
                        type="radio"
                        name="live-address"
                        value={value}
                        checked={gender === value}
                        onChange={() => setGender(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="live-address-why">{ADDRESS_COPY.why}</p>
              </fieldset>
              <p className="live-subtitle-note" lang="en" dir="ltr">
                {ADDRESS_COPY.subtitles}
              </p>
            </>
          ) : null}
          {!languages && !availabilityError ? (
            <p role="status">{copy.checking}</p>
          ) : null}
          {languages && !languages[language] ? (
            <p role="status">{copy.unavailable}</p>
          ) : null}
          {availabilityError ? (
            <div className="live-availability-error">
              <p role="alert">{copy.availabilityError}</p>
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  setAvailabilityError(false);
                  setLanguages(null);
                  setAvailabilityAttempt((attempt) => attempt + 1);
                }}
              >
                {copy.retry}
              </button>
            </div>
          ) : null}
          {recapEnabled ? (
            <label className="live-recap-email">
              {copy.recapLabel}
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                maxLength={100}
                value={recapEmail}
                placeholder="you@andrew.cmu.edu"
                disabled={loading}
                onChange={(event) => {
                  setRecapEmail(event.target.value);
                  setError(null);
                }}
              />
              <span>{copy.recapHelp}</span>
            </label>
          ) : null}
          <button
            type="button"
            className="button primary"
            disabled={loading || !languages?.[language]}
            onClick={() => void startSession()}
          >
            <Icon name="voice" size={16} />
            {loading ? copy.connecting : copy.start}
            <Icon name="arrow" size={16} />
          </button>
          {error ? (
            <div className="error-note" role="alert">
              {error}
            </div>
          ) : null}
          {recapNote ? (
            <p className="live-recap-note" role="status">
              {recapNote}
            </p>
          ) : null}
        </div>
      )}
      <p className="voice-tip">
        <Icon name="voice" size={14} />
        <span>{copy.tip}</span>
      </p>
    </div>
  );
}
export { citationKey };
