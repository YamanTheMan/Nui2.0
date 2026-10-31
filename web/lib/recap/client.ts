"use client";

import { useEffect, useState } from "react";

import type { RecapTurn } from "./summarize";

/** Whether the server can send recaps. False until it answers, and on any error. */
export function useRecapEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/recap", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { enabled?: unknown } | null) => {
        if (!controller.signal.aborted) setEnabled(data?.enabled === true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return enabled;
}

export type RecapResult = { sent: true } | { sent: false; error: string };

export async function sendRecap(email: string, name: string, turns: RecapTurn[]): Promise<RecapResult> {
  try {
    const response = await fetch("/api/recap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, turns }),
      // A recap sent as a session ends must survive the view changing.
      keepalive: JSON.stringify(turns).length < 60_000,
    });
    const data = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (response.ok) return { sent: true };
    return { sent: false, error: typeof data.error === "string" ? data.error : "We couldn't send your recap." };
  } catch {
    return { sent: false, error: "We couldn't send your recap. Check your connection." };
  }
}

/** Collects a session's turns, ignoring the same text reported by more than one event. */
export class TurnLog {
  private readonly turns: RecapTurn[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly ignore: readonly string[] = []) {}

  add(turn: RecapTurn): void {
    const text = turn.text.trim();
    const key = `${turn.role}:${text.replace(/[ً-ْٰ\s\p{P}]/gu, "").toLowerCase()}`;
    if (!text || this.ignore.includes(text) || this.seen.has(key)) return;
    this.seen.add(key);
    this.turns.push({ role: turn.role, text });
  }

  list(): RecapTurn[] {
    return [...this.turns];
  }
}
