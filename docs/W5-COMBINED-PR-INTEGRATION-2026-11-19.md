# W5 — combined medication-context integration rehearsal (2026-11-19)

## Purpose
This is a **non-merge integration probe** combining draft #106 (strict context extraction), draft #107 (physician-facing clarification) and draft #104 (alternative-regimen organ and drug safety). It is an engineering experiment to expose cross-PR issues before the local Codex receives them.

## Exact scope
- Base: `chatgpt/w5-contextual-clinical-clarification-20261119` (draft #107, which includes #106).
- Transplanted exact file blobs from `chatgpt/w5-alternative-regimen-safety-20261119` (draft #104) where there is no overlap: drug interaction checker UI, page, rules and rules unit tests.
- Manually additive translation conflict resolution in `lib/workspace-i18n.ts`: preserve all #107 clarification strings and add #104 bleeding-confirmation labels.
- A dedicated deterministic synthetic integration test matrix `lib/w5-integration-medication-regimens.test.ts`.
- No live models, external API, patient materials, local Preview, deployment, merge, change to `main` or `chatgpt-dev`.

## Intentional clinical boundary
Invalid or conflicting values remain unknown even if a guessed correction is obvious. Incomplete context must never be called safe. Existing DailyMed-linked local checks are limited; green tests assess only the specified synthetic fixtures. Pregnancy/allergy/dose and diagnostic omission validation are **not covered by these 14 integration fixtures** and should be addressed by independent test layers and human review.

## PR dependency and future integration
- #103 is stacked on #96 and touches different paths from #104/#106/#107. No full runnable #96/#103 + this branch combined workflow is claimed.
- Review in order #106 → #107, then compare the integration probe against #104; do not independently merge both this probe and #104 without accounting for duplicated changes.
- Local Codex must reconcile the final `chatgpt-dev` head, run all CI, then perform browser acceptance in Preview 3207 with synthetic cases. Independent clinical validation is outstanding.
- English UI carries the explicit bleeding-confirmation label. Unchecked = unknown, never bleeding absent.
