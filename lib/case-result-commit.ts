import { decisionDraftFrom, persistCase, type Analysis, type ClinicalCase } from './casebook.ts';

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
