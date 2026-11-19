'use client';

import {useState} from 'react';
import {checkMedicationRegimen, type MedicationContext, type DrugInteractionAlert, type OrganSafetyAlert} from '@/lib/drug-interaction-rules';
import {useWorkspaceLanguage} from './workspace-language';
import {readManualMedicationFields} from '@/lib/manual-medication-fields';

export function DrugInteractionAlerts({ alerts }: { alerts: DrugInteractionAlert[] }) {
  const { t } = useWorkspaceLanguage();
  return <>{alerts.map(item => <article key={`${item.url}:${item.first}:${item.second}`}>
    <strong>{item.first} + {item.second}</strong>
    <p><strong>{t(item.severity==='contraindicated'?'Противопоказано':item.severity==='major'?'Значимый риск':'Требуется контроль')}</strong> · {t(item.relation==='current-current'?'Принимаемые':item.relation==='current-proposed'?'Принимаемый + предлагаемый':'Два предлагаемых')}</p>
    <p>{t(item.risk)}</p><p><strong>{t('Механизм:')}</strong> {t(item.mechanism)}</p><p><strong>{t('Применимость:')}</strong> {t(item.conditions)}</p>
    <p>{t(item.action)}</p><p>{t('Мониторинг:')} {t(item.monitoring)}</p><small>{item.source} · {item.section}</small>
    <a href={item.url} target="_blank" rel="noreferrer">DailyMed ↗</a>
  </article>)}</>;
}

function OrganSafetyAlerts({alerts}:{alerts:OrganSafetyAlert[]}){
 const {t}=useWorkspaceLanguage();
 return <>{alerts.map(item=><article key={item.drug+item.risk}>
  <strong>{item.drug} · {t(item.severity==='contraindicated'?'Противопоказано':'Значимый риск')}</strong>
  <p>{t(item.risk)}</p><p>{t(item.action)}</p>
  <a href={item.url} target="_blank" rel="noreferrer">DailyMed · {item.section} ↗</a>
 </article>)}</>;
}

