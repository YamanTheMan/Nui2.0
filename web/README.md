# AskProfNui

A voice and text teaching assistant for **IS 67-382: Digital Transformation,
Strategy and Management** at CMU-Q. Students can type a question or talk to a
speaking Prof Nui avatar, and every answer is grounded in the actual course
materials rather than whatever the model happens to remember.

Live at **https://askprofnui.vercel.app**.

## Architecture

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) on Vercel | UI shell ships from the CDN, so there is no cold-start wait before the student can type |
| Model | Groq — `openai/gpt-oss-120b`, falling back to `openai/gpt-oss-20b` | Fastest inference available; streaming makes the answer feel instant |
| Retrieval | In-memory BM25 over a prebuilt JSON index | The corpus is ~200 short chunks, so a vector database adds latency without adding accuracy |
| Voice | LiveAvatar LITE + an ElevenLabs conversational agent | The avatar renders remotely; ElevenLabs handles speech and its own RAG over the same documents |
| Cache | Vercel Runtime Cache | Course questions repeat constantly across a class, and a hit skips the model entirely |

There is no database, no embedding model, and no vector store at runtime. The
whole knowledge base is a committed JSON file, so a cold function starts in
milliseconds.

## How the model gets course knowledge

```
documents/*.txt  ──(npm run index)──▶  web/lib/retrieval/course-index.json
                                              │
                                    BM25 search at request time
                                              │
                    top chunks + verbatim course facts ──▶ system prompt ──▶ Groq
```

1. **Authoring.** Course content lives in plain `.txt` files in `documents/` at
   the repo root. Sections are separated by a `---` line.
2. **Build.** `scripts/content/build-index.mjs` splits each file into ~800-character
   chunks (100 characters of overlap) and writes them, with their source
   filename, to `lib/retrieval/course-index.json`. That file is **committed** — the
   deployed app never reads `documents/`.
3. **Request time.** `lib/retrieval/index.ts` builds a BM25 index from that JSON on
   first use and keeps it for the life of the process. Each question is tokenized
   (stopwords dropped, light plural stripping) and the top 12 chunks come back
   scored 0–1 relative to the best hit.
4. **Prompt assembly.** `lib/chat/prompt.ts` classifies the question's intent, then
   assembles the system prompt: Prof Nui's persona, verbatim facts from
   `lib/chat/course-facts.ts` for policy questions, the retrieved chunks, and any
   mandatory details the question touches. Greetings and off-topic questions skip
   retrieval entirely and use the small model.

Because the score is normalised, weak retrieval is detectable: if the best chunk
scores below 0.55 the prompt tells the model it may answer from trusted outside
sources (HBR, MIT Sloan, peer-reviewed IS research) with a citation block —
while still never inventing this class's grades, deadlines, or assignment rules.

## Running locally

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Environment variables go in `web/.env.local`:

```
GROQ_API_KEY=...
LIVEAVATAR_API_KEY=...
LIVEAVATAR_AVATAR_ID=...
LIVEAVATAR_SANDBOX=false
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...
ELEVENLABS_SECRET_ID=...
ELEVENLABS_VOICE_ID=...
```

Text chat only needs `GROQ_API_KEY`; the rest power the live avatar.

The site asks people to sign in first with the course username and password.
Set `LOGIN_USERNAME` and `LOGIN_PASSWORD` to override them; the test scripts
read the same two variables from `.env.local`.

## Adding or editing course content

1. Edit or add a `.txt` file in `documents/` (repo root).
2. Publish it to both assistants:

```bash
cd web && npm run sync
```

