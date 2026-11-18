import type {ClinicalCase} from './casebook.ts';
import type {CaseFile} from './conductor.ts';
import type {GuidelineMode} from './parent-guideline-search.ts';
import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from './workspace-i18n.ts';

export type GuidelineResult={id:string;at:string;caseId?:string;topic:string;specialty:string;language:WorkspaceLanguage;
 text:string;originalText:string;model:string;estimatedUsd:number;inputTokens:number;outputTokens:number;searchMode:GuidelineMode};
export type GuidelineDraft={query:string;specialty:string;mode:GuidelineMode;answerLanguage:WorkspaceLanguage;matchInterface:boolean;result:GuidelineResult|null};
export type GuidelineCaseReport={id:string;savedAt:string;referenceName:string;referenceSha256:string;result:GuidelineResult};
const languages=new Set<string>(WORKSPACE_LANGUAGES.map(item=>item.code));
const modes=new Set<string>(['standard','detailed','online']);
const textLimit=200000;
function record(value:unknown):value is Record<string,unknown>{return Boolean(value&&typeof value==='object'&&!Array.isArray(value));}
function short(value:unknown,max:number):value is string{return typeof value==='string'&&value.length<=max;}
function date(value:unknown):value is string{return short(value,50)&&Number.isFinite(Date.parse(value));}
export function validGuidelineResult(value:unknown,caseId?:string,allowEmptyText=false):value is GuidelineResult{
 if(!record(value))return false;
 return short(value.id,128)&&value.id.length>0&&date(value.at)&&value.caseId===caseId
  &&short(value.topic,550)&&value.topic.trim().length>=3&&short(value.specialty,100)
  &&typeof value.language==='string'&&languages.has(value.language)
  &&short(value.text,textLimit)&&(allowEmptyText||Boolean(value.text.trim()))&&short(value.originalText,textLimit)&&Boolean(value.originalText.trim())
  &&short(value.model,200)&&Boolean(value.model.trim())&&typeof value.searchMode==='string'&&modes.has(value.searchMode)
  &&typeof value.estimatedUsd==='number'&&Number.isFinite(value.estimatedUsd)&&value.estimatedUsd>=0
  &&[value.inputTokens,value.outputTokens].every(tokens=>typeof tokens==='number'&&Number.isSafeInteger(tokens)&&tokens>=0&&tokens<=10000000);
}
export function validGuidelineDraft(value:unknown,caseId?:string):value is GuidelineDraft{
 return record(value)&&short(value.query,550)&&short(value.specialty,100)&&typeof value.mode==='string'&&modes.has(value.mode)
  &&typeof value.answerLanguage==='string'&&languages.has(value.answerLanguage)&&typeof value.matchInterface==='boolean'
  &&(value.result===null||validGuidelineResult(value.result,caseId,true));
}
export function validGuidelineReport(value:unknown,caseId:string):value is GuidelineCaseReport{
 return record(value)&&short(value.id,128)&&date(value.savedAt)&&short(value.referenceName,200)
  &&typeof value.referenceSha256==='string'&&/^[a-f0-9]{64}$/.test(value.referenceSha256)
  &&value.id===value.referenceSha256&&value.referenceName===`guideline-summary-${value.referenceSha256.slice(0,16)}.md`&&validGuidelineResult(value.result,caseId);
}
export function emptyGuidelineDraft(language:WorkspaceLanguage):GuidelineDraft{
 return {query:'',specialty:'',mode:'standard',answerLanguage:language,matchInterface:true,result:null};
}
export function guidelineWorkspaceForCase(value:ClinicalCase|undefined,language:WorkspaceLanguage):GuidelineDraft{
 const draft=value?.guidelineDraft;
 if(!draft)return emptyGuidelineDraft(language);
 if(!validGuidelineDraft(draft,value?.id))throw Error('guideline_draft_case_mismatch');
 return structuredClone(draft);
}
/** Bind the existing API response to the exact submitted topic, language and local owner. */
export function guidelineResultFromResponse(raw:unknown,input:{topic:string;specialty:string;language:WorkspaceLanguage;caseId?:string}):GuidelineResult{
 const data=record(raw)?raw:{};
 const value={id:crypto.randomUUID(),at:new Date().toISOString(),...input,text:data.text,originalText:data.text,
  model:data.model,estimatedUsd:data.estimatedUsd,inputTokens:data.inputTokens,outputTokens:data.outputTokens,searchMode:data.searchMode};
 if(!validGuidelineResult(value,input.caseId))throw Error('guideline_invalid_response');
 return value;
}
/** Reference material, never a patient observation, treatment order, or verified primary guideline. */
export async function guidelineCaseReference(result:GuidelineResult,caseId:string,now=new Date().toISOString()):Promise<{report:GuidelineCaseReport;file:CaseFile}>{
 if(!validGuidelineResult(result,caseId))throw Error('guideline_result_case_mismatch');
 const text=['AI-PREPARED GUIDELINE SUMMARY — reference material, not patient facts or a physician order.',
  'Verify the primary documents and their applicability. Links in the response have not been independently validated.',
  `Topic: ${result.topic}`,`Prepared: ${result.at}`,`Request: ${result.id}`,`Model: ${result.model}`,
  `Search mode: ${result.searchMode}; language: ${result.language}`,
  result.text!==result.originalText?'Edited by the physician; original model text retained in the local case.':'Unedited model draft.',
  '',result.text].join('\n');
 const bytes=new TextEncoder().encode(text);
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
 const name=`guideline-summary-${sha256.slice(0,16)}.md`;
 return {report:{id:sha256,savedAt:now,referenceName:name,referenceSha256:sha256,result:structuredClone(result)},
  file:{name,sha256,text,bytes:bytes.byteLength}};
}
export function draftFromGuidelineReport(report:GuidelineCaseReport,caseId:string):GuidelineDraft{
 if(!validGuidelineReport(report,caseId))throw Error('guideline_report_case_mismatch');
 return {query:report.result.topic,specialty:report.result.specialty,mode:report.result.searchMode,
  answerLanguage:report.result.language,matchInterface:false,result:structuredClone(report.result)};
}
/** Copy local ownership only; retain original request/text/cost provenance unchanged. */
export function rebindGuidelineCaseCopy(value:ClinicalCase,newId:string):Pick<ClinicalCase,'guidelineDraft'|'guidelineReports'>{
 return {
  ...(value.guidelineDraft?{guidelineDraft:{...value.guidelineDraft,result:value.guidelineDraft.result?{...value.guidelineDraft.result,caseId:newId}:null}}:{}),
  ...(value.guidelineReports?{guidelineReports:value.guidelineReports.map(item=>({...item,result:{...item.result,caseId:newId}}))}:{}),
 };
}
