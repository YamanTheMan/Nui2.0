"use client";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { firstName, questionProfile, type StudentProfile } from "@/lib/student/profile";
import { useRecapEnabled } from "@/lib/recap/client";
import type { RecapTurn } from "@/lib/recap/summarize";
import { sourceTitle } from "@/lib/course-catalog";
import EmailDraftCard, { type EmailOffer } from "./email-draft-card";
import type { Citation, CourseSource } from "./citations-panel";
import MessageText from "./message-text";
import Icon, { BrandMark, type IconName } from "./ui-icon";
import RecapEmailButton from "./recap-email-button";

const STARTERS: Record<
  string,
  { icon: IconName; title: string; description: string; question: string }[]
> = {
  "Get started": [
    {
      icon: "globe",
      title: "Find your starting point",
      description: "Assignment 1, step by step.",
      question:
        "Walk me through Assignment 1. What country can I choose and what do I need to submit?",
    },
    {
      icon: "layers",
      title: "Connect the concepts",
      description: "TAM, UTAUT, and beyond.",
      question:
        "Compare TAM and UTAUT with a simple technology adoption example.",
    },
    {
      icon: "spark",
      title: "Go for the wow factor",
      description: "What makes strong work stand out.",
      question: "What does the wow factor mean, and how can I improve my work?",
    },
  ],
  "Study together": [
    {
      icon: "target",
      title: "Test your understanding",
      description: "One question at a time, with feedback.",
      question:
        "Quiz me on the Information Systems Strategy Triangle. Ask one question at a time and wait for my answer.",
    },
    {
      icon: "globe",
      title: "Culture, made clearer",
      description: "Explore how culture shapes adoption.",
      question:
        "Explain Hofstede's cultural dimensions in our course and give a technology adoption example.",
    },
    {
      icon: "layers",
      title: "Put theory to work",
      description: "Apply an idea to a concrete example.",
      question:
        "Help me practice applying Porter's Five Forces to a business example. Guide me without doing my assignment.",
    },
  ],
  "Course essentials": [
    {
      icon: "book",
      title: "Know the ground rules",
      description: "Late work, attendance, and the dance policy.",
      question:
        "What is the late submission policy, and how does the dance policy work?",
    },
    {
      icon: "target",
      title: "Plan the final project",
      description: "Scope, structure, and submission requirements.",
      question:
        "What are the steps, word count, and submission requirements for the final project?",
    },
    {
      icon: "layers",
      title: "See how it adds up",
      description: "Understand your course assessment weights.",
      question: "What is the grade distribution for this course?",
    },
  ],
};

function sourcesFrom(
  parts: { type: string; [key: string]: unknown }[],
): CourseSource[] {
  const data = parts.find((part) => part.type === "data-sources")?.data;
  return Array.isArray(data)
    ? data.filter(
        (item): item is CourseSource =>
          item &&
          typeof item.source === "string" &&
          typeof item.text === "string",
      )
    : [];
}
function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      className="message-action"
      aria-label={copied ? "Answer copied" : "Copy answer"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setFailed(false);
        } catch {
          setFailed(true);
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {failed ? "Select text to copy" : copied ? "Copied" : "Copy"}
    </button>
  );
}

