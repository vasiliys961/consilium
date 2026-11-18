'use client';

import {useState} from 'react';
import {checkMedicationRegimen, type MedicationContext, type DrugInteractionAlert} from '@/lib/drug-interaction-rules';
import {medicationEditorContext,editMedicationField,type MedicationEdits,type MedicationField} from '@/lib/medication-context-editor';
import {useWorkspaceLanguage} from './workspace-language';

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

export function DrugInteractionChecker({current,onCurrentChange,disabled=false,initialProposed='',proposed:controlledProposed,onReview,onProposedChange,onDetailsChange,reviewLabel,caseNarrative=''}:{caseNarrative?:string;current?:string;onCurrentChange?:(text:string)=>void;disabled?:boolean;initialProposed?:string;proposed?:string;onReview?:(current:string,proposed:string,details:{stopped:string;alternatives:string;context:MedicationContext})=>void;onProposedChange?:(text:string)=>void;onDetailsChange?:()=>void;reviewLabel?:string}){
  const {t}=useWorkspaceLanguage();
  const [standalone,setStandalone]=useState(''),[localProposed,setProposed]=useState(initialProposed);
  const [stopped,setStopped]=useState(''),[alternatives,setAlternatives]=useState('');
  const [edits,setEdits]=useState<MedicationEdits>({source:caseNarrative,values:{}});
  const {context,fields,issues,hasValues}=medicationEditorContext(caseNarrative,edits);
  const edit=(key:MedicationField,value:string|boolean)=>{setEdits(previous=>editMedicationField(caseNarrative,previous,key,value));onDetailsChange?.();};
  const proposed=controlledProposed??localProposed;
  const active=current??standalone;
  const result=checkMedicationRegimen({current:active,proposed,stopped,alternatives,context});
  const alerts=result.alerts,coverage=result.coverage;
  return <section aria-label={t('Локальная проверка сочетаний')}>
    <h3>{t('Бесплатная локальная проверка сочетаний')}</h3>
    <p>{t('Добавлять препараты можно на любом этапе. Введите действующие вещества по одному на строку, через запятую или плюс. Эта локальная проверка использует только поля ниже; она не извлекает препараты из свободного клинического текста.')}</p>
    {hasValues&&<p aria-label={t('Данные для лекарственной проверки')}>{t('Данные для лекарственной проверки')}: {[
      context.egfr!=null?'eGFR '+context.egfr+' ml/min/1.73 m²':'',context.potassium!=null?'K⁺ '+context.potassium+' mmol/L':'',
      context.ageYears!=null?t('Возраст')+' '+context.ageYears:'',context.qtcMs!=null?'QTc '+context.qtcMs+' ms':'',
    ].filter(Boolean).join(' · ')}</p>}
    {issues.length>0&&<p role="status">{t('В карточке есть противоречивые значения. Уточните данные лекарственной проверки ниже.')}</p>}
    <label>{t('Текущие препараты')}<textarea disabled={disabled} rows={3} maxLength={2000} value={active} onChange={event=>(onCurrentChange??setStandalone)(event.target.value)}/></label>
    <label>{t('Проверить предполагаемое назначение')}<textarea disabled={disabled} rows={2} maxLength={1000} value={proposed} onChange={event=>{setProposed(event.target.value);onProposedChange?.(event.target.value);}}/></label>
    <details><summary>{t('Отменяемые препараты, альтернативы и данные пациента')}</summary>
      <label>{t('Отменены до новой схемы (не входят в текущий приём)')}<textarea rows={2} disabled={disabled} value={stopped} onChange={e=>{setStopped(e.target.value);onDetailsChange?.();}}/></label>
      <label>{t('Взаимоисключающие альтернативы, каждая на отдельной строке')}<textarea rows={2} disabled={disabled} value={alternatives} onChange={e=>{setAlternatives(e.target.value);onDetailsChange?.();}}/></label>
      <label>{t('СКФ, мл/мин/1,73 м² (если известна)')}<input type="number" min="0" max="200" step="0.1" disabled={disabled} value={fields.egfr} onChange={e=>{edit('egfr',e.target.value);}}/></label>
      <label>{t('Калий, ммоль/л (если известен)')}<input type="number" min="0" max="15" step="0.1" disabled={disabled} value={fields.potassium} onChange={e=>{edit('potassium',e.target.value);}}/></label>
      <label>{t('Возраст, годы (если известен)')}<input type="number" min="0" max="120" step="1" disabled={disabled} value={fields.ageYears} onChange={e=>{edit('ageYears',e.target.value);}}/></label>
      <label>{t('QTc, мс (если известен)')}<input type="number" min="200" max="900" step="1" disabled={disabled} value={fields.qtcMs} onChange={e=>{edit('qtcMs',e.target.value);}}/></label>
      <label><input type="checkbox" disabled={disabled} checked={context.decompensatedCirrhosis===true} onChange={e=>{edit('decompensatedCirrhosis',e.target.checked);}}/>{t('Подтверждённый декомпенсированный цирроз')}</label>
      <label><input type="checkbox" disabled={disabled} checked={context.severeHepaticImpairment===true} onChange={e=>{edit('severeHepaticImpairment',e.target.checked);}}/>{t('Подтверждённая тяжёлая печёночная недостаточность')}</label>
    </details>
    {onReview&&<button type="button" disabled={disabled||!(active.trim()||proposed.trim())} onClick={()=>onReview(active,proposed,{stopped,alternatives,context})}>{t(reviewLabel??'Проверить весь список одной недорогой моделью (платный запрос)')}</button>}<p>{t('Охват локального списка:')} {coverage.ruleCount} {t('правила. Это не полная база лекарственных взаимодействий.')}</p>{!!(active.trim()||proposed.trim())&&<div aria-live="polite"><p>{t('Распознано в локальном списке:')} {coverage.recognized.join('; ')||t('нет')}</p>{coverage.unrecognized.length>0&&<p>{t('Не охвачены локальными правилами:')} {coverage.unrecognized.join('; ')}</p>}{result.organAlerts.map(item=><article key={item.drug+item.risk}><strong>{item.drug} · {t(item.severity==='contraindicated'?'Противопоказано':'Значимый риск')}</strong><p>{t(item.risk)}</p><p>{t(item.action)}</p><a href={item.url} target="_blank" rel="noreferrer">DailyMed · {item.section} ↗</a></article>)}
      {alerts.length?<DrugInteractionAlerts alerts={alerts}/>:<p>{t('В доступных правилах совпадений нет. Это не подтверждает совместимость; для остальных сочетаний нужен отдельный разбор и проверка источников.')}</p>}
      {result.missing.length>0&&<p>{t('Для решения требуется уточнить:')} {result.missing.join('; ')}</p>}
      {result.stopped.length>0&&<p>{t('Исключены из действующей схемы:')} {result.stopped.join('; ')}</p>}
      {result.alternatives.length>0&&<details><summary>{t('Альтернативы проверены отдельно (не совместный приём)')}</summary>{result.alternatives.map(item=><article key={item.name}><strong>{item.name}</strong>{item.alerts.length?<DrugInteractionAlerts alerts={item.alerts}/>:<p>{t('Локальных совпадений нет; безопасность не установлена.')}</p>}</article>)}</details>}
     </div>}
  </section>;
}
