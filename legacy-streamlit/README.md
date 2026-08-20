# Retired: the original Streamlit prototype

This folder holds the **first version of AskProfNui** — a Python + Streamlit app
that ran on Render. It is no longer deployed and nothing imports it.

The live product is the Next.js app in [`../web`](../web), deployed on Vercel.
See [`../web/README.md`](../web/README.md).

Kept for reference and history: it documents how the assistant started, and the
prompt behaviour in `agent.py` / `course_facts.py` is the source that
`web/lib/prof-nui.ts` and `web/lib/course-facts.ts` were ported from. Reading the
two side by side is the quickest way to see what changed in the migration.

## What is in here

| File | What it was |
| --- | --- |
| `app.py` | Streamlit UI — the old public-facing app |
| `streamlit_app.py` | Streamlit Community Cloud entry point |
| `agent.py` | Python chat agent (Groq + retrieval) → replaced by `web/app/api/chat/route.ts` + `web/lib/prof-nui.ts` |
| `course_facts.py` | Verbatim course facts → ported to `web/lib/course-facts.ts` |
| `vector_store.py`, `ingest.py` | ChromaDB + FastEmbed semantic retrieval → replaced by BM25 over `web/lib/course-index.json` |
| `chunks.json`, `chroma_db/` | Generated retrieval artifacts from the above |
| `env_config.py` | Loaded secrets from `.streamlit/secrets.toml` |
| `.streamlit/` | Streamlit config and local secrets |
| `Dockerfile`, `render.yaml`, `render.yaml.example` | Render deploy config |
| `create_render_service.py`, `set_render_env.py`, `fix_render.py`, `deploy_streamlit.py` | Render / Streamlit Cloud deploy helpers |
| `requirements.txt` | Full Python dependency set (streamlit, chromadb, fastembed, groq) |
| `README-streamlit.md` | The original project README |

## Why the migration happened

The vector store had to be loaded and embedded on every cold start, which made
the first question slow. The corpus is only a few hundred short chunks, so BM25
over a committed JSON index is just as accurate and starts in milliseconds.
Next.js on Vercel also serves the UI shell from the CDN instead of booting a
Python process per visitor.

## What did *not* move (still live at the repo root)

These are still used by the Next.js content pipeline and the voice agent, so
they stayed where they are:

- `documents/` — course material, the source of truth for both assistants
- `sync_elevenlabs_knowledge.py` — invoked by `web/scripts/sync.mjs` (`npm run sync`)
- `student_profile.py` — imported by that sync script
- `elevenlabs_agent_prompt.txt`, `elevenlabs_knowledge_manifest.json` — read by that sync script
- `liveavatar_client.py`, `setup_liveavatar.py`, `fix_elevenlabs_audio.py` — one-time
  voice setup (registers the ElevenLabs key with LiveAvatar, forces PCM 24 kHz audio)

## Running it (not recommended)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r legacy-streamlit/requirements.txt
python legacy-streamlit/ingest.py     # expects to run from the repo root
streamlit run legacy-streamlit/app.py
```

Paths inside these scripts assume the repo root as the working directory, so
they may need adjusting. Nothing here is maintained.
