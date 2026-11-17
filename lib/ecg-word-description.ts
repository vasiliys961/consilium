/** Reuse the original ECG study description and append only completed,
 * source-identified ECGFounder evidence. Never promote detector scores into
 * diagnoses or replace the physician/model's already formatted report.
 */
import type {StudyReport} from './study-report.ts';
import {studyReportsText} from './study-report.ts';
import type {EcgModuleEvidence} from './module-evidence.ts';
import {ecgEvidenceText} from './module-evidence.ts';

export function ecgWordDescription(
  reports:readonly StudyReport[],
  evidence:EcgModuleEvidence|undefined,
  conclusionLabel='Заключение',
):string{
  const report=studyReportsText(reports,conclusionLabel);
  const technical=evidence ? 'ECGFounder — технические данные, не окончательный диагноз:\n'+ecgEvidenceText(evidence) : '';
  return [report,technical].filter(Boolean).join('\n\n');
}
