# Nui 2.0 — web app

A course companion for IS 67-382: Digital Transformation, Strategy and Management at CMU-Q. Students can ask questions, browse the course notes, or speak to an avatar.

## Run locally

```sh
cd web
npm install
npm run dev
```

Open http://localhost:3000. Configuration lives in `web/.env.local`. Text answers require `GROQ_API_KEY`. Voice uses `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_SECRET_ID`, and `ELEVENLABS_VOICE_ID`. Keep secrets out of Git and browser code.

Sign-in uses `LOGIN_USERNAME` and `LOGIN_PASSWORD` when configured. The course's existing fallback credentials remain supported. All API routes except login require a valid session.

## The new workspace

- A responsive soft-pink and berry interface, including a matching sign-in page.
- Question starters for assignments, study practice, and course policies.
- A searchable library of 12 student-facing resources, including the September 16 class update, grouped by purpose. One additional document supplies teaching style and selected policies.
- Expandable source excerpts attached to text answers. These show the material supplied to the model, not an independent guarantee that every claim was verified.
- Rich answer formatting, stop/retry controls, and editable email drafts.
- Separate text/voice source panels and an optional saved student profile.
- Conversations survive navigation between app views. Resetting a conversation cancels its active request. A page reload starts a new conversation; only the profile is stored.
- Keyboard-accessible mobile navigation, native modal dialogs, visible focus, and reduced-motion support.

Voice sessions end when leaving the live view. Failed or ended sessions can be started again. Actual microphone/video interaction requires the provider credentials and browser permission.

## Course content and grounding

`documents/*.txt` at the repository root are the editable source of truth. Run:

```sh
npm run index
```

This creates the committed `lib/retrieval/course-index.json`. The index contains 120 coherent sections from 13 documents, each with a source filename, document title, and section heading. Long sections split at paragraph boundaries. Authoring placeholders and behavioral persona instructions are excluded from search.

Course policy facts are selected directly from these indexed sections rather than maintained in a second handwritten copy. The authenticated materials endpoint reads the same index; deployed Vercel functions do not need access to the root documents directory.

Retrieval combines BM25 ranking, heading matches, narrowly selected policy sections, query aliases, and dedicated results for compared frameworks. Follow-up questions use earlier student questions to retain the actual topic. Lexical coverage can flag weak evidence; it is not a probability that an answer is correct.

The prompt prioritizes the overview for overall course rules, the specific assignment brief for assignment requirements, and dated class updates for explicitly updated details. The September 16 update adds Assignment 1 presentation dates, a ten-article research minimum, the home-country restriction, and AI-clone consultation hours. These details do not supply Assignment 2 deadlines or individual team slots. The assistant must acknowledge missing dates, incomplete citations, and conflicting notes. The app has no web search tool and must not claim to have searched or read an unavailable paper.

To publish a future class update, add a dated `.txt` file to `documents/` with its effective date and the supplied class notes, then add its entry to `lib/course-catalog.ts` with the date and the `Class updates` category. Updates appear newest first; they are added from supplied notes, not created automatically from the class calendar. Keep the other course materials visible. Rebuild the index, run the offline checks, sync the voice knowledge, and deploy the web app so both assistants receive the same update.

Some underlying notes still need instructor review. See [CONTENT_REVIEW.md](../CONTENT_REVIEW.md) for exact discrepancies. Automated tests verify selected behavior; they cannot guarantee perfect answers to every possible question.

## Streaming, caching, and failures

Text generation uses Groq's `openai/gpt-oss-120b` and can fall back to `openai/gpt-oss-20b` before any visible text. There are first-token, idle, and total generation deadlines. A response already on screen is never spliced together with a second model's answer.

Interrupted, empty, provider-failed, and token-truncated answers carry an explicit retryable status and are never cached. Request cancellation also aborts generation. Input validation admits bounded user/assistant text only; client-supplied system instructions or tool metadata are not forwarded as messages.

Shared cached answers are restricted to independent course questions. The model receives no profile or prior conversation on that path. Greetings, follow-ups, and personal situations bypass shared caching. Cache keys include a prompt version and content fingerprint and preserve meaningful punctuation/Unicode. Full answers live for seven days; fallback-model answers for 30 minutes. Local development uses a bounded in-memory cache with expiry.

Provider quotas can still prevent generation. Error states and caching make these failures clear and recoverable; they do not increase the account's quota.

## Email recaps

Students can get a short recap email (what they covered, next steps, and the next real deadlines with days left) at their `@andrew.cmu.edu` address. Live sessions send it automatically when the session ends if the student filled the optional field on the start screen; text chats have an "Email me a recap" button. Deadlines come from `lib/recap/deadlines.ts`, which a test keeps in sync with D14. Transcripts are used for one email and never stored or logged; each address gets at most five recaps an hour per server instance.

Recaps stay hidden until `RESEND_API_KEY` and `RECAP_FROM` (an address on a domain verified in Resend) are set; `RECAP_REPLY_TO` is optional. Tests: `npm run test:recap`.

## Voice knowledge

The voice assistant is a separate ElevenLabs agent, with its own prompt and hosted knowledge. Editing the text index alone does not update it.

