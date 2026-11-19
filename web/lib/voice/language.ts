import {
  addressName,
  elevenLabsDynamicVariables,
  sessionOpening,
  spokenText,
  type StudentGender,
  type StudentProfile,
} from "../student/profile";

export type LiveLanguage = "en" | "ar";

/** Sent on the student's behalf to start the greeting. Not something they said. */
export const LIVE_READY_MESSAGES: Record<LiveLanguage, string> = {
  en: "Hi, I'm ready for your greeting.",
  ar: "مرحبًا، أنا مستعد لبدء المحادثة بالعربية الفصحى.",
};

export function isLiveLanguage(value: unknown): value is LiveLanguage {
  return value === "en" || value === "ar";
}

// Profile fields are student input. Only a short, name-shaped first token is
// spoken in the Arabic opening; template/markup syntax never enters it.
function arabicGreetingName(name: string): string {
  const first = addressName(name);
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

export const ARABIC_SPOKEN_NAME = "نُوِي تو بوينت أو";

export function liveSessionOpening(profile: StudentProfile, language: LiveLanguage = "en"): string {
  if (language === "en") return spokenText(sessionOpening(profile));
  const name = arabicGreetingName(profile.name);
  // Spelled as it should sound: "nooey", then "two point O" as in the letter.
  const hello = `مرحبًا${name ? ` ${name}` : ""}، أنا ${ARABIC_SPOKEN_NAME}.`;
  if (profile.gender) return `${hello} ${arabicHelpQuestion(profile.gender)}`;
  // Without a stated preference, ask and say why rather than guess from a name or voice.
  return `${hello} قبل أن نبدأ، سؤال سريع: في العربية تختلف صيغة الكلام عند مخاطبة الطالب والطالبة، ` +
    "وأودّ أن أخاطبك بالصيغة الصحيحة. هل أخاطبك بصيغة الطالب أم الطالبة؟";
}

/**
 * "How can I help you?" for one gender. The voice ignores vowel marks such as
 * مساعدتكَ / مساعدتكِ and tends to say the feminine one, so the gender is
 * carried by letters it cannot miss: تودّ / تودّين, تسأل / تسألي.
 */
export function arabicHelpQuestion(gender: Exclude<StudentGender, "">): string {
  return gender === "female"
    ? "ما الذي تودّين أن تسألي عنه اليوم في مادة التحول الرقمي؟"
    : "ما الذي تودّ أن تسأل عنه اليوم في مادة التحول الرقمي؟";
}

/** Session note for the Arabic agent: which grammatical form to use for the student. */
export function arabicAddressNote(gender: Exclude<StudentGender, "">): string {
  return gender === "female"
    ? "صيغة المخاطبة: الطالبة أنثى. خاطبها بصيغة المؤنث طوال هذه الجلسة (أنتِ، تريدين، تستطيعين، تودّين) ولا تسألها عن ذلك مرة أخرى. " +
        "الصوت لا ينطق الحركات، فلا تعتمد على كسرة الكاف وحدها: فضّل الأفعال التي يظهر فيها التأنيث في الحروف (تريدين، تستطيعين، يمكنكِ أن تسألي)."
    : "صيغة المخاطبة: الطالب ذكر. خاطبه بصيغة المذكر طوال هذه الجلسة (أنتَ، تريد، تستطيع، تودّ) ولا تسأله عن ذلك مرة أخرى. " +
        "لا تستخدم صيغة المؤنث معه أبدًا. الصوت لا ينطق الحركات، فلا تعتمد على فتحة الكاف وحدها: فضّل الأفعال التي يظهر فيها التذكير في الحروف (تريد، تستطيع، تودّ أن تسأل).";
}

/** What the agent does right after its opening line. */
export function arabicGreetingFollowUp(gender: StudentGender): string {
  if (gender) return `ثم انتظر سؤال الطالب. تحدث بالعربية الفصحى طوال هذه الجلسة. ${arabicAddressNote(gender)}`;
  return "التحية تتضمن سؤالًا عن صيغة المخاطبة. انتظر الإجابة، ثم استخدم الصيغة التي يختارها الطالب " +
    "(المذكر أو المؤنث) طوال الجلسة دون أن تكرر السؤال. إذا اختار صيغة الطالب فقل: " +
    `«${arabicHelpQuestion("male")}» وإذا اختارت صيغة الطالبة فقل: «${arabicHelpQuestion("female")}». ` +
    "لا تفترض الجنس من الاسم أو الصوت. تحدث بالعربية الفصحى طوال هذه الجلسة.";
}

const FEMALE_ANSWER = /طالبة|مؤنث|المؤنث|أنثى|بنت|فتاة|سيدة|امرأة|\bfemale\b|\bgirl\b|\bwoman\b|\bshe\b/i;
const MALE_ANSWER = /طالب(?!ة)|مذكر|المذكر|ذكر(?!ى)|ولد|شاب|رجل|\bmale\b|\bboy\b|\bman\b|\bhe\b/i;

/** Reads the student's spoken answer to the opening question. Ambiguous answers return null. */
export function detectArabicAddressAnswer(text: string): Exclude<StudentGender, ""> | null {
  const female = FEMALE_ANSWER.test(text);
  // "طالبة" contains "طالب" and "female" contains "male", so test the male form on what remains.
  const male = MALE_ANSWER.test(text.replace(new RegExp(FEMALE_ANSWER.source, "gi"), " "));
  if (female === male) return null;
  return female ? "female" : "male";
}

export function liveDynamicVariables(
  profile: StudentProfile,
  language: LiveLanguage = "en",
): Record<string, string> {
  if (language === "en") return elevenLabsDynamicVariables(profile);
  return {
    student_name: arabicGreetingName(profile.name) || "غير محدد",
    student_major: arabicProfileLabel(profile.major, "غير محدد"),
    student_year: arabicProfileLabel(profile.year, "غير محدد"),
    session_opening: liveSessionOpening(profile, language),
    session_language: "العربية الفصحى",
  };
}
