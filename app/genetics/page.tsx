'use client';
import {GENETIC_TOPICS,GENETIC_FAQ} from '@/lib/genetic-topics';
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {GenomicReviewView} from '@/app/components/genomic-review';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {LanguageSwitcher} from '@/app/components/language-switcher';
import {StudyReports} from '@/app/components/study-reports';
import {ClinicalReportView} from '@/app/components/clinical-report';
import {AnalysisProgress} from '@/app/components/analysis-progress';
import {CitationContent} from '@/app/components/citation-content';
import {prepareFile} from '@/lib/case-intake';
import {caseTitle,caseContext,caseSignature,persistCase,readCases,type ClinicalCase} from '@/lib/casebook';
import type {CaseFile,CaseResult} from '@/lib/conductor';
import {requestAnalysis,type AnalysisProgressEvent} from '@/lib/analysis-stream';
import {clinicalReportText} from '@/lib/clinical-report';
import {planCase} from '@/lib/case-plan';
import {downloadDocx} from '@/lib/download-docx';
import {studyReportsText} from '@/lib/study-report';
import {parseGenotypeTable} from '@/packages/genomics/genotype-table';
import {parseVcf} from '@/packages/genomics/variants';
import {variantClinicalContext,GENETIC_DOMAINS,type GeneticDomain} from '@/packages/genomics/clinical-context';
import styles from '@/app/workspace.module.css';
type Discussion={question:string;filesKey:string;result:CaseResult};

