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

Installed Preview/browser verification and CI are recorded below after execution. Until then, combined runtime browser acceptance remains pending. Main/3107 and the original standalone apps remain unchanged. The copied historical G-WORKSTATION register describes its earlier independent branch, not a completed gate for this runtime.

## Deferred owner material

[Copilot Avatar + Unified Cost Manager](future/copilot-avatar-cost-manager/README.md) and its visual reference are saved byte for byte as **future material only**, at the owner's explicit request. They are not the current assignment and do not authorize providers, payments, services or a UI redesign. Workstation continuity remains the priority.

## Remaining boundaries

The per-case queue serializes writers within this browser process; this is not a verified cross-tab/process lock. Full actual model-return journeys for ECG, ultrasound, genetics and DICOM series still need their own evidence and cost allowance where required. Camera, microphone and clinical correctness have not been tested by these regressions. Hub remains deferred. G-WORKSTATION is IN PROGRESS.
