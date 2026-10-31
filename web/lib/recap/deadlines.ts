/**
 * Fall 2026 due dates, as stated in D14 (syllabus and Canvas Due Date page).
 * Recap emails compute "days left" from these instead of asking a model.
 * A test checks every date here still appears in D14.
 */
export type Deadline = { title: string; due: string; d14: string };

export const DEADLINES: readonly Deadline[] = [
  { title: "Assignment 1 slides (cultural frameworks)", due: "2026-10-01T23:59:00+03:00", d14: "October 1, 2026" },
  { title: "Assignment 2 slides (IT adoption frameworks)", due: "2026-10-29T23:59:00+03:00", d14: "October 29, 2026" },
  { title: "Final project report", due: "2026-11-23T23:59:00+03:00", d14: "November 23, 2026" },
  { title: "Self-reflective essay (500 words)", due: "2026-11-30T23:59:00+03:00", d14: "November 30, 2026" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deadlines that have not passed, soonest first. */
export function upcomingDeadlines(now = new Date(), limit = 2): Deadline[] {
  return DEADLINES.filter((deadline) => new Date(deadline.due).getTime() > now.getTime()).slice(0, limit);
}

function qatarDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(date);
}

/** e.g. "Mon 23 Nov, 11:59 p.m. (23 days left)", counted in Qatar calendar days. */
export function dueLabel(deadline: Deadline, now = new Date()): string {
  const due = new Date(deadline.due);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(due);
  const days = Math.round(
    (new Date(`${qatarDay(due)}T00:00:00Z`).getTime() - new Date(`${qatarDay(now)}T00:00:00Z`).getTime()) / DAY_MS,
  );
  const left = days === 0 ? "due today" : days === 1 ? "due tomorrow" : `${days} days left`;
  return `${day}, 11:59 p.m. (${left})`;
}
