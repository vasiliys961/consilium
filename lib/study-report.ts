export interface StudyReport {
  source: string;
  modality: string;
  description: Array<{ label: string; text: string }>;
  conclusion: string;
  limitations: string[];
}

export function studyReportsText(reports: readonly StudyReport[], conclusionLabel = 'Заключение'): string {
  return reports.map(report => [report.source, ...report.description.map(row => `${row.label}\n${row.text}`),
    `${conclusionLabel}\n${report.conclusion}`, ...report.limitations].filter(Boolean).join('\n\n')).join('\n\n');
}

export function readStudyReports(raw: unknown, files: readonly string[]): StudyReport[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(files);
  const line = (value: unknown, limit = 1800) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  return raw.slice(0, 12).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const source = typeof value.source === 'string' ? value.source.replace(/^file:/, '') : '';
    if (!allowed.has(source)) return [];
    const description = Array.isArray(value.description) ? value.description.slice(0, 16).flatMap((row: Record<string, unknown>) => {
      if (!row || typeof row !== 'object') return [];
      const label = line(row.label, 100), text = line(row.text);
      return label && text ? [{ label, text }] : [];
    }) : [];
    const conclusion = line(value.conclusion);
    if (!description.length || !conclusion) return [];
    return [{ source, modality: line(value.modality, 80), description, conclusion,
      limitations: Array.isArray(value.limitations) ? value.limitations.map((item: unknown) => line(item)).filter(Boolean).slice(0, 8) : [],
    }];
  });
}

export const STUDY_REPORT_INSTRUCTION = `First write studyReports for the supplied files. Each report contains source (exact file name), modality, description (label/text rows), conclusion and limitations. Keep the study description independent of the clinical question. Describe findings and supported measurements first, then a concise standard diagnostic conclusion. Discuss hypotheses and management for the physician question separately in summary/report. Do not copy a differential essay into the study conclusion.
For an ECG use a concise routine protocol, normally 4–6 grouped rows (do not create a separate boilerplate section for every unavailable parameter): recording quality and calibration; rhythm and regularity; HR; electrical axis; P/PR; QRS and conduction; QT/QTc; Q waves and R progression; ST/T by visible lead. Retain standard ECG abbreviations. Numeric measurements may come from the digital measurement module, printed values, or physician-confirmed calibrated-grid measurements. Unconfirmed visual model counts are approximate calibrated-grid estimates, not confirmed measured protocol values. Present all available estimates together once, with approximate signs and one method/uncertainty statement. Do not repeat "not measured" and "proposal for manual checking" per interval. If several values are unavailable, list them once in limitations. Do not hide existing printed calibration or confirmed numbers behind a blanket claim of unavailable calibration. If HR and a rate category disagree, resolve the contradiction: never call a rate of approximately 91 bpm adult sinus tachycardia. Do not infer voltage in mm or Minnesota codes without supported criteria. The conclusion must contain 2–4 short sentences, led by the principal supported ECG diagnosis or pattern, rhythm and supported rate, then important conduction or repolarization findings; explain uncertainty once. Differential diagnoses and next steps belong in the answer to the physician, not a second duplicate ECG description. Copy the method, units and uncertainty. State a specific reason for an unmeasurable item. Do not replace supplied measurements with "not measured". Minnesota codes require supplied criteria and a supported code, otherwise leave codes unassigned. Do not infer a Minnesota code from a classifier label alone.
For a radiograph preserve a proper full descriptive report: projection and coverage when actually known; distribution and character of visible opacities; pleural spaces; cardiac/mediastinal contours; visible bones and devices when relevant. Describe the actual image in connected, informative language, normally 80–150 words for a chest film with several findings. Preserve informative observed negatives without a boilerplate normal checklist. Keep this description separate from a concise 1–3 sentence radiological conclusion. The clinical summary must not replace or shorten away the study description. Do not turn a good descriptive report into an unspecific diagnostic phrase. For other medical images describe technique/coverage, location, visible findings and supported measurements before the conclusion. For laboratory files describe supplied values with units, source reference ranges when present and relevant deviations, then a concise conclusion. Do not invent reference ranges or negative findings. Produce no studyReports when there are no readable files. Treat prior provisional reports as discussion context; current evidence is authoritative.`;
