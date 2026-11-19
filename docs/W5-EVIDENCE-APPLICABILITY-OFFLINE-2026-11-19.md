# W5 — clinical claim to source applicability, offline hardening (2026-11-19)

## Identified issue
A prior source panel could show an apparent dose match when the claim was `5 mg/kg/day` but the only accessible source said `5 mg`. A bibliographic-only source returned empty missing-quantity and missing-population lists, although **no passage had been read**. This is ambiguous for physician evidence review.

## Changes
1. Compare **complete unit strings** (`mg`, `mg/kg`, `mg/kg/day`, `mg/5 mL`, `ng/mL`, `ng/L`, `mL/min/1.73 m²`); these are not interchangeable. Russian/English equivalents receive only literal normalization, never numerical dose conversion.
2. A bibliography record with no text cannot verify quantitative or population-scoped claims. Show explicit provenance limitation.
3. If an affirmative prescribing statement is linked to a source excerpt with `contraindicated`, `not recommended`, etc., show a **caution** to read the actual scope. This is only a textual signal; it is not automatic semantic contradiction detection or clinical contraindication.
4. All observations are local/offline. No new provider calls, no source retrieval, no treatment decision auto-blocking. Existing references remain available to the physician.

## Validation
Nine additional synthetic adversarial test groups, test/typecheck/build required in GitHub CI. No real patient data. Independent clinical, browser and external source verification remain pending. CI passing does NOT verify source truth.

## Merge
Independent from medication stack and diagnostic preflight #116. Base `chatgpt-dev`, Draft only; no main, local server or Preview mutation.
