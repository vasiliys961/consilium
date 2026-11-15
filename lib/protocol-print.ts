import type {ClinicalCase} from './casebook.ts';
import type {Locale} from './locale.ts';
import {clinicalReportText} from './clinical-report.ts';
import type {ProtocolDocument} from '../packages/protocol/document.ts';

/** Print and formatting read ONLY the latest completed analysis, not historic protocols or stale model replies. */
export function completedClinicalEvidence(value:ClinicalCase):string|null{
 const analysis=value.analyses[0];
 if(!analysis||analysis.result.clinicalDraft!=='generated')return null;
 const result=analysis.result;
 const physicianDecisions=value.events.filter(item=>item.kind==='decision').slice(-2);
 return [
  'PATIENT CASE / ПЕРВИЧНЫЕ ДАННЫЕ',
  value.title,
  value.context.trim(),
  value.currentMedications?.trim()?'Текущие лекарства (сообщено врачом): '+value.currentMedications:'',
  value.question?.trim()?'Вопрос врача: '+value.question.trim():'',
  'ЗАВЕРШЁННЫЙ КЛИНИЧЕСКИЙ РАЗБОР — ПРЕДВАРИТЕЛЬНО',
  result.draft.summary,
  result.draft.report?'СТРУКТУРИРОВАННОЕ ОБОСНОВАНИЕ, ОБСЛЕДОВАНИЯ И ТАКТИКА\n'+clinicalReportText(result.draft.report):'Лечебные рекомендации в структурированном клиническом отчёте отсутствуют. Не восполнять автоматически.',
  ...physicianDecisions.map(item=>'ЗАПИСЬ РЕШЕНИЯ ВРАЧА, БЕЗ ЭЛЕКТРОННОЙ ПОДПИСИ ('+item.at+'):\n'+item.text),
  value.decisionDraft?.text?'НЕУТВЕРЖДЁННЫЙ ПРОЕКТ РЕШЕНИЯ ВРАЧА:\n'+value.decisionDraft.text:'',
  result.unassessed.length?'НЕ ОЦЕНЕНО:\n'+result.unassessed.join('\n'):'',
 ].filter(Boolean).join('\n\n').slice(0,100000);
}

/** Deterministic printable view: no API calls, no rewriting of clinical content. */
export function originalClinicalDocument(value:ClinicalCase,displayLocale:Locale='ru'):ProtocolDocument|null{
 const analysis=value.analyses[0],source=completedClinicalEvidence(value);
 if(!analysis||!source)return null;
 const sections=[
  {id:'case',title:'Клинический случай',text:[value.title,value.context].filter(Boolean).join('\n\n')||'Нет дополнительных сведений'},
  {id:'original',title:'Исходное клиническое заключение (без изменений)',text:analysis.result.draft.summary},
  ...(analysis.result.draft.report?[{id:'structured',title:'Клиническое обоснование, обследования и предложенная тактика',text:clinicalReportText(analysis.result.draft.report)}]:[]),
  ...(analysis.result.unassessed.length?[{id:'unassessed',title:'Что не было оценено',text:analysis.result.unassessed.join('\n')}]:[])
 ];
 return {id:crypto.randomUUID(),created:new Date().toISOString(),locale:displayLocale,kind:'encounter',generationMode:'from-analysis',presentation:'original-analysis',sourceAnalysisId:analysis.id,sourceSnapshot:source,sections,edited:false};
}

/** An independent Sol document can be reused as source of one cheap Flash formatting call. */
export function independentProtocolSource(value:ClinicalCase,kind:ProtocolDocument['kind']):ProtocolDocument|undefined{
 return value.protocols?.find(item=>item.kind===kind&&item.generationMode==='standalone'&&item.sections.length>0&&!item.edition);
}
