import type {ClinicalCase} from './casebook.ts';
export type ProposedPrescription={drug:string;dose:string;form:string;route:string;frequency:string;duration:string;quantity:string;note:string};
export type ProposedRegimen={option:string;conditions:string[];safetyChecks:string[];monitoring:string[];medications:ProposedPrescription[]};

/** A saved clinical assessment supplies *options*. Alternatives stay in separate groups. Never infer a prescription from absent fields. */
export function proposedPrescriptionRegimens(value:ClinicalCase|undefined):ProposedRegimen[]{
 const latest=value?.analyses[0];
 if(!latest||latest.result.clinicalDraft!=='generated'||!latest.result.draft.report)return [];
 return latest.result.draft.report.management.flatMap(item=>{
  const names=(item.medications??[]).filter(name=>name.trim()).slice(0,12);
  if(!names.length)return [];
  return [{
   option:item.option,conditions:item.conditions,safetyChecks:item.safetyChecks,monitoring:item.monitoring,
   medications:names.map(drug=>({drug,dose:'',form:'',route:'',frequency:'',duration:'',quantity:'',note:''})),
  }];
 });
}

export function prescriptionPrintText(regimen:ProposedPrescription[],context:{patient:string;physician:string;organization:string}):string{
 const rows=regimen.filter(item=>item.drug.trim());
 return [
  'ЧЕРНОВИК РЕЦЕПТУРНЫХ НАЗНАЧЕНИЙ — ПРОВЕРИТЬ ВРАЧУ',
  'Дата подготовки: '+new Date().toISOString().slice(0,10),
  'Медицинская организация: '+(context.organization||'________________________'),
  'Пациент: '+(context.patient||'________________________'),
  'Врач: '+(context.physician||'________________________'),
  'ВНИМАНИЕ: предложения ИИ не являются рецептом. До печати и оформления врач обязан проверить показания, дозировку, форму, противопоказания, взаимодействия и действующие требования страны.',
  ...rows.map((item,i)=>String(i+1)+'. '+item.drug+'\nФорма: '+(item.form||'не указана')+'; доза: '+(item.dose||'не указана')+'; путь: '+(item.route||'не указан')+'\nКратность: '+(item.frequency||'не указана')+'; длительность: '+(item.duration||'не указана')+'; количество: '+(item.quantity||'не указано')+'\nДополнительные указания: '+item.note),
 ].join('\n\n');
}
