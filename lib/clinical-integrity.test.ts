import assert from 'node:assert/strict';
import test from 'node:test';
import { guardGeneratedClinicalText, guardUnsupportedRestDyspnea, separateMissingFromOpposing } from './clinical-integrity.ts';
import { readClinicalReport } from './clinical-report.ts';

test('an unavailable examination is missing evidence, not evidence against',()=>{
 const result=separateMissingFromOpposing([
  'Фракция выброса и данные визуализации отсутствуют',
  'Болевой синдром не описан',
  'Ритм и признаки тромбоза вен не описаны',
  'ЭКГ не предоставлена',
  'Тропонин не измерен',
  'ECG not available',
  'No imaging results',
  'Документированная отрицательная проба с нагрузкой',
  'Нет крепитации при документированной аускультации',
 ],['Неизвестна исходная СКФ']);
 assert.deepEqual(result.opposing,[
  'Документированная отрицательная проба с нагрузкой',
  'Нет крепитации при документированной аускультации',
 ]);
 assert.equal(result.missing.length,8);
 assert.ok(result.missing.includes('Болевой синдром не описан'));
});

test('the parsed physician report moves unknown results to missing but preserves real negatives',()=>{
 const result=readClinicalReport({problem:'Dyspnea',differential:[{hypothesis:'Heart failure',supporting:['orthopnea'],opposing:['Данные визуализации отсутствуют','ЭхоКГ без снижения ФВ'],missing:[],dangerous:true}]});
 assert.deepEqual(result?.differential[0].opposing,['ЭхоКГ без снижения ФВ']);
 assert.deepEqual(result?.differential[0].missing,['Данные визуализации отсутствуют']);
});

test('unsupported dyspnea at rest is conservatively relabelled and surfaced',()=>{
 const generated={summary:'Нарастает одышка в покое',report:{facts:['одышка в покое'],tactics:{timing:'Немедленно: одышка в покое'}}};
 const result=guardGeneratedClinicalText(generated,'Прогрессирующая одышка, ортопноэ и отеки');
 assert.equal(result.changed,true);
 assert.match(result.value.summary,/в покое не уточнено/);
 assert.doesNotMatch(result.value.report.tactics.timing,/одышка в покое/);
 const documented=guardGeneratedClinicalText(generated,'Пациент описывает одышку в покое и при нагрузке');
 assert.equal(documented.changed,false);
 assert.equal(documented.value.summary,generated.summary);
 const denied=guardUnsupportedRestDyspnea('одышка в покое','Пациент отрицает одышку в покое');
 assert.equal(denied.changed,true);
});

test('unknowns are not mistaken for genuine negative examinations in English',()=>{
 const item=separateMissingFromOpposing(['Not documented','Troponin not measured','Normal troponin after serial testing'],[]);
 assert.deepEqual(item.opposing,['Normal troponin after serial testing']);
 assert.equal(item.missing.length,2);
});
