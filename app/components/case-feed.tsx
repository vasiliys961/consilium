'use client';
import {imageModelLabel} from '@/packages/medical-images/routing';
import {memo} from 'react';
import {analysisQuestion,type ClinicalCase} from '@/lib/casebook';
import {ClinicalReportView} from './clinical-report';
import {GenomicReviewView} from './genomic-review';
import {MedicationReviewView} from './drug-label-picker';
import {StudyReports} from './study-reports';
import {ClinicalSourcesPanel} from './clinical-sources-panel';
import {medicationRisksForFeed} from '@/lib/clinical-feed-risks';
import {councilPerspectiveLabel} from '@/lib/adaptive-council';
import {useWorkspaceLanguage} from './workspace-language';
import styles from '@/app/workspace.module.css';

const roleNames={hypothesis:'Гипотезы',testChooser:'Обследования',challenger:'Критическая проверка',stewardship:'Безопасность лечения',checklist:'Итог консилиума'};
export const CaseFeed=memo(function CaseFeed({value,busy,onCouncil,onDecision}:{value:ClinicalCase;busy:boolean;onCouncil:()=>void;onDecision:()=>void}){
 const {t,language}=useWorkspaceLanguage();
 // A study description belongs to its first occurrence, even when cached in later results.
 const firstStudy=new Map<string,string>();
 for(const analysis of value.analyses.slice().reverse())for(const report of analysis.result.draft.studyReports??[]){const key=JSON.stringify(report);if(!firstStudy.has(key))firstStudy.set(key,analysis.id);}
 return <section aria-label={t('Лента разбора')} className={styles.feed}>
  {value.analyses.map((analysis,index)=>{
   const result=analysis.result;const number=value.analyses.length-index;const newest=index===0;
   const studies=(result.draft.studyReports??[]).filter(report=>firstStudy.get(JSON.stringify(report))===analysis.id);
   const final=result.voices.find(voice=>voice.id==='checklist');
   const missing=result.voices.filter(voice=>voice.status!=='done');
   const medicationRisks=medicationRisksForFeed(result.draft.report);
   return <article key={analysis.id} id={`analysis-${analysis.id}`} tabIndex={-1} className={`${styles.feedEntry} ${newest?styles.feedLatest:''}`}>
    <header className={styles.feedHeader}><span>{t('Разбор')} {number}{analysis.kind==='summary'?' · '+t('Резюме'):analysis.kind==='council'?' · '+t('Консилиум'):''}</span><time dateTime={analysis.at}>{new Date(analysis.at).toLocaleString(language,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></header>
    <h3>{t(analysisQuestion(analysis))}</h3>
    <small>{result.clinicalDraft==='generated'?t('ЧЕРНОВИК · ПРОВЕРИТЬ ВРАЧУ'):t('РАЗБОР НЕ ЗАВЕРШЁН')}</small>
    {analysis.newFacts&&<details><summary>{t('Новые данные этого этапа')}</summary><p className={styles.voiceText}>{analysis.newFacts}</p></details>}
    <div className={styles.feedAnswer}><p>{result.draft.summary}</p></div>
    {medicationRisks.risks.length>0&&<section aria-label={t('Лекарственные риски · проверить врачу')} style={{borderLeft:'3px solid #b07c42',padding:'7px 14px',margin:'12px 0',background:'rgba(184,129,57,.06)'}}>
      <h4 style={{margin:'0 0 5px'}}>{t('Перед назначением: важные лекарственные риски')}</h4>
      <ul style={{margin:'6px 0'}}>{medicationRisks.risks.map((risk,i)=><li key={i}><strong>{risk.option}:</strong> {risk.severity==='contraindicated'?t('Противопоказание: '):''}{risk.risk}</li>)}</ul>
      {medicationRisks.remaining>0&&<small>{t('Дополнительные предупреждения в подробном плане:')} {medicationRisks.remaining}.</small>}
      <small style={{display:'block'}}>{t('Это предварительная проверка отдельных вариантов. Отсутствие предупреждения не подтверждает совместимость препаратов.')}</small>
    </section>}
    {result.visualReadings?.filter(a=>a.secondOpinion).map(a=><section key={a.source}><h4>{t('Второе мнение')} · {imageModelLabel(a.secondOpinion?.model??'')} · {a.source}</h4>{a.secondOpinion?.mode==='informed'&&<small>{t('Проверка с учётом первого ответа')}</small>}<p>{a.secondOpinion?.status==='completed'?a.secondOpinion.reading:t('Второе мнение не получено. Основное заключение сохранено.')}</p><small>{t('Сопоставьте мнения по исходному изображению. Окончательное решение принимает врач.')}</small></section>)}
    {result.validationWarnings?.map((warning,i)=><p role="alert" key={i}>{warning}</p>)}
    {analysis.reusedSources?.length ? <small>{t('Использованы ранее прочитанные исследования:')} {analysis.reusedSources.join(', ')}. {t('Повторное чтение изображений не выполнялось.')}</small>:null}
     {result.voices.length>0&&<section aria-label={t('Итог консилиума')}>
       <h4>{t('Итог консилиума')}</h4>
       {final?.status==='done'?<p className={styles.voiceText}>{final.text}</p>:<p role="status">{t('Итог консилиума не получен. Сохранённые мнения можно посмотреть ниже; обсуждение нельзя считать завершённым.')}</p>}
       {missing.length>0&&<p role="status">{t('Требуется дополнительная оценка:')} {missing.map(voice=>t(roleNames[voice.id])).join(', ')}.</p>}
       {newest&&missing.length>0&&<button disabled={busy} onClick={onCouncil}>{language==='ru'?'Повторить весь консилиум (платно)':'Repeat entire council (paid)'}</button>}
       <details data-testid="council-clinical-opinions">
         <summary>{language==='ru'?'Мнения и клинические проверки':'Clinical perspectives and checks'} · {result.voices.filter(voice=>voice.status==='done').length}/{result.voices.length}</summary>
         {result.voices.some(v=>v.clinicalPerspective)&&<small style={{display:'block',marginBottom:8}}>
           {language==='ru'?'Это ракурсы анализа ИИ; не отдельные консультации врачей.':'These are AI clinical perspectives, not independent human physician consultations.'}
         </small>}
         {result.voices.filter(voice=>voice.id!=='checklist').map(voice=><section key={voice.id}>
           <h4>{t(roleNames[voice.id])}{voice.clinicalPerspective?' · '+councilPerspectiveLabel(voice.clinicalPerspective,language):''}</h4>
           <p className={styles.voiceText}>{voice.status==='done'?voice.text:t(voice.failure==='deadline'?'Время ответа истекло':voice.failure==='truncated'?'Ответ не завершён: достигнут лимит':'Ответ не получен')}</p>
         </section>)}
         <details data-testid="council-technical-models">
           <summary>{language==='ru'?'Технические сведения: модели и резервирование':'Technical details: models and fallback'}</summary>
           <p className={styles.voiceText} style={{fontSize:15}} data-testid="council-actual-models">
             {result.voices.map(v=>t(roleNames[v.id])+' — '+(v.status==='done'?(v.model??'unknown'):(language==='ru'?'не ответил':'no opinion'))+
               (v.fallbackFrom?(language==='ru'?' (резерв вместо ':' (backup for ')+v.fallbackFrom+')':'')).join(' · ')}
           </p>
         </details>
       </details>
     </section>}
    {result.ledger.filter(entry=>entry.genetics?.review).map(entry=><details key={entry.source}><summary>{entry.source} · {t('Генетический разбор')}</summary><GenomicReviewView finding={entry.genetics!}/></details>)}
    {result.medicationReview&&<details><summary>{t('Проверка инструкций к препаратам')}</summary><MedicationReviewView review={result.medicationReview}/></details>}
    {analysis.kind==='summary'&&result.draft.report&&<section aria-label={t('Краткое резюме')}><h4>{t('Следующий шаг')}</h4><p>{result.draft.report.tactics?.nextStep||result.draft.report.problem}</p>{result.draft.report.questions.length>0&&<><h4>{t('Уточнить перед решением')}</h4><ul>{result.draft.report.questions.map((question,i)=><li key={i}>{question}</li>)}</ul></>}</section>}
    {result.draft.report&&<details className={styles.feedDetails}><summary>{t('Обоснование, тактика и уточняющие вопросы')}</summary><ClinicalReportView report={result.draft.report} citations={result.citations}/></details>}
{result.readings?.filter(r=>r.secondOpinion).map(r=><section key={'opinion-'+r.source}><h4>{t('Второе мнение')} · {imageModelLabel(r.secondOpinion?.model??'')} · {r.source}</h4>{r.secondOpinion?.mode==='informed'&&<small>{t('Проверка с учётом первого ответа')}</small>}<p>{r.secondOpinion?.status==='completed'?r.secondOpinion.text:t('Второе мнение не получено. Основное заключение сохранено.')}</p></section>)}
    {studies.length>0&&<section className={styles.feedStudies} aria-label={t('Исследования этого этапа')}><StudyReports reports={studies}/></section>}
    {result.draft.statements.length>0&&<details><summary>{t('Утверждения и привязка к источникам')} · {result.draft.statements.length}</summary>{result.draft.statements.map((statement,i)=><p key={i}>{statement.text}<br/><small>{statement.source||t('Источник не подтверждён · вывод модели')}{statement.held?' · '+t('ТРЕБУЕТ ПРОВЕРКИ'):''}</small></p>)}</details>}
    <ClinicalSourcesPanel value={value} analysis={analysis} index={index}/>
    <details><summary>{t('Что обработано и расход')}</summary>{result.ledger.map((entry,i)=><p key={i}>{entry.source} · {entry.status==='read'?t('прочитано'):t('не оценено')}{entry.reason?' · '+entry.reason:''}</p>)}{result.unassessed.length>0&&<p>{t('Не оценено:')} {result.unassessed.join(', ')}</p>}<p>${result.cost.totalUsd.toFixed(4)}{result.cost.usageComplete===false?' · '+t('Расчётная стоимость неполная'):''}</p><details><summary>{t('Контекст этого этапа')}</summary><pre>{analysis.context}</pre></details></details>
    {newest&&analysis.kind==='summary'&&<button disabled={busy} onClick={onDecision}>{t('Открыть проект решения врача →')}</button>}
    {newest&&value.analyses.length>1&&<nav aria-label={t('Перейти к предыдущему разбору')} className={styles.feedIndex}><h4>{t('Ранее в разборе')}</h4>{value.analyses.slice(1).map((earlier,i)=><div key={earlier.id}><a href={`#analysis-${earlier.id}`}>{value.analyses.length-i-1}. {t(analysisQuestion(earlier))}</a>{(earlier.result.draft.studyReports??[]).filter(report=>firstStudy.get(JSON.stringify(report))===earlier.id).map((report,j)=><small key={j}> · {report.source} · {report.modality}</small>)}</div>)}</nav>}
   </article>;
  })}
  <details className={styles.feedInitial}><summary>{t('Исходные жалобы, анамнез и данные осмотра')}</summary><p>{value.analyses.at(-1)?.clinicalContext||value.context||t('Не добавлены')}</p><p>{value.question}</p></details>
 </section>;
});