Live Conversation asks the student to choose English or Modern Standard Arabic before starting. English uses the existing `ELEVENLABS_AGENT_ID` with Flash v2. Arabic uses a distinct `ELEVENLABS_AR_AGENT_ID` with regular `eleven_v4` and `elevenlabs_agent_prompt_ar.txt`. Both agents reuse the same course-document references and avatar. `ELEVENLABS_AR_VOICE_ID` selects the Arabic clone; if omitted, it uses `ELEVENLABS_VOICE_ID`. These are server-only environment variables. An absent or duplicate Arabic agent ID disables Arabic instead of falling back to English. Set the Arabic variables in Vercel Production before deploying this UI.

Language selection is per call; end the active call before choosing another language. Arabic labels and controls use a locally scoped right-to-left layout. The existing saved-profile key, course files, text chat and English agent configuration are preserved. The Arabic agent owns multilingual conversation policy handling; the browser's English-only grade-request counter is not sent to Arabic sessions.

Check the local voice configuration without contacting a provider:

```sh
cd ..
python3 sync_elevenlabs_knowledge.py --check
```

When ready to update the hosted voice agent:

```sh
cd web
npm run sync
```

That rebuilds the text index, uploads changed documents, creates any missing voice search indexes, and waits for every document to be ready before updating the hosted agent with the root `elevenlabs_agent_prompt.txt`. Index failures and timeouts stop the sync before the agent configuration changes; rerun after resolving the reported issue. It needs the root `.env` credentials plus the Python dependencies in `requirements.txt`. Review the changes before publishing. Keep the existing Flash voice model unless deliberately retuning the cloned voice.

The existing `npm run sync` command targets English only. To validate or explicitly update Arabic from the repository root, use:

```sh
python3 sync_elevenlabs_knowledge.py --language ar --check
python3 sync_elevenlabs_knowledge.py --language ar
```

The check is offline; the second command uploads changed course documents and updates only the configured Arabic agent. Sync each language explicitly when publishing course revisions so both remain current. Arabic sync requires distinct configured English and Arabic IDs and refuses to target the English agent. Creating Arabic does not delete or migrate historical provider conversations; its retention configuration is copied from English and new conversations belong to the selected agent.

Spoken citations are displayed only when the agent sends a structured citation event; the browser no longer converts guessed paraphrases into quotations.

Live sessions have no application-level daily allowance per student. The hosted ElevenLabs agent uses a 7,200-second conversation maximum (the provider's documented ceiling) and `silence_end_call_timeout = -1` to disable silence termination. The root sync script preserves these settings on future knowledge updates. LiveAvatar's subscription duration limit and available provider credits still apply, so sessions are not unlimited. The October 6, 2026 settings-only update is recorded in `../outputs/session-limits/verification.json`; it did not upload course content or change voice/language settings.

## Validation

See [VALIDATION.md](VALIDATION.md) for the checks completed on this version and their limits.

```sh
npm run lint
npx tsc --noEmit
npm run test:offline
npm run build
```

The offline suite covers retrieval, follow-ups, policies, source metadata, input boundaries, streaming failures/cancellation, cache safety, email routing, and profile persistence. It makes no model calls.

Browser tests need a running local server:

```sh
npx playwright install chromium
npm run test:browser

# Or use an installed Google Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

The browser suite tests real login, the materials endpoint, navigation, profile persistence, responsive layouts, and source rendering. Model responses are mocked so UI checks are repeatable and do not spend API quota. Set `TEST_BASE_URL` to test another local/preview server.

Live model suites call the configured provider and consume quota:

```sh
CHAT_TEST_INTERVAL_MS=30000 npm test -- http://localhost:3000
npm run test:smoke -- http://localhost:3000
node scripts/test/grounding.mjs http://localhost:3000 due-date
```

The targeted grounding script accepts `country`, `due-date`, `word-counts`, or `frameworks`; omitting the case makes no requests. Pace live runs on constrained accounts. A failed generation must fail a test, not pass because a nonempty apology was returned.

`next build --webpack` is the supported alternative if the local environment prevents Turbopack from starting its worker.

## Main files

| Area | Files |
| --- | --- |
| Workspace and visual system | `app/page.tsx`, `app/globals.css` |
| Chat and rendering | `components/chat-panel.tsx`, `message-text.tsx` |
| Library and source views | `components/course-library.tsx`, `citations-panel.tsx`, `app/api/materials/route.ts` |
| Generation planning | `lib/chat/prompt.ts`, `intent.ts`, `persona.ts` |
| Grounding and content | `lib/chat/course-facts.ts`, `lib/retrieval/`, `scripts/content/build-index.mjs` |
| Streaming and input validation | `lib/chat/stream-answer.ts`, `request.ts` |
| Cache | `lib/chat/answer-cache.ts` |
| Email drafting | `lib/chat/email.ts`, `app/api/email-draft/route.ts` |
| Voice | `components/live-avatar-stage.tsx`, `lib/voice/liveavatar.ts` |
| Profile | `lib/student/profile-store.ts` |
| Tests | `scripts/test/` |

The retired Streamlit application remains in `legacy-streamlit/` for reference.
