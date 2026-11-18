# G-WORKSTATION acceptance — IN PROGRESS

17 November 2026. This is an evidence register, not approval for clinical use.
Current implementation: `codex/w4-workstation-safety`, based on `9443e67`.
Runtime/test commit `615d95c`; draft [PR #86](https://github.com/vasiliys961/consilium/pull/86), not merged.
See [checkpoint](CODEX-WORKSTATION-CHECKPOINT-2026-11-17.md) for independent worktree,
PR heads and reproducible commands. No unmerged PR is counted as part of the base.

| Stage | Implemented / claimed | Local and mocked evidence | Browser evidence this session | Remaining |
|---|---|---|---|---|
| W1 | Existing Copilot/specialist; #75 draft | Existing regression suite | Workspace renders; RU/EN switch | Full consultation, voice, documents and #75 integration |
| W2 | Existing module contracts; #76 draft | Protocol/genetics/clinical-result persistence tests | Case/editor reopening only | Actual specialist answer and source-bound module result return |
| W3 | Existing RU/Global Ambient | Existing consent/factuality tests | NOT TESTED | Microphone, STT, reviewed protocol and case return |
| W4 | Case history, council, medication rules, documents, ECG/genetics bridges | New result-continuity and numeric factuality regressions; existing mocked integrated journey | Unsent question/decision and tab preserved through list/reopening and fresh tab; no-key editing remains usable | ECGFounder→Word, RU/Global and genetics browser journeys; #84/#85 not merged |
| W5 | 25-case seed matrix plus existing synthetic tests | `workstation-scenarios.test.ts`: real local rules and persistence, mocked unavailable council | RU/EN/RU preserved entered text | Diagnostic reasoning, independent expert expectations, real phone/OCR/library transfer/update |

## W5 interpretation

The 25 cases cover AF, HF/CKD, QT, AV block, bleeding, dyspnea, pneumonia, COPD,
possible PE, severe CKD, potassium abnormalities, polypharmacy, alternatives,
stopped medicines, hepatic impairment, unknown data, negations, conflicting labs,
OCR ambiguity, follow-up, unavailable specialists and unsupported files.

Expected local findings and inputs are committed in `lib/workstation-scenarios.test.ts`.
Each case emits `W5_CASE`: extracted facts, issues, expected/actual local findings,
local FN/FP, reopening, an unassessed clinical question and `clinicalFN/FP: null`.
The initial two wording mismatches in the fixture expectations were corrected to
match the existing risk descriptions; no clinical rule was changed to make them pass.
A lack of a local warning is never scored as clinical safety. No diagnostic
sensitivity/specificity or exclusion of PE/AV block is established.

Executed local matrix: **25/25 cases**, 19 expected rule findings,
local FN=0/19 and FP=0 in this fixed matrix; **25/25 reopenings**.
Clinical FN/FP remain unknown. Full suite: **1189 passed, 0 failed**;
TypeScript and production build passed. This does not upgrade any NOT TESTED row.

## Required trajectories

| Trajectory | Actual evidence | Acceptance |
|---|---|---|
| Create → edit → leave → reopen | Real browser, synthetic case, isolated 3307 | PASS for editor preservation |
| Parallel saved update → delayed clinical answer → reopen | Executed fake IndexedDB integration tests | PASS locally; real cross-tab concurrency NOT TESTED |
| Specialist → answer → same case → reopen | Existing #76 draft tests only | NOT ACCEPTED |
| ECG → ECGFounder → Word → same case | Existing code and #84 draft; mocked journey | NOT ACCEPTED |
| RU/Global → edit → revisions → return | Existing integration tests | Browser NOT TESTED |
| Genetics → VCF → result → reopen | Existing provenance/continuity tests | Browser NOT TESTED |
| Encrypted case export/import and wrong password | Existing local tests | Browser NOT TESTED |
| Library/OCR/mobile/update | Existing local tests and historical user reports | Current browser/device acceptance NOT TESTED |

## Integrity, limits and owner decisions

No paid provider call, patient data, copied credentials, production deployment or
merge was used. Local test dependencies were reused without installation. Memory
RSS, production latency and actual provider costs are NOT MEASURED. Baseline main
and Preview processes/data were left alone. Only the temporary 3307 test server
was created and stopped.

Remaining engineering concerns include cross-tab/process write locking and full
end-to-end module preservation. LIVE_LLM and real STT require expense permission;
real patient data is not needed for the synthetic acceptance work.

Deferred: Radiology AI (viewer preserved), Integration Hub, prescription features,
hardware ultrasound integration, independent clinical validation and public release.
Radiology is not a Gate prerequisite. Gate is not yet passed: the outstanding
browser/module/clinical checks above must not be disguised as successful tests.
The owner decides merges and, after adequate evidence, whether a limited pilot
is appropriate. No pilot or release approval is inferred from this document.
