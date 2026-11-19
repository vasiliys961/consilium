# W5 Doctor Opus clinical output evidence guard — 19 Nov 2026

## Task
Test the **actual Doctor Opus clinical synthesis boundary**, not Nemotron or any other standalone model. Use the same 25 fictional W5 vignettes and feed mocked model answers through `analyzeCase`. Verify that clinically dangerous unsupported assertions are highlighted in the physician UI via `validationWarnings` rather than silently accepted.

## What changes
- Checks four narrow provenance discrepancies: normal ECG explicitly not supplied, negative/normal CT despite unread source, discontinued warfarin described as active, hemodynamic stability stated with documented marked hypotension.
- Flags are warnings requiring source review. **Nothing is automatically promoted to fact**, no model output is silently rewritten and no clinical accuracy metrics are manufactured.
- Existing UI already renders `result.validationWarnings` as `role=alert` in `analysis-workbench`.
- No new model, API, cost, hosted retrieval, patient data, React component or dependencies.

## Test scope
Seven offline unit checks on original synthetic DX notes and two real `analyzeCase` path regression checks with mocked OpenRouter responses. Asserts actual `clinicalDraft=generated`, unsigned output, source warning and no warning on appropriately uncertain answer. No live Opus responses, browser or human validation: a green CI verifies **software behavior only**, not diagnostic sensitivity or treatment quality.

## Dependencies
Derived from W5 25-vignette draft PR #100 and independent from medication stack, free-model Nemotron experiments and #116 lexical preflight. To integrate into Doctor Opus, use this guard as an app-level check. Preserve main/chatgpt-dev and local 3107/3207; no auto-merge or deployment.
