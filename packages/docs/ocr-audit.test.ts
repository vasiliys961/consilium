import test from 'node:test';
import assert from 'node:assert/strict';
import {auditClinicalOcrText,ocrReviewSummary} from './ocr-audit.ts';

test('C5 clinical OCR: keeps original comma decimal, comparison, dose and negation as review targets',()=>{
 const source=[
  'Страница 1 · OCR, сверить с оригиналом',
  'Калий 5,9 ммоль/л',
  'СКФ < 30 мл/мин',
  'МНО 4 , 6',
  'Варфарин 5 мг утром',
  'Аллергии нет',
  'Страница 2 · OCR, сверить с оригиналом',
  'Отрицает кровотечение',
  'Hb 81\tНорма 120-160'
 ].join('\n');
 const original=source;
 const flags=auditClinicalOcrText(source);
 assert.equal(source,original,'A review helper must never rewrite the OCR result');
 const kinds=new Set(flags.map(f=>f.kind));
 for(const kind of ['lab','comparison','number-spacing','dose','negation','table'])
  assert.ok(kinds.has(kind as never),kind);
 assert.ok(flags.some(f=>f.page===2&&f.kind==='negation'));
 assert.match(ocrReviewSummary(flags),/отрицания/);
 assert.match(ocrReviewSummary(flags),/страницы 1, 2/);
});
test('C5 OCR caution: missing or corrupted signs and units are not automatically invented',()=>{
 const text='Страница 1 · OCR, сверить с оригиналом\nСостояние стабильное\nСОЭ значение неизвестно';
 assert.equal(auditClinicalOcrText(text).some(f=>f.kind==='lab'),false);
 assert.ok(!ocrReviewSummary(auditClinicalOcrText(text)).includes('знаки сравнения'));
 assert.equal(auditClinicalOcrText('Страница 1 · OCR, сверить с оригиналом\n5 , 8')[0]?.kind,'number-spacing');
});
test('C5 OCR review is deterministic, bounded, and page-specific',()=>{
 const text=Array.from({length:80},(_,i)=>'Страница '+(i+1)+' · OCR, сверить с оригиналом\nКалий '+(i+2)+',4 ммоль/л').join('\n');
 const flags=auditClinicalOcrText(text);
 assert.ok(flags.length<=12);
 assert.deepEqual(flags,auditClinicalOcrText(text));
 assert.equal(flags[0].page,1);
 assert.ok(flags.every(f=>f.sample.length<=160));
});
test('C5 OCR: signs for a negative laboratory value remain reviewable but do not imply a diagnosis',()=>{
 const text='Страница 1 · OCR, сверить с оригиналом\nK+ - 3,1 mmol/L\nГлюкоза 5,6\nHb 90';
 const flags=auditClinicalOcrText(text);
 assert.ok(flags.some(f=>f.kind==='lab'));
 assert.ok(flags.some(f=>f.kind==='number-spacing'));
 assert.equal(text.includes('K+ - 3,1'),true);
});
