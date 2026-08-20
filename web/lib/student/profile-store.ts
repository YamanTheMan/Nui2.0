/**
 * Reads the saved student profile from localStorage in an SSR-safe way.
 *
 * Backed by useSyncExternalStore, so the server render and the hydration render
 * agree on an empty profile and the stored value is applied immediately after.
 * Snapshots are cached because useSyncExternalStore requires a stable reference.
 */

import { EMPTY_PROFILE, type StudentProfile } from "./profile";

const STORAGE_KEY = "askprofnui.profile";

let cachedRaw: string | null = null;
let cachedProfile: StudentProfile = EMPTY_PROFILE;

const listeners = new Set<() => void>();

function parse(raw: string | null): StudentProfile {
  if (!raw) return EMPTY_PROFILE;
  try {
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<StudentProfile>) };
  } catch {
    return EMPTY_PROFILE;
  }
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
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
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
  cachedProfile = profile;
  cachedRaw = JSON.stringify(profile);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // storage may be unavailable; the value still applies for this session
  }
  for (const listener of listeners) listener();
}
