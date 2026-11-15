'use client';

import {useState} from 'react';
import {knownDrugInteractions, localDrugCoverage, type DrugInteractionAlert} from '@/lib/drug-interaction-rules';
import {useWorkspaceLanguage} from './workspace-language';

export function DrugInteractionAlerts({ alerts }: { alerts: DrugInteractionAlert[] }) {
  const { t } = useWorkspaceLanguage();
  return <>{alerts.map(item => <article key={`${item.url}:${item.first}:${item.second}`}>
    <strong>{item.first} + {item.second}</strong>
    <p>{t(item.risk)}</p>
    <p>{t(item.action)}</p>
    {item.url.startsWith('https://dailymed.nlm.nih.gov/') && <a href={item.url} target="_blank" rel="noreferrer">DailyMed ↗</a>}
  </article>)}</>;
}

export function DrugInteractionChecker({current,onCurrentChange,disabled=false,initialProposed='',proposed:controlledProposed,onReview,onProposedChange}:{current?:string;onCurrentChange?:(text:string)=>void;disabled?:boolean;initialProposed?:string;proposed?:string;onReview?:(current:string,proposed:string)=>void;onProposedChange?:(text:string)=>void}){
  const {t}=useWorkspaceLanguage();
  const [standalone,setStandalone]=useState(''),[localProposed,setProposed]=useState(initialProposed);
  const proposed=controlledProposed??localProposed;
  const active=current??standalone;
  const alerts=knownDrugInteractions(active,proposed);
  const coverage=localDrugCoverage(active,proposed);
  return <section aria-label={t('Локальная проверка сочетаний')}>
    <h3>{t('Локальная проверка сочетаний')}</h3>
    <p>{t('Добавлять препараты можно на любом этапе. Введите действующие вещества по одному на строку, через запятую или плюс. Эта локальная проверка использует только поля ниже; она не извлекает препараты из свободного клинического текста.')}</p>
    <label>{t('Текущие препараты')}<textarea disabled={disabled} rows={3} maxLength={2000} value={active} onChange={event=>(onCurrentChange??setStandalone)(event.target.value)}/></label>
    <label>{t('Проверить предполагаемое назначение')}<textarea disabled={disabled} rows={2} maxLength={1000} value={proposed} onChange={event=>{setProposed(event.target.value);onProposedChange?.(event.target.value);}}/></label>
    {onReview&&<button type="button" disabled={disabled||!(active.trim()||proposed.trim())} onClick={()=>onReview(active,proposed)}>{t('Разобрать этот список с проверкой источников')}</button>}<p>{t('Охват локального списка:')} {coverage.ruleCount} {t('правила. Это не полная база лекарственных взаимодействий.')}</p>{!!(active.trim()||proposed.trim())&&<div aria-live="polite"><p>{t('Распознано в локальном списке:')} {coverage.recognized.join('; ')||t('нет')}</p>{coverage.unrecognized.length>0&&<p>{t('Не охвачены локальными правилами:')} {coverage.unrecognized.join('; ')}</p>}{alerts.length?<DrugInteractionAlerts alerts={alerts}/>:<p>{t('В доступных правилах совпадений нет. Это не подтверждает совместимость; для остальных сочетаний нужен отдельный разбор и проверка источников.')}</p>}</div>}
  </section>;
}
