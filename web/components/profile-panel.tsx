"use client";
import { useState } from "react";
import {
  normaliseAndrewEmail,
  normaliseGender,
  type StudentProfile,
} from "@/lib/student/profile";
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
  const [emailError, setEmailError] = useState(false);
  const [seen, setSeen] = useState(profile);
  if (profile !== seen) {
    setSeen(profile);
    setDraft(profile);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const email = normaliseAndrewEmail(draft.email);
        if (draft.email.trim() && !email) {
          setEmailError(true);
          return;
        }
        onSave({
          name: draft.name.trim(),
          major: draft.major.trim(),
          year: draft.year.trim(),
          gender: draft.gender,
          email,
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
      <label>
        In Arabic, address me as
        <select
          value={draft.gender}
          onChange={(e) => {
            setDraft({ ...draft, gender: normaliseGender(e.target.value) });
            setSaved(false);
          }}
        >
          <option value="">Not set: Nui 2.0 asks me</option>
          <option value="female">A female student (طالبة)</option>
          <option value="male">A male student (طالب)</option>
        </select>
        <span className="small muted">
          Arabic uses different words for men and women, so this only changes
          how Nui 2.0 speaks to you in Arabic. English is not affected.
        </span>
      </label>
      <label>
        Andrew email for session recaps
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={100}
          value={draft.email}
          placeholder="you@andrew.cmu.edu"
          aria-invalid={emailError}
          aria-describedby="recap-email-help"
          onChange={(e) => {
            setDraft({ ...draft, email: e.target.value });
            setSaved(false);
            setEmailError(false);
          }}
        />
        <span id="recap-email-help" className="small muted" role={emailError ? "alert" : undefined}>
          {emailError
            ? "Use your @andrew.cmu.edu address."
            : "After a live session, Nui 2.0 emails you a short recap and your next deadlines. Leave it empty if you share this device."}
        </span>
      </label>
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
