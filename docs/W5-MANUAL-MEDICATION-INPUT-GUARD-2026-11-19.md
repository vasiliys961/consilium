# W5 — manual medication safety numeric entry (2026-11-19)

## Defect and clinical consequence
The existing standalone medication UI used `Number(text)` to trust manually entered eGFR, potassium, age and QTc. HTML numeric input bounds are not a clinical data-integrity boundary: invalid values can be pasted, can appear during partial editing, or can reach the callback despite browser constraints. This could produce spurious high/low potassium or long-QTc flags, or falsely reassuring treatment-context output.

## Change
`readManualMedicationFields` validates all four values deterministically, rejects units, exponents, out-of-bounds and fractional years/QTc. A rejected entry is **null/unknown**, not zero, and a visible input issue. A paid preliminary review cannot be initiated with rejected manual entries until they are corrected or cleared. No value is auto-corrected or converted. Valid independent fields still participate in local safety checks. All relevant strings are shown in Russian/English.

The bounds use existing extraction guard ranges and are not reference intervals. This does not validate identity/date of a lab result, or make a dose, allergy or pregnancy decision.

## Test boundaries
Eight synthetic deterministic regression groups. No live provider, no real patient information, no browser run. GitHub CI (test, TypeScript, build) required. Physician browser acceptance of keyboard input, paste, accessible warning and review-button state remains outstanding.

## Branch stack
PR #106 → #107 → #108 → **this PR**. Do not independently merge the overlapping #104 implementation after #108 without review. No changes to main, chatgpt-dev, local Codex, Preview or deployment.
