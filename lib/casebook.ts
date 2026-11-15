import {readVaultCases,writeVaultCase} from './local-vault.ts';
import {clinicalReportText} from "./clinical-report.ts";
import{materialRoute,materialKey}from'./material-routing.ts';
import {CURRENT_MEDICATIONS_HEADING} from './drug-interaction-rules.ts';
import {studyReportsText} from './study-report.ts';
import type { CaseFile, CaseResult } from './conductor';
import { ecgEvidenceText, radiologyEvidenceText, type RadiologyModuleReport } from './module-evidence.ts';
export type Event = { id: string; at: string; kind: 'note' | 'decision' | 'question'; text: string; editedAt?:string; revisions?:Array<{at:string;text:string}> };
type VisualEvidence = { key: string; readings: NonNullable<CaseResult['visualReadings']>; items?: Array<{fileKey:string; reading:NonNullable<CaseResult['visualReadings']>[number]}> };
export type AnalysisKind = 'question' | 'analysis' | 'management' | 'council' | 'summary';
export type Analysis = { requestOptionsKey?: string; question?:string; kind?:AnalysisKind; clinicalContext?:string; newFacts?:string; reusedSources?:string[]; inputSignature?: string; materialsKey?: string; visualEvidence?: VisualEvidence; id: string; at: string; context: string; result: CaseResult };
export type ClinicalCase = {
  stationDraft?:{note:string;imageProfile:import('../packages/medical-images/profiles').ImageProfile};
  workspaceDraft?:{question:string;note:string;decision:string;tab:string};
  moduleReports?:RadiologyModuleReport[];
  deletedAt?:string;
  closedAt?:string;
  decisionDraft?:{analysisId:string;text:string;at:string};
  drugLabels?: import('./drug-labels.ts').DrugLabelSelection[];
  currentMedications?: string;
  protocolScratch?:Partial<Record<'ru'|'en',{source:string;text:string;state?:Record<string,string>;at:string}>>;
  privatePatient?:{name:string;birthDate:string;identifiers:string;dates:string};
  imageProfile?:import("../packages/medical-images/profiles").ImageProfile;
  id: string; number?: number; title: string; created: string; updated: string;
  protocols?:import("../packages/protocol/document").ProtocolDocument[];
  context: string; question: string; files: CaseFile[]; library?: CaseFile[];
  events: Event[]; analyses: Analysis[]; status: 'active' | 'closed';
};
export function newCase(number?: number): ClinicalCase {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), number, title: '', created: now, updated: now, context: '', question: '', files: [], events: [], analyses: [], status: 'active' };
}
export async function openNewCase(saved: ClinicalCase[]) {
  const key = 'concilium-case-number';
  function reserve() {
    const largest = saved.reduce((highest, item) => Math.max(highest, item.number ?? (/^\d{1,8}$/.test(item.title.trim()) ? Number(item.title) : 0)), 0);
    const previous = Number(localStorage.getItem(key));
    const number = Math.max(largest, Number.isSafeInteger(previous) && previous >= 0 ? previous : 0) + 1;
    localStorage.setItem(key, String(number));
    return newCase(number);
  }
  const value=await (navigator.locks ? navigator.locks.request(key, reserve) : reserve());
  await persistCase(value);return value;
}
export function caseTitle(value: ClinicalCase, fallback: string) {
  return value.title.trim() || (value.number ? String(value.number) : fallback);
}
function eventLabel(kind: Event['kind']) {
  return kind === 'decision' ? 'Решение врача' : kind === 'question' ? 'Предыдущий вопрос врача' : 'Динамика';
}

