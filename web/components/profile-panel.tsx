"use client";

import { useState } from "react";

import { firstName, type StudentProfile } from "@/lib/student/profile";

type Props = {
  profile: StudentProfile;
  onSave: (profile: StudentProfile) => void;
};

export default function ProfilePanel({ profile, onSave }: Props) {
  const [draft, setDraft] = useState<StudentProfile>(profile);
  const [saved, setSaved] = useState(false);

  // The stored profile arrives just after hydration, so re-seed the form when
  // it changes underneath us.
  const [seenProfile, setSeenProfile] = useState(profile);
  if (profile !== seenProfile) {
    setSeenProfile(profile);
    setDraft(profile);
  }

  const update = (key: keyof StudentProfile) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned: StudentProfile = {
      name: draft.name.trim(),
      major: draft.major.trim(),
      year: draft.year.trim(),
    };
    setDraft(cleaned);
    onSave(cleaned);
    setSaved(true);
  };

  const fieldClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-300";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your profile</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        So Prof Nui knows who she&apos;s talking to.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Name</span>
          <input
            className={fieldClass}
            value={draft.name}
            onChange={(e) => update("name")(e.target.value)}
            placeholder="e.g. Yaman"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Major</span>
          <input
            className={fieldClass}
            value={draft.major}
            onChange={(e) => update("major")(e.target.value)}
            placeholder="e.g. Information Systems"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Year</span>
          <input
            className={fieldClass}
            value={draft.year}
            onChange={(e) => update("year")(e.target.value)}
            placeholder="e.g. Junior"
          />
        </label>
      </div>

      <button
        type="submit"
        className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        Save profile
      </button>

      {saved && draft.name ? (
        <p className="mt-2 text-center text-xs text-emerald-600 dark:text-emerald-400">
          Saved — she&apos;ll call you {firstName(draft.name)}.
        </p>
      ) : null}
    </form>
  );
}
