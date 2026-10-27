import {
  elevenLabsDynamicVariables,
  firstName,
  sessionOpening,
  type StudentProfile,
} from "../student/profile";

export type LiveLanguage = "en" | "ar";

export function isLiveLanguage(value: unknown): value is LiveLanguage {
  return value === "en" || value === "ar";
}

// Profile fields are student input. Only a short, name-shaped first token is
// spoken in the Arabic opening; template/markup syntax never enters it.
function arabicGreetingName(name: string): string {
  const first = firstName(name);
  return /^[\p{L}\p{M}][\p{L}\p{M}'’\-]{0,39}$/u.test(first) ? first : "";
}

function arabicProfileLabel(value: string, fallback: string): string {
  const label = value
    .replace(/[^\p{L}\p{M}\p{N}\s.'’\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return label || fallback;
}

export function liveSessionOpening(profile: StudentProfile, language: LiveLanguage = "en"): string {
  if (language === "en") return sessionOpening(profile);
  const name = arabicGreetingName(profile.name);
  return `مرحبًا${name ? ` ${name}` : ""}، أنا نوي 2.0. كيف يمكنني مساعدتك اليوم في مادة التحول الرقمي؟`;
}

export function liveDynamicVariables(
  profile: StudentProfile,
  language: LiveLanguage = "en",
): Record<string, string> {
  if (language === "en") return elevenLabsDynamicVariables(profile);
  return {
    student_name: arabicGreetingName(profile.name) || "صديقنا الطالب",
    student_major: arabicProfileLabel(profile.major, "غير محدد"),
    student_year: arabicProfileLabel(profile.year, "غير محدد"),
    session_opening: liveSessionOpening(profile, language),
    session_language: "العربية الفصحى",
  };
}
