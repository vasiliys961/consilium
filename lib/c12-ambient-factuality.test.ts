import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditAmbientDraft as ruAudit} from '../integrations/protocol/ru/lib/ambient-draft-audit.ts';
import {auditAmbientDraft as enAudit} from '../integrations/protocol/en/lib/ambient-draft-audit.ts';

test('C12: a supported RU medicine dose with a matching T-line is not flagged',()=>{
 const transcript='Пациент: Принимаю апиксабан 5 мг два раза в сутки.\nВрач: Аллергия на пенициллин?\nПациент: Нет, не было.';
 const draft='Лекарства: апиксабан 5 mg два раза в сутки [T1].\nАллергии на пенициллин нет [T3].';
 assert.deepEqual(ruAudit(transcript,draft),[]);
 assert.deepEqual(enAudit(transcript,draft),[]);
});
test('C12: a dose absent from the transcript is flagged, never corrected or silently transferred',()=>{
 const transcript='Пациент: Апиксабан 5 мг один раз в сутки.';
 const draft='Лекарства: апиксабан 10 мг один раз в сутки [T1].';
 const flags=ruAudit(transcript,draft);
 assert.ok(flags.some(f=>f.code==='unsupported_dose'&&f.detail.includes('10 мг')));
 assert.equal(transcript,'Пациент: Апиксабан 5 мг один раз в сутки.');
 assert.equal(draft,'Лекарства: апиксабан 10 мг один раз в сутки [T1].');
});
test('C12: an existing but wrong T-line does not substantiate the right dose',()=>{
 const source='Пациент: Не было одышки.\nПациент: Варфарин 5 мг ежедневно.\nВрач: Повторите дозу.';
 const draft='Лекарства: варфарин 5 мг [T1].';
 const issues=enAudit(source,draft);
 assert.ok(issues.some(f=>f.code==='wrong_dose_reference'&&f.detail.includes('[T1]')));
 assert.ok(!issues.some(f=>f.code==='unsupported_dose'));
 assert.deepEqual(enAudit(source,'Лекарства: варфарин 5 мг [T2].'),[]);
});
test('C12: fabricated and missing T-line references are flagged even if prose seems plausible',()=>{
 const source='Patient: I take metformin 500 mg each morning.';
 assert.ok(enAudit(source,'Metformin 500 mg [T99]').some(x=>x.code==='invalid_citation'));
 assert.ok(enAudit(source,'Metformin 500 mg').some(x=>x.code==='missing_citations'));
 assert.ok(enAudit(source,'Metformin 500 mg [T0]').some(x=>x.code==='invalid_citation'));
});
test('C12: common units across Global and RU formats do not need extra paid inference',()=>{
 const sources=[
  ['Toma 5 mg de apixabán.','Apixabán 5 mg [T1].'],
  ['Apixabano 5 mg por dia.','Apixabano 5 mg [T1].'],
  ['Patient takes 0,5 ml daily.','Dose: 0.5 mL [T1].'],
  ['患者服用阿哌沙班5毫克。','阿哌沙班5毫克 [T1].'],
  ['تناول دواء 5 ملغ.','5 mg [T1].'],
  ['रोगी दवा 5 मिलीग्राम लेता है।','दवा 5 mg [T1].'],
  ['المريض يأخذ 5 ملجم.','5 mg [T1].'],
  ['المريض يأخذ ٥ ملغ.','5 mg [T1].'],
 ];
 for(const [source,draft] of sources){
  assert.deepEqual(enAudit(source,draft),[],source);
  assert.deepEqual(ruAudit(source,draft),[],source);
 }
});
test('C12: Chinese adjacent doses and Arabic-Indic numerals are actually detected',()=>{
 const chinese='患者服用阿哌沙班5毫克。';
 assert.ok(enAudit(chinese,'阿哌沙班10毫克 [T1]').some(x=>x.code==='unsupported_dose'));
 const arabic='المريض يأخذ ٥ ملغ.';
 assert.ok(ruAudit(arabic,'10 mg [T1]').some(x=>x.code==='unsupported_dose'));
 assert.deepEqual(enAudit(arabic,'5 mg [T1]'),[]);
});
test('C12: UI requires physician acknowledgment after mismatches, reset on edit and forbids stale draft',()=>{
 for(const edition of ['ru','en']){
  const path='integrations/protocol/'+edition+'/app/protocol/page.tsx';
  const page=readFileSync(path,'utf8');
  assert.match(page,/auditAmbientDraft\(conversationTranscriptText,recordedDraftText\)/);
  assert.match(page,/ambientIssues\.length>0&&!ambientAuditConfirmed/);
  assert.match(page,/setAmbientAuditConfirmed\(false\)/);
  assert.match(page,/draftSourceTranscript!==conversationTranscriptText\.trim\(\)/);
  assert.match(page,/setRecordedDraftText\(e\.target\.value\);setAmbientAuditConfirmed\(false\)/);
  assert.doesNotMatch(page,/setRawText\([^\n]*\)\s*;\s*void buildDraftFromConversation/);
 }
 const global=readFileSync('integrations/protocol/en/app/protocol/page.tsx','utf8');
 assert.match(global,/draftSourceLocale!==locale/);
 const localization=readFileSync('integrations/protocol/en/lib/i18n/ambient-audit-ui.ts','utf8');
 for(const code of ['en','es','fr','ar','hi','pt-BR','id','ms','tr','zh-CN'])
  assert.ok(localization.includes(code+':{')||localization.includes("'"+code+"':{"),code);
});
