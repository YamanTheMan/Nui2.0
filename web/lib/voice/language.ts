import {
  elevenLabsDynamicVariables,
  firstName,
  sessionOpening,
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
  const hello = `مرحبًا${name ? ` ${name}` : ""}، أنا نوي 2.0.`;
  // The diacritic tells the voice which form to pronounce.
  if (profile.gender === "female") return `${hello} كيف يمكنني مساعدتكِ اليوم في مادة التحول الرقمي؟`;
  if (profile.gender === "male") return `${hello} كيف يمكنني مساعدتكَ اليوم في مادة التحول الرقمي؟`;
  // Without a stated preference, ask and say why rather than guess from a name or voice.
  return `${hello} قبل أن نبدأ، سؤال سريع: في العربية تختلف صيغة الكلام عند مخاطبة الطالب والطالبة، ` +
    "وأودّ أن أخاطبك بالصيغة الصحيحة. هل أخاطبك بصيغة الطالب أم الطالبة؟";
}

/** Session note for the Arabic agent: which grammatical form to use for the student. */
export function arabicAddressNote(gender: Exclude<StudentGender, "">): string {
  return gender === "female"
    ? "صيغة المخاطبة: الطالبة أنثى. خاطبها بصيغة المؤنث طوال هذه الجلسة (أنتِ، يمكنكِ، تستطيعين، سؤالكِ) ولا تسألها عن ذلك مرة أخرى."
    : "صيغة المخاطبة: الطالب ذكر. خاطبه بصيغة المذكر طوال هذه الجلسة (أنتَ، يمكنكَ، تستطيع، سؤالكَ) ولا تسأله عن ذلك مرة أخرى.";
}

/** What the agent does right after its opening line. */
export function arabicGreetingFollowUp(gender: StudentGender): string {
  if (gender) return `ثم انتظر سؤال الطالب. تحدث بالعربية الفصحى طوال هذه الجلسة. ${arabicAddressNote(gender)}`;
  return "التحية تتضمن سؤالًا عن صيغة المخاطبة. انتظر الإجابة، ثم استخدم الصيغة التي يختارها الطالب " +
    "(المذكر أو المؤنث) طوال الجلسة دون أن تكرر السؤال، ثم اسأل كيف يمكنك المساعدة في مادة التحول الرقمي. " +
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
    student_name: arabicGreetingName(profile.name) || "صديقنا الطالب",
    student_major: arabicProfileLabel(profile.major, "غير محدد"),
    student_year: arabicProfileLabel(profile.year, "غير محدد"),
    session_opening: liveSessionOpening(profile, language),
    session_language: "العربية الفصحى",
  };
}
