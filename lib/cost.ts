export const MODELS = {
  pro: "google/gemini-4-argon",
  flash: "google/gemini-3.8-flash",
  hydrogen: "google/gemini-4-hydrogen",
  sol: "openai/gpt-6.1-sol",
  terra: "openai/gpt-6.1-terra",
  opus: "anthropic/claude-opus-5.5",
  sonnet: "anthropic/claude-sonnet-5.5",
} as const;

/** Estimated USD per million tokens. Gemini tariffs verified 12 November 2026. */
const PRICES: Record<string, { input: number; output: number }> = {
  [MODELS.pro]: { input: 2, output: 10 },
  'google/gemini-3.1-pro-preview': { input: 2, output: 12 }, // Historical receipts.
  [MODELS.flash]: { input: 0.75, output: 3.75 },
  [MODELS.hydrogen]: { input: 1.5, output: 7.5 }, // OpenRouter standard rates verified 13 November 2026.
  [MODELS.sol]: { input: 2, output: 10 },
  [MODELS.terra]: { input: 1, output: 5 },
  [MODELS.opus]: { input: 4, output: 20 },
  [MODELS.sonnet]: { input: 3, output: 15 },
};

const UNKNOWN_PRICE = { input: 1, output: 5 };

const VISUAL = new Set(["radiology", "ultrasound", "dermatology", "histology"]);

export type CostStepId =
  | "intake"
  | "translate"
  | "hear"
  | "interpreter"
  | "frame"
  | "imageSecondOpinion"
  | "draft"
  | "hypothesis"
  | "testChooser"
  | "challenger"
  | "stewardship"
  | "checklist";

export interface CostStep {
  id: CostStepId;
  model: string | null;
  status: "done" | "planned";
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  usd: number;
}

export function priceUsd(model: string, inputTokens: number, outputTokens: number, at=Date.now()): number {
  const rates = model===MODELS.pro&&at>=Date.parse('2026-12-01T00:00:00Z')?{input:4,output:20}:PRICES[model] ?? UNKNOWN_PRICE;
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const usd = (input / 1_000_000) * rates.input + (output / 1_000_000) * rates.output;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** OpenRouter's usage.cost is the billed amount for THIS call; token rates are only a fallback. */
export function chargeForCall(model:string, usage:unknown): {usd:number;source:'openrouter'|'estimate'} {
 const record=usage && typeof usage==='object' ? usage as Record<string,unknown> : {};
 const billed=record.cost;
 if(typeof billed==='number' && Number.isFinite(billed) && billed>=0) {
  return {usd:Math.round(billed*1_000_000)/1_000_000,source:'openrouter'};
 }
 const input=typeof record.prompt_tokens==='number'?record.prompt_tokens:0;
 const output=typeof record.completion_tokens==='number'?record.completion_tokens:0;
 return {usd:priceUsd(model,input,output),source:'estimate'};
}

function planned(id: CostStepId, model: string): CostStep {
  return { id, model, status: "planned", inputTokens: 0, outputTokens: 0, durationMs: 0, usd: 0 };
}

export function planCost(path: "light" | "complex", modalities: Iterable<string>): CostStep[] {
  const steps: CostStep[] = [
    { id: "intake", model: null, status: "done", inputTokens: 0, outputTokens: 0, durationMs: 0, usd: 0 },
  ];
  const visual = [...modalities].some((modality) => VISUAL.has(modality));
  if (visual) steps.push(planned("frame", MODELS.pro));
  steps.push(planned("draft", MODELS.opus));
  if (path === "complex") {
    steps.push(
      planned("hypothesis", MODELS.pro),
      planned("testChooser", MODELS.sol),
      planned("challenger", MODELS.opus),
      planned("stewardship", MODELS.sonnet),
      planned("checklist", MODELS.opus),
    );
  }
  return steps;
}

export function totalUsd(steps: CostStep[]): number {
  const sum = steps.reduce((amount, step) => amount + step.usd, 0);
  return Math.round(sum * 1_000_000) / 1_000_000;
}

/** Mother billing: 100 clinic credits per dollar. This case does not keep a balance. */
export const CREDITS_PER_USD = 100;

export function creditsFor(usd: number): number {
  const amount = Number.isFinite(usd) ? Math.max(0, usd) : 0;
  return Math.round(amount * CREDITS_PER_USD * 100) / 100;
}
