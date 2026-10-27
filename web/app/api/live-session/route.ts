import {
  configIsComplete,
  createSessionToken,
  getLiveAvatarConfig,
  missingLiveAvatarKeys,
} from "@/lib/voice/liveavatar";
import { isLiveLanguage, liveSessionOpening } from "@/lib/voice/language";
import { InvalidRequest, normaliseProfile, readJsonRequest } from "@/lib/chat/request";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  return Response.json({
    languages: {
      en: configIsComplete(getLiveAvatarConfig("en")),
      ar: configIsComplete(getLiveAvatarConfig("ar")),
    },
  }, { headers: noStore });
}

export async function POST(req: Request) {
  try {
    const input = await readJsonRequest(req, 4096);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new InvalidRequest("Please send a valid session request.");
    }
    const body = input as { profile?: unknown; voiceId?: unknown; language?: unknown };
    const language = body.language === undefined ? "en" : body.language;
    if (!isLiveLanguage(language)) {
      throw new InvalidRequest("Please select English or Arabic for your live session.");
    }
    const profile = normaliseProfile(body.profile);
    if (body.voiceId != null && (typeof body.voiceId !== "string" ||
        (body.voiceId !== "" && !/^[a-zA-Z0-9_-]{1,100}$/.test(body.voiceId)))) {
      throw new InvalidRequest("Please select a valid voice.");
    }
    const config = getLiveAvatarConfig(language);
    if (!configIsComplete(config)) {
      return Response.json({
        error: language === "ar"
          ? "المحادثة المباشرة بالعربية غير متاحة حاليًا. يرجى المحاولة لاحقًا."
          : "Live avatar is not configured on this server.",
        missing: missingLiveAvatarKeys(language),
      }, { status: 503, headers: noStore });
    }
    const voiceId = typeof body.voiceId === "string" ? body.voiceId : undefined;
    const token = await createSessionToken(config, profile, voiceId);
    return Response.json({
      sessionId: token.sessionId,
      sessionToken: token.sessionToken,
      language,
      openingMessage: liveSessionOpening(profile, language),
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof InvalidRequest) {
      return Response.json({ error: error.message }, { status: error.status, headers: noStore });
    }
    console.error("Live session creation failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({
      error: "Live voice is temporarily unavailable. Please try again, or continue in chat.",
    }, { status: 502, headers: noStore });
  }
}
