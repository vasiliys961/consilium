import { MODELS } from './cost.ts';
import type { Citation } from './literature.ts';

export const CONSULT_MODELS = [
  { id: MODELS.sonnet, label: 'Claude Sonnet 5.5' },
  { id: MODELS.opus, label: 'Claude Opus 5.5' },
  { id: MODELS.sol, label: 'GPT-6.1 Sol' },
] as const;
export type ConsultModel = 'auto' | (typeof CONSULT_MODELS)[number]['id'];
export type ConsultDepth = 'auto' | 'brief' | 'detailed';
export type ConsultStage = 'planning' | 'searching' | 'answering';
export type ConsultReply = {
  text: string;
  model: string;
  cost: number;
  usageComplete: boolean;
  depth?: Exclude<ConsultDepth, 'auto'>;
  sources: Citation[];
  searched: boolean;
};
export const REVIEW_MARKER = '\n\n[DRAFT TO REVIEW]\n';
export const REVIEW_LIMIT = 64_000;

export function reviewModelFor(model: string): Exclude<ConsultModel, 'auto'> {
  return model === MODELS.opus ? MODELS.sol : MODELS.opus;
}
