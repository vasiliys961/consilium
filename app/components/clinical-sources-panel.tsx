'use client';
import Link from 'next/link';
import type {Analysis,ClinicalCase} from '@/lib/casebook';
import {clinicalSourcesForStage,makeGuidelineTopicHandoff,GUIDELINE_HANDOFF_KEY} from '@/lib/clinical-source-review';
import {safeReferenceUrl} from '@/lib/literature';
import {reviewClaimEvidence} from '@/lib/clinical-claim-evidence';
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
  const passages=entry.passages.slice(0,5);
  return <li key={entry.analysisId+':'+(c.passageId||c.pmid||c.url||c.title)} style={{marginBottom:12}}>
   <strong>{url?<a href={url} target="_blank" rel="noopener noreferrer">{c.title} ↗</a>:c.title}</strong>
   <div><small>{[c.year,origins[c.shelf],c.journal,c.country,c.edition,c.chapter,c.page&&'стр. '+c.page].filter(Boolean).join(' · ')}</small></div>
   {passages.map((passage,i)=><div key={passage.citation.passageId||String(i)} style={{paddingLeft:8,borderLeft:'2px solid #d8e2dd',marginTop:8}}>
    {passages.length>1&&<small>{t('Место источника')} {i+1} / {entry.passages.length}</small>}
    {passage.matchedStatements.slice(0,3).map((statement,j)=>{
     const assessment=reviewClaimEvidence(statement,passage.citation);
     const access=assessment.level==='paragraph'?t('Прочитан абзац полного текста')
      :assessment.level==='excerpt'?t('Доступен фрагмент')
      :assessment.level==='abstract'?t('Доступна только аннотация')
      :t('Есть только библиографическая запись');
     return <div key={j}>
      <p><small><strong>{t('Тезис, связанный с источником:')}</strong> {statement.slice(0,350)}</small></p>
      <p><small>{access}. {assessment.topicOverlap
       ?t('Термины тезиса встречаются в тексте; это не проверка достоверности вывода.')
       :t('Совпадение содержания тезиса с доступным текстом не установлено.')}</small></p>
      {assessment.missingQuantities.length>0&&<p><small>{t('Числа или дозы из тезиса не найдены в доступном фрагменте:')} {assessment.missingQuantities.join(', ')}.</small></p>}
      {assessment.unlocatedPopulation.length>0&&<p><small>{t('Условия применимости не обнаружены в доступном тексте:')} {assessment.unlocatedPopulation.join(', ')}.</small></p>}
     </div>;
    })}
    <CitationContent citation={passage.citation}/>
   </div>)}
   {!entry.matchedStatements.length&&<p><small>{t('Нет явной привязки к конкретному тезису. Источник сохранён для проверки врачом.')}</small></p>}
   {entry.passages.length>passages.length&&<p><small>{t('Дополнительных мест в этой публикации:')} {entry.passages.length-passages.length}</small></p>}
  </li>;
 }
 return <details>
  <summary>{t('Источники для проверки')} · {shown}{analysis.kind==='summary'&&review.earlier.length>0?' · '+t('включая ранее найденные'):''}</summary>
  <p>{t('Международные руководства и индексируемые исследования — в приоритете. Ссылка сама по себе не подтверждает вывод. Проверьте показание, популяцию, раздел, версию и ограничения источника.')}</p>
  {shown===0?<p>{t('В данном этапе и доступной истории нет сохранённых ссылок. Это не означает отсутствия рекомендаций.')}</p>:null}
  {review.current.length>0&&<section><h4>{t('Найдены на этом этапе')} · {review.currentCount}</h4><ol>{review.current.map(renderEntry)}</ol></section>}
  {review.earlier.length>0&&<section><h4>{t('Найдены на предыдущих этапах')} · {review.earlierCount}</h4><ol>{review.earlier.map(renderEntry)}</ol></section>}
  {review.currentCount+review.earlierCount>shown&&<small>{t('Показаны наиболее релевантные источники')} · {shown} / {review.currentCount+review.earlierCount}</small>}
  {analysis.kind==='summary'&&<p><Link href="/guidelines" onClick={storeTopic}>{t('Найти клинические рекомендации по этому выводу')} →</Link><br/><small>{t('Тема и найденные ссылки передаются только в браузере. Поиск не запускается автоматически; сначала проверьте тему и обезличивание.')}</small></p>}
 </details>;
}
