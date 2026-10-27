/** Server-side LiveAvatar + ElevenLabs helpers. Never import from client code. */

import type { StudentProfile } from "../student/profile";
import { liveDynamicVariables, type LiveLanguage } from "./language";

const LIVEAVATAR_API_BASE = "https://api.liveavatar.com";
const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export type LiveAvatarConfig = {
  language: LiveLanguage;
  apiKey: string;
  avatarId: string;
  agentId: string;
  secretId: string;
  voiceId: string;
  isSandbox: boolean;
};

export function getLiveAvatarConfig(language: LiveLanguage = "en"): LiveAvatarConfig {
  const defaultVoiceId = (process.env.ELEVENLABS_VOICE_ID ?? "").trim();
  return {
    language,
    apiKey: (process.env.LIVEAVATAR_API_KEY ?? "").trim(),
    avatarId: (process.env.LIVEAVATAR_AVATAR_ID ?? "").trim(),
    agentId: (process.env[language === "ar" ? "ELEVENLABS_AR_AGENT_ID" : "ELEVENLABS_AGENT_ID"] ?? "").trim(),
    secretId: (process.env.ELEVENLABS_SECRET_ID ?? "").trim(),
    voiceId: language === "ar"
      ? (process.env.ELEVENLABS_AR_VOICE_ID ?? "").trim() || defaultVoiceId
      : defaultVoiceId,
    isSandbox: (process.env.LIVEAVATAR_SANDBOX ?? "false").toLowerCase() === "true",
  };
}

export function configIsComplete(config: LiveAvatarConfig): boolean {
  if (config.language === "ar" && config.agentId === (process.env.ELEVENLABS_AGENT_ID ?? "").trim()) {
    return false;
  }
  return Boolean(config.apiKey && config.avatarId && config.agentId && config.secretId);
}

export function missingLiveAvatarKeys(language: LiveLanguage = "en"): string[] {
  const required = [
    "LIVEAVATAR_API_KEY",
    "LIVEAVATAR_AVATAR_ID",
    language === "ar" ? "ELEVENLABS_AR_AGENT_ID" : "ELEVENLABS_AGENT_ID",
    "ELEVENLABS_SECRET_ID",
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
  if (config.language === "ar" && !configIsComplete(config)) {
    throw new Error("The Arabic live agent requires a separate, complete configuration.");
  }
  const agentConfig: Record<string, unknown> = {
    secret_id: config.secretId,
    agent_id: config.agentId,
    dynamic_variables: liveDynamicVariables(profile, config.language),
  };

  // The Arabic agent is validated with its configured voice. An English picker
  // value or a custom client request must not silently replace that voice.
  const selectedVoice = config.language === "ar" ? config.voiceId : voiceId || config.voiceId;
  if (selectedVoice) agentConfig.voice_id = selectedVoice;

  const response = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/token`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
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
    // Provider bodies may include account/configuration details. Never forward
    // them through the public endpoint.
    throw new Error(`LiveAvatar session failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    data?: { session_id?: string; session_token?: string };
  };
  const sessionId = payload.data?.session_id;
  const sessionToken = payload.data?.session_token;

  if (typeof sessionId !== "string" || !sessionId || typeof sessionToken !== "string" || !sessionToken) {
    throw new Error("LiveAvatar returned an unexpected session response.");
  }

  return { sessionId, sessionToken };
}

export type Voice = { id: string; name: string };

export async function listVoices(): Promise<Voice[]> {
  const apiKey = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!apiKey) return [];

  const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Could not load ElevenLabs voices (${response.status}).`);
  }

  const payload = (await response.json()) as {
    voices?: Array<{ voice_id?: string; name?: string }>;
  };

  if (!Array.isArray(payload.voices)) return [];
  return payload.voices
    .filter((voice): voice is { voice_id: string; name?: string } =>
      Boolean(voice && typeof voice.voice_id === "string" && voice.voice_id))
    .map((voice) => ({ id: voice.voice_id, name: typeof voice.name === "string" ? voice.name : voice.voice_id }));
}

export const DEFAULT_VOICE_NAME = "Thai Professor Nui";

export function pickDefaultVoice(voices: Voice[], preferredId: string): string {
  if (preferredId && voices.some((v) => v.id === preferredId)) return preferredId;
  const byName = voices.find((v) => v.name === DEFAULT_VOICE_NAME);
  if (byName) return byName.id;
  const fuzzy = voices.find((v) => v.name.toLowerCase().includes("professor nui"));
  if (fuzzy) return fuzzy.id;
  return voices[0]?.id ?? "";
}
