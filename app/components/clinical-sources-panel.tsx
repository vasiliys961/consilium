'use client';
import Link from 'next/link';
import type {Analysis,ClinicalCase} from '@/lib/casebook';
import {clinicalSourcesForStage,makeGuidelineTopicHandoff,GUIDELINE_HANDOFF_KEY} from '@/lib/clinical-source-review';
import {safeReferenceUrl} from '@/lib/literature';
import type {ClinicalSourceEntry} from '@/lib/clinical-source-review';
import {CitationContent} from './citation-content';
import {useWorkspaceLanguage} from './workspace-language';

const origins={world:'Международные руководства',russia:'Национальные рекомендации',local:'Личная библиотека / локальный источник',europepmc:'Индексируемая публикация',drug:'Инструкция к препарату',genetics:'Генетический источник'};
export function ClinicalSourcesPanel({value,analysis,index}:{value:ClinicalCase;analysis:Analysis;index:number}){
 const {t}=useWorkspaceLanguage();
 const review=clinicalSourcesForStage(value.analyses,index);
 const shown=review.current.length+review.earlier.length;
 function storeTopic(){
  try{sessionStorage.setItem(GUIDELINE_HANDOFF_KEY,JSON.stringify(makeGuidelineTopicHandoff(value,analysis,review)));}
  catch{/* Guidelines remains usable with a manually entered topic if browser storage is disabled. */}
 }
 function renderEntry(entry:ClinicalSourceEntry){
  const c=entry.citation,url=c.url?safeReferenceUrl(c.url):null;
  return <li key={entry.analysisId+':'+(c.passageId||c.pmid||c.url||c.title)} style={{marginBottom:12}}>
   <strong>{url?<a href={url} target="_blank" rel="noopener noreferrer">{c.title} ↗</a>:c.title}</strong>
   <div><small>{[c.year,origins[c.shelf],c.journal,c.country,c.edition].filter(Boolean).join(' · ')}</small></div>
   {entry.matchedStatements.length>0&&<p><small>{t('Связанный тезис разбора (привязка не означает подтверждения источником):')} {entry.matchedStatements[0].slice(0,350)}</small></p>}
   <CitationContent citation={c}/>
  </li>;
 }
 return <details>
  <summary>{t('Источники для проверки')} · {shown}{analysis.kind==='summary'&&review.earlier.length>0?' · '+t('включая ранее найденные'):''}</summary>
  <p>{t('Международные руководства и индексируемые исследования — в приоритете. Ссылка сама по себе не подтверждает вывод.')}</p>
  {shown===0?<p>{t('В данном этапе и доступной истории нет сохранённых ссылок. Это не означает отсутствия рекомендаций.')}</p>:null}
  {review.current.length>0&&<section><h4>{t('Найдены на этом этапе')} · {review.currentCount}</h4><ol>{review.current.map(renderEntry)}</ol></section>}
  {review.earlier.length>0&&<section><h4>{t('Найдены на предыдущих этапах')} · {review.earlierCount}</h4><ol>{review.earlier.map(renderEntry)}</ol></section>}
  {review.currentCount+review.earlierCount>shown&&<small>{t('Показаны наиболее релевантные источники')} · {shown} / {review.currentCount+review.earlierCount}</small>}
  {analysis.kind==='summary'&&<p><Link href="/guidelines" onClick={storeTopic}>{t('Найти клинические рекомендации по этому выводу')} →</Link><br/><small>{t('Тема и найденные ссылки передаются только в браузере. Поиск не запускается автоматически; сначала проверьте тему и обезличивание.')}</small></p>}
 </details>;
}
