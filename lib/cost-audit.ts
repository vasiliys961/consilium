/**
 * Local, metadata-only accounting summary. Never accepts patient text, prompts,
 * answers or other raw evidence. OpenRouter billing is per HTTP response, not
 * inferred from the displayed (estimated) clinical stage plan.
 */
import type { CaseResult } from './conductor.ts';
import type { CostCallStage } from './cost.ts';

export interface ModelCostRow {
  stage: CostCallStage | 'unclassified';
  model: string;
  calls: number;
  received: number;
  truncated: number;
  failed: number;
  missingUsage: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  billedUsd: number;
  estimatedUsd: number;
}

const validStages = new Set<string>(['speech', 'genetics', 'imaging', 'evidence', 'synthesis', 'consilium']);
const finiteNonnegative = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const roundUsd = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

/** A model may appear in more than one stage; never guess stage from model name. */
export function summarizeModelCosts(cost: CaseResult['cost']): {
  rows: ModelCostRow[];
  accountedUsd: number;
  reportedUsd: number;
  differenceUsd: number;
  billedResponses: number;
  estimatedResponses: number;
  missingUsageResponses: number;
} {
  const groups = new Map<string, ModelCostRow>();
  let billedResponses = 0;
  let estimatedResponses = 0;
  let missingUsageResponses = 0;
  for (const call of cost.calls ?? []) {
    const stage: ModelCostRow['stage'] = call.stage && validStages.has(call.stage)
      ? call.stage : 'unclassified';
    const model = call.model || 'unknown';
    const key = JSON.stringify([stage, model]);
    let row = groups.get(key);
    if (!row) {
      row = { stage, model, calls: 0, received: 0, truncated: 0, failed: 0,
        missingUsage: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, billedUsd: 0, estimatedUsd: 0 };
      groups.set(key, row);
    }
    row.calls++;
    row[call.status === 'received' || call.status === 'truncated' ? call.status : 'failed']++;
    if (call.usageAvailable !== true) { row.missingUsage++; missingUsageResponses++; }
    row.inputTokens += finiteNonnegative(call.inputTokens);
    row.outputTokens += finiteNonnegative(call.outputTokens);
    row.durationMs += finiteNonnegative(call.durationMs);
    if (call.billingSource === 'openrouter') { row.billedUsd += finiteNonnegative(call.usd); billedResponses++; }
    else { row.estimatedUsd += finiteNonnegative(call.usd); estimatedResponses++; }
  }
  const rows = [...groups.values()].map(row => ({
    ...row, billedUsd: roundUsd(row.billedUsd), estimatedUsd: roundUsd(row.estimatedUsd),
  })).sort((a,b) => a.stage.localeCompare(b.stage) || a.model.localeCompare(b.model));
  const accountedUsd = roundUsd(rows.reduce((total,row)=>total+row.billedUsd+row.estimatedUsd,0));
  const reportedUsd = roundUsd(finiteNonnegative(cost.totalUsd));
  return {
    rows, accountedUsd, reportedUsd, differenceUsd: roundUsd(reportedUsd-accountedUsd),
    billedResponses, estimatedResponses, missingUsageResponses,
  };
}
