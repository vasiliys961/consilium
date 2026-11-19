import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMedicationSafetyContext,medicationContextHintAdvice} from './medication-context.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';
import {clinicalReportText,type ClinicalReport} from './clinical-report.ts';

const examples=[
 {id:'unit-potassium',note:'Potassium: 5.9 mg/dL',field:'potassium',kind:'units',advice:'лабораторный'},
 {id:'unit-qtc',note:'QTc: 520 s',field:'qtcMs',kind:'units',advice:'ЭКГ'},
 {id:'unit-egfr',note:'eGFR: 25 mg/dL',field:'egfr',kind:'units',advice:'креатинина'},
 {id:'months-not-years',note:'Age: 75 months',field:'ageYears',kind:'units',advice:'месяцев'},
 {id:'comparison-not-exact',note:'СКФ: <30 мл/мин/1,73 м²',field:'egfr',kind:'inequality',advice:'неравенство'},
 {id:'implausible-number',note:'Калий: 99 ммоль/л',field:'potassium',kind:'implausible',advice:'опечатку'},
 {id:'old-result',note:'K+: 5.9 mmol/L yesterday',field:'potassium',kind:'historical',advice:'предыдущий'},
 {id:'unknown-bleeding',note:'Active bleeding: pending',field:'activeBleeding',kind:'uncertain',advice:'статус'},
] as const;
for(const fixture of examples)test('W5 smart clarification: '+fixture.id,()=>{
 const result=extractMedicationSafetyContext(fixture.note);
 assert.ok(result.issues.length>=1);
 const hint=result.hints.find(h=>h.field===fixture.field);
 assert.equal(hint?.kind,fixture.kind);
 assert.equal(hint?.status,'requires_physician_confirmation');
 assert.equal(result.context[fixture.field],undefined,'Unconfirmed guess must not become clinical fact');
 assert.match(medicationContextHintAdvice(hint!),new RegExp(fixture.advice,'i'));
 if(fixture.kind==='units')assert.ok(hint?.expectedFormat?.includes('…'),'Only a template, never a guessed value');
});

test('W5 smart clarification: conflicting laboratory measurements suggest checking dates without choosing a value',()=>{
 const result=extractMedicationSafetyContext('СКФ: 25 мл/мин/1,73 м²\nСКФ: 78 мл/мин/1,73 м²');
 assert.equal(result.context.egfr,undefined);
 assert.ok(result.hints.some(h=>h.kind==='conflict'&&h.observed.includes('25')&&h.observed.includes('78')));
 assert.ok(result.hints.some(h=>medicationContextHintAdvice(h).includes('даты')));
 assert.ok(result.issues.some(i=>i.includes('Несогласованные')));
});

test('W5 smart clarification: even a valid duplicate plus invalid same-field value is not trusted',()=>{
 const result=extractMedicationSafetyContext('Калий: 5,8 ммоль/л\nK+: 5.8 mmol/L\nK+: 5.8 mg/dL');
 assert.equal(result.context.potassium,undefined);
 assert.ok(result.hints.some(h=>h.kind==='units'));
 assert.ok(result.issues.some(s=>s.includes('Калий')));
});

test('W5 smart clarification: conflicting bleeding statuses stay unknown and invite physician review',()=>{
 const result=extractMedicationSafetyContext('Active bleeding: yes\nActive bleeding: no');
 assert.equal(result.context.activeBleeding,undefined);
 assert.ok(result.hints.some(h=>h.kind==='conflict'));
 assert.ok(result.hints.some(h=>medicationContextHintAdvice(h).includes('Не выбирайте')));
});

test('W5 smart clarification: correct units and repeated identical values have no false suggestions',()=>{
 const result=extractMedicationSafetyContext('eGFR: 38 mL/min/1.73 m2\nK+: 4.5 mmol/L\nКалий: 4,5 ммоль/л\nQTc: 430 ms\nAge: 56 years\nActive bleeding: no');
 assert.deepEqual(result.hints,[]);
 assert.deepEqual(result.issues,[]);
 assert.deepEqual(result.context,{egfr:38,potassium:4.5,qtcMs:430,ageYears:56,activeBleeding:false});
});

test('W5 smart clarification: valid dangerous potassium is not suppressed by a separate invalid QTc/renal value',()=>{
 const result=extractMedicationSafetyContext('Калий: 5,9 ммоль/л\nСКФ: 25 mg/dL\nQTc: 520 s');
 assert.equal(result.context.potassium,5.9);
 assert.equal(result.context.egfr,undefined);
 assert.equal(result.context.qtcMs,undefined);
 assert.equal(result.hints.length,2);
 const risks=checkMedicationRegimen({current:'spironolactone\nmetformin\nmoxifloxacin',context:result.context});
 assert.ok(risks.organAlerts.some(a=>a.risk.includes('гиперкалиемия')));
 assert.equal(risks.organAlerts.some(a=>a.risk.includes('Метформин: СКФ')),false);
 assert.equal(risks.organAlerts.some(a=>a.risk.includes('выраженном удлинении QTc')),false);
});

test('W5 smart clarification: unsigned written report includes original, verification question and no fabricated clinical correction',()=>{
 const extraction=extractMedicationSafetyContext('QTc: 520 s');
 const report:ClinicalReport={problem:'Synthetic safety review',facts:[],differential:[],investigations:[],management:[],
  localContextHints:extraction.hints,questions:[],followUp:[],limitations:[]};
 const text=clinicalReportText(report);
 assert.match(text,/QTc: 520 s/);
 assert.match(text,/QTc: … ms/);
 assert.match(text,/исходную ЭКГ/);
 assert.match(text,/не использовано как факт/);
 assert.doesNotMatch(text,/QTc: 520 ms/,'No guessed conversion may be printed as an accepted value');
});

test('W5 smart clarification: only actual issue lines become suggestions, never unstructured history or model quotation',()=>{
 const source='Patient says potassium was high in the past.\nRecommended to check QTc later.\nВозраст: 62 года';
 const extraction=extractMedicationSafetyContext(source);
 assert.deepEqual(extraction.hints,[]);
 assert.equal(extraction.context.ageYears,62);
 assert.equal(extraction.context.potassium,undefined);
});
