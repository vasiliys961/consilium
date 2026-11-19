import { CitationContent } from "@/app/components/citation-content";
import { useWorkspaceLanguage } from "@/app/components/workspace-language";
import type { ClinicalReport } from '@/lib/clinical-report';
import {citationPassages,type Citation} from '@/lib/literature';
import {reviewClaimEvidence} from '@/lib/clinical-claim-evidence';
import {medicationCopy} from '@/lib/medication-copy';
import {medicationContextHintAdvice} from '@/lib/medication-context';
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
 function sourceLink(key:string,claim:string) {
   const citation=citations.flatMap(citationPassages).find(item=>item.passageId===key||item.url===key||`pmid:${item.pmid}`===key);
   if(!citation)return null;
   const assessment=reviewClaimEvidence(claim,citation);
   const access=assessment.level==='paragraph'?t('Фрагмент полного текста')
    :assessment.level==='excerpt'?t('Фрагмент источника')
    :assessment.level==='abstract'?t('Аннотация'):t('Библиографическая запись');
   return <li key={key}>{citation.url&&/^https:\/\//i.test(citation.url)
     ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.title} ↗</a>
     : citation.title}
     <p><small>{access}. {assessment.topicOverlap
      ?t('Термины варианта встречаются в тексте; применимость не подтверждена автоматически.')
      :t('Содержание рекомендации не подтверждено доступным текстом автоматически.')}
      {assessment.missingQuantities.length>0?' '+t('Проверить дозы/цифры:')+' '+assessment.missingQuantities.join(', '):''}
      {assessment.unlocatedPopulation.length>0?' '+t('Уточнить применимость:')+' '+assessment.unlocatedPopulation.join(', '):''}</small></p>
     <CitationContent citation={citation}/></li>;
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
  {Boolean(report.localContextHints?.length)&&<section aria-label={t('Возможные уточнения клинических данных')}>
   <h3>{t('Возможные уточнения клинических данных')}</h3>
   <p><strong>{t('Это только предположения: медицинские данные не исправлены и не использованы как подтверждённые.')}</strong></p>
   <ul>{report.localContextHints!.map((hint,index)=><li key={index}>
    <strong>{t(hint.field==='egfr'?'СКФ':hint.field==='potassium'?'Калий':hint.field==='qtcMs'?'QTc':hint.field==='ageYears'?'Возраст':hint.field==='activeBleeding'?'Активное патологическое кровотечение':hint.field==='decompensatedCirrhosis'?'Декомпенсированный цирроз':'Тяжёлая печёночная недостаточность')}</strong>
    <p>{t('В исходной записи:')} {hint.observed}</p>
    {hint.expectedFormat&&<p>{t('Ожидаемый формат:')} <code>{hint.expectedFormat}</code></p>}
    <p>{t(medicationContextHintAdvice(hint))}</p>
    <p><small>{t('Сверьте данные и исправьте исходную запись вручную; предположение не использовано как факт.')}</small></p>
   </li>)}</ul>
  </section>}
  {report.investigations.length > 0 && <><h3>{t("Что уточнить и зачем")}</h3>{report.investigations.map((item, i) => <p key={i}><strong>{item.test}</strong> — {item.rationale}{item.priority && ` · ${item.priority}`}</p>)}</>}
  {report.management.length > 0 && <>
    <h3>{t("Лечебная тактика · варианты для решения врача")}</h3>
    {report.management.map((item, i) => <article key={i}>
      <strong>{item.option}</strong>
      <p>{t("Условия:")} {item.conditions.join('; ') || t('Не оценено')}</p>
      <p>{t("Перед назначением:")} {item.safetyChecks.join('; ') || t('Не оценено')}</p>
      {item.monitoring.length > 0 && <p>{t("Контроль:")} {item.monitoring.join('; ')}</p>}
      {Boolean(item.sources?.length)&&<ul>{item.sources!.map(source=>sourceLink(source,[item.option,...item.conditions].join(' ')))}</ul>}
      {selectedOption !== i && item.localInteractions && item.localInteractions.length > 0 && <section>
        <h4>{t('Локальная проверка сочетаний')}</h4>
        <DrugInteractionAlerts alerts={item.localInteractions}/>
      </section>}
      {item.stoppedMedications?.length ? <p><small>{t('Предложено отменить перед этой схемой (проверить врачу):')} {item.stoppedMedications.join(', ')}. {t('Не считать совместным приёмом после отмены; проверьте план перехода и мониторинг.')}</small></p>:null}
      {item.localOrganAlerts?.length ? <section><h4>{t('Риски с учётом клинических данных')}</h4>{item.localOrganAlerts.map((alert,j)=><p key={j}><strong>{alert.severity==='contraindicated'?t('Противопоказание: '):t('Требует проверки: ')}{alert.risk}</strong> {alert.action} <a href={alert.url} target="_blank" rel="noopener noreferrer">DailyMed §{alert.section}</a></p>)}</section>:null}
      {item.localSafetyGaps?.length ? <section><h4>{t('Недостающие данные для оценки безопасности')}</h4><ul>{item.localSafetyGaps.map((gap,j)=><li key={j}>{gap}</li>)}</ul></section>:null}
      {item.medications?.length ? <p><small>{t('Локальная проверка препаратов, предложенных ИИ для этой схемы:')} {item.medications.join(', ')}. {t('Проверено только')} {item.localCoverage?.ruleCount??'—'} {t('локальных правил; отсутствие совпадения не доказывает совместимость.')}
      {item.localCoverage?.unrecognized.length ? ' '+t('Не охвачены локальными правилами:')+' '+item.localCoverage.unrecognized.join(', '):''}
      {item.localCoverage?.unverifiedPairCount ? ' '+t('Нет локально подтверждённого правила для')+' '+item.localCoverage.unverifiedPairCount+' '+t('сочетаний, например:')+' '+item.localCoverage.unverifiedPairs.join('; ')+'. '+t('Отсутствие правила не доказывает безопасность.') : ''}</small></p>:null}
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
      {item.sources.length ? <ul>{item.sources.map(source=>sourceLink(source,item.combination+' '+item.risk))}</ul> : <small>{t('Источник не подтверждён · вывод модели')}</small>}
    </article>)}
    {report.medicationSafety.gaps.length>0&&<ul>{report.medicationSafety.gaps.map((gap,i)=><li key={i}>{gap}</li>)}</ul>}
    {report.medicationSafety.alerts.length===0&&<p>{t('Совместимость препаратов не установлена.')}</p>}
  </section>}
  {report.questions.length > 0 && <><h3>{t("Вопросы, меняющие решение")}</h3><ul>{report.questions.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
  {report.followUp.length > 0 && <><h3>{t("Повторная оценка")}</h3><ul>{report.followUp.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
  {report.limitations.length > 0 && <><h3>{t("Границы разбора")}</h3><ul>{report.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
 </section>;
}