/** Provenance must follow the actual attached bytes, not the filename or a prior analysis. */
const SHA256 = /^[0-9a-f]{64}$/i;
function sourceHash(hash: string | null | undefined): string | null {
  return hash && SHA256.test(hash) ? hash.toLowerCase() : null;
}
function hasSourceHash(value: ClinicalCase, hash: string | null | undefined): boolean {
  const expected = sourceHash(hash);
  return Boolean(expected && value.files.some(file => sourceHash(file.sha256) === expected));
}
function radiologyReportIsCurrent(value: ClinicalCase, report: RadiologyModuleReport): boolean {
  // No filename-only or partially matched multi-file reports may suppress a reread.
  return report.fileKeys.length > 0 && report.fileKeys.every(key => Boolean(sourceHash(key) && hasSourceHash(value, key)));
}
function radiologyContext(value: ClinicalCase): string[] {
  return (value.moduleReports ?? []).map(report => {
    // Legacy unbound reports remain visible with their existing explicit warning.
    if (!report.fileKeys.length) return radiologyEvidenceText(report);
    if (radiologyReportIsCurrent(value, report)) return radiologyEvidenceText(report);
    const sources = report.sources.length ? report.sources.join(', ') : 'неизвестные источники';
    return `Opus Radiology · ${sources} · ${report.at}\nИсторический отчёт: исходные файлы больше не совпадают с прикреплёнными к текущему случаю. Прежнее описание сохранено в истории и экспорте, но не является заключением по новым файлам. Требуется повторный разбор изменённого исследования.`;
  });
}
export function caseContext(value: ClinicalCase): string {
  const recent = value.events.slice().reverse().find(event => event.kind === 'question');
  const question = recent?.text ?? value.question;
  const medications = value.currentMedications?.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('\n');
  return [question && `Вопрос врача: ${question}`, medications && `${CURRENT_MEDICATIONS_HEADING}\n${medications}`, value.context, recent && value.question ? `Первоначальный вопрос: ${value.question}` : '',
    ...value.events.filter(event => event.id !== recent?.id).map(event => `${event.at} — ${eventLabel(event.kind)}: ${event.text}`),...radiologyContext(value)].filter(Boolean).join('\n\n');
}

