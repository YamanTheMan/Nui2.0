# Validation — Nui 2.0 0.2.0

## October 14 — Live persona name

The hosted English agent still explicitly identified itself as AskProfNui in its system prompt, display name, and fallback greeting. These fields now say Nui 2.0. Both hosted agents and local prompt files also identify AskProfNui as former branding and give the current name precedence over older names in retrieved course material.

- Applied a targeted provider patch rather than the full pending knowledge/prompt sync. No website deployment was required. New sessions use the updated hosted configuration.
- Final provider readback matches the original configuration plus only the intended branding changes. Voice IDs, English Flash v2, Arabic v4, all 13 knowledge references, retrieval, tools, profile defaults, session limits, platform settings, and workflow were preserved. No historical conversations were deleted or migrated.
- Fresh live WebSocket conversations answered both “What is your name?” and “Are you AskProfNui?” correctly in English, plus their Arabic equivalents. Both returned spoken audio. This verifies the hosted agents directly; the browser/avatar path was not retested in this change.
- All 15 offline Python regression tests passed, including the new identity/default-greeting check. `git diff --check` passed.

Sanitized readback and live-response evidence is in `../outputs/persona-branding/`. Full configuration backups are private local temporary files. The broader English knowledge/prompt refresh described below remains unpublished; the branding fix is now live.

## October 6 — Arabic live conversations

Production deployment `dpl_6MhoPvFuYbvRAtucYbPsp6EZc4iM` is READY at https://askprofnui.vercel.app (Next.js 16.3.5; Vercel build completed in 13 seconds). Students choose English or Modern Standard Arabic before starting a live call. English retains its original Flash v2 agent. Arabic uses a separate agent with regular `eleven_v4`, the same cloned voice, and the same 13 existing knowledge-document references. Arabic controls are scoped RTL; the rest of the website is unchanged.

- ESLint, TypeScript, 109 offline web checks, 14 Python checks, the local production build, and Vercel's production build passed.
- All 16 desktop/mobile Playwright cases passed against production. These cover existing sign-in/library/chat flows and the language selector, saved profile preservation, correct request language, no automatic call start, unavailable-language handling, and rejection of mismatched provider responses. AI requests in these browser scenarios are mocked.
- Separate real avatar calls passed for Arabic and English on both localhost and production: 1280×720 video played, avatar speech state was observed, and both calls ended cleanly. No browser page errors were reported. These calls used a synthetic microphone, not the user's physical microphone.
- A direct Arabic live-agent test using regular v4 streamed nonempty PCM 24 kHz speech for two questions. It correctly stated the ten-paper/seven-minute requirements and disclosed that it is an AI assistant that cannot decide grades. First audio arrived after approximately 2.3 and 2.0 seconds in these test turns.
- A separate speech-input test sent a 4.56-second synthetic Arabic question as paced PCM audio, with no text-message substitute. Arabic speech recognition transcribed it accurately; the agent answered in Arabic and returned spoken audio. Physical microphone behavior and perceptual lip synchronization still depend on the user's device and connection.
- Final provider readback verified the complete original English conversation configuration and platform settings were unchanged. Arabic prompt readback matches the dedicated local file; existing knowledge IDs and provider retention settings were preserved. No course files or historical conversations were deleted or migrated.
- Both agents retain the two-hour ElevenLabs maximum and disabled silence termination. LiveAvatar plan limits and provider credits still apply.
- The deployment error-log query returned no matching logs.

Sanitized provider and live-call verification records are in `../outputs/arabic-live/`. The English knowledge/prompt refresh described in the September notes below remains a separate unpublished change; this release created Arabic and did not sync over the English agent.

## September 26 refinements

The homepage has less repeated copy, larger starter headings and category tabs, and a prominent course-library button. All 12 student-facing resources remain available. Dated notes appear newest first under Class updates; the optional IX Lab opportunities section has been removed while AI-clone consultation hours remain. The product name is Nui 2.0 across the active UI and assistant instructions.

- 101 offline checks pass: 81 retrieval/grounding checks, 14 runtime tests, and 6 profile tests.
- ESLint, TypeScript, and Vercel's production build pass.
- All eight desktop/mobile browser checks passed against deployment `dpl_9kswNKNopYrKnAhaVKuwneBcWSkJ`, including the larger library button, update filtering, content removal, and availability of all resources.
- The production title reads Nui 2.0 and the dated-material endpoint exactly matches the three revised sections. Text answers use cache version `v8-nui-2` and 120 indexed sections across 13 documents.
- The soft-pink/berry theme was visually checked on desktop and mobile across the homepage, library, login, and live conversation views. The final homepage illustration fits without clipped labels, and layouts have no horizontal overflow. Primary-button contrast is 7.40:1; checked muted text combinations exceed 4.5:1.
- Final pink deployment: `dpl_7GGr3arJwHUY8YUz5agxV3tn4KZb` (READY), aliased to https://askprofnui.vercel.app. Vercel's production build passed.
- The voice changes are prepared locally. Automatic approval review blocked the ElevenLabs sync pending specific approval to send the revised content and instructions. The hosted agent therefore still has the September 22 configuration until that sync is approved and completed.

