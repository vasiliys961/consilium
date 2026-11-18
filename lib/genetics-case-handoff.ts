import type {ClinicalCase} from './casebook.ts';
import {caseSignature} from './casebook.ts';
import type {CaseFile,CaseResult} from './conductor.ts';

const SHA=/^[a-f0-9]{64}$/i;

/** Only already-present, hash-bound VCF text is offered as an explicit reuse action. */
export function geneticFilesInCase(value:ClinicalCase):CaseFile[]{
 return value.files.filter(file=>/\.vcf(?:\.gz)?$/i.test(file.name)
  &&typeof file.text==='string'&&file.text.length>0
  &&typeof file.sha256==='string'&&SHA.test(file.sha256));
}

/** A filename or empty hash must never identify the genetic material of a prior AI reading. */
export function geneticFilesKey(files:readonly CaseFile[]):string{
 if(files.some(file=>typeof file.sha256!=='string'||!SHA.test(file.sha256)))
  throw Error('Для точной привязки генетического разбора нужен SHA-256 каждого использованного файла.');
 return files.map(file=>file.sha256!.toLowerCase()).sort().join(':');
}

export type GeneticsDiscussionTurn={
 id:string;
 at:string;
 caseId?:string;
 inputSignature?:string;
 question:string;
 clinicalContext:string;
 filesKey:string;
 result:CaseResult;
};

/** Pure, no-network import into the freshest saved case. Never assigns a result to changed sources. */
export function mergeGeneticsIntoCase(value:ClinicalCase,files:readonly CaseFile[],turn?:GeneticsDiscussionTurn,now=new Date().toISOString()):ClinicalCase{
 if(value.status==='closed'||value.deletedAt)throw Error('Случай закрыт. Верните его в работу перед добавлением генетических результатов.');
 const key=geneticFilesKey(files);
 if(turn){
  if(turn.caseId&&turn.caseId!==value.id)throw Error('Заключение подготовлено для другого клинического случая.');
  if(turn.filesKey!==key)throw Error('После генетического анализа исходные файлы изменились. Нельзя сохранять прежний вывод как относящийся к новым файлам: выполните повторный разбор.');
  if(turn.result.clinicalDraft!=='generated')throw Error('Незавершённый разбор нельзя сохранить как заключение.');
 }
 if(!files.length&&!turn)throw Error('Выберите материалы или завершите генетическую консультацию.');
 const existingKeys=new Set(value.files.map(file=>file.sha256?.toLowerCase()).filter(Boolean));
 const newFiles=files.filter(file=>!existingKeys.has(file.sha256!.toLowerCase()));
 const alreadySaved=turn&&value.analyses.some(analysis=>analysis.id===turn.id);
 if(newFiles.length===0&&(!turn||alreadySaved))return value;
 const updated:ClinicalCase={...value,updated:now,files:[...value.files,...newFiles]};
 if(turn&&!alreadySaved){
  updated.analyses=[{
   id:turn.id,at:turn.at,question:turn.question,kind:'analysis',
   clinicalContext:turn.clinicalContext,
   context:turn.clinicalContext,
   inputSignature:turn.inputSignature??'genetics-source-context-unverified',
   result:turn.result
  },...value.analyses];
 }
 return updated;
}

export type GeneticsWorkspaceDraft={files:CaseFile[];context:string;question:string;focus:string;discussion:GeneticsDiscussionTurn[]};
/** Returning to a case can restore only its own local working materials. */
export function geneticsWorkspaceForCase(value:ClinicalCase|undefined):GeneticsWorkspaceDraft{
 const empty:GeneticsWorkspaceDraft={files:[],context:'',question:'',focus:'',discussion:[]};
 const draft=value?.geneticsDraft;
 if(!draft)return empty;
 if(draft.discussion.some(turn=>turn.caseId&&turn.caseId!==value?.id))throw Error('genetics_draft_case_mismatch');
 return structuredClone(draft);
}
export function geneticsInputSignature(value:ClinicalCase,files:readonly CaseFile[]):string{
 const hashes=new Set(value.files.map(file=>file.sha256?.toLowerCase()).filter(Boolean));
 return caseSignature({...value,files:[...value.files,...files.filter(file=>!hashes.has(file.sha256?.toLowerCase()))]});
}
