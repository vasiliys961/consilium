import { MODELS } from "../../lib/cost.ts";
import { complete } from "../../lib/gateway.ts";
import { languageName, type Locale } from "../../lib/locale.ts";
import { checkFidelity, targetLanguage, type FidelityReport } from "./fidelity.ts";

export interface Interpretation extends FidelityReport {
  translation: string | null;
  audience: "screen" | "patient";
  target: Locale;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

function sourceLanguage(source: string): "en" | "ru" {
  return /[а-яё]/i.test(source) ? "ru" : "en";
}

export async function interpretSpeech(
  env: Record<string, string | undefined>,
  input: { text: string; locale: Locale; audience?: "screen" | "patient"; target?: Locale },
  fetchImpl: typeof fetch = fetch,
): Promise<Interpretation | null> {
  const source = input.text.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!source) return null;
  const audience = input.audience === "patient" ? "patient" : "screen";
  const target = input.target ?? targetLanguage(source, input.locale, audience);
  if (!input.target && target === sourceLanguage(source)) {
    return { source, translation: source, audience, target, findings: [], model: null, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  }
  const language = languageName(target);
  const turn = await complete(
    env,
    {
      model: MODELS.pro,
      maxTokens: 800,
      messages: [
        {
          role: "system",
          content: `Translate the clinician or patient text into ${language}. Preserve every number, unit, drug name, and negation. Do not add a diagnosis. Output only the translation.`,
        },
        { role: "user", content: source },
      ],
    },
    fetchImpl,
  ).catch(() => null);
  if (!turn?.text.trim()) {
    return { source, translation: null, audience, target, findings: [], model: null, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  }
  const translation = turn.text.replace(/\s+/g, " ").trim().slice(0, 4000);
  const report = checkFidelity(source, translation);
  return {
    source: report.source,
    translation,
    audience,
    target,
    findings: report.findings,
    model: turn.model,
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
    durationMs: turn.durationMs,
  };
}