export function analysisQuestion(analysis: Analysis): string {
  return analysis.question || analysis.context.match(/^Вопрос врача: ([^\n]+)/)?.[1] || ({management:'Лечебная тактика',council:'Консилиум',summary:'Резюме разбора',question:'Вопрос по случаю',analysis:'Разбор материалов'})[analysis.kind ?? 'analysis'];
}
const imageKey = (file:CaseFile, profile:ClinicalCase['imageProfile']) => JSON.stringify(['medical-image-routing-v1',profile??'auto',file.name,file.sha256,file.imageProfile,file.masks]);
export function caseAnalysisInput(value: ClinicalCase, rereadImages = false) {
  const moduleHandled=(file:CaseFile)=>(value.moduleReports??[]).some(report=>radiologyReportIsCurrent(value, report) && Boolean(sourceHash(file.sha256) && report.fileKeys.some(key=>sourceHash(key)===sourceHash(file.sha256))));
  const images = value.files.filter(file => file.image && !file.text && !file.frames?.length&&!moduleHandled(file)&&materialRoute(file)!=='radiology');
  const key = JSON.stringify(['medical-image-routing-v1',value.imageProfile ?? 'auto', images.map(file => [file.name, file.sha256, file.imageProfile, file.masks])]);
  const materialsKey = JSON.stringify([value.imageProfile ?? 'auto', ...[value.files,value.library??[]].map(files=>files.map(file=>[file.name,file.sha256,file.imageProfile,file.masks,file.intakeNote]))]);
  const cached = new Map<CaseFile,NonNullable<CaseResult['visualReadings']>[number]>();
  if(!rereadImages)for(const file of images){
    if(!file.sha256)continue;
    for(const analysis of value.analyses){
      const evidence=analysis.visualEvidence;
      const item=evidence?.items?.find(item=>item.fileKey===imageKey(file,value.imageProfile));
      const legacy=evidence?.key===key&&evidence.readings.length===images.length?evidence.readings[images.indexOf(file)]:undefined;
      const reading=item?.reading??legacy;
      if(reading?.status==='read'){cached.set(file,reading);break;}
    }
  }
  const pending=images.filter(file=>!cached.has(file));
  const visualContext=[...cached.values()].map(reading=>`${reading.source}: ${reading.reading}\n${reading.limitations?.join('; ')??''}`).join('\n\n');
  // Preserve the whole question/answer sequence across changed materials, in chronological order.
  const discussion=value.analyses.slice().reverse().map((analysis,index)=>[
    `Discussion ${index+1} — ${analysisQuestion(analysis)}`,
    analysis.result.clinicalDraft==='generated'
      ? analysis.result.draft.summary
      : `Prior step INCOMPLETE — no validated clinical synthesis was received. Available provisional module observations and failure context follow; do not treat these as a completed assessment:\n${analysis.result.draft.summary.slice(0,2500) || '(no partial text preserved)'}`,
    analysis.result.draft.report?clinicalReportText(analysis.result.draft.report):'',
    analysis.result.ecgEvidence
      ? hasSourceHash(value, analysis.result.ecgEvidence.sha256)
        ? 'ECGFounder — ранее сохранённое техническое измерение по неизменённому файлу, в текущем проходе не повторено:\n'+ecgEvidenceText(analysis.result.ecgEvidence)
        : `ECGFounder · ${analysis.result.ecgEvidence.source} — исторический результат, не подтверждённый текущим SHA-256. Прежние классы и измерения НЕ относятся к новому файлу; при необходимости выполните повторный анализ. Полные результаты остались в истории случая.`
      : '',
    ...analysis.result.voices.filter(voice=>voice.status==='done').map(voice=>`${voice.id}: ${voice.text}`),
    ...(analysis.result.voices.some(voice=>voice.status!=='done')
      ? [`Earlier consilium INCOMPLETE: ${analysis.result.voices.filter(voice=>voice.status!=='done').map(voice=>voice.id).join(', ')} were not assessed. Their silence is not agreement and must not be reconstructed as a clinical opinion.`]
      : []),
  ].filter(Boolean).join('\n')).join('\n\n');
  const sent=value.files.filter(file=>!cached.has(file)&&!moduleHandled(file)&&materialRoute(file)!=='radiology').map(file=>({...file,...(file.sha256&&!file.clientId?{clientId:`${file.sha256.slice(0,8)}-${file.sha256.slice(8,12)}-${file.sha256.slice(12,16)}-${file.sha256.slice(16,20)}-${file.sha256.slice(20,32)}`}:{})}));
  return {
    text:[caseContext(value),visualContext&&`CACHED PRIOR IMAGE INTERPRETATIONS — these unchanged images were read in an earlier step and deliberately are not uploaded again. The current processing ledger covers only NEW uploads; absence from it does not mean these earlier readings were lost or failed. They remain provisional model interpretations, not verified measurements. Reassess their clinical meaning against new data, mention actual contradictions once, and do not repeat their full descriptions.\n${visualContext}\n${studyReportsText(value.analyses.flatMap(analysis=>analysis.result.draft.studyReports??[]).filter((report,index,all)=>[...cached.values()].some(reading=>reading.source===report.source)&&all.findIndex(other=>JSON.stringify(other)===JSON.stringify(report))===index))}`,
      ...images.filter(file=>file.intakeNote).map(file=>`Current physician-supplied image measurements:\n${file.intakeNote}`),
      discussion&&`PRIOR DISCUSSION — unsigned model proposals, not new patient facts. Continue from these questions, answers and disagreements; do not repeat unchanged sections.\n${discussion}`].filter(Boolean).join('\n\n'),
    pendingModules:value.files.filter(file=>materialRoute(file)==='radiology'&&!moduleHandled(file)),files:sent,materialsKey,reusedSources:[...cached.values()].map(reading=>reading.source),
    reusedStudyReports:value.analyses.flatMap(analysis=>analysis.result.draft.studyReports??[]).filter((report,index,all)=>[...cached.values()].some(reading=>reading.source===report.source)&&all.findIndex(other=>JSON.stringify(other)===JSON.stringify(report))===index),
    visualEvidence:(readings:CaseResult['visualReadings']):VisualEvidence|undefined=>{
      const items=[...cached].map(([file,reading])=>({fileKey:imageKey(file,value.imageProfile),reading}));
      if(readings?.length===pending.length)pending.forEach((file,index)=>{if(file.sha256&&readings[index].status==='read')items.push({fileKey:imageKey(file,value.imageProfile),reading:readings[index]});});
      return items.length?{key,items,readings:items.map(item=>item.reading)}:undefined;
    },
  };
}
export function decisionDraftFrom(analysis:Analysis):string{
 const report=analysis.result.draft.report;
 return ['Проект решения · требует проверки и редактирования врачом',analysis.result.draft.summary,
   report?.tactics?.nextStep&&`Следующее действие: ${report.tactics.nextStep}`,
   ...(report?.management??[]).map(option=>[option.option,option.conditions.length?`Условия: ${option.conditions.join('; ')}`:'',option.safetyChecks.length?`Проверить: ${option.safetyChecks.join('; ')}`:''].filter(Boolean).join('\n')),
   report?.tactics?.reassess&&`Контроль: ${report.tactics.reassess}`,report?.tactics?.escalate&&`Изменить тактику: ${report.tactics.escalate}`,
   report?.questions.length?'Уточнить перед решением:\n'+report.questions.map(text=>'• '+text).join('\n'):'',
   report?.limitations.length?'Ограничения:\n'+report.limitations.map(text=>'• '+text).join('\n'):'',
 ].filter(Boolean).join('\n\n');
}
export async function readCases(includeDeleted=false): Promise<ClinicalCase[]> {return (await readVaultCases()).filter(value=>includeDeleted||!value.deletedAt).sort((a,b)=>b.updated.localeCompare(a.updated));}
const writes=new Map<string,Promise<void>>();
export async function persistCase(value:ClinicalCase,remove=false):Promise<void>{const previous=writes.get(value.id)??Promise.resolve();const next=previous.catch(()=>{}).then(()=>writeVaultCase(value,remove));writes.set(value.id,next);try{await next;}finally{if(writes.get(value.id)===next)writes.delete(value.id);}}
export function exportCase(value: ClinicalCase): string {
  const editor=value.workspaceDraft;
  const unfinished=[
    editor?.question?.trim()&&`Вопрос врача, не отправлен в завершённый разбор: ${editor.question.trim()}`,
    editor?.note?.trim()&&`Наблюдения в редакторе, ещё не утверждены: ${editor.note.trim()}`,
    editor?.decision?.trim()&&`Проект решения врача, НЕ подписан: ${editor.decision.trim()}`,
  ].filter(Boolean);
  return [ `# ${caseTitle(value,'Клинический случай')}`, `ID: ${value.id}`, `Статус: ${value.status}`, value.context,
    `Вопрос: ${value.question}`,
    ...(unfinished.length?['\n## Незавершённый редактор врача · не является заключением',...unfinished]:[]),
    '\n## Профильные исследования',...(value.moduleReports??[]).map(radiologyEvidenceText),'\n## Материалы', ...value.files.map(f => `${f.name} (${f.bytes ?? 0} байт)`),
    ...(value.protocols??[]).map(p=>'\n## Протокол · черновик\n'+p.sections.map(s=>s.title+'\n'+s.text).join('\n\n')),
    '\n## Хронология', ...value.events.map(e => `${e.at} • ${eventLabel(e.kind)}\n${e.text}`),
    ...value.analyses.map(a => `\n## ${analysisQuestion(a)} · ${a.at} — черновик\n${a.result.draft.summary}\n${a.result.ecgEvidence?ecgEvidenceText(a.result.ecgEvidence):''}\n${studyReportsText(a.result.draft.studyReports??[])}\n${a.result.draft.report?clinicalReportText(a.result.draft.report):""}\n${a.result.draft.statements.map(s => `• ${s.text} [${s.source || 'Без подтверждённого источника'}]`).join('\n')}\nИсточники:\n${a.result.citations.map(c => `${c.title} ${c.url || ''}`).join('\n')}\nНе оценено: ${a.result.unassessed.join(', ') || 'см. журнал обработки'}`),
  ].join('\n\n');
}

