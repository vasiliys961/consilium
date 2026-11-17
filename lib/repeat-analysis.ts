/**
 * Zero-network duplicate-run guard. A repeat requires confirmation, never a silent skip:
 * clinicians may intentionally seek an independent answer from unchanged data.
 */
import type { Analysis, AnalysisKind } from './casebook.ts';

export interface RunOptions {
  task: string;
  kind: AnalysisKind;
  consilium: boolean;
  councilSpecialty?: string;
  secondOpinion: boolean;
  rereadImages: boolean;
  externalSearch: boolean;
  answerLocale: string;
  sourceLocale: string;
  retrievedSources: readonly {name: string; sha256?: string}[];
}

/** Compact key; source hashes, not full patient texts or binary data. */
export function runOptionsKey(options: RunOptions): string {
  return JSON.stringify([
    options.task,options.kind,options.consilium,options.councilSpecialty??'auto',options.secondOpinion,
    options.rereadImages,options.externalSearch,options.answerLocale,options.sourceLocale,
    options.retrievedSources.map(item=>[item.name,item.sha256??'']),
  ]);
}

export function duplicateCompletedRun(latest: Analysis | undefined, signature: string, optionsKey: string): boolean {
  return Boolean(latest
    && latest.inputSignature === signature
    && latest.requestOptionsKey === optionsKey
    && latest.result.clinicalDraft === 'generated');
}

export function repeatedRunWarning(latest: Analysis | undefined, language: string): string {
  const cost=latest?.result.cost;
  const amount=cost && Number.isFinite(cost.totalUsd)?cost.totalUsd.toFixed(4):null;
  const ru=language==='ru';
  const charge=amount
    ? cost?.billingComplete===true
      ? (ru?'Фактическое начисление прошлого запроса: $':'Previous billed amount: $')+amount+'.'
      : (ru?'Оценка прошлой стоимости: $':'Previous estimated cost: $')+amount+'.'
    : '';
  return [
    ru?'Данные, вопрос и режим разбора не изменились. Предыдущий результат сохранён.':'The case, question and analysis settings have not changed. Previous results are saved.',
    charge,
    ru?'Новый запрос может быть платным и дать другой ответ. Запустить повторный анализ?':'A new request may incur a charge and may produce a different answer. Run again?',
  ].filter(Boolean).join(' ');
}
