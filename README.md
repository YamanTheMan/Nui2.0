# AskProfNui

AI teaching assistant for **IS 67-382: Digital Transformation, Strategy and
Management** at CMU-Q. Students ask questions by voice or text and get answers
grounded in the course materials.

**The app lives in [`web/`](web) → read [`web/README.md`](web/README.md).**
It is a Next.js app deployed on Vercel at https://askprofnui.vercel.app.

## What is at the repo root

| Path | Purpose |
| --- | --- |
| `documents/` | Course material (`.txt`). Source of truth for both the text and voice assistants. |
| `sync_elevenlabs_knowledge.py` | Uploads `documents/` + the agent prompt to ElevenLabs. Run via `cd web && npm run sync`. |
| `student_profile.py` | Greeting helpers imported by the sync script. |
| `elevenlabs_agent_prompt.txt` | Voice agent system prompt. |
| `elevenlabs_knowledge_manifest.json` | Tracks which documents are already uploaded, by hash. |
| `liveavatar_client.py`, `setup_liveavatar.py`, `fix_elevenlabs_audio.py` | One-time voice setup: register the ElevenLabs key with LiveAvatar, force PCM 24 kHz audio. |
| `requirements.txt` | Python deps for those admin scripts only. |
| `legacy-streamlit/` | The retired original Streamlit prototype. Reference only. |

Course content and secrets stay here because the voice agent and the web app
share them. Everything a student touches is served from `web/`.
