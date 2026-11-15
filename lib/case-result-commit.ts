import { decisionDraftFrom, persistCase, persistCaseDraft, type Analysis, type ClinicalCase } from './casebook.ts';

/**
 * Promote an editor-only question into this request's in-memory analysis snapshot.
 * Only a returned server result may make the event part of durable case history.
 * A retry must start from the persisted case, not from this temporary snapshot.
 */
export function stagePhysicianQuestion(
  snapshot: ClinicalCase,
  question: string,
  id = crypto.randomUUID(),
  at = new Date().toISOString(),
): ClinicalCase {
  const text=question.trim();
  return text ? {...snapshot,events:[...snapshot.events,{id,at,kind:'question',text}]} : snapshot;
}

/**
 * Persist the unsubmitted question before a potentially paid or interrupted
 * request. Keeping it in workspaceDraft avoids recording an event for a failed
 * call, while surviving an unexpected browser reload.
 */
export async function preservePendingQuestion(
  snapshot: ClinicalCase,
  question: string,
  note: string,
  decision: string,
  save: (value: ClinicalCase) => Promise<void> = async value=>{
    const applied=await persistCaseDraft(value.id,value.workspaceDraft!,snapshot.updated);
    if(!applied)throw new Error('Случай изменился во время подготовки вопроса. Обновите случай перед отправкой.');
  },
): Promise<void> {
  if(!question.trim())return;
  await save({...snapshot,workspaceDraft:{
    question:question.trim(),note,decision,tab:'analysis',
  }});
}

/**
 * Turn a server-completed response into a locally durable physician-case step.
 * The UI must not clear the pending question or announce saved success until
 * this write finishes; if the vault fails, return the result for manual export.
 */
export async function commitClinicalAnalysis(
  snapshot: ClinicalCase,
  entry: Analysis,
  workspaceDraft: NonNullable<ClinicalCase['workspaceDraft']>,
  save: (value: ClinicalCase) => Promise<void> = persistCase,
): Promise<{ value: ClinicalCase; stored: boolean }> {
  const value: ClinicalCase = {
    ...snapshot,
    updated: entry.at,
    analyses: [entry, ...snapshot.analyses],
    workspaceDraft,
    ...(entry.kind === 'summary' && entry.result.clinicalDraft === 'generated'
      ? { decisionDraft: { analysisId: entry.id, at: entry.at, text: decisionDraftFrom(entry) } }
      : {}),
  };
  try {
    await save(value);
    return { value, stored: true };
  } catch {
    // Preserve the just-completed result in memory even if IndexedDB is full.
    // The UI can still export it, and must never pretend it has been persisted.
    return { value, stored: false };
  }
}
