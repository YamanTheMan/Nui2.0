import { getLiveAvatarConfig, listVoices, pickDefaultVoice } from "@/lib/voice/liveavatar";

export async function GET() {
  try {
    const voices = await listVoices();
    const config = getLiveAvatarConfig();
    return Response.json({
      voices,
      defaultVoiceId: pickDefaultVoice(voices, config.voiceId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ voices: [], defaultVoiceId: "", error: message }, { status: 502 });
  }
}
