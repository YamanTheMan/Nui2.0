#!/usr/bin/env python3
"""Quick test for CMU AI Gateway API key (reads from .env)."""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()

try:
    from openai import OpenAI
except ImportError:
    print("Install openai first: pip install openai")
    sys.exit(1)


def main() -> int:
    api_key = os.getenv("CMU_AI_API_KEY", "").strip()
    base_url = os.getenv("CMU_AI_BASE_URL", "https://ai-gateway.andrew.cmu.edu").strip()
    chat_model = os.getenv("CMU_CHAT_MODEL", "gpt-5-nano").strip()
    embed_model = os.getenv("CMU_EMBED_MODEL", "azure/text-embedding-3-small").strip()

    if not api_key:
        print("Missing CMU_AI_API_KEY in .env")
        return 1

    client = OpenAI(api_key=api_key, base_url=base_url)

    print(f"Base URL: {base_url}")
    print(f"Testing chat model: {chat_model}")
    try:
        response = client.chat.completions.create(
            model=chat_model,
            messages=[{"role": "user", "content": "Reply with exactly: API works"}],
        )
        print("CHAT OK")
        print("Reply:", response.choices[0].message.content)
    except Exception as exc:
        print("CHAT FAILED:", type(exc).__name__, str(exc)[:500])
        return 1

    print(f"\nTesting embedding model: {embed_model}")
    try:
        emb = client.embeddings.create(
            model=embed_model,
            input="digital transformation",
        )
        vec = emb.data[0].embedding
        print("EMBED OK")
        print("Vector length:", len(vec))
        print("First 5 numbers:", [round(x, 5) for x in vec[:5]])
    except Exception as exc:
        print("EMBED FAILED:", type(exc).__name__, str(exc)[:500])
        return 1

    print("\nAll tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
