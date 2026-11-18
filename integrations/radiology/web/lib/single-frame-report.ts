import type {LocalVolumeReceipt} from './full-volume-receipts.ts';
import {validSourceRadiologyReview} from './structured-radiology-review.ts';

/** Format only the already paid, source-bound answer. No second synthesis call.
 * A one-slice description must never claim coverage of an entire CT/MR study.
 */
export function singleFrameReport(receipts:readonly LocalVolumeReceipt[],modality:'CT'|'MR',sourceIndex:number,totalFrames:number):string{
 if(!Number.isSafeInteger(sourceIndex)||sourceIndex<0||!Number.isSafeInteger(totalFrames)||sourceIndex>=totalFrames||receipts.length!==1)
  throw Error('Описание одного среза не соответствует выбранному источнику.');
 const receipt=receipts[0],number=sourceIndex+1;
 if(receipt.batchIndex!==0||receipt.findings.some(f=>f.sourceIndex!==sourceIndex)||!receipt.structuredReview||
  !validSourceRadiologyReview(receipt.structuredReview,[number])||receipt.structuredReview.imageQuality.length!==1)
  throw Error('Источник описания одного среза не подтверждён.');
 const structures=receipt.structuredReview.structures.map(s=>[
  s.anatomy+': '+s.description,
  s.importantNegatives.length?'Отрицательные признаки: '+s.importantNegatives.join('; '):'',
  'Ограничения оценки: '+s.limitations,
 ].filter(Boolean).join('\n'));
 const findings=receipt.findings.map(f=>[
  f.anatomy+': '+f.sign,
  f.localization?'Локализация: '+f.localization:'',
  f.morphology?'Морфологические признаки: '+f.morphology:'',
  'Неопределённость: '+f.uncertainty,
 ].filter(Boolean).join('\n'));
 return [
  (modality==='CT'?'КТ':'МРТ')+' · предварительное описание одного среза',
  'Оценён срез '+number+' из '+totalFrames+' представленных. Полное исследование не оценивалось.',
  'ОПИСАНИЕ',...structures,
  ...(findings.length?['НАБЛЮДЕНИЯ',...findings]:[]),
  'ОГРАНИЧЕНИЯ',...receipt.structuredReview.imageQuality.map(q=>q.limitations),...receipt.limitations,
  'Описание сформировано по одному изображению и требует проверки врачом. Неоценённые отделы не считаются нормальными.',
 ].join('\n\n');
}
