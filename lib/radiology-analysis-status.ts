import {localOrigin} from './local-ports.ts';

export type RadiologyAnalysisStatus='ready'|'not-approved'|'missing-provider'|'operator-required'|'not-development'|'unavailable';

/** Viewer health alone does not establish permission or connectivity for analysis.
 * Only this small allowlist crosses from the child service to the workstation.
 */
export function parseRadiologyAnalysisStatus(raw:unknown):RadiologyAnalysisStatus{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'unavailable';
 const value=raw as Record<string,unknown>;
 if(value.schema!=='opus-deidentified-openrouter-pilot-readiness/v1'||value.provider!=='openrouter')return 'unavailable';
 if(value.configurationStatus==='ready')return value.enabled===true&&value.workstationConnected===true?'ready':'operator-required';
 if(['not-approved','missing-provider','operator-required','not-development'].includes(String(value.configurationStatus)))
  return value.configurationStatus as RadiologyAnalysisStatus;
 return 'unavailable';
}

export async function radiologyAnalysisStatus(fetchImpl:typeof fetch=fetch):Promise<RadiologyAnalysisStatus>{
 try{
  const response=await fetchImpl(`${localOrigin('radiology')}/api/ai/deidentified-openrouter-review`,{
   cache:'no-store',signal:AbortSignal.timeout(1200),redirect:'error',
  });
  return response.ok?parseRadiologyAnalysisStatus(await response.json()):'unavailable';
 }catch{return 'unavailable';}
}

export function radiologyAnalysisNotice(status:RadiologyAnalysisStatus):string{
 switch(status){
  case 'ready':return 'Анализ подключён. Отправка снимков — после вашей проверки и подтверждения.';
  case 'not-approved':return 'Просмотр снимков доступен. Для анализа требуется разрешение администратора рабочего места.';
  case 'missing-provider':return 'Просмотр снимков доступен. Подключение к службе анализа ещё не настроено.';
  case 'operator-required':return 'Просмотр снимков доступен. Администратору нужно завершить подключение анализа.';
  case 'not-development':return 'Просмотр снимков доступен. Анализ не разрешён в этом режиме рабочего места.';
  default:return 'Просмотр снимков доступен. Сейчас не удалось проверить подключение анализа.';
 }
}
