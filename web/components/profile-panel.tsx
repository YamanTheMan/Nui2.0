"use client";
import { useState } from "react";
import type { StudentProfile } from "@/lib/student/profile";
import Icon from "./ui-icon";

export default function ProfilePanel({
  profile,
  onSave,
}: {
  profile: StudentProfile;
  onSave: (profile: StudentProfile) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [seen, setSeen] = useState(profile);
  if (profile !== seen) {
    setSeen(profile);
    setDraft(profile);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          name: draft.name.trim(),
          major: draft.major.trim(),
          year: draft.year.trim(),
        });
        setSaved(true);
      }}
      className="profile-form"
    >
      <div className="profile-avatar">
        <Icon name="user" size={26} />
      </div>
      <h2>Make yourself at home.</h2>
      <p className="muted">
        A little context helps Prof Nui tailor the conversation to you.
        Everything here is optional.
      </p>
      {(
        [
          ["name", "Your name", "What should we call you?"],
          ["major", "Major", "e.g. Information Systems"],
          ["year", "Year of study", "e.g. Junior"],
        ] as const
      ).map(([key, label, placeholder]) => (
        <label key={key}>
          {label}
          <input
            maxLength={100}
            value={draft[key]}
            placeholder={placeholder}
            onChange={(e) => {
              setDraft({ ...draft, [key]: e.target.value });
              setSaved(false);
            }}
          />
        </label>
      ))}
      <button type="submit" className="button primary">
        <Icon name={saved ? "check" : "user"} size={16} />
        {saved ? "Profile saved" : "Save profile"}
      </button>
      <p className="small muted" role="status">
        {saved
          ? "Your profile is ready for your next question."
          : "Saved in this browser. Included with your questions for context."}
      </p>
    </form>
  );
}
