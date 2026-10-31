/** The course runs in Qatar, so "today" for a deadline is the calendar date in Doha. */
const ZONE = "Asia/Qatar";

export function qatarDateKey(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(now);
}

export function qatarDateLabel(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}

export function todayBlock(now = new Date()): string {
  return `TODAY'S DATE: ${qatarDateLabel(now)} (Qatar time).
Use it whenever a question involves a deadline, a presentation day or "this week". Say plainly when a
deadline has already passed, and never describe a passed date as upcoming. Count days only from this date.`;
}
