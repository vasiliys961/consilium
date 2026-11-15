import type { StudyReport } from '@/lib/study-report';
import { useWorkspaceLanguage } from './workspace-language';

export function StudyReports({ reports }: { reports?: StudyReport[] }) {
  const { t } = useWorkspaceLanguage();
  if (!reports?.length) return null;
  return <section aria-label={t('Описание исследования')}>
    <h3>{t('Описание исследования')}</h3>
    {reports.map((report, index) => { const ecg=/ecg|ekg|экг|tracing|electrocard|электрокарди/i.test(report.modality+' '+report.source); const description=<dl>{report.description.map((row,i)=><div key={i}><dt><strong>{row.label}</strong></dt><dd>{row.text}</dd></div>)}</dl>; return <article className="study-report" key={`${report.source}:${index}`}>
      <h4>{report.source} · {report.modality}</h4>
      {!ecg&&<><h4>{t('Описание и измерения')}</h4>{description}</>}
      <h4>{t('Заключение')}</h4><p>{report.conclusion}</p>
      {ecg&&<details><summary>{t('Описание и измерения')}</summary>{description}</details>}
      {report.limitations.length > 0 && <details><summary>{t('Границы разбора')}</summary><ul>{report.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
    </article>;})}
  </section>;
}
