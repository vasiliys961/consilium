import type { LedgerEntry } from './conductor.ts';
import type { FrameAccount } from '../packages/vision/comprehend.ts';
import type { SpecialistReading } from '../packages/specialists/read.ts';
export function reconcileEvidence(
 ledger: LedgerEntry[],
 input: { accounts: FrameAccount[]; readings: SpecialistReading[]; covers: Array<{source:string;withheld:boolean}>; failures: Array<{source:string;reason:string}>; imageNames: string[] },
 ru = true,
): LedgerEntry[] {
 return ledger.map(entry => {
  const blocked = input.covers.find(c => c.source === entry.source && c.withheld);
  if (blocked) return {...entry,status:'not_assessed',reason:ru?'Изображение не отправлено: локальная проверка вшитых персональных данных не выполнена.':'Image withheld: local privacy check failed.'};
  const account = input.accounts.find(a => a.source === entry.source);
  if (account) {
   const readable = account.status !== 'unreadable' && (account.seen.length > 0 || Boolean(account.reading));
   return {...entry,modality:account.kind==='tracing'?'ecg':account.kind==='ultrasound'?'ultrasound':account.kind==='dermoscopy'?'dermatology':account.kind==='histology'?'histology':account.kind==='document'?'document':account.kind==='radiograph'?'radiology':entry.modality,status:readable?'read':'not_assessed',reason: readable
    ? (ru?'Визуальный разбор':'Visual interpretation') + (account.status==='limited'?(ru?' с ограничениями.': ' with limitations.'):'.')
    : account.limitations?.join('; ') || account.reading || (ru?'Изображение не читается.':'Image is unreadable.')};
  }
  const specialist=input.readings.find(r=>r.source===entry.source);
  if(specialist?.status==='done') return {...entry,status:'read',reason:ru?'Профильный визуальный разбор выполнен.':'Specialist interpretation completed.'};
  const failure=input.failures.find(f=>f.source===entry.source);
  if(failure) return {...entry,status:'not_assessed',reason:failure.reason==='truncated'
   ? (ru?'Модель дважды вернула обрезанный ответ. Разбор не получен.':'Model output was truncated twice; no interpretation received.')
   : (ru?'Модель не вернула корректный разбор изображения. Повторите запрос.':'No valid image interpretation received; retry the request.')};
  if(input.imageNames.includes(entry.source)) return {...entry,status:'not_assessed',reason:ru?'Изображение не было разобрано в этом запросе; проверьте формат и лимит кадров.':'Image was not interpreted in this request; check format and frame limit.'};
  return entry;
 });
}