export default function GeneticsPage(){
 const {t,language}=useWorkspaceLanguage();
 const [files,setFiles]=useState<CaseFile[]>([]),[cases,setCases]=useState<ClinicalCase[]>([]),[selected,setSelected]=useState('');
 const [context,setContext]=useState(''),[question,setQuestion]=useState(''),[focus,setFocus]=useState('');
 const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[notice,setNotice]=useState(''),[page,setPage]=useState(0);
 const [academic,setAcademic]=useState(true),[discussion,setDiscussion]=useState<Discussion[]>([]),[progress,setProgress]=useState<AnalysisProgressEvent[]>([]),[preview,setPreview]=useState('');
 const controller=useRef<AbortController>();
 const current=cases.find(item=>item.id===selected);
 useEffect(()=>{void readCases().then(values=>{setCases(values);const id=new URLSearchParams(location.search).get('case');if(id&&values.some(item=>item.id===id))setSelected(id);}).catch(()=>{});return()=>controller.current?.abort();},[]);
 const file=files.find(item=>/\.vcf(?:\.gz)?$/i.test(item.name))??files[0];
 const extracted=useMemo(()=>file?.text?parseVcf(file.text,language==='ru'?'ru':'en'):null,[file,language]);
 const filesKey=files.map(item=>item.sha256).join(':');
 const review=(discussion.at(-1)?.filesKey===filesKey?discussion.at(-1)?.result.ledger.find(entry=>entry.genetics?.review)?.genetics?.review:null)??extracted;
 const genotypes=useMemo(()=>!review&&file?.text?parseGenotypeTable(file.text):null,[file,review]);
 const latest=discussion.at(-1)?.result;
 const domains=useMemo(()=>{
  const groups=new Map<GeneticDomain,Set<string>>();
  for(const variant of review?.variants??[]){if(!variant.gene)continue;for(const domain of variantClinicalContext(variant).domains){if(!groups.has(domain))groups.set(domain,new Set());groups.get(domain)!.add(variant.gene);}}
  return [...groups].map(([id,genes])=>({id,genes:[...genes]}));
 },[review]);
 async function upload(list:FileList|null){
  if(!list)return;setUploading(true);setNotice('');
  try{const added=await Promise.all(Array.from(list).map(prepareFile));setFiles(old=>[...old,...added].filter((item,i,all)=>all.findIndex(other=>other.sha256===item.sha256)===i));setPage(0);}catch{setNotice('Не удалось прочитать файл.');}finally{setUploading(false);}
 }
 function preparedFiles(){return files.map(item=>{
  const table=item.text&&!/\.vcf(?:\.gz)?$/i.test(item.name)?parseGenotypeTable(item.text):null;
  return table?{...item,name:'genotypes.txt',text:['Genotype test. These are observed calls; genome build and strand require the original laboratory metadata. Missing positions are not reference.','rsid,chromosome,position,genotype',...table.rows.map(row=>[row.rsid,row.chromosome,row.position,row.genotype].join(','))].join('\n')}:item;
 });}
 async function analyze(){
  if(controller.current||(!files.length&&!question.trim()))return;
  const request=new AbortController();controller.current=request;setBusy(true);setNotice('');setProgress([]);setPreview('');
  const asked=question.trim()||t('Клиническое значение вариантов');
  const focused=review?.variants.find(item=>item.id===focus);
  const previous=discussion.slice(-3).map(turn=>({question:turn.question,summary:turn.result.draft.summary,studyReports:turn.result.draft.studyReports,report:turn.result.draft.report}));
  const text=['Clinical genetics consultation for a physician. Interpret the actual test in the clinical context, explain variant-level significance, inheritance, laboratory risk descriptions, possible drug implications and practical next steps. Give a substantive expert discussion, not merely an extraction table or repeated generic warnings.',current?`Linked case context:\n${caseContext(current)}`:'',context?`Physician clinical context:\n${context}`:'',focused?`Physician selected variant (actual extracted data):\n${JSON.stringify(focused)}`:'',previous.length?`Prior discussion, unverified AI hypotheses; no new patient facts:\n${JSON.stringify(previous).slice(-36000)}`:'',`Latest physician question:\n${asked}`].filter(Boolean).join('\n\n');
  try{
   const result=await requestAnalysis({caseId:current?.id,text,files:preparedFiles(),locale:language,sourceLocale:language,task:/фармакоген|лекарств|назначен|pharmaco|drug|medication|farmacogen|药物|دواء|औषध/i.test(asked)?'management':planCase(asked,files).task==='management'?'management':'clinical',externalSearch:academic,retain:false},{signal:request.signal,onProgress:event=>setProgress(old=>[...old.slice(-20),event]),onPreview:setPreview});
   if(result.clinicalDraft!=='generated'){setNotice('Разбор не завершён. Материалы сохранены на странице; повторите запрос.');return;}
   setDiscussion(old=>[...old,{question:asked,filesKey,result}].slice(-8));setQuestion('');
  }catch(error){if(!request.signal.aborted)setNotice('Не удалось завершить разбор. Сохраните материалы и повторите запрос.');}
  finally{controller.current=undefined;setBusy(false);setPreview('');}
 }
 async function save(){
  if(!selected||!files.length)return;setNotice('');
  try{
   const value=(await readCases()).find(item=>item.id===selected);if(!value)throw Error('case');
   const combined=[...value.files,...files].filter((item,i,all)=>all.findIndex(other=>other.sha256===item.sha256)===i);
   const now=new Date().toISOString();let updated:ClinicalCase={...value,updated:now,files:combined};
   if(latest)updated={...updated,analyses:[{id:crypto.randomUUID(),at:now,context:[caseContext(value),context,discussion.at(-1)?.question].filter(Boolean).join('\n\n'),inputSignature:caseSignature(updated),result:latest},...value.analyses]};
   await persistCase(updated);setCases(old=>old.map(item=>item.id===updated.id?updated:item));setNotice(latest?'Разбор и материалы сохранены в случае. Можно продолжить обсуждение в клиническом случае.':'Материал добавлен в случай.');
  }catch{setNotice('Не удалось сохранить материал в случае.');}
 }
 return <main className={`${styles.content} module-page genetic-dialogue`}>
  <Link href={selected?`/workspace?case=${encodeURIComponent(selected)}`:'/workspace'}>← {t('Клинические случаи')}</Link>
  <LanguageSwitcher disabled={busy}/><h1>{t('Генетика · разбор и консультация')}</h1>
  <p>{t('Загрузите тест, добавьте клинический вопрос и получите оценку значения вариантов. Затем уточняйте выводы в диалоге с генетическим консультантом.')}</p>
  <section className={styles.panel}>
   <label>{t('Сохранение результата')}<select disabled={busy} value={selected} onChange={event=>{setSelected(event.target.value);setDiscussion([]);setContext('');setQuestion('');}}><option value="">{t('Работать отдельно')}</option>{cases.map(item=><option key={item.id} value={item.id}>{caseTitle(item,item.id.slice(0,8))}</option>)}</select></label>
   <p className="module-hint">{t('Работайте отдельно или выберите случай: его данные станут контекстом исследования, а результат можно будет сохранить в его истории.')}</p>
   <h2>{t('1. Генетический тест и заключение лаборатории')}</h2>
   <label>{t('Добавить файлы')}<input type="file" multiple accept=".vcf,.vcf.gz,.txt,.csv,.pdf,.docx,.png,.jpg,.jpeg" disabled={busy||uploading} onChange={event=>{void upload(event.currentTarget.files);event.currentTarget.value='';}}/></label>
   <p className="module-hint">{t('VCF/VCF.GZ, таблицы генотипов, PDF/DOCX и фото лабораторного заключения. Описание лаборатории можно добавить вместе с исходными вариантами.')}</p>
   {files.map(item=><div className={styles.fileRow} key={item.sha256}><strong>{item.name}</strong><button disabled={busy} onClick={()=>{setFiles(old=>old.filter(other=>other.sha256!==item.sha256));setFocus('');}}>{t('Удалить')}</button></div>)}
   {uploading&&<p role="status">{t('Извлекаем данные перед отправкой на разбор')}</p>}
   {review&&<><h3>{t('Клинические направления')}</h3><p>{t('Эти направления помогают выбрать вопрос. Связь гена с заболеванием ещё не означает, что найденный вариант его вызывает.')}</p><div className="genetic-actions">{domains.map(group=><button key={group.id} disabled={busy} onClick={()=>setQuestion(`${t(GENETIC_DOMAINS[group.id])}: ${group.genes.join(', ')}. ${t('Клиническое значение вариантов')}`)}>{t(GENETIC_DOMAINS[group.id])} · {group.genes.length}</button>)}</div>
    <label>{t('Вариант для подробного обсуждения')}<select value={focus} disabled={busy} onChange={event=>setFocus(event.target.value)}><option value="">{t('Общий разбор теста')}</option>{review.variants.map(variant=><option key={variant.id} value={variant.id}>{variant.gene??'—'} · {variant.id} · {variant.genotype??'—'}</option>)}</select></label>
    <details><summary>{t('Извлечённые данные теста')} · {review.records}</summary><GenomicReviewView key={file?.sha256+language} finding={{review}}/></details></>}
   {genotypes&&<details><summary>{t('Все извлечённые генотипы, включая референсные')} · {genotypes.count}</summary><table><thead><tr><th>rsID</th><th>{t('Хромосома')}</th><th>{t('Позиция')}</th><th>{t('Генотип')}</th></tr></thead><tbody>{genotypes.rows.slice(page*20,page*20+20).map((item,index)=><tr key={item.rsid+index}><td>{item.rsid}</td><td>{item.chromosome}</td><td>{item.position}</td><td>{item.genotype||'—'}</td></tr>)}</tbody></table><button disabled={!page} onClick={()=>setPage(value=>value-1)}>{t('Назад')}</button> <button disabled={(page+1)*20>=genotypes.rows.length} onClick={()=>setPage(value=>value+1)}>{t('Далее')}</button></details>}
   <h2>{t('2. Клинический контекст и вопрос')}</h2>
   <label>{t('Жалобы, семейный анамнез и лекарства')}<textarea disabled={busy} rows={4} value={context} onChange={event=>setContext(event.target.value)} placeholder={t('Возраст, симптомы, семейные случаи заболеваний, цель теста, текущие препараты. Без ФИО и контактов.')}/></label>
   {current&&<details><summary>{t('Контекст выбранного случая')}</summary><p style={{whiteSpace:'pre-wrap'}}>{caseContext(current)}</p></details>}
   <h3>{t('Темы консультации')}</h3><div className="genetic-actions">{GENETIC_TOPICS.map(topic=><button key={topic.id} disabled={busy} onClick={()=>setQuestion(t(topic.question))}>{t(topic.title)}</button>)}</div><details><summary>{t('Частые вопросы генетику')}</summary><div className="genetic-actions">{GENETIC_FAQ.map(prompt=><button key={prompt} disabled={busy} onClick={()=>setQuestion(t(prompt))}>{t(prompt)}</button>)}</div></details>
   <label>{t('Вопрос генетическому консультанту')}<textarea disabled={busy} rows={3} value={question} onChange={event=>setQuestion(event.target.value)} placeholder={t('Что означает вариант, как он связан с клиникой и что меняет в ведении пациента?')}/></label>
   <label><input type="checkbox" checked={academic} disabled={busy} onChange={event=>setAcademic(event.target.checked)}/> {t('Разрешить поиск в публичных источниках, если он нужен для задачи')}</label>
   <div className="genetic-actions"><button disabled={busy||uploading||(!files.length&&!question.trim())} onClick={()=>void analyze()}>{t(busy?'Выполняется разбор…':discussion.length?'Продолжить обсуждение':'Разобрать генетический тест')}</button>{busy&&<button onClick={()=>controller.current?.abort()}>{t('Остановить')}</button>}<button disabled={busy||!selected||!files.length} onClick={()=>void save()}>{t(latest?'Сохранить разбор и материалы в случай':'Добавить материал в случай')}</button>{discussion.length>0&&<button disabled={busy} onClick={()=>{setDiscussion([]);setNotice('');}}>{t('Очистить обсуждение')}</button>}</div>
   {notice&&<p role="status">{t(notice)}</p>}{busy&&<AnalysisProgress events={progress} preview={preview}/>}
  </section>
  {discussion.map((turn,index)=><article key={index}>
   <h2>{t('Вопрос врача')} · {index+1}</h2><p>{turn.question}</p>
   <StudyReports reports={turn.result.draft.studyReports}/><h3>{t('Клиническое заключение')}</h3><p>{turn.result.draft.summary}</p>
   {turn.result.draft.report&&<ClinicalReportView report={turn.result.draft.report} citations={turn.result.citations}/>}
   {!!turn.result.citations.length&&<details><summary>{t('Источники для проверки')}</summary>{turn.result.citations.map((citation,i)=><section key={i}>{citation.url?.startsWith('https://')?<a href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a>:citation.title}<CitationContent citation={citation}/></section>)}</details>}
   <div className="genetic-actions"><button onClick={()=>void downloadDocx(t('Клиническое генетическое заключение'),[turn.question,studyReportsText(turn.result.draft.studyReports??[],t('Заключение')),turn.result.draft.summary,turn.result.draft.report?clinicalReportText(turn.result.draft.report,t):''].join('\n\n'),language)}>{t('Бланк DOCX')}</button></div>
  </article>)}
 </main>;
}
