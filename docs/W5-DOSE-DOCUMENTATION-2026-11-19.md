# W5 medication order documentation — 19 Nov 2026

## Clinical purpose
Make *missing prescription details* visible instead of the generic blanket statement. This module checks ONLY whether the supplied proposed and alternative medicine lines contain documented dose/unit, route and frequency. It does not validate any therapeutic dose, interval, interaction, indication or pregnancy use. A fully documented order may still be clinically unsafe.

- Distinguishes a formulation concentration (250 mg/5 mL) from an actual administered volume.
- Weight-dependent mg/kg remains unresolved until weight is confirmed by physician and formulation verified; no automatic arithmetic.
- No drug names are silently discarded as approved. Alternatives are separate; more than 12 explicitly unexamined.
- Free, deterministic and local; no API calls, new dependencies or patient data.
- RU/EN feedback. Other language UX requires review.
- 11 synthetic regression groups. GitHub CI required; browser acceptance and independent clinical validation outstanding.

## Dependency
Stack #106 → #107 → #108 → #110 → #111 → #114 → this PR. Draft only; no merge/deploy, main, chatgpt-dev, Preview 3207 or Codex 3107 changes.
