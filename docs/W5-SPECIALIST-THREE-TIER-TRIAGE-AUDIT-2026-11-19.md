# W5 — Experimental specialist model-tier routing audit (synthetic only)

Date: 2026-11-19. **Experiment, NOT accepted for clinical use.** Branch is based on PR #96 head `0436c8be`, targeting review without changing runtime. No API calls, keys, browser data, deployments or paid tokens.

## What is already implemented (not changed here)
- `lib/specialist-chat.ts`: Sonnet 5.5 plans `simple|complex`; auto-answer routes brief → Sonnet 5.5 and detailed → Opus 5.5.
- `lib/specialist-options.ts`: manual choice Sonnet 5.5, Opus 5.5 or GPT-6.1 Sol.
- No Haiku specialist runtime or three-tier clinical-risk classifier exists in this review baseline.

## What was actually tested
An independent deterministic, conservative rule-based *prototype* was executed locally against **82 author-created synthetic bilingual physician prompts**. This is an engineering smoke test of possible routing, **not a test of Haiku/Sonnet/Opus answers or clinical accuracy**.

Expected tier labels were authored in advance from the prompt's apparent risk: Haiku (isolated definitions), Sonnet (stable clinical work-up), Opus (urgent, polypharmacy, high-risk decisions). The first 52 cases were used to identify and revise two safety-gate rules; the subsequent 30 prompts formed a separate holdout. Holdout cases and observed routing are supplied in `docs/fixtures/w5-specialist-triage-holdout-2026-11-19.json`. The full local 82-case script and report can be provided by the owner as chat artifacts.

| Phase | Correct tier assignment | Dangerous under-triage |
| --- | ---: | ---: |
| Initial 52, v1 | 48/52 (92.3%) | 2 |
| Same 52 after repair (not independent) | 50/52 (96.2%) | 0 |
| Fresh 30-case holdout, v2 | **20/30 (66.7%)** | **5** |

**Dangerous holdout misses (assigned Sonnet but expected Opus):**
- H21: unstable chest tightness with diaphoresis;
- H22: collapse and generalized urticaria after a medication (possible anaphylaxis);
- H24: platelets 15 × 10^9/L and mucosal bleeding;
- H29: INR 6.2, cirrhosis, melena;
- H30: QTc 610 ms on two medications.

Conservative false escalations also occurred: an isolated definition of orthostatic hypotension and a stable follow-up mentioning *no syncope* were routed to Opus. The regular-expression prototype mishandles negation and unusual formulations. Additional errors were simple explanations routed to Sonnet.

## Pricing thought experiment — NOT billed spend
Current public OpenRouter nominal text rates, USD per million input/output tokens: Haiku 0.10/0.50, Sonnet 2/10, Opus 4/20. Example sizes are arbitrarily held equal at 1000 input + 1500 output tokens per question (not observed model usage).

The 30-case holdout router chose Haiku=4, Sonnet=17, Opus=9. **Calculated** cost $0.5984 vs $1.0200 if all 30 used Opus, nominal savings 41.3%. Classifier, retrieval, retries, escalation, caching, longer Opus outputs, and provider differences are excluded. Real savings cannot be inferred from this small balanced sample.

## Recommendation and next safe experiment
1. **Do not deploy this rule-based prototype or replace specialists yet.** The holdout demonstrated unacceptable missed high-risk triggers; optimizing solely for 3-tier accuracy hides the asymmetric danger.
2. Preserve current manual model override, source-binding, privacy review and independent review action. Use separate clinical urgency detection (explicit red flags + numeric parsing + negations, assessed in RU/EN) before optional cheap LLM tier prediction. Uncertainty, new treatments, contraindications, calculations and patient-specific therapeutic decisions should conservatively avoid Haiku until validated.
3. Prepare at least 50–100 independent reference tasks, including hard negatives, mild vs emergency lookalikes, children, pregnancy, renal dosing, QT, anticoagulation, interactions, subtle adversarial short questions and language alternations. Record *under-triage* as primary routing failure metric. Test on unseen prompts, not tuned fixtures.
4. Only with explicit new API budget: blind-call Haiku, Sonnet, Opus on exactly the same prompts, blind-score independent expert rubric for clinically important omissions/hallucinations, record actual OpenRouter `usage.cost`, latency p50/p95 and escalation rate. No real patient data.
5. Implement a feature flag and offline fallback in a separate PR only after evidence; keep `main`, port 3107 and production untouched. Current W4/W5 G-WORKSTATION gate still IN PROGRESS.

This PR supplies **experiment documentation and holdout fixtures only**, not a new routing engine or proof that Haiku is clinically equivalent to stronger models.
