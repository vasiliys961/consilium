import type {CaseFile} from './conductor.ts';
import {storeOriginal} from './material-routing.ts';

export type RadiologyReportSource={files:readonly File[];confirmed:readonly string[]};
/** Capture before awaiting: newly added images must not become the source of an older description. */
export async function prepareRadiologyCaseSave(input:{text:string;currentFiles:readonly File[];reportSource:RadiologyReportSource;caseFiles:readonly CaseFile[]}){
 const current=[...input.currentFiles],source=[...input.reportSource.files],confirmed=[...input.reportSource.confirmed];
 const text=input.text.trim(),known=[...input.caseFiles];
 const entries=await Promise.all([...new Set([...current,...source])].map(async file=>({file,material:{...await storeOriginal(file),processingModule:'radiology' as const}})));
 const fileKeys=source.length?entries.filter(entry=>source.includes(entry.file)).map(entry=>entry.material.sha256!):confirmed;
 const validKeys=fileKeys.every(key=>/^[a-f0-9]{64}$/i.test(key))?[...new Set(fileKeys)]:[];
 const sources=source.length?source.map(file=>file.name):known.filter(file=>file.sha256&&validKeys.includes(file.sha256)).map(file=>file.name);
 return {materials:entries.map(entry=>entry.material),report:text?{text,fileKeys:validKeys,sources}:undefined};
}