type Props = {
  profile: StudentProfile;
  input: string;
  setInput: (text: string) => void;
  onReset: () => void;
  onSources: (sources: Citation[]) => void;
  onShowSources: () => void;
  onLibrary: () => void;
};
export default function ChatPanel({
  profile,
  input,
  setInput,
  onReset,
  onSources,
  onShowSources,
  onLibrary,
}: Props) {
  const { messages, sendMessage, status, error, stop, regenerate, clearError } =
    useChat();
  const [category, setCategory] = useState("Get started");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const busy = status === "streaming" || status === "submitted";
  // The recap address never travels with a question.
  const askingProfile = useMemo(() => questionProfile(profile), [profile]);
  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );
  const ended = messages.some((message) =>
    message.parts.some((part) => part.type === "data-session-end"),
  );
  const latestSources = useMemo(() => {
    const lastAnswer = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    return lastAnswer ? sourcesFrom(lastAnswer.parts) : [];
  }, [messages]);
  useEffect(() => {
    onSources(
      latestSources.map((source) => ({
        source: source.source,
        quote: source.text,
        section: source.section,
      })),
    );
  }, [latestSources, onSources]);
  useEffect(() => {
    if (messages.length > 0 && following.current)
      bottom.current?.scrollIntoView({
        behavior: status === "streaming" ? "auto" : "smooth",
        block: "end",
      });
  }, [messages, status]);
  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = "auto";
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 160)}px`;
    }
  }, [input]);
  useEffect(() => {
    const track = () => {
      following.current =
        document.documentElement.scrollHeight -
          window.innerHeight -
          window.scrollY <
        250;
    };
    window.addEventListener("scroll", track, { passive: true });
    return () => window.removeEventListener("scroll", track);
  }, []);
  const submit = (text: string) => {
    if (!text.trim() || busy || ended) return;
    following.current = true;
    clearError();
    void sendMessage({ text: text.trim() }, { body: { profile: askingProfile } }).catch(
      () => {},
    );
    setInput("");
  };
  const retry = () => {
    clearError();
    following.current = true;
    void regenerate({ body: { profile: askingProfile } }).catch(() => {});
  };
  const hasMessages = messages.length > 0;
  const recapEnabled = useRecapEnabled();
  const recapTurns = (): RecapTurn[] =>
    messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role === "user" ? ("student" as const) : ("nui" as const),
        text: message.parts
          .map((part) => (part.type === "text" ? part.text : ""))
          .join(" ")
          .trim(),
      }))
      .filter((turn) => turn.text);
  return (
    <section
      className={`chat-view view-enter ${hasMessages ? "has-conversation" : ""}`}
    >
      {!hasMessages ? (
        <>
          <div className="welcome-heading">
            <h1>
              {profile.name ? (
                <>
                  Hi {firstName(profile.name)}.<br />
                  What&apos;s on your mind?
                </>
              ) : (
                <>
                  Big ideas.
                  <br />
                  <em>Let&apos;s make them click.</em>
                </>
              )}
            </h1>
            <p>
              Ask a question or find a place to start.
            </p>
          </div>
          <div className="welcome-feature">
            <div className="feature-copy">
              <h2>Your course, together.</h2>
              <p>Class updates, assignments, and key concepts.</p>
              <button className="feature-link" onClick={onLibrary}>
                Explore your course <Icon name="arrow" size={20} />
              </button>
            </div>
            <div className="concept-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit orbit-three" />
              <span className="art-center">
                n<span>✳</span>
              </span>
              <span className="concept-label concept-people">
                <i />
                People
              </span>
              <span className="concept-label concept-strategy">
                <i />
                Strategy
              </span>
              <span className="concept-label concept-technology">
                <i />
                Technology
              </span>
              <span className="art-star">✳</span>
              <span className="art-dot" />
            </div>
          </div>
          <div className="starter-heading">
            <h2>A good place to begin</h2>
          </div>
          <div className="starter-tabs" aria-label="Question categories">
            {Object.keys(STARTERS).map((item) => (
              <button
                key={item}
                aria-pressed={category === item}
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="starter-grid">
            {STARTERS[category].map((starter, i) => (
              <button
                key={starter.title}
                className="starter-card"
                onClick={() => submit(starter.question)}
              >
                <span className={`tile-icon tone-${i}`}>
                  <Icon name={starter.icon} size={20} />
                </span>
                <h3>{starter.title}</h3>
                <p>{starter.description}</p>
                <Icon name="arrow" className="starter-arrow" size={17} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="conversation-heading">
            <div>
              <span className="eyebrow">A LITTLE CLARITY, TOGETHER</span>
              <h1>Let&apos;s think it through.</h1>
            </div>
            <button className="button secondary" onClick={onShowSources}>
              <Icon name="book" size={16} />
              Sources{" "}
              {latestSources.length > 0 && (
                <span className="count-badge">{latestSources.length}</span>
              )}
            </button>
          </div>
          <div
            className="messages"
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.map((message) => {
              const text = message.parts
                .filter(
                  (part): part is { type: "text"; text: string } =>
                    part.type === "text",
                )
                .map((part) => part.text)
                .join("");
              const user = message.role === "user";
              const offer = message.parts.find(
                (
                  part,
                ): part is { type: "data-email-offer"; data: EmailOffer } =>
                  part.type === "data-email-offer",
              )?.data;
              const sources = sourcesFrom(message.parts);
              const incomplete = message.parts.some(
                (part) => part.type === "data-answer-status",
              );
              if (!text && !incomplete) return null;
              return (
                <article
                  key={message.id}
                  className={`message ${user ? "message-user" : "message-assistant"}`}
                >
                  {!user && <BrandMark small />}
                  <div className="message-content">
                    <span className="message-label">
                      {user ? firstName(profile.name) || "You" : "Prof Nui"}
                      {!user && <span>AI COURSE COMPANION</span>}
                    </span>
                    <div className="message-body">
                      <MessageText text={text} />
                    </div>
                    {offer && (
                      <EmailDraftCard offer={offer} profile={profile} />
                    )}
                    {!user && sources.length > 0 && (
                      <details className="message-sources">
                        <summary>
                          <Icon name="book" size={13} />
                          {
                            new Set(sources.map((source) => source.source)).size
                          }{" "}
                          course{" "}
                          {new Set(sources.map((source) => source.source))
                            .size === 1
                            ? "source"
                            : "sources"}{" "}
                          consulted
                          <Icon name="chevron" size={12} />
                        </summary>
                        <div>
                          {sources.map((source, index) => (
                            <details key={index}>
                              <summary>
                                {sourceTitle(source.source)}
                                {source.section && (
                                  <span> · {source.section}</span>
                                )}
                              </summary>
                              <p>{source.text}</p>
                            </details>
                          ))}
                        </div>
                      </details>
                    )}
                    {!user && !busy && <CopyAnswer text={text} />}
                    {incomplete && (
                      <p className="error-note">
                        This answer could not be completed.{" "}
                        {message.id === messages.at(-1)?.id && (
                          <button
                            disabled={busy}
                            onClick={retry}
                            className="text-button"
                          >
                            Try again
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
            {status === "submitted" && (
              <div className="thinking" role="status">
                <BrandMark small />
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <p>Thinking it through…</p>
              </div>
            )}
          </div>
        </>
      )}
      {error && (
        <div className="error-note" role="alert">
          <span>
            We couldn&apos;t finish that reply. Please try again. If your
            session has expired, sign in again.
          </span>
          <button className="text-button" onClick={retry}>
            <Icon name="refresh" size={14} />
            Retry
          </button>
        </div>
      )}
      <div ref={bottom} className="composer-wrap">
        {ended ? (
          <div className="session-ended">
            <p>
              This conversation has ended. You can start a fresh one when
              you&apos;re ready.
            </p>
            <button className="button primary" onClick={onReset}>
              <Icon name="plus" size={16} />
              New conversation
            </button>
          </div>
        ) : (
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
          >
            <label className="sr-only" htmlFor="chat-question">
              Your question for Prof Nui
            </label>
            <textarea
              ref={textarea}
              id="chat-question"
              value={input}
              maxLength={6000}
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit(input);
                }
              }}
              placeholder="What would you like to understand?"
            />
            <div className="composer-bottom">
              {busy ? (
                <button
                  type="button"
                  className="send-button"
                  onClick={() => void stop()}
                  aria-label="Stop generating"
                >
                  <Icon name="stop" size={18} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="send-button"
                  disabled={!input.trim()}
                  aria-label="Send question"
                >
                  <Icon name="send" size={19} />
                </button>
              )}
            </div>
          </form>
        )}
        <div className="composer-hint">
          <span>
            <Icon name="book" size={12} /> Grounded in your course materials
          </span>
          {recapEnabled && hasMessages ? (
            <RecapEmailButton profile={profile} turns={recapTurns} />
          ) : null}
          <span>
            Enter to send <b>·</b> Shift + Enter for a new line
          </span>
        </div>
      </div>
    </section>
  );
}
