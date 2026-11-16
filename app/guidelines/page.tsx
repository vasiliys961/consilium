'use client';
import Link from 'next/link';
import {useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {reviewBeforeSending} from '@/lib/privacy-client';
import {downloadDocx} from '@/lib/download-docx';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import type {GuidelineMode} from '@/lib/parent-guideline-search';

type SearchResult={text:string;model:string;estimatedUsd:number;inputTokens:number;outputTokens:number;searchMode:GuidelineMode};
const specialties=['Кардиология','Пульмонология','Неврология','Эндокринология','Гастроэнтерология','Нефрология','Ревматология','Онкология','Инфекционные болезни','Педиатрия','Акушерство и гинекология','Хирургия','Анестезиология и реаниматология'];
const modes:readonly [GuidelineMode,string][]=[['brief','Кратко · Gemini Flash'],['standard','Стандарт · Gemini Flash'],['detailed','Подробно · Sonnet 5.5'],['online','Актуальные · Perplexity Sonar']];
export default function ClinicalGuidelines(){
 const {language}=useWorkspaceLanguage();
 const tr=(ru:string,en:string)=>language==='ru'?ru:en;
 const [query,setQuery]=useState(''),[specialty,setSpecialty]=useState(''),[mode,setMode]=useState<GuidelineMode>('standard');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[result,setResult]=useState<SearchResult|null>(null),[editing,setEditing]=useState(false);
 async function search(){
  if(busy||query.trim().length<3)return;
  setBusy(true);setNotice('');setResult(null);setEditing(false);
  try{
   const reviewed=await reviewBeforeSending({text:query.trim(),task:'evidence',locale:language,sourceLocale:language,retain:false,externalSearch:false});
   const response=await fetch('/api/protocols/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...reviewed,modelMode:mode,specialty})});
   if(!response.ok){
    const data=await response.json().catch(()=>({error:'unknown'}));
    const reason=data.error;
    throw Error(reason==='openrouter_not_configured'?tr('В Preview не задан OPENROUTER_API_KEY','OPENROUTER_API_KEY not configured'):
     reason==='provider_no_clinical_guidance'?tr('Модель не ответила. Это техническая ошибка, а не отсутствие рекомендаций. Попробуйте другой режим.','Model returned no answer; this is not evidence that no guideline exists.'):
     tr('Ошибка получения рекомендаций: '+String(reason),'Guideline search error: '+String(reason)));
   }
   const data=await response.json() as SearchResult;
   if(!data.text?.trim())throw Error(tr('Пустой ответ модели','Empty model response'));
   setResult(data);
  }catch(e){setNotice(e instanceof Error?e.message:tr('Ошибка запроса','Request error'));}
  finally{setBusy(false);}
 }
 async function share(){
  if(!result)return;
  try{if(navigator.share)await navigator.share({title:query,text:result.text});
   else{await navigator.clipboard.writeText(result.text);setNotice(tr('Скопировано для отправки','Copied for sharing'));}}
  catch{setNotice(tr('Отправка отменена','Sharing canceled'));}
 }
 return <main className="module-page" style={{maxWidth:1080,margin:'auto',padding:28,lineHeight:1.6}}>
  <p><Link href="/workspace">← {tr('Клинические случаи','Clinical cases')}</Link></p>
  <h1>📚 {tr('Клинические рекомендации','Clinical guidelines')}</h1>
  <p>{tr('Самостоятельный поиск материнского Doctor Opus: от краткого обзора до подробной клинической тактики и актуальных документов через Sonar. Одного названия болезни достаточно.','Standalone guidance search adapted from Doctor Opus. A single disease name is sufficient.')}</p>
  <section style={{padding:20,background:'#fcfdfb',border:'1px solid #c4d1c7',borderRadius:10,margin:'18px 0'}}>
   <label>{tr('Специальность (необязательно)','Specialty (optional)')}
    <select disabled={busy} value={specialty} onChange={e=>setSpecialty(e.target.value)}>
     <option value="">{tr('Без выбора','Any')}</option>{specialties.map(v=><option key={v} value={v}>{v}</option>)}
    </select>
   </label>
   <label>{tr('Тема или клинический вопрос','Topic or clinical question')}
    <textarea disabled={busy} rows={3} maxLength={550} value={query} onChange={e=>setQuery(e.target.value)}
     placeholder={tr('Например: плеврит','Example: pleuritis')}
     onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void search();}}}/>
   </label>
   <p><strong>{tr('Глубина анализа','Search depth')}</strong></p>
   <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    {modes.map(([value,title])=><button type="button" key={value} disabled={busy} aria-pressed={mode===value}
     onClick={()=>setMode(value)} style={{border:'1px solid #8c9c90',background:mode===value?'#20543d':'#edf3ee',color:mode===value?'#fff':'#1c3b2d',borderRadius:6,padding:'9px 12px'}}>{title}</button>)}
   </div>
   <p><small>{mode==='online'?tr('Perplexity Sonar ищет актуальные сведения в интернете. Ссылки и применимость проверяются врачом.','Sonar searches online; verify citations and clinical applicability.'):tr('Gemini Flash — быстрее и дешевле; Sonnet — подробнее. Источники в ответе модели не считаются автоматически проверенными.','Flash is faster; Sonnet more detailed. Model references need verification.')}</small></p>
   <button disabled={busy||query.trim().length<3} onClick={()=>void search()}>{busy?tr('Поиск…','Searching…'):tr('🔍 Найти клинические рекомендации','🔍 Find clinical guidelines')}</button>
   <p><small>{tr('Перед отправкой — стандартная проверка обезличивания. Запросы к моделям могут расходовать API-баланс.','Privacy review precedes the model call. Calls may cost API credits.')}</small></p>
  </section>
  {notice&&<p role="status">{notice}</p>}
  {result&&<section style={{padding:22,background:'white',border:'1px solid #d2ded6',borderRadius:9}}>
   <h2>{tr('Найденные рекомендации и клиническая тактика','Clinical recommendations')}</h2>
   <p><small>{tr('Модель','Model')}: {result.model} · {tr('Расчётная стоимость','Estimated cost')}: {'$'+result.estimatedUsd.toFixed(5)} · {tr('Токены','Tokens')}: {result.inputTokens+result.outputTokens}</small></p>
   {editing?<label>{tr('Редактировать текст','Edit text')}<textarea rows={24} value={result.text} onChange={e=>setResult(prev=>prev&&({...prev,text:e.target.value}))}/></label>:
    <article className="clinical-guideline-markdown" style={{whiteSpace:'normal',lineHeight:1.75}}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.text}</ReactMarkdown></article>}
   <div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:20}}>
    <button type="button" onClick={()=>setEditing(prev=>!prev)}>{editing?tr('Просмотр','Preview'):tr('Редактировать','Edit')}</button>
    <button type="button" onClick={()=>void downloadDocx(query,result.text,language).catch(()=>setNotice(tr('Ошибка DOCX','DOCX failed')))}>DOCX</button>
    <button type="button" onClick={()=>window.print()}>{tr('Печать / PDF','Print / PDF')}</button>
    <button type="button" onClick={()=>void share()}>{tr('Поделиться','Share')}</button>
    <button type="button" onClick={()=>void navigator.clipboard.writeText(result.text).then(()=>setNotice(tr('Текст скопирован для клинического разбора','Copied for clinical review'))).catch(()=>setNotice(tr('Не удалось скопировать','Copy failed')))}>{tr('Копировать для разбора','Copy for clinical case')}</button>
   </div>
   <p><small>{tr('Выводы ИИ, дозировки и ссылки требуют сверки с первоисточником. Это не утверждённые назначения врача.','Verify recommendations, doses and sources. Not a signed physician order.')}</small></p>
  </section>}
  {!busy&&!result&&<section>
   <h3>{tr('Примеры запросов','Example searches')}</h3>
   <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    {['Плеврит','Острый коронарный синдром','Декомпенсация сердечной недостаточности','Фибрилляция предсердий','Внебольничная пневмония'].map(v=><button type="button" key={v} onClick={()=>setQuery(v)}>{v}</button>)}
   </div>
  </section>}
 </main>;
}