export function caseSignature(value:ClinicalCase):string{return JSON.stringify({context:value.context,question:value.question,imageProfile:value.imageProfile,files:value.files.map(f=>[f.name,f.sha256,f.imageProfile,f.masks,f.intakeNote]),library:value.library?.map(f=>[f.name,f.sha256]),currentMedications:value.currentMedications,drugLabels:value.drugLabels?.length?value.drugLabels.map(item=>item.setId):undefined,moduleReports:value.moduleReports?.map(r=>[r.id,r.fileKeys,r.text]),followUp:value.events});}

export function protocolSource(value:ClinicalCase):string{const latest=value.analyses[0];return [caseContext(value),latest?(latest.result.clinicalDraft==='unavailable'
  ? 'Клинический ответ не завершён; ниже сохранены только предварительные данные и причина сбоя. Нельзя считать это готовым заключением:\n'
  : latest.inputSignature&&latest.inputSignature!==caseSignature(value)
    ? 'Предыдущий предварительный разбор; после него данные случая изменились. Проверить актуальность врачу:\n'
    : 'Предварительный разбор, проверить врачу:\n')+latest.result.draft.summary:'',latest?studyReportsText(latest.result.draft.studyReports??[]):'',latest?.result.draft.report?clinicalReportText(latest.result.draft.report):'',latest?.result.visualReadings?.map(r=>r.reading).join('\n'),latest?.result.unassessed.length?'Не оценено: '+latest.result.unassessed.join(', '):''].filter(Boolean).join('\n\n');}

