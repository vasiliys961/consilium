# W5 — physician-supplied allergy, pregnancy and dose uncertainty (2026-11-19)

## Scope
Small, zero-cost patient-safety overlay on existing drug-interaction UI. No new clinical knowledge base or new model. Explicit structured allergy status, confirmed allergen ingredient names, and pregnancy status remain physician-controlled; unknown is not assumed negative. Exact ingredient matches are flagged across retained current drugs, new proposals and separately evaluated alternatives. Discontinued medicines are not automatically co-administered.

## Clinical boundaries
- Only literal ingredient/known alias equivalence is considered. A *penicillin class allergy* and amoxicillin are **not** auto-declared identical; class cross-reactivity must be evaluated from real history and prescribing references. An empty matched list is never a negative allergy screen.
- Confirmed pregnancy only triggers a label/population-specific review reminder; no unsupported algorithmic fetal safety claims or blanket contraindications.
- All doses/routes/frequencies require independent verification. Regex/name matching never approves a dose.
- A confirmed allergy status with no allergen, unparseable allergen history or contradictory input keeps review unresolved. No additional API call.
- One introductory description and visible findings in RU/EN, no repeated confirmation popups. International translations beyond EN need subsequent review.
- Never turn an AI conclusion into a confirmed allergy/pregnancy fact.

## Tests
Twelve synthetic deterministic tests; CI test/typecheck/build required, no real patient data. Browser acceptance and clinical validation not performed.

## Dependency
Stack: PR #106 → #107 → #108 → #110 → #111 → this PR. #104 changes are represented inside #108. No merge/deploy; preserve chatgpt-dev and main.
