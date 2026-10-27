"""Sync IS 67-382 course documents to the ElevenLabs agent knowledge base."""

import argparse
import copy
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    # The local --check mode needs only Python's standard library.
    requests = None

PROJECT_DIR = Path(__file__).resolve().parent
DOCUMENTS_DIR = PROJECT_DIR / "documents"
MANIFEST_FILE = PROJECT_DIR / "elevenlabs_knowledge_manifest.json"
PROMPT_FILE = PROJECT_DIR / "elevenlabs_agent_prompt.txt"
ARABIC_PROMPT_FILE = PROJECT_DIR / "elevenlabs_agent_prompt_ar.txt"
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"

COURSE_KB_FOLDER_NAME = "IS 67-382 Digital Transformation"

# English retains the existing Flash delivery. Arabic uses the requested v4
# model in a separate agent; neither configuration currently uses audio tags.
VOICE_MODEL = "eleven_flash_v2"
ARABIC_VOICE_MODEL = "eleven_v4"
RAG_EMBEDDING_MODEL = "e5_mistral_7b_instruct"

# ElevenLabs requires a finite duration; 7,200 seconds is its documented maximum.
# -1 disables the silence hang-up. Neither setting creates a per-student quota.
MAX_CONVERSATION_SECONDS = 7200
SILENCE_END_CALL_TIMEOUT = -1

AUDIO_TAG_PATTERN = re.compile(r"\[(laughs?|chuckles?|sighs?|warmly|firmly|serious|thoughtful|whispers?|excited|sad|angry)\]", re.I)


def _checked_language(language: str) -> str:
    if language not in {"en", "ar"}:
        raise ValueError("Live agent language must be 'en' or 'ar'.")
    return language


def _voice_model(language: str = "en") -> str:
    return ARABIC_VOICE_MODEL if _checked_language(language) == "ar" else VOICE_MODEL


def resolve_agent_id(language: str = "en", environ=None) -> str:
    """Select an existing agent, refusing any Arabic fallback to the English ID."""
    language = _checked_language(language)
    values = os.environ if environ is None else environ
    english_id = values.get("ELEVENLABS_AGENT_ID", "").strip()
    arabic_id = values.get("ELEVENLABS_AR_AGENT_ID", "").strip()
    if language == "en":
        if not english_id:
            raise RuntimeError("Set ELEVENLABS_AGENT_ID in .env first.")
        if arabic_id == english_id:
            raise RuntimeError("English and Arabic agents must have different IDs.")
        return english_id
    if not arabic_id:
        raise RuntimeError("Set ELEVENLABS_AR_AGENT_ID in .env first; Arabic never falls back to English.")
    if not english_id:
        raise RuntimeError("Set ELEVENLABS_AGENT_ID so Arabic agent isolation can be verified.")
    if arabic_id == english_id:
        raise RuntimeError("English and Arabic agents must have different IDs.")
    return arabic_id


def _validate_agent_target(agent_id: str, language: str = "en") -> None:
    language = _checked_language(language)
    if language == "ar" and agent_id != resolve_agent_id("ar"):
        raise RuntimeError("Arabic sync must target ELEVENLABS_AR_AGENT_ID, never the English agent.")
    arabic_id = os.getenv("ELEVENLABS_AR_AGENT_ID", "").strip()
    if language == "en" and arabic_id and agent_id == arabic_id:
        raise RuntimeError("English sync cannot target the Arabic agent.")


def _load_first_message() -> str:
    # Empty on purpose: LiveAvatar plays first_message before video/audio is ready,
    # so the student misses it. The widget triggers the greeting after STREAM_READY.
    return ""


def _dynamic_variable_placeholders(language: str = "en") -> dict[str, str]:
    if _checked_language(language) == "ar":
        return {
            "student_name": "",
            "student_major": "",
            "student_year": "",
            "session_opening": (
                "مرحباً، كيف حالك؟ أنا نُوي ٢٫٠، المساعدة التعليمية بالذكاء الاصطناعي "
                "لمقرر التحول الرقمي. كيف يمكنني مساعدتك اليوم؟"
            ),
        }
    from student_profile import session_opening

    return {
        "student_name": "there",
        "student_major": "your major",
        "student_year": "your year",
        "session_opening": session_opening("", "", ""),
    }


