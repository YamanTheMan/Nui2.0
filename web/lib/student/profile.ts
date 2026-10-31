/**
 * Arabic addresses men and women with different word forms. This is only used to
 * speak Arabic correctly; English never reads it. Empty means "ask the student".
 */
export type StudentGender = "" | "female" | "male";

export type StudentProfile = {
  name: string;
  major: string;
  year: string;
  gender: StudentGender;
  /** Andrew email for session recaps. Never sent with chat questions. */
  email: string;
};

export const EMPTY_PROFILE: StudentProfile = { name: "", major: "", year: "", gender: "", email: "" };

const ANDREW_EMAIL = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@andrew\.cmu\.edu$/;

/** The profile as sent with a question or live session: never the recap address. */
export function questionProfile({ name, major, year, gender }: StudentProfile): Omit<StudentProfile, "email"> {
  return { name, major, year, gender };
}

/** Lower-cased Andrew address, or "" when the value is not one. */
export function normaliseAndrewEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  return ANDREW_EMAIL.test(email) ? email : "";
}

export function normaliseGender(value: unknown): StudentGender {
  return value === "female" || value === "male" ? value : "";
}

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
      `Hi ${first}, how are you? I'm Nui 2.0. ` +
      `I see you're a ${trimmedYear} studying ${trimmedMajor} — nice to meet you. ` +
      `What can I help you with today for digital transformation?`
    );
  }
  if (first && trimmedMajor) {
    return (
      `Hi ${first}, how are you? I'm Nui 2.0. ` +
      `You're in ${trimmedMajor}, right? What can I help you with today?`
    );
  }
  if (first) {
    return (
      `Hi ${first}, how are you? I'm Nui 2.0. ` +
      `What can I help you with today — anything on digital transformation?`
    );
  }
  return (
    "Hi, how are you? I'm Nui 2.0. " +
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
