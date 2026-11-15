'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {readCases,persistCase,type ClinicalCase} from '@/lib/casebook';
import {proposedPrescriptionRegimens,prescriptionPrintText,type ProposedPrescription} from '@/lib/prescription-draft';
import {downloadDocx} from '@/lib/download-docx';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';

const EMPTY:ProposedPrescription={drug:'',dose:'',form:'',route:'',frequency:'',duration:'',quantity:'',note:''};
type K=keyof ProposedPrescription;
const FIELDS:readonly [K,string,string][]=[
 ['drug','МНН / препарат','Generic drug'],
 ['form','Лекарственная форма','Form'],
 ['dose','Доза','Dose'],
 ['route','Путь введения','Route'],
 ['frequency','Кратность','Frequency'],
 ['duration','Длительность','Duration'],
 ['quantity','Количество','Quantity'],
 ['note','Дополнительно','Instructions']
];
export default function PrescriptionDrafts(){
 const {language}=useWorkspaceLanguage();
 const tr=(ru:string,en:string)=>language==='ru'?ru:en;
 const [cases,setCases]=useState<ClinicalCase[]>([]),[caseId,setCaseId]=useState('');
 const [index,setIndex]=useState(-1),[rows,setRows]=useState<ProposedPrescription[]>([{...EMPTY}]);
 const [patient,setPatient]=useState(''),[physician,setPhysician]=useState(''),[organization,setOrganization]=useState(''),[notice,setNotice]=useState('');
 const current=cases.find(c=>c.id===caseId);
 const options=proposedPrescriptionRegimens(current);
 const source=current?.protocols?.flatMap(p=>p.sections).find(p=>/^(Treatment|Therapy|Лечение|Терапия)$/i.test(p.title))?.text;
 const printable=prescriptionPrintText(rows,{patient,physician,organization});
 useEffect(()=>{
  const requested=new URLSearchParams(location.search).get('case');
  void readCases().then(items=>{setCases(items);if(items.some(c=>c.id===requested))setCaseId(requested??'');}).catch(()=>setNotice('Локальные случаи не загружены'));
 },[]);
 function chooseCase(id:string){setCaseId(id);setIndex(-1);setRows([{...EMPTY}]);setNotice('');}
 function chooseOption(next:number){
  setIndex(next);
  setRows(next>=0&&options[next]?.medications.length?options[next].medications.map(m=>({...m})):[{...EMPTY}]);
 }
 function updateRow(i:number,key:K,text:string){setRows(old=>old.map((r,j)=>i===j?{...r,[key]:text}:r));}
 async function save(){
  if(!current)return;
  const date=new Date().toISOString(),note='ЧЕРНОВИК РЕЦЕПТУРНОГО ПЛАНА, ПРЕДЛОЖЕННОГО ИИ И ИСПРАВЛЕННОГО В РЕДАКТОРЕ. НЕ ЯВЛЯЕТСЯ РЕЦЕПТОМ ИЛИ ПОДПИСАННЫМ НАЗНАЧЕНИЕМ.\n'+prescriptionPrintText(rows,{patient:'',physician:'',organization:''});
  try{
   const saved=(await readCases()).find(c=>c.id===current.id);
   if(!saved)throw Error('missing case');
   const updated={...saved,updated:date,events:[...saved.events,{id:crypto.randomUUID(),kind:'note' as const,at:date,text:note.slice(0,12000)}]};
   await persistCase(updated);
   setCases(old=>old.map(c=>c.id===current.id?updated:c));
   setNotice(tr('Черновик сохранён отдельно от решений врача.','Draft saved separately from physician decisions.'));
  }catch{setNotice(tr('Не удалось сохранить черновик','Could not save draft'));}
 }
 return <main className="module-page" style={{maxWidth:1010,margin:'auto',padding:26,lineHeight:1.6}}>
  <p><Link href="/protocol/structured">← {tr('Редактор протокола','Protocol editor')}</Link></p>
  <h1>{tr('Рецептурные бланки · редактор врача','Prescription sheets · physician editor')}</h1>
  <p>{tr('ИИ предлагает лекарства и лечебные схемы при клиническом разборе. Здесь врач выбирает вариант, исправляет препараты, дозы и режимы и затем печатает черновик. Ничего не считается назначенным автоматически.','AI proposes treatments during clinical reasoning. The physician chooses a regimen, edits drugs, doses and directions, and prints a draft. No orders are automatically placed.')}</p>
  <label>{tr('Клинический случай','Clinical case')}
   <select value={caseId} onChange={e=>chooseCase(e.target.value)}><option value="">{tr('Без случая','No case')}</option>{cases.map(c=><option key={c.id} value={c.id}>{c.title||c.id.slice(0,8)}</option>)}</select>
  </label>
  {options.length>0&&<label>{tr('Предложенные ИИ альтернативы (не смешивать)','AI-proposed alternative regimens (do not combine)')}
   <select value={index} onChange={e=>chooseOption(Number(e.target.value))}>
    <option value="-1">{tr('Заполнить вручную','Manual entry')}</option>
    {options.map((o,i)=><option value={i} key={i}>{String(i+1)+'. '+o.option.slice(0,120)}</option>)}
   </select>
  </label>}
  {index>=0&&options[index]&&<section>
   <p><strong>{tr('Исходное предложение ИИ','Original AI proposal')}:</strong> {options[index].option}</p>
   <p>{tr('Условия','Conditions')}: {options[index].conditions.join('; ')||tr('не указаны','not supplied')}.</p>
   <p>{tr('Перед назначением проверить','Check before prescribing')}: {options[index].safetyChecks.join('; ')||tr('не указано','not supplied')}.</p>
   <p>{tr('Мониторинг','Monitoring')}: {options[index].monitoring.join('; ')||tr('не указан','not supplied')}.</p>
  </section>}
  {options.length===0&&source&&<details><summary>{tr('Лечебные предложения в ранее сформированном протоколе','Treatment proposals in the saved protocol')}</summary><p style={{whiteSpace:'pre-wrap'}}>{source.slice(0,5000)}</p><small>{tr('При переносе в рецептурный лист обязательно укажите проверенную дозу и путь.','Manually verify dose and route before copying to a prescription.')}</small></details>}
  <h2>{tr('Редактируемые препараты','Editable drugs')}</h2>
  {rows.map((row,i)=><fieldset key={i} style={{border:'1px solid #bdc9c1',marginBottom:15,padding:12}}>
   <legend>{tr('Запись','Item')} {i+1}</legend>
   {FIELDS.map(([key,ru,en])=><label key={key}>{tr(ru,en)}<input value={row[key]} maxLength={key==='note'?600:160} onChange={e=>updateRow(i,key,e.target.value)} placeholder={key==='dose'?tr('Уточнить по показаниям и функции органов','Verify for indication and organ function'):''}/></label>)}
   <button type="button" onClick={()=>setRows(old=>old.length===1?[{...EMPTY}]:old.filter((_,j)=>i!==j))}>{tr('Убрать запись','Remove item')}</button>
  </fieldset>)}
  <button type="button" onClick={()=>setRows(old=>old.length>=16?old:[...old,{...EMPTY}])}>{tr('Добавить препарат','Add medication')}</button>
  <h3>{tr('Реквизиты для печати (хранятся только в этой форме)','Print details (local to this page)')}</h3>
  <label>{tr('Пациент','Patient')}<input value={patient} onChange={e=>setPatient(e.target.value)}/></label>
  <label>{tr('Врач','Physician')}<input value={physician} onChange={e=>setPhysician(e.target.value)}/></label>
  <label>{tr('Медицинская организация','Organization')}<input value={organization} onChange={e=>setOrganization(e.target.value)}/></label>
  <p><strong>{tr('До печати проверить показания, назначение, аллергию, функцию почек/печени, взаимодействия, дозы и действующую форму рецепта в нужной юрисдикции.','Before printing: verify indications, allergies, renal/hepatic function, interactions, dosage and applicable local prescription rules.')}</strong></p>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
   <button type="button" onClick={()=>window.print()}>{tr('Печать черновика / PDF','Print draft / PDF')}</button>
   <button type="button" onClick={()=>void downloadDocx(tr('Черновик рецепта','Prescription draft'),printable,language).catch(()=>setNotice('DOCX error'))}>DOCX</button>
   <button type="button" disabled={!caseId} onClick={()=>void save()}>{tr('Сохранить черновик в случай','Save draft in case')}</button>
   <button type="button" onClick={()=>{if(navigator.share)void navigator.share({title:tr('Рецептурный черновик','Prescription draft'),text:printable}).catch(()=>{});else void navigator.clipboard.writeText(printable).then(()=>setNotice(tr('Скопировано для отправки','Copied for sharing'))).catch(()=>setNotice(tr('Не удалось скопировать','Copy failed')));}}>{tr('Поделиться черновиком','Share draft')}</button>
   <Link href={caseId?'/drug-checker?case='+encodeURIComponent(caseId):'/drug-checker'}>{tr('Проверить взаимодействия','Check interactions')}</Link>
  </div>
  {notice&&<p role="status">{notice}</p>}
  <article id="opus-rx-print" style={{display:'none'}}><h1>{tr('ЧЕРНОВИК РЕЦЕПТУРНЫХ НАЗНАЧЕНИЙ','PRESCRIPTION DRAFT')}</h1><p style={{whiteSpace:'pre-wrap'}}>{printable}</p><footer>{tr('Подлежит проверке и оформлению врачом. Не является действительным рецептом.','For physician verification and proper issue. Not a valid prescription.')}</footer></article>
  <style>{'@media print { @page { size:A4; margin:16mm; } body * { visibility:hidden !important; } #opus-rx-print, #opus-rx-print * {visibility:visible!important;} #opus-rx-print {display:block!important;position:absolute;left:0;top:0;width:100%;font:12pt Georgia,serif;color:#000!important;} #opus-rx-print p{line-height:1.5;} }'}</style>
 </main>;
}
