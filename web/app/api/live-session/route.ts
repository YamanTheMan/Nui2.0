import {
  configIsComplete,
  createSessionToken,
  getLiveAvatarConfig,
  missingLiveAvatarKeys,
} from "@/lib/voice/liveavatar";
import { EMPTY_PROFILE, sessionOpening, type StudentProfile } from "@/lib/student/profile";

function normaliseProfile(input: unknown): StudentProfile {
  if (!input || typeof input !== "object") return EMPTY_PROFILE;
  const raw = input as Partial<Record<keyof StudentProfile, unknown>>;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    major: typeof raw.major === "string" ? raw.major : "",
    year: typeof raw.year === "string" ? raw.year : "",
  };
}

export async function POST(req: Request) {
  const config = getLiveAvatarConfig();

  if (!configIsComplete(config)) {
    return Response.json(
      {
        error: "Live avatar is not configured on this server.",
        missing: missingLiveAvatarKeys(),
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    profile?: unknown;
    voiceId?: unknown;
  };

  const profile = normaliseProfile(body.profile);
  const voiceId = typeof body.voiceId === "string" ? body.voiceId : undefined;

  try {
    const token = await createSessionToken(config, profile, voiceId);
    return Response.json({
      sessionId: token.sessionId,
      sessionToken: token.sessionToken,
      openingMessage: sessionOpening(profile),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