export function reviseCaseEvent(value:ClinicalCase,id:string,text:string,now=new Date().toISOString()):ClinicalCase{
 if(!text.trim())throw Error('Запись не может быть пустой.');
 if(!value.events.some(event=>event.id===id))throw Error('Запись не найдена.');
 return {...value,updated:now,events:value.events.map(event=>event.id===id?{...event,text:text.trim(),editedAt:now,revisions:[...(event.revisions??[]),{at:now,text:event.text}]}:event)};
}
export function finishClinicalCase(value:ClinicalCase,decision:string,editingId?:string,now=new Date().toISOString()):ClinicalCase{
 if(editingId&&!decision.trim())throw Error('Редактируемое решение не может быть пустым.');
 let next=value;
 if(editingId&&!value.events.some(event=>event.id===editingId&&event.kind==='decision'))throw Error('Для завершения требуется запись решения врача.');
 if(editingId&&decision.trim())next=reviseCaseEvent(value,editingId,decision,now);
 else if(decision.trim())next={...value,events:[...value.events,{id:crypto.randomUUID(),at:now,kind:'decision',text:decision.trim()}]};
 if(!next.events.some(event=>event.kind==='decision'))throw Error('Сначала запишите решение врача или перенесите проект в редактор и проверьте его.');
 return {...next,status:'closed',closedAt:now,updated:now};
}
export function decisionDocument(value:ClinicalCase):string{
 const decision=value.events.slice().reverse().find(event=>event.kind==='decision');
 return [`# Решение врача · ${caseTitle(value,'Клинический случай')}`,`Код случая: ${value.id}`,`Статус: ${value.status==='closed'?'Завершён':'В работе'}`,decision?`Записано: ${decision.at}${decision.editedAt?' · Изменено: '+decision.editedAt:''}\n\n${decision.text}`:'Решение врача ещё не записано.'].join('\n\n');
}
