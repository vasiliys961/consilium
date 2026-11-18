# Codex workstation checkpoint — 17 November 2026

## Current authority and product direction

The owner handed development to Codex, then clarified the priority: a reliable,
pleasant, physician-oriented workstation. Work in coherent clinical workflows;
keep technical configuration out of the everyday path. Preserve existing modules.
The handoff is a reference checked against code, not a reason to restart W1.

- Base: `origin/chatgpt-dev` = `9443e67ca01e04bc5e07c3c42dfc41f692d80b46`.
- Independent branch: `codex/w4-workstation-safety`.
- Runtime/test commit: `615d95c742c25a534d0b50669ee4fdf3735978ac`.
- Draft PR: [#86](https://github.com/vasiliys961/consilium/pull/86), base `chatgpt-dev`; not merged.
- Worktree: `/private/tmp/doctor-opus-w4`; independent repository:
  `/private/tmp/doctor-opus-codex-repository`. Temporary paths are not deployment paths;
  recover the branch from GitHub if the OS removes them.
- `main` = `8a0638a6a3713e22e12cc48c649241f058106ec1`; comparison: 0 behind / 51 ahead.
- The original `Documents/ChatGPT/cosiliim` is an uncommitted local installation,
  not the GitHub checkout. Do not initialize/overwrite it to resolve that difference.
- Existing Preview: `Documents/Consilium-Preview`, local HEAD `4eda13f`, with one
  pre-existing Radiology generated-file change. Neither it nor 3107 was modified.
- The owner closed the 3207 browser window; this does not authorize server changes.
- Paid API calls, merges, deployments, Radiology AI and Integration Hub remain outside
  current authorization. Radiology does not block this workstation Gate. Only OpenRouter.

## Existing PRs verified against GitHub

All six remain open drafts, not merged into the base:

| PR | Purpose | Head | PR workflow |
|---|---|---|---|
| #75 | W1 local tool discovery/context | `1d80c84` | success, run 44121066725 |
| #76 | W2 completed specialist result return | `2442185` | success, run 44125307273 |
| #77 | historical stop checkpoint | `9f05505` | no PR run returned |
| #83 | defer Radiology | `a49067d` | no PR run returned |
| #84 | preserve ECG route / Word evidence | `a2582a2` | success, run 44145924598 |
| #85 | case facts in medication panel | `6733e33` | success, run 44149323052 |

No cherry-pick, merge or deployment of those PRs was performed. In particular,
this branch does not claim that the medication panel already has #85's integration.
The parser fix is compatible with #85's separate boolean spelling change.

## Implemented physician outcomes

1. **Leave and reopen a case without losing editable work.** Switching cases or
   creating a new one first saves current facts, materials and editor drafts;
   reopening restores question, note, decision and selected section. Storage
   failure/conflict keeps the doctor on the current screen. No routine discard dialog.
2. **A late answer cannot replace newer saved work.** The clinical result path
   re-reads the freshest case inside the existing write queue and appends the answer
   and submitted question. New documents, source files, physician decisions and
   unsent drafts remain. Duplicate answers are idempotent; closed/deleted cases are
   not recreated. Failed saves retain the completed response for export.
3. **Do not use a misleading measurement as a patient fact.** Numeric medication
   fields require the complete explicit value and supported units, without silent
   conversions. Historical/planned/negated/ambiguous suffixes, unsupported units,
   impossible values and repeated unknown/conflicting numerical fields remain unknown.
   Conflicts beyond 3500 characters are no longer silently truncated away.
   Bare numbers keep the existing canonical-unit convention. Free prose is not parsed.
4. **Clinical meaning before technical detail.** Model names moved inside closed
   service settings and second-opinion details. Module cards describe clinical tasks.
   Unavailable analysis explains that editing/saving remain possible. A changed case
   visibly marks its previous analysis as not updated. Important warnings, cost
   consent and source limitations remain available. Added copy exists in all ten UI languages.

## Evidence and reproducible commands

- Baseline: `npm test` — 1133 passed.
- Numeric factuality reproduction before fix: 12 of 25 checks failed; afterwards all
  25 pass. These are parser regressions, NOT 25 independently validated clinical cases.
- Targeted continuity checks: 17 passed, including encrypted reload and concurrent
  queued result completion. Navigation checks: 3 passed.
- W5 seed: `node --require ./scripts/openrouter-only.cjs --experimental-strip-types --test lib/workstation-scenarios.test.ts`.
  25 distinct synthetic cases execute real local screening and case persistence;
  one also mocks unavailable council requests. Each emits `W5_CASE` with expected
  findings, actual findings, extracted values, issues, local FN/FP and reopening.
- Final validation: **1189 tests passed / 0 failed**, typecheck and build passed.
- Commands: `npm test`, `npm run typecheck`,
  `NEXT_TELEMETRY_DISABLED=1 npm run build`.
- Dependencies were reused via a read-only reference to Preview's existing
  `node_modules`; no installation, weights or secrets were copied. No `.env.local`.

### Actual browser work (in-app browser, isolated 3307, synthetic only)

Created a case; entered context and unsent question/decision; returned to the case
list; reopened the case; verified both editor texts and the selected tab. Opened
the same case in a fresh browser tab and verified persistence. Switched RU/EN/RU:
question/decision text and clinical numbers were not translated. Confirmed the
collapsed service-settings title replaces the model-name banner and the analysis
unavailable message is visible. The 3307 test server was stopped afterwards.

Cold test server startup was 6 s; initial `/workspace` compilation 14.6 s; these
are dev compilation observations, not production latency measurements. RSS was
not measured. No LIVE_LLM, STT, ECGFounder execution or child module startup.

## Next coherent work packages

1. Review the existing draft dependencies #75/#76/#83–85 with the owner; no merge
   without permission. A separate temporary integration branch may be used to test
   them together, with results explicitly distinguished from `chatgpt-dev`.
2. Complete W4 browser trajectories through ECG/Word, RU/Global revisions and
   genetics using synthetic input; do not create substitute engines/editors.
3. Extend W5 from local rules to independent clinical expectations and separately
   authorized live-model checks. Pulmonary emergencies, AV block and anticoagulation
   indications are not validated by the local medication matrix.
4. Complete W1–W3, encrypted case transfer, library/OCR and real-phone acceptance;
   fix observed failures, then update `G-WORKSTATION-ACCEPTANCE.md` with actual evidence.

Not ready to claim Gate or pilot approval. Cross-tab/process write concurrency,
real microphone/phone, remote model reasoning and child integrations require
additional evidence; the in-memory per-case queue alone is not a cross-process lock.
