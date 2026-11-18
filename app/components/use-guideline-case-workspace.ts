'use client';
import {useEffect,useRef,useState,type MouseEvent} from 'react';
import {useRouter} from 'next/navigation';
import {readCases,persistGuidelineDraft,persistGuidelineResult,createCaseFromGuideline,type ClinicalCase} from '@/lib/casebook';
import {registerVaultFlush} from '@/lib/local-vault';
import {emptyGuidelineDraft,guidelineWorkspaceForCase,draftFromGuidelineReport,type GuidelineDraft,type GuidelineResult} from '@/lib/guideline-case-return';
import {GUIDELINE_HANDOFF_KEY,parseGuidelineTopicHandoff,type GuidelineTopicHandoff} from '@/lib/clinical-source-review';
import {guidelineUi} from '@/lib/guideline-ui';
import type {WorkspaceLanguage} from '@/lib/workspace-i18n';

/** Local case working state around the existing search. No model or new service here. */
export function useGuidelineCaseWorkspace(language:WorkspaceLanguage){
 const router=useRouter();
 const [draft,setDraft]=useState(()=>emptyGuidelineDraft(language));
 const [cases,setCases]=useState<ClinicalCase[]>([]),[selected,setSelected]=useState(''),[ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[switching,setSwitching]=useState(false),[notice,setNotice]=useState('');
 const [handoff,setHandoff]=useState<GuidelineTopicHandoff|null>(null);
 const standalone=useRef(emptyGuidelineDraft(language)),persisted=useRef('');
 const pending=useRef({caseId:selected,draft});pending.current={caseId:selected,draft};
 const current=cases.find(item=>item.id===selected),locked=busy||saving||switching;
 const signature=()=>JSON.stringify(pending.current);
 const standaloneUnsaved=()=>Boolean(standalone.current.query||standalone.current.result||!pending.current.caseId&&(pending.current.draft.query||pending.current.draft.result));
 const updateCase=(value:ClinicalCase)=>setCases(old=>old.map(item=>item.id===value.id?value:item));
 const flushRef=useRef<()=>Promise<void>>(async()=>{});
 flushRef.current=async()=>{
  const snapshot=pending.current,key=JSON.stringify(snapshot);if(key===persisted.current)return;
  if(!snapshot.caseId){standalone.current=structuredClone(snapshot.draft);persisted.current=key;return;}
  if(cases.find(item=>item.id===snapshot.caseId)?.status==='closed'){persisted.current=key;return;}
  const value=await persistGuidelineDraft(snapshot.caseId,snapshot.draft);
  persisted.current=key;updateCase(value);
 };
 async function flush(){await flushRef.current();if(signature()!==persisted.current)throw Error('guideline_draft_changed');}
 function apply(caseId:string,value:GuidelineDraft){
  setSelected(caseId);setDraft(value);persisted.current=JSON.stringify({caseId,draft:value});
 }
 useEffect(()=>registerVaultFlush(()=>flushRef.current()),[]);
 useEffect(()=>{
  let active=true;
  void readCases().then(values=>{
   if(!active)return;setCases(values);
   const url=new URL(location.href);let raw:string|null=null;
   try{raw=sessionStorage.getItem(GUIDELINE_HANDOFF_KEY);if(raw)sessionStorage.removeItem(GUIDELINE_HANDOFF_KEY);}catch{/* Case search still works without sessionStorage. */}
   const imported=parseGuidelineTopicHandoff(raw);
   const id=url.searchParams.get('case')??'',value=values.find(item=>item.id===id);
   let restored=guidelineWorkspaceForCase(value,language);
   const reportId=url.searchParams.get('report');
   if(reportId){const report=value?.guidelineReports?.find(item=>item.id===reportId);
    if(report&&value)restored=draftFromGuidelineReport(report,value.id);
    else{restored=emptyGuidelineDraft(language);setNotice(guidelineUi(language,'reportMissing'));}}
   apply(value?.id??'',restored);
   if(id&&!value)setNotice(guidelineUi(language,'caseMissing'));
   if(!reportId&&imported&&(!imported.caseId||imported.caseId===value?.id)){
    setHandoff(imported);setDraft({...restored,query:imported.topic});persisted.current='';
   }
   setReady(true);
  }).catch(()=>setNotice(guidelineUi(language,'draftError')));
  const guard=(event:BeforeUnloadEvent)=>{
   if(signature()!==persisted.current||standaloneUnsaved()){
    event.preventDefault();event.returnValue='';
   }
  };
  window.addEventListener('beforeunload',guard);
  return()=>{active=false;window.removeEventListener('beforeunload',guard);void flushRef.current().catch(()=>{});};
 },[]);
 useEffect(()=>{
  if(!ready||locked||current?.status==='closed')return;
  const timer=setTimeout(()=>void flushRef.current().catch(()=>setNotice(guidelineUi(language,'draftError'))),300);
  return()=>clearTimeout(timer);
 },[draft,selected,ready,locked]);
 async function changeCase(next:string){
  if(locked)return;setSwitching(true);
  try{
   await flush();const values=await readCases(),value=values.find(item=>item.id===next);
   if(next&&!value)throw Error('case_missing');
   setCases(values);apply(next,value?guidelineWorkspaceForCase(value,language):structuredClone(standalone.current));setHandoff(null);setNotice('');
   const url=new URL(location.href);url.searchParams.delete('report');
   if(next)url.searchParams.set('case',next);else url.searchParams.delete('case');
   history.replaceState(history.state,'',url.pathname+url.search);
  }catch{setNotice(guidelineUi(language,'draftError'));}
  finally{setSwitching(false);}
 }
 async function acceptResult(result:GuidelineResult){
  const owner=pending.current.caseId;
  if(result.caseId!==(owner||undefined))throw Error('guideline_result_case_mismatch');
  const next={...pending.current.draft,result};setDraft(next);
  if(!owner){standalone.current=structuredClone(next);persisted.current=JSON.stringify({caseId:'',draft:next});return;}
  try{const value=await persistGuidelineDraft(owner,next);updateCase(value);persisted.current=JSON.stringify({caseId:owner,draft:next});}
  catch{setNotice(guidelineUi(language,'draftError'));}
 }
 async function saveResult(){
  const snapshot=pending.current;
  if(locked||!snapshot.caseId||!snapshot.draft.result)return;
  setSaving(true);setNotice('');
  try{await flush();updateCase(await persistGuidelineResult(snapshot.caseId,snapshot.draft.result));setNotice(guidelineUi(language,'saved'));}
  catch{setNotice(guidelineUi(language,'draftError'));}
  finally{setSaving(false);}
 }
 async function createFromResult(){
  if(locked||selected||!pending.current.draft.result)return;
  setSaving(true);setNotice('');
  try{
   const value=await createCaseFromGuideline(pending.current.draft);
   setCases(old=>[value,...old]);apply(value.id,value.guidelineDraft!);standalone.current=emptyGuidelineDraft(language);setHandoff(null);
   const url=new URL(location.href);url.searchParams.set('case',value.id);url.searchParams.delete('report');history.replaceState(history.state,'',url.pathname+url.search);
   setNotice(guidelineUi(language,'saved'));
  }catch{setNotice(guidelineUi(language,'draftError'));}
  finally{setSaving(false);}
 }
 function navigate(event:MouseEvent<HTMLElement>){
  const link=(event.target as Element).closest('a');
  if(!link||event.defaultPrevented||link.target==='_blank'||new URL(link.href,location.href).origin!==location.origin)return;
  event.preventDefault();event.stopPropagation();if(locked)return;
  if(standaloneUnsaved()&&!window.confirm(guidelineUi(language,'leaveStandalone')))return;
  setSwitching(true);
  void flush().then(()=>{const url=new URL(link.href);router.push(url.pathname+url.search+url.hash);})
   .catch(()=>setNotice(guidelineUi(language,'draftError'))).finally(()=>setSwitching(false));
 }
 return {draft,setDraft,cases,selected,current,ready,locked,busy,setBusy,saving,notice,setNotice,handoff,setHandoff,changeCase,flush,acceptResult,saveResult,createFromResult,navigate};
}
