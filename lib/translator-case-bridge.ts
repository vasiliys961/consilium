/** C11: browser-only translator -> clinical case handoff. The patient context is NEVER
 * automatically transmitted to the speech service. Only an explicit physician action sends
 * completed source/translated text to the selected local case in its own browser origin.
 */
export interface TranslationTransfer{
 id:string;from:string;to:string;
 turns:Array<{source:string;translation:string}>;
 fidelityWarnings:number;
}
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const LOCALE=/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/;
export function translationTransferMessage(value:unknown,session:string):TranslationTransfer|null{
 if(!UUID.test(session)||!value||typeof value!=='object'||Array.isArray(value))return null;
 const item=value as Record<string,unknown>;
 if(item.type!=='concilium.translator.transcript'||item.session!==session||typeof item.id!=='string'||!UUID.test(item.id)||
  typeof item.from!=='string'||!LOCALE.test(item.from)||typeof item.to!=='string'||!LOCALE.test(item.to)||
  !Array.isArray(item.turns)||item.turns.length===0||item.turns.length>30||
  !Number.isInteger(item.fidelityWarnings)||Number(item.fidelityWarnings)<0||Number(item.fidelityWarnings)>100)return null;
 let size=0;const turns:Array<{source:string;translation:string}>=[];
 for(const raw of item.turns){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const row=raw as Record<string,unknown>;
  if(typeof row.source!=='string'||typeof row.translation!=='string'||!row.source.trim()||!row.translation.trim()
    ||row.source.length>8000||row.translation.length>8000)return null;
  size+=row.source.length+row.translation.length;
  if(size>80000)return null;
  turns.push({source:row.source.trim(),translation:row.translation.trim()});
 }
 return {id:item.id,from:item.from,to:item.to,turns,fidelityWarnings:item.fidelityWarnings as number};
}
export function translationNoteText(transfer:TranslationTransfer):string{
 return [
  'Медицинский перевод речи · запись со слов, НЕ подтверждённый анамнез или врачебное заключение.',
  'Необходимо сверить с участниками разговора исходную речь, числовые значения, отрицания, дозировки и единицы. Автоматический перевод может искажать клинический смысл.',
  'Языки диалога: '+transfer.from+' ↔ '+transfer.to+'.',
  ...(transfer.fidelityWarnings>0?['Предупреждений о качестве перевода: '+transfer.fidelityWarnings+'. Требуется ручная проверка.']:[]),
  ...transfer.turns.map((turn,index)=>'Фрагмент '+(index+1)+':\nИсходная речь: '+turn.source+'\nАвтоматический перевод: '+turn.translation),
 ].join('\n\n');
}