That rebuilds `lib/retrieval/course-index.json` **and** shells out to the root
`sync_elevenlabs_knowledge.py`, which uploads changed documents plus the agent
prompt to the ElevenLabs voice agent. It only re-uploads files whose hash
changed. Requires `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in the root
`.env`, and the Python deps in the root `requirements.txt`.

3. Commit the updated index and push — Vercel deploys automatically.

Use `npm run index` when you only want to rebuild the text index and skip the
voice sync.

## The voice agent

The spoken assistant is a separate ElevenLabs agent, so its personality lives in
`elevenlabs_agent_prompt.txt` at the repo root rather than in `lib/chat/persona.ts`.
`npm run sync` pushes that prompt along with the course documents. The two prompts
are written to match, and both drive the same four-stage grade-change arc — the
browser counts the attempts and feeds the stage to the agent, so the escalation is
defined in one place and the voice can't drift from the text.

It runs on **`eleven_flash_v2`**, set by `VOICE_MODEL` in
`sync_elevenlabs_knowledge.py`. The sync reads the agent's current voice settings and
swaps only the model, so the tuned voice, speed and stability survive the update.

**On laughter and the voice model.** Only the `eleven_v3*` models speak audio tags
like `[laughs]` as real laughter; Flash and Turbo read the brackets aloud as the word
"laughs". v3 was tried and does produce a genuinely human laugh, but it re-colours the
whole delivery and stopped sounding like Prof Nui's cloned voice, which matters more
than the laugh. So the agent stays on Flash and the prompt writes laughter as a single
spoken "Ha" folded into the sentence. Repeated syllables — "ha ha ha" — are what make
a synthesised laugh sound mechanical, so the prompt bans them explicitly.

If you ever do move to a v3 voice, put the tags back in the same change. `_check_prompt`
refuses to sync a tagged prompt to a non-v3 model, because that mistake is silent until
somebody listens to a live session.

Use `node scripts/ops/voice-samples.mjs` to render the same line across models and
settings into `voice-samples/` when you want to compare by ear.

## The answer cache

Course questions repeat heavily across a class, so answers are cached in the
Vercel Runtime Cache. A hit skips the model completely, which also sidesteps the
occasional multi-second queue on Groq's shared tier.

- **Only student-independent answers are cached.** A plan is cacheable only when
  the intent is `retrieve` and the question is not a follow-up. When it is, the
  model is sent *just* the question — no conversation history, no name, no major
  — and the prompt explicitly tells it not to greet or use a name. That is what
  makes it safe to replay one student's answer to another: **no student's name
  can ever appear in someone else's reply.** Greetings, off-topic replies, grade
  disputes, and follow-ups are never cached.
- **Keys are fingerprinted.** The key is `answer:<promptVersion>:<contentHash>:<intent>:<questionHash>`,
  where the content hash covers the course index. Re-running `npm run sync`
  changes the fingerprint, so edited content produces new keys instead of stale
  answers.
- **TTL is 7 days** (30 minutes for fallback answers — see below), and entries
  are tagged `course-answers`.
- **Every response reports what happened** via the `x-answer-cache` header:
  `hit` (replayed from cache), `miss` (generated and stored), or `bypass` (not
  cacheable — a greeting, a follow-up, or anything student-specific).
- A cache hit is replayed as a stream so it still reads like a live reply.
- **Manual purge:**

```bash
vercel cache invalidate --tag course-answers
```

In `npm run dev` an in-process `Map` stands in for the runtime cache, so local
behaviour matches production.

### Pre-warming before a demo

The cache is empty after a content change, so the first person to ask each
question pays full latency. Warm it first:

```bash
npm run warm -- https://askprofnui.vercel.app
```

That asks the 20 most common course questions once and reports `hit` / `miss` per
question, plus how many fell back to the smaller model. Run it after a deploy or
after `npm run sync`.

## Model fallback

The primary model is `openai/gpt-oss-120b`. If it has not produced **visible
text within 5 seconds**, the request switches to `openai/gpt-oss-20b` — a
slightly plainer answer beats staring at a blank screen. Once tokens are on the
wire the request is committed and never restarts, so a student never sees half an
answer twice. The abandoned generation is aborted rather than left running.

The budget is measured against the first *text* token, not the SDK's
`timeout: { firstChunkMs }`. Groq returns metadata almost immediately and can
then sit queued or reasoning for another 10+ seconds, which satisfies
`firstChunkMs` while the student still sees nothing.

Fallback answers **are** cached, but for 30 minutes instead of 7 days. The
questions that stall are exactly the ones that most need caching, so refusing to
cache them meant the slowest questions stayed slow forever; the short TTL lets
the larger model replace them soon after.

Each response carries a transient `data-model` part naming the model that
actually answered, so a fallback shows up explicitly instead of just looking like
an unexplained slow reply.

If **both** models come back empty — usually a Groq rate limit — the reply falls
back to a short apology rather than an empty bubble, which reads as a broken page.
That apology is never cached, so the next student gets a real answer.

## Writing the email to Prof Nui

Some things genuinely cannot be settled in the chat: an extension, a formal
appeal, illness, a failed upload, a group partner who vanished. Pointing at an
email address is where most assistants stop, and it is the exact moment a
stressed student stalls — they know who to write to, not how to say it.

So she offers to write it. `lib/chat/email.ts` classifies the message into one of
ten situations, the chat route attaches a `data-email-offer` part to her reply,
and `components/email-draft-card.tsx` renders a button under it. Pressing it calls
`/api/email-draft`, which returns a subject and body the student can edit before
opening a pre-filled **Gmail** compose window (with a `mailto:` fallback for
anyone not on Gmail). They read it and press send themselves — nothing is sent
on their behalf.

Two details do most of the work here:

- **The offer has to be rare.** Detection requires both a situation pattern and
  first-person wording, so "what is the late policy" gets an answer while "I was
  in hospital and missed the deadline" gets the offer. `topic_approval` and
  `meeting` are deliberately narrow for the same reason — "can I choose Qatar"
  and "when are office hours" are ordinary course questions.
- **The draft must not invent anything.** If the student never gave a date, a
  reason, or an assignment name, the draft leaves `[a bracketed blank]` for them
  to fill in. A draft with honest gaps is useful; one with an invented reason
  could embarrass them in front of their professor.

A question that needs an email describes *this student's* situation, so it is
never cacheable, and the mandatory-detail nudge is suppressed for the situational
reasons — reciting the Qatar rule at someone explaining a hospital stay reads as
tone-deaf. Grade begging never gets the offer; helping draft it would undo the
refusal she just gave.

The voice agent cannot open Gmail, so it makes the same offer and points the
student at the chat on the page.

## Tests

Start the dev server, then point the suites at any URL (they default to
`http://localhost:3000`):

