import {appendFileSync,existsSync,mkdirSync,renameSync,statSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export interface RunEvent {event:string;runId:string;at:string;[key:string]:unknown}
const numericFields=new Set(['files','referenceFiles','inputTokens','outputTokens','durationMs','estimatedUsd','httpStatus','modelResponses','readFiles','unassessedFiles','passages','citations']);
const stringFields=new Set(['model','provider','requestedTask','task','clinicalDraft','finishReason','stage','module','status']);
const reasons=new Set(['Error','TypeError','AbortError','TimeoutError','unknown','transport_error','deadline','queue','invalid_json','invalid_case','payload_too_large','privacy_review_required','invalid_response','truncated','schema_rejected','payment_required','provider_error']);
export function terminalEvent(runId:string,event:string,fields:Record<string,unknown>={}):RunEvent{
 const safe:Record<string,unknown>={};
 for(const [key,value] of Object.entries(fields)){
  if(numericFields.has(key)&&typeof value==='number'&&Number.isFinite(value))safe[key]=value;
  else if(stringFields.has(key)&&(value===null||typeof value==='string'))safe[key]=typeof value==='string'?value.slice(0,160):value;
  else if(['consilium','externalSearch','usageAvailable','usageComplete'].includes(key)&&typeof value==='boolean')safe[key]=value;
  else if(key==='reason')safe.reason=typeof value==='string'&&reasons.has(value)?value:'unknown';
 }
 return {event,runId,at:new Date().toISOString(),...safe};
}
export function terminalLogPath(){return resolve(process.env.CONCILIUM_LOG_FILE||resolve(process.cwd(),'.logs','events.jsonl'));}
export function appendTerminalEvent(event:RunEvent,path=terminalLogPath()){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 if(existsSync(path)&&statSync(path).size>=2*1024*1024)renameSync(path,`${path}.1`);
 appendFileSync(path,JSON.stringify(terminalEvent(event.runId,event.event,event))+'\n',{mode:0o600});
}
let warned=false;
export function writeTerminalEvent(event:RunEvent){
 const safe=terminalEvent(event.runId,event.event,event);
 console.info(`[Concilium] ${JSON.stringify(safe)}`);
 try{appendTerminalEvent(safe);}catch{if(!warned){warned=true;console.warn('[Concilium] Не удалось записать журнал; события остаются в терминале сервера.');}}
}
const stages:Record<string,string>={intake:'Подготовка файлов',readings:'Чтение материалов',sources:'Поиск источников',synthesis:'Клиническое заключение',consilium:'Консилиум',planning:'Определение задачи',searching:'Подбор литературы',answering:'Подготовка ответа'};
export function formatTerminalEvent(event:RunEvent):string{
 const time=new Date(event.at).toLocaleTimeString('ru-RU');
 const prefix=`${time} [${event.runId.slice(0,8)}]`;
 const duration=typeof event.durationMs==='number'?` · ${(event.durationMs/1000).toFixed(1)} с`:'';
 const cost=event.usageAvailable===false||event.usageComplete===false?' · стоимость неполная: провайдер не передал токены':typeof event.estimatedUsd==='number'?` · ≈ $${event.estimatedUsd.toFixed(6)}`:'';
 switch(event.event){
  case 'privacy.approved':return `${prefix} Проверка персональных данных подтверждена врачом · отправляется подготовленная копия`;
  case 'run.started':
   if(event.requestedTask==='specialist-chat')return `${prefix} Начат чат со специалистом`;
   if(event.requestedTask==='specialist-review')return `${prefix} Начата проверка ответа`;
   if(event.requestedTask==='specialist-voice')return `${prefix} Начата расшифровка голосового вопроса`;
   return `${prefix} Начат разбор · файлов: ${event.files??0} · источников врача: ${event.referenceFiles??0}`;
  case 'run.planned':return `${prefix} Задача: ${event.task} · консилиум: ${event.consilium?'да':'нет'}`;
  case 'consult.stage':
  case 'stage.started':return `${prefix} ${stages[String(event.stage)]??event.stage}`;
  case 'stage.completed':return `${prefix} ${stages[String(event.stage)]??event.stage}: завершено${event.readFiles!==undefined?` · прочитано: ${event.readFiles}, не оценено: ${event.unassessedFiles}`:''}${event.passages!==undefined?` · фрагментов: ${event.passages}, источников: ${event.citations}, внешний поиск: ${event.externalSearch?'да':'нет'}`:''}`;
  case 'module.started':return `${prefix} Проверка цифровой записи · ${event.module} · локально`;
  case 'module.completed':return `${prefix} ${event.module}: ${event.status==='read'?'отработал':'запись не оценена'} · локально${duration}${cost}`;
  case 'module.failed':return `${prefix} ${event.module??'Модуль'}: технический сбой, данные не оценены; остальные этапы разбора продолжаются${duration}`;
  case 'stage.failed':return `${prefix} ${stages[String(event.stage)]??event.stage}: этап не завершён; доступные результаты других этапов сохранены`;
  case 'model.started':return `${prefix} → Модель: ${event.model} (${event.provider})`;
  case 'model.responded':return `${prefix} ← ${event.model} · HTTP ${event.httpStatus} · завершение: ${event.finishReason??'не указано'} · токены: ${event.inputTokens} → ${event.outputTokens}${duration}${cost}`;
  case 'model.rejected':return `${prefix} Ответ ${event.model} отклонён · ${event.reason==='truncated'?'достигнут лимит ответа':'ответ не соответствует формату разбора'}`;
  case 'model.failed':return `${prefix} ОШИБКА модели ${event.model}: ${event.reason}${duration}`;
  case 'run.completed':return `${prefix} ${event.clinicalDraft==='generated'?'Ответ сформирован':'Клинический ответ не получен'} · вызовов с ответом: ${event.modelResponses}${event.readFiles===undefined?'':` · прочитано: ${event.readFiles}, не оценено: ${event.unassessedFiles}`}${duration}${cost}`;
  case 'run.aborted':return `${prefix} Разбор остановлен${duration}${cost}`;
  case 'run.failed':return `${prefix} ОШИБКА разбора: ${event.reason}`;
  case 'request.rejected':{
   const reasons:Record<string,string>={invalid_json:'не удалось прочитать формат запроса',invalid_case:'неверный состав запроса',payload_too_large:'превышен допустимый размер запроса',queue:'другие разборы ещё выполняются'};
   return `${prefix} Разбор не запускался: ${reasons[String(event.reason)]??'запрос отклонён'} · HTTP ${event.httpStatus} (${event.reason})`;
  }
  default:return `${prefix} ${event.event}`;
 }
}
