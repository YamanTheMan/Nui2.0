"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import ChatPanel from "@/components/chat-panel";
import CitationsPanel, { citationKey, type Citation } from "@/components/citations-panel";
import LiveAvatarPanel from "@/components/live-avatar-panel";
import ProfilePanel from "@/components/profile-panel";
import {
  getServerSnapshot,
  getSnapshot,
  saveProfile,
  subscribe,
} from "@/lib/student/profile-store";

type Tab = "live" | "chat";

export default function Home() {
  const profile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [tab, setTab] = useState<Tab>("chat");
  const [citations, setCitations] = useState<Citation[]>([]);

  const addCitation = useCallback((citation: Citation) => {
    setCitations((current) => {
      const key = citationKey(citation);
      if (current.some((c) => citationKey(c) === key)) return current;
      return [citation, ...current];
    });
  }, []);

  const tabClass = (value: Tab) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition ${
      tab === value
        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    }`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          AskProfNui
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your teaching assistant for digital transformation at CMU-Q.
        </p>
      </header>

      <div className="mb-5 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" onClick={() => setTab("chat")} className={tabClass("chat")}>
          Text chat
        </button>
        <button type="button" onClick={() => setTab("live")} className={tabClass("live")}>
          Live avatar
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <section>
          {tab === "chat" ? (
            <ChatPanel profile={profile} />
          ) : (
            <LiveAvatarPanel profile={profile} onCitation={addCitation} />
          )}
        </section>

        <div className="flex flex-col gap-5">
          <ProfilePanel profile={profile} onSave={saveProfile} />
          <CitationsPanel citations={citations} />
        </div>
      </div>

      <footer className="mt-8 text-xs text-slate-400 dark:text-slate-500">
        Grades, extensions, or appeals go to{" "}
        <a className="underline" href="mailto:savanid@cmu.edu">
          savanid@cmu.edu
        </a>
        .
      </footer>
    </main>
  );
}