```bash
npm test                                          # every suite
npm run test:smoke                                # the facts must be right
npm run test:scenarios                            # the tone must be right
npm run test:email                                # the email hand-off, end to end
npm run test:cache                                # cache behaviour + name-leak safety
npm run test:tone                                 # prints replies to read, no assertions

npm test -- https://askprofnui.vercel.app         # or point them at production
```

- `test:smoke` asks real questions through the real model and asserts the answers
  contain the details students previously reported as missing — the dance rule in
  the late policy, the Qatar exclusion for Assignment 1, the wow factor, the 40%
  weighting, the word-count tolerance.
- `test:scenarios` walks the situations students actually create — panic, good
  news, an apology, rudeness, "are you an AI", asking her to write the assignment —
  and checks each reply for tone as well as content. It then walks all four
  grade-change attempts in one conversation and asserts the arc: a short no, a
  blunt second, an explicit warning, then a real goodbye that closes the session.
- `test:email` checks both directions: five situations that must produce the offer
  with the right reason, and five ordinary course questions that must not. It also
  asserts she never writes the email inline, and that a draft built from a student
  who gave no reason and no date leaves both as blanks instead of inventing them.
  It asserts the reply is non-empty too, because the offer is a data part and would
  otherwise pass green while every bubble rendered blank.
- `test:cache` asks the same question as two different students and checks the
  repeat is byte-identical, served with `x-answer-cache: hit`, and free of the
  first student's name. It also confirms greetings and follow-ups report `bypass`.
- `test:tone` asserts nothing. It prints replies across eighteen situations so you
  can read them and judge whether she still sounds like a person.

Every reply is normalised to ASCII punctuation before it is checked, because the
model writes curly apostrophes and an assertion spelled `can't` would otherwise
silently never match `can’t`.

Timing, also against a running server:

```bash
node scripts/ops/measure-latency.mjs           # time-to-first-token
node scripts/ops/measure-latency.mjs --repeat  # second pass shows the cached hit
```

It prints the cache status and the answering model per question, so you can see
at a glance whether a slow reply was a cache miss, a fallback, or both.

Lower-level checks that need no server, since they import the library directly:

```bash
npx tsx scripts/test/retrieval.mts    # retrieval quality + intent routing
npx tsx scripts/ops/analyze-prompt.mts  # where the prompt tokens actually go
```

## Answer behaviour

Every question is routed by intent before it reaches the model:

- **Course questions** get verbatim facts from `lib/chat/course-facts.ts` ahead of the
  BM25 chunks, with specific details enforced as mandatory inclusions.
- **Greetings** and **off-topic questions** skip retrieval and use the fast model.
- **Emotional messages** are routed before course lookup, so a student who says
  they're failing gets steadied rather than handed the grading breakdown. Distress,
  celebration, apology, rudeness, and academic-integrity asks each have their own tone.
- **Grade-change begging** escalates over four turns — a clean no, then blunt, then an
  explicit warning, then the session closes. The wording is free each time; only the
  arc is fixed, so it never sounds like a recording.
- **Real grade disputes and extensions** are pointed at savanid@cmu.edu, and she
  offers to write the email — see "Writing the email to Prof Nui" above.
- **"How are you"** gets answered before she moves on. Skipping it for "I'm glad
  you're here" ignores a question the student actually asked.

## Repo layout

```
documents/                     course material (source of truth, repo root)
sync_elevenlabs_knowledge.py   voice agent sync, called by npm run sync
legacy-streamlit/              retired original Streamlit prototype (reference only)
web/
  app/api/chat/route.ts        streaming chat endpoint, cache + model fallback
  lib/chat/persona.ts          who she is and how she sounds, per situation
  lib/chat/intent.ts           what the student is actually doing
  lib/chat/prompt.ts           assembles the system prompt for one reply
  lib/chat/course-facts.ts     verbatim course facts
  lib/chat/answer-cache.ts     Vercel Runtime Cache wrapper
  lib/chat/sanitize.ts         strips emoji the prompt asked it not to use
  lib/retrieval/index.ts       BM25 search
  lib/retrieval/course-index.json   generated, committed search index
  lib/student/                 profile type and browser storage
  lib/voice/liveavatar.ts      LiveAvatar + ElevenLabs session helpers
  scripts/content/             build-index and sync
  scripts/test/                the test suites and the tone probe
  scripts/ops/                 latency, prompt analysis, cache warming, env push
```

`legacy-streamlit/` is the original Python + Streamlit version of this project
that ran on Render. It is fully superseded by this app and kept only for
reference — see `legacy-streamlit/README.md`.
