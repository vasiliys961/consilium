/** Light, auditable module artifacts. No model calls, weights, storage or new services. */
import type { TracingAssessment, NetworkClass } from '../packages/ecg/founder.ts';

export interface EcgModuleEvidence {
  module: 'ecgfounder';
  method: 'digital-ecg-waveform';
  source: string;
  sha256: string | null;
  status: 'read' | 'not_assessed';
  threshold: number;
  /** Class scores from the network, NOT calibrated diagnostic probabilities. */
  cleared: NetworkClass[];
  top: NetworkClass | null;
  /** Measurements are copied from the separate digital tracing measurement path. */
  measurements?: TracingAssessment['measurements'];
  reason: string | null;
}

export interface RadiologyModuleReport {
  id: string;
  module: 'radiology';
  fileKeys: string[];
  sources: string[];
  text: string;
  at: string;
  /** Report is an unsigned station draft, not verified interpretation of all slices. */
  status?: 'reported';
  coverage?: 'not_verified';
}

const HASH = /^[a-f0-9]{64}$/i;
const THRESHOLD = 0.5;

/** Never transform detector scores into a diagnosis or assert that a threshold excludes pathology. */
export function ecgModuleEvidence(assessment: TracingAssessment, sourceHash?: string | null): EcgModuleEvidence {
  const validHash = typeof sourceHash === 'string' && HASH.test(sourceHash) ? sourceHash.toLowerCase() : null;
  const measured = assessment.measurements;
  return {
    module: 'ecgfounder',
    method: 'digital-ecg-waveform',
    source: assessment.source,
    sha256: validHash,
    status: assessment.status,
    threshold: THRESHOLD,
    cleared: assessment.status === 'read'
      ? assessment.cleared.filter(item => Number.isFinite(item.score) && item.score >= THRESHOLD).slice(0, 5)
      : [],
    top: assessment.status === 'read' ? assessment.top : null,
    ...(measured ? { measurements: measured } : {}),
    reason: assessment.reason,
  };
}

export function ecgEvidenceText(evidence: EcgModuleEvidence): string {
  const source = `ECGFounder · ${evidence.source} · ${evidence.sha256 ?? 'SHA-256 не указан'}`;
  if (evidence.status !== 'read') {
    return `${source}\nНе оценено: ${evidence.reason || 'исполнитель не вернул результат'}. Отсутствие ответа не является нормальной ЭКГ.`;
  }
  const classes = evidence.cleared.length
    ? `Классы, прошедшие порог ${evidence.threshold}: ${evidence.cleared.map(row => `${row.label} (${row.score.toFixed(2)})`).join('; ')}.`
    : `Ни один класс не прошёл порог ${evidence.threshold}; это НЕ означает нормальную ЭКГ.`;
  const measurements = evidence.measurements?.lines.length
    ? `\nЦифровые измерения (${evidence.measurements.method}): ${evidence.measurements.lines.map(row => `${row.name}: ${row.value}`).join('; ')}. ${evidence.measurements.note}`
    : '';
  return `${source}\n${classes} Баллы сети — не калиброванные вероятности заболеваний.${measurements}`;
}

export function radiologyEvidenceText(report: RadiologyModuleReport): string {
  const sources = report.sources.length ? report.sources.join(', ') : 'исходный файл не привязан';
  const binding = report.fileKeys.length ? 'Идентификаторы файлов есть' : 'Подтверждённой привязки к исходному файлу нет';
  return `Opus Radiology · ${sources} · ${report.at}\nСтатус: неподписанный черновик отдельного модуля. ${binding}. Полнота просмотра DICOM-серий/срезов и детекторов НЕ подтверждена этим сообщением. Текст модуля — исходные данные для критической оценки врачом, не доказательство нормальности непросмотренных структур.\nНачало описания:\n${report.text}\nКонец описания.`;
}
