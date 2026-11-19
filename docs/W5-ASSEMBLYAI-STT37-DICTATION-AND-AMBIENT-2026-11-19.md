# W5 — Direct AssemblyAI STT-3.7 for physician dictation and clinician–patient conversation

**Decision by owner: 19 Nov 2026. Status: approved *direction*, not approval to run paid requests or edit the production workflow.**
**Scope:** Global (English/multilingual) native protocol initially; check RU counterpart separately. Finish W4/W5 clinical workstation acceptance before enabling the new provider. No avatar work in this PR.

## One STT provider, two physician workflows

| Workflow | Source | STT model | Diarization | Output to Haiku 5.5 |
|---|---|---|---|---|
| **A. Physician dictation into protocol** | Doctor speaks alone, may include clinical shorthand and punctuation requests | Direct AssemblyAI `assemblyai-stt-3-7` (recorded audio) | **Off** | Exact dictated clinical facts -> structured *draft* / selected protocol fields; do not add findings |
| **B. Recorded physician–patient encounter (Ambient)** | Conversation with multiple speakers, e.g. 30–90 min | Direct AssemblyAI `assemblyai-stt-3-7` (recorded audio) | **On** (`speaker_labels: true`) | Speaker-attributed utterances, timestamps, source `[Tn]` -> factual HPI/PMH/medicines/ROS/observations, then editable draft |

**No arbitrary 20-minute clipping.** The vendor's async pre-recorded API supports up to **10 hours** and max 5 GB at `/v2/transcript`; direct `/v2/upload` limit **2.2 GB**. Validate the actual browser/editor upload limits separately, do not imply that vendor acceptance guarantees browser memory or storage. Do not use OpenRouter's sync STT file-size/duration limits for this route.

**One purpose = one transcription:** after the session is recorded and stopped, upload the intact saved file once to the async API. There is no need for real-time STT for these two modes. Medical Mode (`domain: "medical-v1"`) is OPTIONAL and language-scoped (EN, ES, DE, FR currently per official documentation), not an assumed Russian-language enhancement; only enable when evidence and allowed billing justify it. Distinguish acoustic `speaker_id` from the clinical roles doctor/patient (physician can assign/correct roles). For single-speaker dictation do not charge for diarization.

## Confirmed availability and cost

- **STT-3.7 was not listed on OpenRouter's transcription catalogue** at the time of decision; do not invent a model ID for OpenRouter. Use **direct** AssemblyAI API and a separate `ASSEMBLYAI_API_KEY` stored server-side, billed independently of OpenRouter.
- Official direct API selection: `speech_models: ["assemblyai-stt-3-7"]`, upload file + `POST /v2/transcript`, async polling/webhook, then read `utterances` and `speech_model_used` for actual model identity.
- Published pay-as-you-go: $0.21/hr basic async; diarization +$0.02/hr; Medical Mode +$0.15/hr. Examples **30-minute** audio: dictation basic **$0.105**; conversation with diarization **$0.115**; conversation with diarization + Medical Mode **$0.190** (excluding Haiku, any Keyterms/Prompting add-ons, downstream LLM, storage, taxes). Record exact provider billing if accessible; otherwise show clear estimated charges, not a fake receipt.
- Official sources to re-check before code: https://www.assemblyai.com/blog/which-assemblyai-stt-3-7-model , https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model , https://www.assemblyai.com/docs/pre-recorded-audio/label-speakers , https://www.assemblyai.com/docs/faq/are-there-any-limits-on-file-size-or-file-duration-for-files-submitted-to-the-api , https://www.assemblyai.com/pricing/ .

## Current implementation — reuse, don't rebuild

- `integrations/protocol/en/lib/assemblyai.ts`: existing direct AssemblyAI async REST client using `ASSEMBLYAI_API_KEY`, upload + polling, `speaker_labels:true`, `speech_model:'best'` **legacy**. Make model ID explicit and allow per-workflow speaker labels; preserve return of `utterances`, ideally timestamps and speaker IDs *as typed data*, not just flattened plain text.
- `integrations/protocol/en/lib/speech-provider.ts`: existing abstraction for STT provider.
- `integrations/protocol/en/app/api/transcribe/route.ts`: existing direct route when `CONCILIUM_OPENROUTER_ONLY` is off; integrated mode currently takes the `transcribeAmbientOpenRouter` path. **Do not flip that global flag** to turn on AssemblyAI and accidentally change other LLM calls; isolate an explicit per-STT-provider selection (e.g. `AMBIENT_STT_PROVIDER`) behind a feature flag.
- `integrations/protocol/en/lib/concilium-openrouter-stt.ts`: existing MAI-Transcribe 2 with acoustic labels and Whisper fallback through OpenRouter; preserve as manually selectable safe fallback/rollback, **not automatic re-billing after unknown timeout**.
- `docs/C14-MULTILINGUAL-AMBIENT-OPENROUTER-2026-11-16.md`: existing `PROTOCOL_DIALOGUE_DRAFT_MODEL='anthropic/claude-haiku-5.5'` for factual extraction; physician edits before final protocol. **Keep this stage**; no duplicate expensive model calls.
- `integrations/protocol/en/lib/ambient-draft-audit.ts`: preserve local check of provenance, negative statements and dosages; add diarization-focused scenarios.
- No change to live `main`, port `3107`, current Preview `3207`, patient records, separate apps or existing signed privacy protections.