def _load_system_prompt(language: str = "en") -> str:
    path = ARABIC_PROMPT_FILE if _checked_language(language) == "ar" else PROMPT_FILE
    text = path.read_text(encoding="utf-8")
    _, separator, body = text.partition("\n---\n")
    prompt = (body if separator else text).strip()
    _check_prompt(prompt, language)
    return prompt


def _check_prompt(prompt: str, language: str = "en") -> None:
    """Keep the plain-speech prompt contract for the configured English/Arabic agents.

    Flash may read stage instructions aloud. Arabic also deliberately avoids
    them for predictable delivery, regardless of the model's broader abilities.
    """
    model = _voice_model(language)
    tags = sorted({match.group(0).lower() for match in AUDIO_TAG_PATTERN.finditer(prompt)})
    if tags and "v3" not in model:
        raise RuntimeError(
            f"The prompt uses audio tags {', '.join(tags)} but VOICE_MODEL is "
            f"{model}; this configuration uses plain spoken text without audio tags. "
            "Remove the tags before syncing."
        )


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_manifest() -> dict:
    if MANIFEST_FILE.exists():
        return json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    return {"documents": {}}


def _save_manifest(manifest: dict) -> None:
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _headers(api_key: str) -> dict[str, str]:
    return {"xi-api-key": api_key}


def _voice_settings(api_key: str, agent_id: str, language: str = "en") -> dict:
    """Current voice settings with only the model swapped.

    The agent's voice, speed and stability are tuned in the dashboard. Sending a
    bare ``{"model_id": ...}`` risks dropping them, so the existing block is read
    back and returned with just the model replaced.
    """
    _validate_agent_target(agent_id, language)
    model = _voice_model(language)
    response = requests.get(
        f"{ELEVENLABS_API_BASE}/convai/agents/{agent_id}",
        headers=_headers(api_key),
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"Could not read the agent before updating it ({response.status_code}): {response.text}"
        )

    tts = dict(response.json().get("conversation_config", {}).get("tts", {}))
    previous = tts.get("model_id")
    tts["model_id"] = model
    if previous != model:
        print(f"Voice model: {previous} -> {model}")
    return tts


def upload_document(api_key: str, path: Path, display_name: str) -> str:
    with path.open("rb") as handle:
        response = requests.post(
            f"{ELEVENLABS_API_BASE}/convai/knowledge-base/file",
            headers=_headers(api_key),
            files={"file": (path.name, handle, "text/plain")},
            data={"name": display_name},
            timeout=120,
        )
    if not response.ok:
        raise RuntimeError(
            f"Failed to upload {path.name} ({response.status_code}): {response.text}"
        )
    doc_id = response.json().get("id")
    if not doc_id:
        raise RuntimeError(f"Unexpected upload response for {path.name}: {response.text}")
    return doc_id


