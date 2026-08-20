"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";

import { sessionOpening, type StudentProfile } from "@/lib/student/profile";
import EmailDraftCard, { type EmailOffer } from "./email-draft-card";
import MessageText from "./message-text";

const SUGGESTIONS = [
  "What country should I choose for Assignment 1?",
  "What's the late policy?",
  "How do I get an A?",
  "What's the grade distribution?",
];

export default function ChatPanel({ profile }: { profile: StudentProfile }) {
  const { messages, sendMessage, setMessages, status, error } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isBusy = status === "streaming" || status === "submitted";

  // She ends the conversation after repeated grade begging. Once that happens
  // the composer closes, the same way a real office-hours door would.
  const sessionEnded = messages.some((message) =>
    message.parts.some((part) => part.type === "data-session-end"),
  );

  const startOver = () => {
    setMessages([]);
    setInput("");
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy || sessionEnded) return;
    void sendMessage({ text: trimmed }, { body: { profile } });
    setInput("");
  };

  return (
    <div className="flex h-[560px] flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">
            <MessageText text={sessionOpening(profile)} />
          </div>

          {messages.map((message) => {
            const text = message.parts
              .filter((part): part is { type: "text"; text: string } => part.type === "text")
              .map((part) => part.text)
              .join("");
            if (!text) return null;

            const isUser = message.role === "user";
            const emailOffer = message.parts.find(
              (part): part is { type: "data-email-offer"; data: EmailOffer } =>
                part.type === "data-email-offer",
            )?.data;

            return (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  isUser
                    ? "ml-auto rounded-tr-sm bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "rounded-tl-sm bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                <MessageText text={text} />
                {emailOffer ? <EmailDraftCard offer={emailOffer} profile={profile} /> : null}
              </div>
            );
          })}

          {status === "submitted" ? (
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 dark:bg-slate-800">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              </span>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              Something went wrong. Check that GROQ_API_KEY is set, then try again.
            </p>
          ) : null}
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => submit(suggestion)}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {sessionEnded ? (
        <div className="flex items-center gap-3 border-t border-slate-200 p-3 dark:border-slate-800">
          <p className="flex-1 text-sm text-slate-500 dark:text-slate-400">
            AskProfNui ended this conversation.
          </p>
          <button
            type="button"
            onClick={startOver}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Start over
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about assignments, frameworks, the wow factor…"
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-300"
          />
          <button
            type="submit"
            disabled={isBusy || input.trim().length === 0}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