## Previous release — September 22

The following checks describe the earlier release and its hosted voice sync.

Production: https://askprofnui.vercel.app

Vercel deployment: `dpl_GbSjLRjULVikAnzPiMgXViSQfmh5` (READY). Includes the September 16 class update, 121 indexed sections across 13 documents, and cache prompt version `v7-september-update`.

## Passing checks

- ESLint and TypeScript: clean.
- Production builds: local `npm run build -- --webpack` and Vercel's default Turbopack build both succeeded on Next.js 16.3.5.
- Offline checks: 80 retrieval/grounding checks, 14 runtime tests, and 6 profile tests.
- Browser checks: all 8 Playwright cases pass against the production URL across desktop Chrome and mobile Chromium, following earlier local verification. They cover sign-in, responsive layout, profile storage, keyboard navigation, the real course-material endpoint, source excerpts, safe rich text, retry behavior, view switching, and conversation reset. AI replies are mocked in these browser tests.
- Earlier local live grounding scenarios: Assignment 1 country restrictions, missing Assignment 2 calendar dates, final-project versus reflective-essay word counts, and TAM/UTAUT/UTAUT2 distinctions. The word-count and framework tests initially caught unsupported extrapolations; both passed after targeted fixes and cache invalidation.
- Earlier local live cache suite: all 11 checks passed, including byte-identical repeat answers, cached late-policy/grading replies, no cross-student name leakage, and cache bypass for greetings and follow-ups.
- Production live answers: the September 16 Assignment 1 question passed checks for both presentation dates, seven minutes plus Q&A, ten peer-reviewed articles, the home-country restriction, and fixed theory; a repeat returned the same updated answer from cache. A separate consultation question passed checks for Tuesday hours, IX Lab, Canvas access, five minutes, and advice without grading. The Assignment 2 due-date regression still correctly reports that its calendar deadline is unspecified.
- Production material endpoint: anonymous requests return 401; authenticated requests return all four September 16 sections exactly matching the local index. Production voice choices and default voice are available.
- Hosted voice configuration: prompt read-back exactly matches the local file, all 13 knowledge documents are attached, retrieval is enabled, the original voice is preserved, and `end_call` is enabled. The missing provider search indexes were built and all 13 report `succeeded` at 100%. Offline request/session mocks also exercised timeout, cleanup, transcript counting and restart behavior.
- Voice sync readiness: 8 offline Python regression tests pass, covering provider failures, missing/wrong-model indexes, bounded timeouts, batch limits, and blocking agent updates until every document is ready. Run `python3 -m unittest discover -s tests -v` from the repository root.
- Dependency audit: zero reported vulnerabilities after updating Next.js and ESLint configuration to 16.3.5 and applying compatible transitive patches.
- `git diff --check`: clean.

## Important limits

The first unpaced live suite hit unavailable-answer states after a burst of requests. Provider diagnostics reported an 8,000-token-per-minute limit for each configured model during this run. Targeted follow-up tests were paced. The complete live tone/email suite is **not** claimed as passing; model results are also nondeterministic.

The initial local Turbopack build was prevented from starting its worker by the sandbox. Webpack passed locally, and Turbopack subsequently passed in Vercel's production environment.

No live microphone/avatar session was opened; hosted voice configuration and document readiness were verified through the provider API. A backup of the prior voice configuration was saved locally before syncing.

See [CONTENT_REVIEW.md](../CONTENT_REVIEW.md) for missing dates, incomplete scholarship, and conflicting notes that require instructor confirmation. Source traceability and regression coverage reduce errors; they cannot guarantee every generated answer is correct.

## Reproduce

```sh
cd web
npm run lint
npx tsc --noEmit
npm run test:offline
npm run build -- --webpack

# With a development server running:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
CHAT_TEST_INTERVAL_MS=30000 npm test -- http://127.0.0.1:3000
node scripts/test/grounding.mjs http://127.0.0.1:3000 word-counts
```

Use the browser project's default Chromium installation when Google Chrome is unavailable.