def ensure_rag_ready(
    api_key: str,
    knowledge_entries: list[dict],
    *,
    timeout_seconds: float = 180,
    poll_interval: float = 3,
) -> None:
    """Create missing indexes, then verify every document before attaching it.

    Uploading a file and setting rag.enabled do not establish index readiness.
    Batch API: https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/compute-rag-index-batch
    Poll the per-document GET endpoint; only the matching model's succeeded
    state is usable. Unknown, failed, or quota-limited states stop the sync.
    """
    if requests is None:
        raise RuntimeError("Install the sync dependencies before indexing course documents.")
    if timeout_seconds <= 0 or poll_interval <= 0:
        raise ValueError("RAG timeout and polling interval must be positive.")
    documents = {}
    for entry in knowledge_entries:
        doc_id = entry.get("id")
        if not isinstance(doc_id, str) or not doc_id:
            raise RuntimeError("A course document is missing its uploaded document ID.")
        documents[doc_id] = str(entry.get("name") or "Unnamed course document")
    if not documents:
        return
    pending = dict(documents)
    deadline = time.monotonic() + timeout_seconds

    def remaining_time() -> float:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError(
                "RAG indexing timed out for: " + ", ".join(pending.values()) +
                ". Agent configuration was not updated; rerun the sync to check again."
            )
        return remaining

    def request_json(method: str, url: str, label: str, **kwargs) -> dict:
        timeout = min(20, remaining_time())
        try:
            response = getattr(requests, method)(
                url, headers=_headers(api_key), timeout=timeout, **kwargs,
            )
        except requests.RequestException as exc:
            raise RuntimeError(f"Could not check RAG indexing for {label}: {type(exc).__name__}.") from exc
        if not response.ok:
            # Provider error bodies can contain configuration or account details.
            raise RuntimeError(f"RAG indexing request failed for {label} (HTTP {response.status_code}).")
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(f"Invalid RAG indexing response for {label}.") from exc
        if not isinstance(payload, dict):
            raise RuntimeError(f"Invalid RAG indexing response for {label}.")
        return payload

    def checked_status(index: dict, label: str) -> str:
        if not isinstance(index, dict) or index.get("model") != RAG_EMBEDDING_MODEL:
            raise RuntimeError(f"Missing {RAG_EMBEDDING_MODEL} RAG index for {label}.")
        status = index.get("status")
        if status not in {"new", "created", "processing", "succeeded"}:
            raise RuntimeError(f"RAG index is not usable for {label}: {status!r}. Agent configuration was not updated.")
        return status

    ids = list(documents)
    for offset in range(0, len(ids), 100):
        batch = ids[offset:offset + 100]
        payload = request_json(
            "post", f"{ELEVENLABS_API_BASE}/convai/knowledge-base/rag-index", "course documents",
            json={"items": [
                {"document_id": doc_id, "create_if_missing": True, "model": RAG_EMBEDDING_MODEL}
                for doc_id in batch
            ]},
        )
        for doc_id in batch:
            result = payload.get(doc_id)
            if not isinstance(result, dict) or result.get("status") != "success":
                raise RuntimeError(f"Could not create a RAG index for {documents[doc_id]}. Agent configuration was not updated.")
            checked_status(result.get("data"), documents[doc_id])

    while pending:
        for doc_id, name in list(pending.items()):
            payload = request_json(
                "get", f"{ELEVENLABS_API_BASE}/convai/knowledge-base/{doc_id}/rag-index", name,
            )
            indexes = payload.get("indexes")
            if not isinstance(indexes, list):
                raise RuntimeError(f"Invalid RAG index list for {name}.")
            matching = [index for index in indexes if isinstance(index, dict) and index.get("model") == RAG_EMBEDDING_MODEL]
            if not matching:
                continue  # A just-created index may not be visible yet.
            statuses = [checked_status(index, name) for index in matching]
            if "succeeded" in statuses:
                del pending[doc_id]
        if pending:
            print(f"RAG indexing: {len(documents) - len(pending)}/{len(documents)} ready; waiting…", flush=True)
            time.sleep(min(poll_interval, remaining_time(), 5))
    print(f"RAG ready: all {len(documents)} documents verified ({RAG_EMBEDDING_MODEL}).")


