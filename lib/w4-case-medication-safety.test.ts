import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {caseMedicationSafetyContext,type ManualMedicationFacts} from './case-medication-safety-context.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';
import {caseContext,newCase,caseAnalysisInput} from './casebook.ts';
import {conduct} from './conductor.ts';
import {runConsilium,CONSILIUM_ROLES} from './consilium.ts';

const blank:ManualMedicationFacts={
 egfrText:'',potassiumText:'',ageText:'',qtcText:'',
 decompensatedCirrhosis:null,severeHepaticImpairment:null
};

test('W4 medication: existing physician case facts are used for local checking without duplicate entry',()=>{
 const value=newCase();
 value.context=[
  'Возраст: 72 года','СКФ: 28 мл/мин/1,73 м²','Калий: 5,7 ммоль/л',
  'QTc: 515 мс','Активное патологическое кровотечение: нет',
 ].join('\n');
 value.currentMedications='амиодарон\nспиронолактон\nкалия хлорид';
 const got=caseMedicationSafetyContext(value.context,blank);
 assert.deepEqual(got.context,{
  egfr:28,potassium:5.7,ageYears:72,qtcMs:515,
  activeBleeding:false,decompensatedCirrhosis:undefined,
  severeHepaticImpairment:undefined
 });
 assert.deepEqual(got.issues,[]);
 const checked=checkMedicationRegimen({
  current:value.currentMedications,proposed:'моксифлоксацин',
  context:got.context
 });
 assert.ok(checked.alerts.some(a=>/удлинение QT|torsade/i.test(a.risk)));
 assert.ok(checked.alerts.some(a=>/Спиронолактон и добавка калия/.test(a.risk)));
 assert.ok(checked.organAlerts.some(a=>/K\+ ≥5,5/.test(a.risk)));
 assert.ok(checked.organAlerts.some(a=>/выраженном удлинении QTc/.test(a.risk)));
 assert.ok(checked.coverage.unverifiedPairCount>0,'Unknown pairs must remain unverified');
 // The clinician's medication list is unchanged: a proposed option remains only proposed.
 assert.equal(value.currentMedications,'амиодарон\nспиронолактон\nкалия хлорид');
});

test('W4 medication: contradictory numbers stay unknown, not silently selected',()=>{
 const facts=['СКФ: 25 мл/мин/1,73 м²','СКФ: 77 мл/мин/1,73 м²','Калий: <5,0 ммоль/л',
 'QTc: неизвестна','Активное патологическое кровотечение: да'].join('\n');
 const got=caseMedicationSafetyContext(facts,blank);
 assert.equal(got.context.egfr,null);
 assert.equal(got.context.potassium,null);
 assert.equal(got.context.qtcMs,null);
 assert.equal(got.context.activeBleeding,true);
 assert.ok(got.issues.some(t=>t.includes('СКФ')));
 const warning=checkMedicationRegimen({current:'метформин\nапиксабан',context:got.context});
 assert.ok(warning.missing.some(x=>x.includes('СКФ не указана')));
 assert.ok(warning.organAlerts.some(x=>/активное патологическое кровотечение/.test(x.risk)));
 assert.equal(warning.organAlerts.some(x=>/СКФ <30/.test(x.risk)),false);
});

