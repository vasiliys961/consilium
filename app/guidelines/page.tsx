'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {readCases,persistCase,caseContext,type ClinicalCase} from '@/lib/casebook';
import {reviewBeforeSending} from '@/lib/privacy-client';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {downloadDocx} from '@/lib/download-docx';
import type {GuidelinePlan,GuidelineResult} from '@/lib/guideline-review';

type Section='differential'|'investigations'|'treatment'|'monitoring'|'safety';
const SECTIONS:readonly [Section,string,string][]=[
 ['differential','Дифференциальная диагностика','Differential diagnosis'],
 ['investigations','Предлагаемые обследования','Proposed investigations'],
 ['treatment','Предлагаемое лечение','Proposed treatment'],
 ['monitoring','Контроль и мониторинг','Follow-up and monitoring'],
 ['safety','Ограничения и безопасность','Safety and contraindications']
];
function planText(plan:GuidelinePlan,topic:string){
 return [topic,plan.summary,...SECTIONS.map(([key,title])=>title+':\n'+plan[key].map((v,i)=>String(i+1)+'. '+v.text+(v.sources.length?' ['+v.sources.join(', ')+']':' [Модельная рекомендация, без проверенного фрагмента]')).join('\n')),'Уточнить:\n'+plan.uncertainties.join('\n')].join('\n\n');
}
export default function ClinicalGuidelines(){
 const {language}=useWorkspaceLanguage();
 const label=(ru:string,en:string)=>language==='ru'?ru:en;
 const [cases,setCases]=useState<ClinicalCase[]>([]),[caseId,setCaseId]=useState(''),[topic,setTopic]=useState(''),[context,setContext]=useState('');
 const [result,setResult]=useState<GuidelineResult|null>(null),[plan,setPlan]=useState<GuidelinePlan|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  const query=new URLSearchParams(location.search);
  void readCases().then(items=>{setCases(items);const found=items.find(x=>x.id===query.get('case'));if(found){setCaseId(found.id);setContext(caseContext(found).slice(0,7000));setTopic(found.question.slice(0,350));}}).catch(()=>setNotice('Локальные случаи недоступны'));
 },[]);
 function changeCase(id:string){
  if(plan&&!window.confirm(label('Есть несохранённые правки. Продолжить?','Discard unsaved edits?')))return;
  setCaseId(id);const selected=cases.find(x=>x.id===id);
  setContext(selected?caseContext(selected).slice(0,7000):'');setTopic(selected?selected.question.slice(0,350):'');setResult(null);setPlan(null);
 }
 async function generate(){
  if(topic.trim().length<4||busy)return;
  setBusy(true);setResult(null);setPlan(null);setNotice('');
  try{
   const reviewed=await reviewBeforeSending({text:JSON.stringify({topic:topic.trim(),context}),locale:language,sourceLocale:language,task:'management',retain:false,externalSearch:true});
   const response=await fetch('/api/guidelines',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reviewed)});
   if(!response.ok)throw Error(label('Не удалось получить рекомендации','Guideline search failed'));
   const data=await response.json() as GuidelineResult;
   if(!data.plan||!Array.isArray(data.sources))throw Error('Invalid response');
   setResult(data);setPlan(data.plan);
  }catch(e){setNotice(e instanceof Error?e.message:'Error');}
  finally{setBusy(false);}
 }
 function edit(key:Section,index:number,value:string){
  setPlan(old=>old&&({...old,[key]:old[key].map((item,i)=>i===index?{...item,text:value}:item)}));
 }
 async function attach(){
  if(!plan||!result||!caseId)return;
  const existing=cases.find(x=>x.id===caseId);if(!existing)return;
  const refs=result.sources.map(x=>x.id+' '+x.title+' '+(x.url??'no URL')).join('\n');
  const report='РЕДАКТИРУЕМЫЕ ПРЕДЛОЖЕНИЯ ИИ ПО КЛИНИЧЕСКИМ РЕКОМЕНДАЦИЯМ. НЕ ЯВЛЯЮТСЯ ПОДПИСАННЫМИ НАЗНАЧЕНИЯМИ.\n'+planText(plan,topic)+'\n\nИСТОЧНИКИ ПОИСКА (полный текст не подтверждён):\n'+refs;
  const at=new Date().toISOString();
  const updated={...existing,updated:at,events:[...existing.events,{id:crypto.randomUUID(),kind:'note' as const,at,text:report.slice(0,12000)}]};
  try{await persistCase(updated);setCases(old=>old.map(x=>x.id===caseId?updated:x));setNotice(label('Предложения добавлены в случай и будут доступны в следующем разборе','Proposals added to the case for subsequent clinical review'));}
  catch{setNotice(label('Ошибка сохранения','Save failed'));}
 }
 async function share(){
  if(!plan)return;
  const text=planText(plan,topic);
  try{if(navigator.share)await navigator.share({title:topic,text});else{await navigator.clipboard.writeText(text);setNotice(label('Скопировано для отправки','Copied for sharing'));}}
  catch{setNotice(label('Отправка отменена','Sharing cancelled'));}
 }
 return <main className="module-page" style={{maxWidth:1020,margin:'auto',padding:26,lineHeight:1.6}}>
  <p><Link href="/workspace">← {label('Клинические случаи','Clinical cases')}</Link></p>
  <h1>{label('Клинические рекомендации','Clinical guidelines')}</h1>
  <p>{label('ИИ самостоятельно предлагает обследование, лечение, альтернативы и мониторинг. Врач редактирует все предложения. Подтверждённые источники отображаются отдельно от выводов модели.','AI proposes diagnostics, treatment, alternatives and monitoring. The physician edits proposals; retrieved sources remain distinguishable from model reasoning.')}</p>
  <label>{label('Случай (необязательно)','Case (optional)')}<select value={caseId} disabled={busy} onChange={e=>changeCase(e.target.value)}>
   <option value="">{label('Самостоятельный поиск','Standalone')}</option>
   {cases.map(c=><option key={c.id} value={c.id}>{c.title||c.id.slice(0,8)}</option>)}
  </select></label>
  <label>{label('Клинический вопрос','Clinical question')}<input maxLength={350} value={topic} disabled={busy} onChange={e=>{setTopic(e.target.value);setResult(null);setPlan(null);}} placeholder={label('Сердечная недостаточность: обследование и лечение','Heart failure: investigations and treatment')}/></label>
  <label>{label('Клинический контекст','Clinical context')}<textarea rows={7} value={context} maxLength={9000} disabled={busy} onChange={e=>{setContext(e.target.value);setResult(null);setPlan(null);}} placeholder={label('Возраст, симптомы, лаборатория, препараты, аллергии и функция органов','Age, symptoms, labs, medicines, allergies, organ function')}/></label>
  <p><small>{label('Перед отправкой проводится проверка обезличивания. Поиск и модель могут расходовать средства. Предлагаемые назначения врач проверяет и исправляет.','Privacy review is required; retrieval and reasoning may incur API costs. The physician reviews and edits all proposed prescriptions.')}</small></p>
  <button disabled={busy||topic.trim().length<4} onClick={()=>void generate()}>{busy?label('Анализ…','Analyzing…'):label('Найти рекомендации и составить план · GPT-6.1 Sol','Find guidelines and draft plan · GPT-6.1 Sol')}</button>
  {notice&&<p role="status">{notice}</p>}
  {plan&&result&&<section>
   <h2>{label('Предложения ИИ — редактируемый черновик','AI proposals — editable draft')}</h2>
   <p><small>{label('Модель','Model')}: {result.model}. {label('Расчётная стоимость','Estimated cost')}: {'$'+result.estimatedUsd.toFixed(5)}. {label('Доказательная база','Evidence coverage')}: {result.sourceCoverage==='none'?label('источники не найдены','none retrieved'):result.sourceCoverage==='metadata_only'?label('только библиография','bibliography only'):label('фрагменты публикаций','retrieved excerpts')}.</small></p>
   <label>{label('Резюме','Summary')}<textarea value={plan.summary} rows={4} onChange={e=>setPlan(old=>old&&({...old,summary:e.target.value}))}/></label>
   {SECTIONS.map(([key,ru,en])=><section key={key}><h3>{label(ru,en)}</h3>
    {plan[key].map((v,i)=><div key={i}><label>{i+1}.<textarea rows={3} value={v.text} maxLength={1000} onChange={e=>edit(key,i,e.target.value)}/></label>
     <small>{v.sources.length?label('Связанные источники: ','Model-linked sources: ')+v.sources.join(', '):label('Предложение модели без подтверждённого фрагмента','Model proposal without a cited excerpt')}</small>
    </div>)}
   </section>)}
   <h3>{label('Что необходимо уточнить','Missing key information')}</h3>
   {plan.uncertainties.map((v,i)=><label key={i}>{i+1}.<textarea rows={2} value={v} onChange={e=>setPlan(old=>old&&({...old,uncertainties:old.uncertainties.map((x,j)=>i===j?e.target.value:x)}))}/></label>)}
   <h3>{label('Найденные источники','Retrieved sources')}</h3>
   {result.sources.map(s=><article key={s.id}><strong>{s.id}</strong> · {s.url?<a href={s.url} rel="noreferrer" target="_blank">{s.title}</a>:s.title} ({s.year??label('год неизвестен','year unknown')})<p><small>{s.excerpt?label('Доступен фрагмент, требуется сверка с полным текстом','Excerpt only; verify full text'):label('Только библиографическая запись','Bibliographic metadata only')}</small></p></article>)}
   {result.sources.length===0&&<p>{label('Проверенных поиском источников нет: выводы являются предложениями модели.','No retrieved sources; these are model-only proposals.')}</p>}
   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
    <button type="button" disabled={!caseId} onClick={()=>void attach()}>{label('Использовать в клиническом случае','Add to clinical case')}</button>
    <button type="button" onClick={()=>void downloadDocx(label('Клинические рекомендации','Clinical guidelines'),planText(plan,topic),language).catch(()=>setNotice('DOCX failed'))}>DOCX</button>
    <button type="button" onClick={()=>void share()}>{label('Поделиться','Share')}</button>
    <button type="button" onClick={()=>window.print()}>{label('Печать / PDF','Print / PDF')}</button>
   </div>
  </section>}
 </main>;
}
