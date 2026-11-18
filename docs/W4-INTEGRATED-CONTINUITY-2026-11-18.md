# W4 — integrate existing case, document and genetics continuity fixes

18 November 2026. Branch `chatgpt/codex-w4-workstation-continuity-20261118`, based on #95. No merge or paid model calls.

## Reuse and conflict decisions

This branch applies the already implemented runtime/tests of #86 (`615d95c`), #87 (`979316c`) and #88 (`2e93810`) onto the current #95/#94/#93/#92 stack. It does not merge their branches or replace the existing Copilot execution layer. Historical implementation evidence remains in the original checkpoint/document/genetics notes; it is not automatically browser acceptance of this combined runtime.

- Case navigation preserves the visible physician draft before leaving; delayed clinical results append to the latest case rather than overwriting newer materials, protocol returns and decisions. A failed save does not claim success.
- Structured protocol drafts persist separately by language/layout, exact saved documents reopen, revisions and complete Word evidence retain their original handling.
- Genetics workspaces restore files, family history, question and discussion from the selected case only; results and drafts use the existing per-case write queue. Closed/changed/foreign source guards remain active.
- Conflict resolutions retain newer Copilot callbacks, its atomic source-bound commits, the case-keyed portable export and the current collapsed technical/model UI. Independent locale additions are combined by keys; no conflicting translations were silently selected.
- New integration regression executes Copilot, delayed clinical response, structured protocol and genetics returns against one case. All results and independent physician/protocol/genetics drafts survive; a later Copilot commit for changed source material rejects.
- A new intersection defect is fixed: restoring a **copy** of a case containing a genetic discussion must rebind its verified local workspace owner to the new case ID. Historical clinical content/input signatures remain unchanged. A foreign discussion owner is rejected rather than reassigned. Protocol drafts survive encrypted transfer too.

## Verification

Full combined suite: **1240 tests passed, 0 failed**. Production build including TypeScript passed. Tests use synthetic local/mocked results; no provider reasoning or clinical validity is inferred.

Actual installed Preview/browser verification and CI are recorded below. Main/3107 and the original standalone apps remain unchanged. The copied historical G-WORKSTATION register describes its earlier independent branch, not a completed gate for this runtime.

### Installed browser acceptance

Combined runtime `5596a9fd7ef865fa2941977c24ff486b32247ca7` was installed on Preview 3207, branch `chatgpt/codex-w4-continuity-live-20261118`; preflight passes. The original generated Radiology `next-env.d.ts` change is preserved.

- Uploaded a real **synthetic** VCF (`GENE1`, `17-123-A-G`, `0/1`) through the browser chooser. The local parser displayed the actual variant and genotype without calling a clinical model or external annotation service.
- Case A (the synthetic transfer copy): entered distinct family history and an unsent question. Switched to synthetic case B: A's file and both inputs were absent. Entered B's question and returned to A: A's own VCF/history/question were restored.
- Opened A's genetics page in a fresh browser tab: the same source and unsent question survived. `Add material to case` saved the VCF and returned to **the same case ID**. Materials increased from 1 to 2; the earlier clinical analysis and RU protocol remained. The saved earlier analysis is visibly marked as based on older case data after adding the VCF, rather than being silently relabeled as current.
- These tests establish local VCF extraction, per-case draft isolation, reopening and source-material return. They **do not** establish new paid genetic interpretation, annotation quality or clinical validity.
- Four missing genetic return labels observed in the English UI are now supplied in all ten interface languages; this is not a claim that every legacy dynamic clinical/error string is localized.

CI for commit `0e767acdc1718dfc4d4f6508429489e6ba330e8e` (same runtime plus owner documentation): [core](https://github.com/vasiliys961/consilium/actions/runs/44383360347) and [Radiology integration](https://github.com/vasiliys961/consilium/actions/runs/44383359550) passed. The final label update is verified below.

## Deferred owner material

[Copilot Avatar + Unified Cost Manager](future/copilot-avatar-cost-manager/README.md) and its visual reference are saved byte for byte as **future material only**, at the owner's explicit request. They are not the current assignment and do not authorize providers, payments, services or a UI redesign. Workstation continuity remains the priority.

## Remaining boundaries

The per-case queue serializes writers within this browser process; this is not a verified cross-tab/process lock. Full actual model-return journeys for ECG, ultrasound, genetics and DICOM series still need their own evidence and cost allowance where required. Camera, microphone and clinical correctness have not been tested by these regressions. Hub remains deferred. G-WORKSTATION is IN PROGRESS.


### Final installed state

- Runtime **`d38aa3b178dba03125969478d5e2383f6f49fc52`**, installed branch **`chatgpt/codex-w4-continuity-localized-20261118`** on Preview 3207. Preflight passes; only the pre-existing generated Radiology `next-env.d.ts` is dirty.
- Final CI: [core tests, TypeScript and build](https://github.com/vasiliys961/consilium/actions/runs/44384363034), [Radiology integration](https://github.com/vasiliys961/consilium/actions/runs/44384362699): **success**. Local full suite 1240 passed; after the final label change, targeted language/genetics/combined-write checks and TypeScript also passed.
- Actual English browser check: `Genetic source files`, `Continue genetic review` and the saved-report notice are translated; the material list contains both the earlier TXT and the new VCF, with the expected locally extracted GENE1/0/1 and no invented ACMG class or external match.
- Browser evidence (synthetic only): `/private/tmp/doctor-opus-continuity-acceptance/genetics-returned.jpg` (full context), `genetics-returned-viewport.jpg` (compact). Temporary agent tabs were closed; owner tabs preserved. The synthetic book/case/drafts remain clearly named; nothing was permanently deleted.
- [Draft PR #96](https://github.com/vasiliys961/consilium/pull/96) is reviewable, not merged. Development worktree: `/private/tmp/doctor-opus-workstation-continuity`. #95 retains the independently reviewable book-transfer package.

Next work remains the actual module-return acceptance for ECG/ultrasound/guidelines/DICOM series, completion of genetics interpretation evidence when a fresh paid allowance is given, remaining interface language gaps, and cross-tab write protection. The successful local material route is not a replacement for those checks. W4/W5 and G-WORKSTATION remain in progress; avatar/cost-manager material and Hub remain deferred.
