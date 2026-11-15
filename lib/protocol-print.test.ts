import test from 'node:test';
import assert from 'node:assert/strict';
import type {ClinicalCase} from './casebook.ts';
import {completedClinicalEvidence,originalClinicalDocument,independentProtocolSource} from './protocol-print.ts';
import {REPORT_INSTRUCTION} from './clinical-report.ts';

const caseFixture={
 id:'case-1',title:'Synthetic case',context:'Мужчина, 68 лет. Прогрессирующая одышка и ортопноэ. АД 155/90, SpO₂ 93%.',question:'Оценить диагностический и лечебный план.',
 files:[],events:[],status:'active',created:'2026-11-15T10:00:00Z',updated:'2026-11-15T10:00:00Z',
 analyses:[{id:'analysis-1',result:{clinicalDraft:'generated',draft:{
  summary:'Рабочий диагноз: вероятная сердечная недостаточность; эхокардиография обязательна.',
  report:{problem:'Вероятная декомпенсация',facts:['NT-proBNP 4200 пг/мл'],differential:[],
   investigations:[{test:'ЭКГ',rationale:'исключить ишемию',priority:'срочно'}],
   management:[{option:'Обсудить петлевой диуретик после оценки объёма и СКФ',conditions:['подтверждён застой'],safetyChecks:['калий, креатинин'],monitoring:['диурез']}],
   questions:[],limitations:['Аускультация не предоставлена'],followUp:['Повторная оценка']}
 },studyReports:[],statements:[]},unassessed:[]}}]
} as unknown as ClinicalCase;

test('original printable clinical note is deterministic and preserves diagnoses and conditional therapy without invented findings',()=>{
 const first=originalClinicalDocument(caseFixture,'ru')!;
 assert.equal(first.presentation,'original-analysis');
 assert.equal(first.sourceAnalysisId,'analysis-1');
 assert.equal(first.sections[1].text,caseFixture.analyses[0].result.draft.summary);
 const all=first.sections.map(section=>section.text).join('\n');
 assert.match(all,/NT-proBNP 4200/);
 assert.match(all,/Обсудить петлевой диуретик/);
 assert.match(all,/калий, креатинин/);
 assert.doesNotMatch(all,/пациент согласен|живот мягкий|лимфоузлы не увеличены|нет жалоб на одышку/i);
 assert.match(completedClinicalEvidence(caseFixture)!,/ЗАВЕРШЁННЫЙ КЛИНИЧЕСКИЙ РАЗБОР/);
});
test('an unfinished analysis can never produce a printable completed clinical report',()=>{
 const failed={...caseFixture,analyses:[{...caseFixture.analyses[0],result:{...caseFixture.analyses[0].result,clinicalDraft:'unavailable' as const}}]} as ClinicalCase;
 assert.equal(completedClinicalEvidence(failed),null);
 assert.equal(originalClinicalDocument(failed),null);
});
test('latest finished case does not bring previous AI reports or unrelated signed-looking consent into a new formatting request',()=>{
 const updated={...caseFixture,analyses:[caseFixture.analyses[0],{...caseFixture.analyses[0],id:'older',result:{...caseFixture.analyses[0].result,draft:{...caseFixture.analyses[0].result.draft,summary:'Patient signed consent'}}}]} as ClinicalCase;
 assert.doesNotMatch(completedClinicalEvidence(updated)!,/Patient signed consent/);
 assert.match(completedClinicalEvidence(updated)!,/Аускультация не предоставлена/);
});
test('a saved Sol source must be a genuine standalone protocol, never an intermediate Flash translation',()=>{
 const sol={id:'sol',kind:'encounter',locale:'ru',generationMode:'standalone',sections:[{id:'Diagnosis',title:'Diagnosis',text:'Working diagnosis'}]};
 const translated={...sol,id:'flash',generationMode:'from-protocol'};
 const value={...caseFixture,protocols:[translated,sol]} as ClinicalCase;
 assert.equal(independentProtocolSource(value,'encounter')?.id,'sol');
});
test('full clinical reasoning includes conditional treatment options; interpretation remains separate',()=>{
 assert.match(REPORT_INSTRUCTION,/For a full clinical task, include clinically appropriate provisional management options/);
 assert.match(REPORT_INSTRUCTION,/not imply that a physician accepted any proposal/);
 assert.doesNotMatch(REPORT_INSTRUCTION,/for clinical tasks management must be empty/);
});
