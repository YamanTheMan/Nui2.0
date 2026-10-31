import { EMPTY_PROFILE, normaliseGender, type StudentProfile } from "../student/profile";
import type { ChatTurn } from "./prompt";

export class InvalidRequest extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

/** Bound the body while reading it, including requests without Content-Length. */
export async function readJsonRequest(req: Request, maxBytes = 512_000): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > maxBytes) {
    throw new InvalidRequest("This conversation is too large. Start a new chat.", 413);
  }
  if (!req.body) throw new InvalidRequest("Please send a message.");
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new InvalidRequest("This conversation is too large. Start a new chat.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof InvalidRequest) throw error;
    throw new InvalidRequest("Invalid request. Please try again.");
  } finally {
    reader.releaseLock();
  }
}

export function normaliseProfile(input: unknown): StudentProfile {
  if (!input || typeof input !== "object" || Array.isArray(input)) return EMPTY_PROFILE;
  const raw = input as Record<string, unknown>;
  const field = (value: unknown) => typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  return { name: field(raw.name), major: field(raw.major), year: field(raw.year), gender: normaliseGender(raw.gender) };
}

export function parseChatRequest(payload: unknown): { turns: ChatTurn[]; profile: StudentProfile } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new InvalidRequest("Invalid chat request.");
  }
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    throw new InvalidRequest("Please send a message.");
  }
  if (raw.messages.length > 100) {
    throw new InvalidRequest("This conversation is full. Start a new chat to continue.", 413);
  }
  const turns: ChatTurn[] = [];
  let totalCharacters = 0;
  for (const message of raw.messages) {
    if (!message || typeof message !== "object" ||
        (message.role !== "user" && message.role !== "assistant") || !Array.isArray(message.parts)) {
      throw new InvalidRequest("Invalid chat message.");
    }
    const textParts: string[] = [];
    for (const part of message.parts) {
      if (!part || typeof part !== "object") throw new InvalidRequest("Invalid message content.");
      if (part.type !== "text") continue; // Server metadata is never promoted to model instructions.
      if (typeof part.text !== "string") throw new InvalidRequest("Invalid message text.");
      textParts.push(part.text);
    }
    const content = textParts.join("\n").trim();
    if (content.length > 12_000) {
      throw new InvalidRequest("Please keep each message under 12,000 characters.", 413);
    }
    totalCharacters += content.length;
    if (totalCharacters > 100_000) {
      throw new InvalidRequest("This conversation is too large. Start a new chat.", 413);
    }
    if (!content && message.role === "user") throw new InvalidRequest("Please type a question.");
    if (content) turns.push({ role: message.role, content });
  }
  if (raw.messages.at(-1)?.role !== "user" || turns.at(-1)?.role !== "user") {
    throw new InvalidRequest("The last message must be your question.");
  }
  return { turns, profile: normaliseProfile(raw.profile) };
}
