'use client';
import type { AnalysisProgressEvent } from '@/lib/analysis-stream';
import { useWorkspaceLanguage } from './workspace-language';

export function AnalysisProgress({ events, preview }: { events: AnalysisProgressEvent[]; preview: string }) {
  const { t } = useWorkspaceLanguage();
  const labels: Record<string, string> = {
    intake: 'Подготовка файлов', readings: 'Чтение исследований', sources: 'Подбор источников',
    synthesis: 'Сопоставляем находки с вопросом врача', consilium: 'Обсуждаем варианты и проверяем риски',
  };
  const stages = events.filter(event => event.event === 'stage.started');
  const current = stages.at(-1)?.stage;
  return <section aria-label={t('Ход разбора')} className="analysis-progress" style={{ padding: 20, background: '#eef5eb', color: '#244b37', borderRadius: 9, marginBlock: 16 }}>
    <p role="status"><span className="analysis-running">{t('Выполняется разбор…')}</span></p>
    <h3>{t(labels[String(current)] ?? 'Принимаем и проверяем материалы')}</h3>
    <ol>{stages.slice(-4).map((event, index) => <li key={index}>{t(labels[String(event.stage)] ?? 'Обработка')}</li>)}</ol>
    {preview && <><strong>{t('Предварительный текст · итог ещё проверяется')}</strong><p style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>{preview}</p></>}
  </section>;
}