## Non-negotiable recording safety / no lost encounter

**Do not lose a 20-, 45-, 60- or 90-minute encounter if network/STT/Haiku fails.**

1. The audio is recorded in the clinician's browser and durably saved locally (e.g. OPFS or IndexedDB or validated encrypted-file flow) **before first cloud submission**. Do not rely solely on a JS in-memory Blob, and do not claim guaranteed persistence across browser eviction. Display saved/unsaved state; offer manual export/recovery if local storage or quota fails. On tab close/reload/crash, recover last completed segment(s); if recorder segments are used, verify complete audio and continuity (gaps measured, no silent loss). Never declare success if not actually saved.
2. When stop is pressed, freeze the source audio and calculate a SHA-256/checksum; keep it linked to the chosen case and recording ID. Distinct recordings never overwrite each other; different patient cases never share fragments or speaker labels.
3. Upload exactly that saved audio to the **authorized direct AssemblyAI** endpoint, record remote job ID and upload status, and poll **without retranscribing** if the job is still running. Preserve file and job ID on timeouts/HTTP 5xx/unknown billing; do not automatically resubmit the whole file. Explicit retry requires check for existing job and clear billing implication.
4. Store **transcript + ordered utterances + acoustic speaker IDs + available timecodes** locally alongside source checksum and source [Tn] mapping before Haiku is invoked. Do not erase original audio or transcript because later LLM returned malformed JSON, drifted, or was canceled.
5. Haiku produces a **factual, editable draft only**: no invented physical findings, dosages, medication orders, sign-off, consent, diagnoses or treatments. If missing data, note it; preserve meaningful numbers, units, negations and temporal qualifiers, and sources `[Tn]`. Role attribution must remain editable and never inferred as certain from speaker ID alone.
6. Final clinical interpretation/management, if requested, remains separate with Sonnet/Opus and physician review; no full paid Consilium triggered by dictation or ambient automatically.
7. Save the edited protocol in the **correct** case and language. If user declines or STT fails, retained audio/transcript should remain recoverable within policy, with deliberate deletion controls and verified cleanup after the physician confirms. Preserve preview/origin case boundaries and existing privacy receipts.
8. Audio may identify people **before** any text de-identification. Do not use real patient audio in tests. Before real clinical use check consent, provider medical data terms, geographic processing region (EU option where applicable), data retention, BAA/DPA and local encryption.

## Acceptance tests for Codex

- **Mock/no paid API**: two 1-speaker dictation fixtures and six 2-speaker encounters, among EN/RU/ES, with drug names/doses, allergies, eGFR, negations, code-switching, interruption, and no completed objective exam.
- Assert dictation `speaker_labels:false`, conversation `speaker_labels:true`, exact `speech_models:["assemblyai-stt-3-7"]`; `speech_model_used` checked on response. Medical Mode only for explicitly allowed languages and billing; no silent add-on.
- Long-file simulations: 20/30/60/90 minutes with mock file upload and processing; no 20-minute chop, no missing fragments; local quota errors and recovery; no claim success before persistent write; force reload/timeout/HTTP 502/provider delayed completion and ensure same job reused.
- Verify physician-assigned speaker roles are not fabricated by Haiku; timestamps and `[Tn]` survive; zero invented doses, normal examinations, negative symptoms, prescriptions, or medication changes; physician can edit before signing.
- Cost receipts if available; otherwise `estimated` not `billed`; no duplicate paid STT after failure. Ensure preserved OpenRouter path still works; QA manually confirms browser microphone/save/load and cross-case isolation.
- Only after owner provides explicit budget and safe synthetic voice recordings: **paired live tests** against existing MAI/Whisper using WER, speaker-attributed WER, DER, drug/negation recall, latency, dropout, and $/encounter. No claim of clinical equivalence from mocked tests.

## Delivery order

First finish current workstation W4→W5 acceptance. Then 1) read actual current app, 2) produce minimal design/diff, 3) code on small separate feature branch/PR after owner approves the integration effort, 4) free offline tests, 5) limited billed synthetic audio trial only with approved budget, 6) optional rollout. **No work on avatar now** (separate future proposal). No extra agent framework, no new service for the sake of architecture.

This PR only records a clear owner decision for Codex; it changes **no runtime** and initiates **no paid request**.