export function DrugInteractionChecker({current,onCurrentChange,disabled=false,initialProposed='',proposed:controlledProposed,onReview,onProposedChange,onDetailsChange,reviewLabel}:{current?:string;onCurrentChange?:(text:string)=>void;disabled?:boolean;initialProposed?:string;proposed?:string;onReview?:(current:string,proposed:string,details:{stopped:string;alternatives:string;context:MedicationContext})=>void;onProposedChange?:(text:string)=>void;onDetailsChange?:()=>void;reviewLabel?:string}){
  const {t,language}=useWorkspaceLanguage();
  const [standalone,setStandalone]=useState(''),[localProposed,setProposed]=useState(initialProposed);
  const [stopped,setStopped]=useState(''),[alternatives,setAlternatives]=useState('');
  const [egfrText,setEgfrText]=useState(''),[potassiumText,setPotassiumText]=useState(''),[ageText,setAgeText]=useState(''),[qtcText,setQtcText]=useState('');
  const [decompensatedCirrhosis,setDecompensatedCirrhosis]=useState(false),[severeHepaticImpairment,setSevereHepaticImpairment]=useState(false),[activeBleeding,setActiveBleeding]=useState(false);
  const manual=readManualMedicationFields({egfr:egfrText,potassium:potassiumText,ageYears:ageText,qtcMs:qtcText});
  const context:MedicationContext={...manual.context,decompensatedCirrhosis:decompensatedCirrhosis||undefined,severeHepaticImpairment:severeHepaticImpairment||undefined,activeBleeding:activeBleeding||undefined};
  const proposed=controlledProposed??localProposed;
  const active=current??standalone;
  const result=checkMedicationRegimen({current:active,proposed,stopped,alternatives,context});
  const alerts=result.alerts,coverage=result.coverage;
  return <section aria-label={t('Локальная проверка сочетаний')}>
    <h3>{t('Бесплатная локальная проверка сочетаний')}</h3>
    <p>{t('Добавлять препараты можно на любом этапе. Введите действующие вещества по одному на строку, через запятую или плюс. Эта локальная проверка использует только поля ниже; она не извлекает препараты из свободного клинического текста.')}</p>
    <label>{t('Текущие препараты')}<textarea disabled={disabled} rows={3} maxLength={2000} value={active} onChange={event=>(onCurrentChange??setStandalone)(event.target.value)}/></label>
    <label>{t('Проверить предполагаемое назначение')}<textarea disabled={disabled} rows={2} maxLength={1000} value={proposed} onChange={event=>{setProposed(event.target.value);onProposedChange?.(event.target.value);}}/></label>
    <details><summary>{t('Отменяемые препараты, альтернативы и данные пациента')}</summary>
      <label>{t('Отменены до новой схемы (не входят в текущий приём)')}<textarea rows={2} disabled={disabled} value={stopped} onChange={e=>{setStopped(e.target.value);onDetailsChange?.();}}/></label>
      <label>{t('Взаимоисключающие альтернативы, каждая на отдельной строке')}<textarea rows={2} disabled={disabled} value={alternatives} onChange={e=>{setAlternatives(e.target.value);onDetailsChange?.();}}/></label>
      <label>{t('СКФ, мл/мин/1,73 м² (если известна)')}<input type="number" min="0" max="130" step="0.1" disabled={disabled} value={egfrText} onChange={e=>{setEgfrText(e.target.value);onDetailsChange?.();}}/></label>
      <label>{t('Калий, ммоль/л (если известен)')}<input type="number" min="1.5" max="10" step="0.1" disabled={disabled} value={potassiumText} onChange={e=>{setPotassiumText(e.target.value);onDetailsChange?.();}}/></label>
      <label>{t('Возраст, годы (если известен)')}<input type="number" min="0" max="120" step="1" disabled={disabled} value={ageText} onChange={e=>{setAgeText(e.target.value);onDetailsChange?.();}}/></label>
      <label>{t('QTc, мс (если известен)')}<input type="number" min="250" max="800" step="1" disabled={disabled} value={qtcText} onChange={e=>{setQtcText(e.target.value);onDetailsChange?.();}}/></label>
      <label><input type="checkbox" disabled={disabled} checked={activeBleeding} onChange={e=>{setActiveBleeding(e.target.checked);onDetailsChange?.();}}/>{t('Подтверждённое активное патологическое кровотечение')}</label>
      <label><input type="checkbox" disabled={disabled} checked={decompensatedCirrhosis} onChange={e=>{setDecompensatedCirrhosis(e.target.checked);onDetailsChange?.();}}/>{t('Подтверждённый декомпенсированный цирроз')}</label>
      <label><input type="checkbox" disabled={disabled} checked={severeHepaticImpairment} onChange={e=>{setSevereHepaticImpairment(e.target.checked);onDetailsChange?.();}}/>{t('Подтверждённая тяжёлая печёночная недостаточность')}</label>
    </details>
    {manual.issues.length>0&&<p role="status" aria-live="polite">{language==='ru'?'Проверьте или очистите некорректные числовые поля. Неподтверждённые значения не используются: ':'Check or clear invalid numeric fields. Unconfirmed values are not used: '}{manual.issues.map(issue=>({egfr:'eGFR',potassium:language==='ru'?'Калий':'Potassium',ageYears:language==='ru'?'Возраст':'Age',qtcMs:'QTc'}[issue.field])).join(', ')}.</p>}
    {onReview&&<button type="button" disabled={disabled||manual.issues.length>0||!(active.trim()||proposed.trim())} onClick={()=>onReview(active,proposed,{stopped,alternatives,context})}>{t(reviewLabel??'Проверить весь список одной недорогой моделью (платный запрос)')}</button>}<p>{t('Охват локального списка:')} {coverage.ruleCount} {t('правила. Это не полная база лекарственных взаимодействий.')}</p>{!!(active.trim()||proposed.trim()||alternatives.trim())&&<div aria-live="polite"><p>{t('Распознано в локальном списке:')} {coverage.recognized.join('; ')||t('нет')}</p>{coverage.unrecognized.length>0&&<p>{t('Не охвачены локальными правилами:')} {coverage.unrecognized.join('; ')}</p>}<OrganSafetyAlerts alerts={result.organAlerts}/>
      {alerts.length?<DrugInteractionAlerts alerts={alerts}/>:<p>{t('В доступных правилах совпадений нет. Это не подтверждает совместимость; для остальных сочетаний нужен отдельный разбор и проверка источников.')}</p>}
      {result.missing.length>0&&<p>{t('Для решения требуется уточнить:')} {result.missing.join('; ')}</p>}
      {result.stopped.length>0&&<p>{t('Исключены из действующей схемы:')} {result.stopped.join('; ')}</p>}
      {result.alternatives.length>0&&<details><summary>{t('Альтернативы проверены отдельно (не совместный приём)')}</summary>{result.alternatives.map(item=><article key={item.name}><strong>{item.name}</strong>
       <OrganSafetyAlerts alerts={item.organAlerts}/>
       {item.alerts.length?<DrugInteractionAlerts alerts={item.alerts}/>:<p>{t('Локальных совпадений нет; безопасность не установлена.')}</p>}
       {item.missing.length>0&&<p>{t('Для решения требуется уточнить:')} {item.missing.join('; ')}</p>}
       {item.unrecognized.length>0&&<p>{t('Не охвачены локальными правилами:')} {item.unrecognized.join('; ')}</p>}
      </article>)}</details>}
     </div>}
  </section>;
}
