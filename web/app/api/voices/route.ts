import { getLiveAvatarConfig, listVoices, pickDefaultVoice } from "@/lib/voice/liveavatar";

export async function GET() {
  try {
    const voices = await listVoices();
    const config = getLiveAvatarConfig();
    return Response.json({
      voices,
      defaultVoiceId: pickDefaultVoice(voices, config.voiceId),
    });
  } catch {
    return Response.json({
      voices: [],
      defaultVoiceId: "",
      error: "Voice choices are temporarily unavailable. The default voice is still available when configured.",
    }, { status: 502 });
  }
}