test('W4 medication: explicit user correction overrides only its field, and case switches do not leak overrides',()=>{
 const facts='СКФ: 30 мл/мин/1,73 м²\nКалий: 4,7 ммоль/л\nДекомпенсированный цирроз: подтверждён';
 const first=caseMedicationSafetyContext(facts,blank);
 assert.equal(first.context.egfr,30);
 assert.equal(first.context.decompensatedCirrhosis,true);
 const changed=caseMedicationSafetyContext(facts,{...blank,egfrText:'44',decompensatedCirrhosis:false});
 assert.equal(changed.context.egfr,44);
 assert.equal(changed.context.potassium,4.7);
 assert.equal(changed.context.decompensatedCirrhosis,false);
 // Independent case: no clinical values and no retained overrides.
 const second=caseMedicationSafetyContext('Жалобы: одышка; СКФ неизвестна',blank);
 assert.equal(second.context.egfr,null);
 assert.equal(second.context.decompensatedCirrhosis,undefined);
 const ui=readFileSync('app/components/clinical-workspace.tsx','utf8');
 assert.match(ui,/DrugInteractionChecker key=\{current\.id\} caseFacts=\{current\.context\}/);
 assert.match(ui,/активное патологическое кровотечение \$\{details\.context\.activeBleeding/);
});

test('W4 medication: current/stopped/alternatives never become one fictitious combination',()=>{
 const got=caseMedicationSafetyContext('СКФ: 54 мл/мин/1,73 м²\nВозраст: 69 лет',blank);
 const reviewed=checkMedicationRegimen({
  current:'варфарин\nибупрофен',
  stopped:'варфарин',
  alternatives:'апиксабан\nривароксабан',
  context:got.context
 });
 assert.equal(reviewed.alerts.some(x=>/Варфарин/.test(x.risk)),false);
 assert.equal(reviewed.alerts.some(x=>/апиксабан.*ривароксабан|Апиксабан и ривароксабан/.test(x.risk)),false);
 assert.deepEqual(reviewed.alternatives.map(x=>x.alerts.length),[1,1]);
});

test('W4 no extra provider: follow-up council retains clinical facts and medication warnings after a mock reply',async()=>{
 const clinical=newCase();
 clinical.context='СКФ: 28 мл/мин/1,73 м²\nКалий: 5,7 ммоль/л\nQTc: 515 мс';
 clinical.question='Оцените жалобы и терапию';
 clinical.currentMedications='амиодарон\nспиронолактон\nкалия хлорид';
 const initial=caseAnalysisInput(clinical);
 const first=conduct({text:initial.text,locale:'ru'});
 clinical.analyses.unshift({id:'mock-first',at:'2026-11-17T15:00:00Z',context:initial.text,result:{
 ...first,clinicalDraft:'generated',draft:{...first.draft,summary:'Тестовое предварительное заключение'}
 }});
 clinical.events.push({id:'new-fact',at:'2026-11-17T15:05:00Z',kind:'note',text:'Повторная жалоба: слабость усилилась'});
 const later=caseAnalysisInput(clinical);
 assert.match(later.text,/Повторная жалоба: слабость усилилась/);
 assert.match(later.text,/Тестовое предварительное заключение/);
 assert.match(later.text,/амиодарон/);
 let calls=0;
 const voices=await runConsilium({OPENROUTER_API_KEY:'synthetic-no-network'},{
  locale:'ru',note:later.text,draft:'Синтетический проект',citations:[]
 },async()=>{
  calls++;
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Синтетическое мнение; назначения не утверждены.',source:null})}}],usage:{prompt_tokens:12,completion_tokens:16}});
 });
 assert.equal(calls,CONSILIUM_ROLES.length);
 assert.deepEqual(voices.map(x=>x.status),CONSILIUM_ROLES.map(()=>'done'));
 assert.equal(clinical.currentMedications,'амиодарон\nспиронолактон\nкалия хлорид');
});

test('W4 spelling: affirmative and negated Russian confirmed status stay distinct',()=>{
 const yes=caseMedicationSafetyContext('Декомпенсированный цирроз: подтверждён\\nТяжёлая печёночная недостаточность: подтверждена',blank);
 assert.equal(yes.context.decompensatedCirrhosis,true);
 assert.equal(yes.context.severeHepaticImpairment,true);
 const no=caseMedicationSafetyContext('Декомпенсированный цирроз: не подтверждён\\nТяжёлая печёночная недостаточность: не подтверждена',blank);
 assert.equal(no.context.decompensatedCirrhosis,false);
 assert.equal(no.context.severeHepaticImpairment,false);
});
