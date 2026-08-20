export type StudentProfile = {
  name: string;
  major: string;
  year: string;
};

export const EMPTY_PROFILE: StudentProfile = { name: "", major: "", year: "" };

export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

/** Warm opener used for the live voice session and the text chat welcome. */
export function sessionOpening({ name, major, year }: StudentProfile): string {
  const first = firstName(name);
  const trimmedMajor = major.trim();
  const trimmedYear = year.trim();

  if (first && trimmedYear && trimmedMajor) {
    return (
      `Hi ${first}, how are you? I'm AskProfNui. ` +
      `I see you're a ${trimmedYear} studying ${trimmedMajor} — nice to meet you. ` +
      `What can I help you with today for digital transformation?`
    );
  }
  if (first && trimmedMajor) {
    return (
      `Hi ${first}, how are you? I'm AskProfNui. ` +
      `You're in ${trimmedMajor}, right? What can I help you with today?`
    );
  }
  if (first) {
    return (
      `Hi ${first}, how are you? I'm AskProfNui. ` +
      `What can I help you with today — anything on digital transformation?`
    );
  }
  return (
    "Hi, how are you? I'm AskProfNui. " +
    "What can I help you with today for digital transformation?"
  );
}

export function elevenLabsDynamicVariables(profile: StudentProfile): Record<string, string> {
  return {
    student_name: firstName(profile.name) || "there",
    student_major: profile.major.trim() || "your major",
    student_year: profile.year.trim() || "your year",
    session_opening: sessionOpening(profile),
  };
}
