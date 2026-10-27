/** Offline checks for persisted profiles and unavailable browser storage. */
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { getServerSnapshot, getSnapshot, saveProfile, subscribe } from "../../lib/student/profile-store.ts";
import { EMPTY_PROFILE } from "../../lib/student/profile.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let stored: string | null = null;
let readFails = false;
let writeFails = false;
const storageListeners = new Set<() => void>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: () => {
        if (readFails) throw new Error("Storage access denied");
        return stored;
      },
      setItem: (_key: string, value: string) => {
        if (writeFails) throw new Error("Storage quota exceeded");
        stored = value;
      },
    },
    addEventListener: (_event: string, listener: () => void) => storageListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => storageListeners.delete(listener),
  },
});

beforeEach(() => {
  readFails = false;
  writeFails = false;
  saveProfile(EMPTY_PROFILE);
  stored = null;
  getSnapshot();
});
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

test("invalid and legacy saved data always produces safe string fields", () => {
  for (const raw of ["{", "null", "[]", "42", '"a name"', '{"name":null,"major":17,"year":{}}']) {
    stored = raw;
    assert.deepEqual(getSnapshot(), EMPTY_PROFILE, raw);
  }
  stored = JSON.stringify({ name: "  Ada\nLovelace  ", major: "M".repeat(300), year: "  Junior\u0000 " });
  assert.deepEqual(getSnapshot(), { name: "Ada Lovelace", major: "M".repeat(120), year: "Junior" });
});

test("server and unchanged browser snapshots preserve reference stability", () => {
  assert.deepEqual(getServerSnapshot(), EMPTY_PROFILE);
  assert.equal(getServerSnapshot(), getServerSnapshot());
  stored = JSON.stringify({ name: "Ada", major: "IS", year: "Junior" });
  const profile = getSnapshot();
  assert.equal(getSnapshot(), profile);
  assert.equal(getSnapshot(), profile);
});

test("a failed storage read preserves the last known profile", () => {
  stored = JSON.stringify({ name: "Ada", major: "IS", year: "Junior" });
  const profile = getSnapshot();
  readFails = true;
  assert.equal(getSnapshot(), profile);
  assert.equal(getSnapshot().name, "Ada");
});

test("a failed storage write preserves the user's new profile over old storage", () => {
  saveProfile({ name: "Old name", major: "IS", year: "Junior" });
  writeFails = true;
  saveProfile({ name: "New name", major: "CS", year: "Senior" });
  assert.equal(JSON.parse(stored!).name, "Old name");
  const profile = getSnapshot();
  assert.equal(profile.name, "New name");
  assert.equal(getSnapshot(), profile);
  readFails = true;
  assert.equal(getSnapshot(), profile);
});

test("successful storage recovery resumes persisted and cross-tab updates", () => {
  writeFails = true;
  saveProfile({ name: "Local", major: "", year: "" });
  writeFails = false;
  saveProfile({ name: "Saved", major: "IS", year: "" });
  assert.equal(getSnapshot().name, "Saved");
  stored = JSON.stringify({ name: "Another tab", major: "CS", year: "Senior" });
  assert.equal(getSnapshot().name, "Another tab");
  stored = null;
  assert.deepEqual(getSnapshot(), EMPTY_PROFILE);
});

test("local subscribers receive normalized edits and can unsubscribe", () => {
  let notified = 0;
  const unsubscribe = subscribe(() => { notified += 1; });
  saveProfile({ name: " Ada\n ", major: " IS ", year: "" });
  assert.equal(notified, 1);
  assert.deepEqual(getSnapshot(), { name: "Ada", major: "IS", year: "" });
  assert.equal(storageListeners.size, 1);
  unsubscribe();
  saveProfile({ name: "New", major: "", year: "" });
  assert.equal(notified, 1);
  assert.equal(storageListeners.size, 0);
});