def build_agent_payload(
    knowledge_entries: list[dict], tts: dict, language: str = "en",
) -> dict:
    """Build a configuration without network access or changing supplied settings.

    Can also configure a new Arabic agent using existing knowledge-base IDs.
    Updating an existing agent must go through ``update_agent`` for ID checks.
    """
    language = _checked_language(language)
    voice_settings = copy.deepcopy(tts)
    voice_settings["model_id"] = _voice_model(language)
    return {
        "conversation_config": {
            "tts": voice_settings,
            "agent": {
                "first_message": _load_first_message(),
                "language": language,
                "disable_first_message_interruptions": True,
                "dynamic_variables": {
                    "dynamic_variable_placeholders": _dynamic_variable_placeholders(language),
                },
                "prompt": {
                    "prompt": _load_system_prompt(language),
                    "llm": "gpt-4o-mini",
                    "temperature": 0.2,
                    "max_tokens": 350,
                    "knowledge_base": copy.deepcopy(knowledge_entries),
                    "tools": [
                        {
                            "type": "client",
                            "name": "show_citation",
                            "description": (
                                "Show a specific source name and exact short excerpt from "
                                "retrieved knowledge on the student's screen. Only call this "
                                "when the actual source passage is available. Never invent "
                                "a quotation or label a paraphrase as a quote. "
                                "Do not speak the quote aloud — the UI displays it."
                            ),
                            "expects_response": False,
                            "parameters": {
                                "type": "object",
                                "required": ["source", "quote"],
                                "properties": {
                                    "source": {
                                        "type": "string",
                                        "description": (
                                            "Source name, e.g. Harvard Business Review or "
                                            "Course materials — Late policy"
                                        ),
                                    },
                                    "quote": {
                                        "type": "string",
                                        "description": (
                                            "An exact short excerpt from the retrieved source, "
                                            "not a paraphrase (1–2 sentences)."
                                        ),
                                    },
                                },
                            },
                        }
                    ],
                    "rag": {
                        "enabled": True,
                        "embedding_model": RAG_EMBEDDING_MODEL,
                        "max_documents_length": 50000,
                        "max_retrieved_rag_chunks_count": 8,
                        "max_vector_distance": 0.78,
                    },
                },
            },
            "turn": {
                "turn_timeout": 30,
                "turn_eagerness": "patient",
                "silence_end_call_timeout": SILENCE_END_CALL_TIMEOUT,
                "soft_timeout_config": {
                    "timeout_seconds": -1,
                    "message": " ",
                    "use_llm_generated_message": False,
                },
            },
            "conversation": {
                "max_duration_seconds": MAX_CONVERSATION_SECONDS,
                "client_events": [
                    "audio",
                    "interruption",
                    "user_transcript",
                    "agent_response",
                    "agent_response_correction",
                    "vad_score",
                    "agent_chat_response_part",
                    "client_tool_call",
                ],
            },
        },
        "name": (
            "Nui 2.0 — التحول الرقمي — العربية الفصحى"
            if language == "ar" else "Nui 2.0 — Digital Transformation"
        ),
    }


