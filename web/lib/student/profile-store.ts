/**
 * Reads the saved student profile from localStorage in an SSR-safe way.
 *
 * Backed by useSyncExternalStore, so the server render and the hydration render
 * agree on an empty profile and the stored value is applied immediately after.
 * Snapshots are cached because useSyncExternalStore requires a stable reference.
 */

import { EMPTY_PROFILE, normaliseAndrewEmail, normaliseGender, type StudentProfile } from "./profile";

const STORAGE_KEY = "askprofnui.profile";

let cachedRaw: string | null = null;
let cachedProfile: StudentProfile = EMPTY_PROFILE;
let memoryOnly = false;

const listeners = new Set<() => void>();

function parse(raw: string | null): StudentProfile {
  if (!raw) return EMPTY_PROFILE;
  try {
    return normalise(JSON.parse(raw));
  } catch {
    return EMPTY_PROFILE;
  }
}

function normalise(input: unknown): StudentProfile {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return EMPTY_PROFILE;
  const raw = input as Record<string, unknown>;
  const field = (value: unknown) =>
    typeof value === "string"
      ? value
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120)
      : "";
  return {
    name: field(raw.name),
    major: field(raw.major),
    year: field(raw.year),
    gender: normaliseGender(raw.gender),
    email: normaliseAndrewEmail(raw.email),
  };
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getSnapshot(): StudentProfile {
  // A failed write must not let an older stored value replace the user's edit.
  if (memoryOnly) return cachedProfile;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedProfile;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedProfile = parse(raw);
  }
  return cachedProfile;
}

export function getServerSnapshot(): StudentProfile {
  return EMPTY_PROFILE;
}

export function saveProfile(profile: StudentProfile): void {
  cachedProfile = normalise(profile);
  cachedRaw = JSON.stringify(cachedProfile);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
    memoryOnly = false;
  } catch {
    // storage may be unavailable; the value still applies for this session
    memoryOnly = true;
  }
  for (const listener of listeners) listener();
}
