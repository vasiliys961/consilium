import { CitationContent } from "@/app/components/citation-content";
import { useWorkspaceLanguage } from "@/app/components/workspace-language";
import type { ClinicalReport } from '@/lib/clinical-report';
import type { Citation } from '@/lib/literature';
import {medicationCopy} from '@/lib/medication-copy';
import {useId,useState} from 'react';
import {DrugInteractionAlerts, DrugInteractionChecker} from './drug-interaction-checker';

export function ClinicalReportView({ report, citations = [], medicationCheck }: {
    report: ClinicalReport;
    citations?: Citation[];
    medicationCheck?: { current: string; onCurrentChange: (value:string)=>void; disabled: boolean };
}) {
 const {t,language}=useWorkspaceLanguage();
 const copy=medicationCopy(language);
 const tactics=report.tactics;
 const [selectedOption,setSelectedOption]=useState<number>();
 const checkerId=useId();
 function sourceLink(key:string) {
   const citation=citations.find(item=>item.passageId===key||item.url===key||`pmid:${item.pmid}`===key);
   if(!citation)return null;
   return <li key={key}>{citation.url&&/^https:\/\//i.test(citation.url)
     ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.title} ↗</a>
     : citation.title}<CitationContent citation={citation}/></li>;
 }
    return <section aria-label={t("Диагностический и лечебный план")}>
  <h3>{t("Клиническая задача")}</h3><p>{report.problem}</p>
  {tactics&&<section aria-label={copy.tactics}>
    <h3>{copy.tactics}</h3>
    <dl>
      {([[copy.next,tactics.nextStep],[copy.timing,tactics.timing],[copy.reassess,tactics.reassess],[copy.escalate,tactics.escalate]]).filter(([,value])=>value).map(([label,value])=><div key={label}><dt><strong>{label}</strong></dt><dd>{value}</dd></div>)}
    </dl>
  </section>}
  {report.facts.length > 0 && <><h3>{t("На чём основан разбор")}</h3><ul>{report.facts.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
  {report.differential.length > 0 && <><h3>{t("Дифференциальные гипотезы · проверить врачу")}</h3>{report.differential.map((item, i) => <article key={i} style={{ borderLeft: '2px solid #abc4b3', padding: '4px 16px', margin: '16px 0' }}><strong>{item.hypothesis}{item.dangerous ? ` · ${t('Опасная альтернатива')}` : ''}</strong>{item.supporting.length > 0 && <p>{t("За:")}{item.supporting.join('; ')}</p>}{item.opposing.length > 0 && <p>{t("Против:")}{item.opposing.join('; ')}</p>}{item.missing.length > 0 && <p>{t("Уточнить:")}{item.missing.join('; ')}</p>}</article>)}</>}
  {report.investigations.length > 0 && <><h3>{t("Что уточнить и зачем")}</h3>{report.investigations.map((item, i) => <p key={i}><strong>{item.test}</strong> — {item.rationale}{item.priority && ` · ${item.priority}`}</p>)}</>}
  {report.management.length > 0 && <>
    <h3>{t("Лечебная тактика · варианты для решения врача")}</h3>
    {report.management.map((item, i) => <article key={i}>
      <strong>{item.option}</strong>
      <p>{t("Условия:")} {item.conditions.join('; ') || t('Не оценено')}</p>
      <p>{t("Перед назначением:")} {item.safetyChecks.join('; ') || t('Не оценено')}</p>
      {item.monitoring.length > 0 && <p>{t("Контроль:")} {item.monitoring.join('; ')}</p>}
      {Boolean(item.sources?.length)&&<ul>{item.sources!.map(sourceLink)}</ul>}
      {selectedOption !== i && item.localInteractions && item.localInteractions.length > 0 && <section>
        <h4>{t('Локальная проверка сочетаний')}</h4>
        <DrugInteractionAlerts alerts={item.localInteractions}/>
      </section>}
      {item.medications?.length ? <p><small>{t('Локальная проверка препаратов, предложенных ИИ для этой схемы:')} {item.medications.join(', ')}. {t('Проверено только')} {item.localCoverage?.ruleCount??'—'} {t('локальных правил; отсутствие совпадения не доказывает совместимость.')}
      {item.localCoverage?.unrecognized.length ? ' '+t('Не охвачены локальными правилами:')+' '+item.localCoverage.unrecognized.join(', '):''}</small></p>:null}
      {medicationCheck && Boolean(item.medications?.length) && <>
        <button type="button" disabled={medicationCheck.disabled} aria-expanded={selectedOption===i} aria-controls={checkerId+i}
          onClick={()=>setSelectedOption(selectedOption===i?undefined:i)}>{t('Проверить препараты этой схемы')}</button>
        <div id={checkerId+i} hidden={selectedOption!==i}>
          {selectedOption===i&&<DrugInteractionChecker {...medicationCheck} initialProposed={item.medications?.join('\n')}/>}
        </div>
      </>}
    </article>)}
  </>}
  {medicationCheck && selectedOption===undefined&&<DrugInteractionChecker {...medicationCheck}/>}
  {report.medicationSafety && <section>
    <h3>{t('Взаимодействия и риски лекарств')}</h3>
    {report.medicationSafety.alerts.map((item,i)=><article key={i}>
      <strong>{item.combination}</strong><p>{item.risk}</p>{item.patientFactor&&<p>{item.patientFactor}</p>}{item.mitigation&&<p>{item.mitigation}</p>}
      {item.sources.length ? <ul>{item.sources.map(sourceLink)}</ul> : <small>{t('Источник не подтверждён · вывод модели')}</small>}
    </article>)}
    {report.medicationSafety.gaps.length>0&&<ul>{report.medicationSafety.gaps.map((gap,i)=><li key={i}>{gap}</li>)}</ul>}
    {report.medicationSafety.alerts.length===0&&<p>{t('Совместимость препаратов не установлена.')}</p>}
  </section>}
  {report.questions.length > 0 && <><h3>{t("Вопросы, меняющие решение")}</h3><ul>{report.questions.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
  {report.followUp.length > 0 && <><h3>{t("Повторная оценка")}</h3><ul>{report.followUp.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
  {report.limitations.length > 0 && <><h3>{t("Границы разбора")}</h3><ul>{report.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
 </section>;
}