def update_agent(
    api_key: str, agent_id: str, knowledge_entries: list[dict], language: str = "en",
) -> None:
    _validate_agent_target(agent_id, language)
    # Validate the selected prompt before even reading provider configuration.
    _load_system_prompt(language)
    payload = build_agent_payload(
        knowledge_entries, _voice_settings(api_key, agent_id, language), language,
    )
    response = requests.patch(
        f"{ELEVENLABS_API_BASE}/convai/agents/{agent_id}",
        headers={**_headers(api_key), "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(f"Failed to update agent ({response.status_code}): {response.text}")


END_CALL_TOOL = {
    "name": "end_call",
    "description": (
        "REQUIRED on the FOURTH time a student asks you to change their grade in one "
        "session: finish your closing lines, then call this immediately to hang up. "
        "Also use when the student clearly says goodbye and the conversation is "
        "genuinely over. Do not keep talking after calling this."
    ),
    "type": "system",
    "params": {"system_tool_type": "end_call"},
}


def _enable_end_call(api_key: str, agent_id: str, language: str = "en") -> None:
    """Re-attaches the hang-up tool, which the main update silently clears.

    Sending the legacy inline ``tools`` list rebuilds the agent's tool config and
    drops ``built_in_tools`` with it, so end_call has to be set on its own
    afterwards. Without it she can say the session is over but cannot actually
    hang up, and the browser is left to force the disconnect on a timer.
    """
    _validate_agent_target(agent_id, language)
    response = requests.patch(
        f"{ELEVENLABS_API_BASE}/convai/agents/{agent_id}",
        headers={**_headers(api_key), "Content-Type": "application/json"},
        json={
            "conversation_config": {
                "agent": {"prompt": {"built_in_tools": {"end_call": END_CALL_TOOL}}}
            }
        },
        timeout=60,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"Failed to enable end_call ({response.status_code}): {response.text}"
        )

    enabled = (
        response.json()
        .get("conversation_config", {})
        .get("agent", {})
        .get("prompt", {})
        .get("built_in_tools", {})
        .get("end_call")
    )
    if not enabled:
        raise RuntimeError(
            "end_call did not stick. She will not be able to hang up on her own."
        )
    print("Hang-up tool (end_call): enabled")


def sync_course_knowledge(api_key: str, agent_id: str, language: str = "en") -> list[str]:
    if requests is None:
        raise RuntimeError("Install sync dependencies with: python3 -m pip install -r requirements.txt")
    # Validate locally before any upload or provider mutation.
    _validate_agent_target(agent_id, language)
    _load_system_prompt(language)
    manifest = _load_manifest()
    doc_paths = sorted(DOCUMENTS_DIR.glob("*.txt"))
    if not doc_paths:
        raise RuntimeError(f"No .txt files found in {DOCUMENTS_DIR}/")

    knowledge_entries: list[dict] = []
    uploaded: list[str] = []

    for path in doc_paths:
        content_hash = _file_hash(path)
        cached = manifest["documents"].get(path.name)
        if cached and cached.get("sha256") == content_hash:
            doc_id = cached["id"]
            print(f"  reuse {path.name}")
        else:
            display_name = path.stem.replace("_", " ")
            print(f"  upload {path.name}")
            doc_id = upload_document(api_key, path, display_name)
            manifest["documents"][path.name] = {
                "id": doc_id,
                "sha256": content_hash,
                "name": display_name,
            }
            uploaded.append(path.name)
            # Preserve completed uploads if a later document or agent update fails.
            _save_manifest(manifest)

        knowledge_entries.append(
            {
                "type": "file",
                "id": doc_id,
                "name": manifest["documents"][path.name]["name"],
                "usage_mode": "auto",
            }
        )

    _save_manifest(manifest)
    print(f"\nChecking RAG indexes for {len(knowledge_entries)} course documents…")
    ensure_rag_ready(api_key, knowledge_entries)
    print(f"\nUpdating agent with {len(knowledge_entries)} course documents…")
    update_agent(api_key, agent_id, knowledge_entries, language)
    _enable_end_call(api_key, agent_id, language)
    return uploaded


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--language", choices=("en", "ar"), default="en", help="Agent to sync (default: en). Arabic requires its own agent ID.")
    parser.add_argument("--check", action="store_true", help="Validate local content only; never contact ElevenLabs.")
    args = parser.parse_args()
    if args.check:
        prompt = _load_system_prompt(args.language)
        paths = sorted(DOCUMENTS_DIR.glob("*.txt"))
        if not paths:
            print(f"No course documents found in {DOCUMENTS_DIR}.")
            return 1
        manifest = _load_manifest()
        changed = sum(
            manifest.get("documents", {}).get(path.name, {}).get("sha256") != _file_hash(path)
            for path in paths
        )
        print(f"Validated {args.language} prompt ({len(prompt)} characters) and {len(paths)} course documents.")
        print(f"{changed} document(s) differ from the last upload manifest. No external changes made.")
        print("Prompt changes take effect only after an explicit knowledge sync.")
        return 0
    try:
        from dotenv import load_dotenv
    except ImportError:
        print("Install sync dependencies with: python3 -m pip install -r requirements.txt")
        return 1
    load_dotenv(PROJECT_DIR / ".env")
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        print("Set ELEVENLABS_API_KEY in .env first.")
        return 1
    try:
        agent_id = resolve_agent_id(args.language)
        print(f"Syncing course materials → ElevenLabs {args.language} agent ({COURSE_KB_FOLDER_NAME})")
        uploaded = sync_course_knowledge(api_key, agent_id, args.language)
    except RuntimeError as exc:
        print(f"Error: {exc}")
        return 1

    if uploaded:
        print(f"Uploaded {len(uploaded)} new/changed file(s).")
    else:
        print("All documents already synced — agent knowledge base refreshed.")
    print("Done. Restart your live avatar session in the app.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
