# W5 — offline diagnostic answer preflight (2026-11-19)

## What was actually exercised
Use the existing 25 **fictional** clinical vignettes (PR #100) to examine already-produced model answer JSONL **without a browser, server or API**. The new tool helps prioritize physician review for confident but unverified claims: a normal ECG without an ECG, negative CTPA without reviewed imaging, PE/ACS exclusion without evidence, warfarin incorrectly treated as current, or failure to mention urgent disposition in emergency cases.

The checker flags *possible* problems with narrow RU/EN lexical patterns. It does **not** score a response as clinically correct, count a missing phrase as a confirmed critical omission, verify all paraphrases or distinguish every negated sentence. A clean report has **zero clinical pass claims**. Human reviewers adjudicate with PR #100's independently approved case anchors.

## How to use without browser / API
1. Existing `scripts/w5-free-model-trial.mjs` produces JSONL only after a separately authorized provider run (none required here).
2. Run `node --experimental-strip-types scripts/w5-diagnostic-preflight.mjs <synthetic-model-results.jsonl>`.
3. Review the flagged case IDs and original responses with a physician. For final grading, use `scripts/w5-diagnostic-report.mjs` after independent reference approval.

The preflight neither executes nor authorizes a model run. It sends no text over network; never copies an API key into output. A text file must contain only fictional test material, **not** patient data.

## Technical checks
- 11 groups of adversarial and cautious synthetic cases, plus coverage of all 25 IDs, no fake diagnostics.
- Fail-closed on duplicate/unknown IDs, missing answered text and mislabeled failures.
- Reports `casesClinicianReviewed=0`, `clinicalValidation=false` even with all patterns clean.
- No runtime diagnostic treatment decisions or changes to clinical modules.
- CI test/typecheck/build required. Independent blinded physician scoring and actual model inference not performed.

## Branch integration
Based on PR #100, separate from W5 medication PR chain. Draft only; no main/chatgpt-dev/Preview/Codex/deployment changes.
