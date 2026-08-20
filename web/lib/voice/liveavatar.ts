/** Server-side LiveAvatar + ElevenLabs helpers. Never import from client code. */

import { elevenLabsDynamicVariables, type StudentProfile } from "../student/profile";

const LIVEAVATAR_API_BASE = "https://api.liveavatar.com";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export type LiveAvatarConfig = {
  apiKey: string;
  avatarId: string;
  agentId: string;
  secretId: string;
  voiceId: string;
  isSandbox: boolean;
};

export function getLiveAvatarConfig(): LiveAvatarConfig {
  return {
    apiKey: process.env.LIVEAVATAR_API_KEY ?? "",
    avatarId: process.env.LIVEAVATAR_AVATAR_ID ?? "",
    agentId: process.env.ELEVENLABS_AGENT_ID ?? "",
    secretId: process.env.ELEVENLABS_SECRET_ID ?? "",
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
    isSandbox: (process.env.LIVEAVATAR_SANDBOX ?? "false").toLowerCase() === "true",
  };
}

export function configIsComplete(config: LiveAvatarConfig): boolean {
  return Boolean(config.apiKey && config.avatarId && config.agentId && config.secretId);
}

export function missingLiveAvatarKeys(): string[] {
  const required = [
    "LIVEAVATAR_API_KEY",
    "LIVEAVATAR_AVATAR_ID",
    "ELEVENLABS_AGENT_ID",
    "ELEVENLABS_SECRET_ID",
    "ELEVENLABS_API_KEY",
  ];
  return required.filter((key) => !(process.env[key] ?? "").trim());
}

export type SessionToken = {
  sessionId: string;
  sessionToken: string;
};

export async function createSessionToken(
  config: LiveAvatarConfig,
  profile: StudentProfile,
  voiceId?: string,
): Promise<SessionToken> {
  const agentConfig: Record<string, unknown> = {
    secret_id: config.secretId,
    agent_id: config.agentId,
    dynamic_variables: elevenLabsDynamicVariables(profile),
  };

  const selectedVoice = voiceId || config.voiceId;
  if (selectedVoice) agentConfig.voice_id = selectedVoice;

  const response = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/token`, {
    method: "POST",
    headers: {
      "X-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "LITE",
      avatar_id: config.avatarId,
      is_sandbox: config.isSandbox,
      elevenlabs_agent_config: agentConfig,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LiveAvatar session failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as {
    data?: { session_id?: string; session_token?: string };
  };
  const sessionId = payload.data?.session_id;
  const sessionToken = payload.data?.session_token;

  if (!sessionId || !sessionToken) {
    throw new Error("LiveAvatar returned an unexpected session response.");
  }

  return { sessionId, sessionToken };
}

export type Voice = { id: string; name: string };

export async function listVoices(): Promise<Voice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
  if (!apiKey) return [];

  const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Could not load ElevenLabs voices (${response.status}).`);
  }

  const payload = (await response.json()) as {
    voices?: Array<{ voice_id?: string; name?: string }>;
  };

  return (payload.voices ?? [])
    .filter((voice): voice is { voice_id: string; name?: string } => Boolean(voice.voice_id))
    .map((voice) => ({ id: voice.voice_id, name: voice.name ?? voice.voice_id }));
}

export const DEFAULT_VOICE_NAME = "Thai Professor Nui";

export function pickDefaultVoice(voices: Voice[], preferredId: string): string {
  const byName = voices.find((v) => v.name === DEFAULT_VOICE_NAME);
  if (byName) return byName.id;
  if (preferredId && voices.some((v) => v.id === preferredId)) return preferredId;
  const fuzzy = voices.find((v) => v.name.toLowerCase().includes("professor nui"));
  if (fuzzy) return fuzzy.id;
  return voices[0]?.id ?? "";
}
