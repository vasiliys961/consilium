import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMedicationSafetyContext} from './medication-context.ts';
import {checkMedicationRegimen,localDrugCoverage} from './drug-interaction-rules.ts';
import {caseContext,newCase} from './casebook.ts';

/** Clinical scenarios are entirely synthetic and never call a medical model or provider. */
const scenarios=[
 {id:'C3-A heart failure and hyperkalemia',
  clinical:'Возраст: 76 лет\nСКФ: 27 мл/мин/1,73 м²\nКалий: 5,9 ммоль/л\nАктивное кровотечение: нет',
  current:'лозартан\nспиронолактон\nкалия хлорид\nфуросемид',
  pairs:2,organs:['гиперкалиемия'],contra:1,egfr:27},
 {id:'C3-B AF and active GI bleeding',
  clinical:'Возраст: 78 лет\nСКФ: 60 мл/мин/1,73 м²\nАктивное патологическое кровотечение: да',
  current:'апиксабан\nаспирин\nклопидогрел\nпантопразол',
  pairs:2,organs:['активное патологическое кровотечение'],contra:1,egfr:60},
 {id:'C3-C AF without bleeding, rivaroxaban plus two bleeding modifiers',
  clinical:'Возраст: 64 года\nСКФ: 83 мл/мин/1,73 м²\nАктивное кровотечение: нет',
  current:'ривароксабан\nибупрофен\nаспирин\nметформин',
  pairs:2,organs:[],contra:0,egfr:83},
 {id:'C3-D CKD with colchicine-macrolide and metformin',
  clinical:'Возраст: 70 лет\nСКФ: 23 мл/мин/1,73 м²\nКалий: 4,8 ммоль/л',
  current:'колхицин\nкларитромицин\nметформин\nамлодипин',
  pairs:1,organs:['Метформин: СКФ'],contra:1,egfr:23},
 {id:'C3-E prolonged QT and multiple cardiovascular drugs',
  clinical:'Возраст: 68 лет\nСКФ: 52 мл/мин/1,73 м²\nQTc: 515 мс\nКалий: 3,2 ммоль/л',
  current:'амиодарон\nдигоксин\nмоксифлоксацин\nбисопролол',
  pairs:2,organs:['QTc','сухожилий','гипокалиемии'],contra:0,egfr:52},
 {id:'C3-F QT interaction persists even if QTc not prolonged',
  clinical:'Возраст: 49 лет\nСКФ: 72 мл/мин/1,73 м²\nQTc: 425 мс',
  current:'амиодарон\nмоксифлоксацин\nдигоксин\nбисопролол',
  pairs:2,organs:[],contra:0,egfr:72},
 {id:'C3-G lithium, NSAID, ACE inhibitor and CKD',
  clinical:'Возраст: 57 лет\nСКФ: 42 мл/мин/1,73 м²',
  current:'литий\nибупрофен\nэналаприл\nметформин',
  pairs:2,organs:['Метформин: при СКФ'],contra:0,egfr:42},
 {id:'C3-H strong CYP3A interactions',
  clinical:'Возраст: 60 лет\nСКФ: 82 мл/мин/1,73 м²',
  current:'кларитромицин\nсимвастатин\nлуразидон\nметформин',
  pairs:2,organs:[],contra:0,egfr:82},
 {id:'C3-I cirrhosis and hepatic impairment',
  clinical:'Возраст: 67 лет\nСКФ: 69 мл/мин/1,73 м²\nДекомпенсированный цирроз: да\nТяжёлая печёночная недостаточность: подтверждена',
  current:'апиксабан\nсимвастатин\nметформин\nамлодипин',
  pairs:0,organs:['Симвастатин противопоказан','Апиксабан при тяжёлой'],contra:1,egfr:69}
] as const;

for(const scenario of scenarios){
 test('clinical-context '+scenario.id,()=>{
  const parsed=extractMedicationSafetyContext(scenario.clinical);
  const checked=checkMedicationRegimen({current:scenario.current,context:parsed.context});
  const clinicallyMajor=checked.alerts.filter(a=>a.severity==='major'||a.severity==='contraindicated');
  console.log('C3_CONTEXT '+JSON.stringify({id:scenario.id,matched:checked.alerts.map(a=>a.risk),organ:checked.organAlerts.map(a=>a.risk),unverifiedPairs:checked.coverage.unverifiedPairCount,unrecognized:checked.coverage.unrecognized,issues:parsed.issues}));
  assert.equal(parsed.context.egfr,scenario.egfr);
  assert.equal(checked.alerts.length,scenario.pairs);
  for(const part of scenario.organs)assert.ok(checked.organAlerts.some(a=>a.risk.includes(part)),scenario.id+': '+part);
  assert.ok(checked.organAlerts.filter(a=>a.severity==='contraindicated').length>=scenario.contra);
  assert.equal(parsed.issues.length,0);
  assert.ok(checked.coverage.unverifiedPairCount>0,'Do not imply that all unrelated combinations were checked');
  assert.ok(clinicallyMajor.every(x=>x.section&&x.monitoring&&x.mechanism&&x.url.startsWith('https://dailymed.nlm.nih.gov/')));
 });
}
test('context in a real case narrative is carried with current drugs without guessing values',()=>{
 const synthetic=newCase();synthetic.question='Оцените риски терапии при СН';
 synthetic.currentMedications='лозартан\nспиронолактон\nкалия хлорид';
 synthetic.context='СН с ХБП\nВозраст: 74 года\nСКФ: 26 мл/мин/1,73 м²\nКалий: 5,7 ммоль/л';
 const note=caseContext(synthetic);
 const facts=extractMedicationSafetyContext(note);
 const medications=note.match(/Current medications reported by the physician:\n([\s\S]*?)(?:\n\n|$)/)?.[1]??'';
 const result=checkMedicationRegimen({current:medications,context:facts.context});
 assert.equal(result.alerts.length,2);
 assert.ok(result.organAlerts.some(a=>a.severity==='contraindicated'));
 assert.equal(facts.context.potassium,5.7);
});
test('conflicting lab values and unsupported comparisons are NOT silently treated as observed results',()=>{
 const note='СКФ: 23 мл/мин/1,73 м²\nСКФ: 78 мл/мин/1,73 м²\nКалий: <5,0 ммоль/л\nQTc: неизвестна\nВозраст: 72 лет';
 const extracted=extractMedicationSafetyContext(note);
 assert.equal(extracted.context.egfr,undefined);
 assert.equal(extracted.context.potassium,undefined);
 assert.equal(extracted.context.qtcMs,undefined);
 assert.equal(extracted.context.ageYears,72);
 assert.ok(extracted.issues.some(s=>s.includes('СКФ')));
 const checked=checkMedicationRegimen({current:'метформин',context:extracted.context});
 assert.ok(checked.missing.some(s=>s.includes('СКФ не указана')));
 assert.equal(checked.organAlerts.length,0,'Do not invent renal contraindication from discordant results');
});
test('a negated bleeding status must never become a contraindication',()=>{
 const a=extractMedicationSafetyContext('Активное патологическое кровотечение: нет\nСКФ: 64 мл/мин/1,73 м²');
 const b=extractMedicationSafetyContext('Активное патологическое кровотечение: да\nСКФ: 64 мл/мин/1,73 м²');
 const drugs='ривароксабан\nаспирин\nклопидогрел\nметформин';
 assert.equal(a.context.activeBleeding,false);
 assert.equal(checkMedicationRegimen({current:drugs,context:a.context}).organAlerts.length,0);
 assert.equal(b.context.activeBleeding,true);
 assert.ok(checkMedicationRegimen({current:drugs,context:b.context}).organAlerts.some(a=>a.severity==='contraindicated'));
});
test('anticoagulant switching and mutually exclusive options preserve baseline clinical risk',()=>{
 const clinical=extractMedicationSafetyContext('Возраст: 69 лет\nСКФ: 77 мл/мин/1,73 м²\nАктивное кровотечение: нет').context;
 const before=checkMedicationRegimen({current:'варфарин\nибупрофен\nметформин',proposed:'апиксабан',context:clinical});
 const after=checkMedicationRegimen({current:'варфарин\nибупрофен\nметформин',proposed:'апиксабан',stopped:'warfarin',context:clinical});
 assert.ok(before.alerts.some(a=>a.risk.includes('Варфарин и апиксабан')));
 assert.equal(after.alerts.filter(a=>a.risk.includes('Варфарин')).length,0);
 assert.ok(after.alerts.some(a=>a.risk.includes('Апиксабан и системный НПВП')));
 const alternatives=checkMedicationRegimen({current:'ибупрофен\nметформин\nпантопразол',alternatives:'варфарин\nапиксабан\nривароксабан',context:clinical});
 assert.deepEqual(alternatives.alternatives.map(x=>x.alerts.length),[1,1,1]);
 assert.equal(alternatives.alerts.length,0);
});
test('coverage reports missing pairs even when every individual ingredient is recognized',()=>{
 const result=localDrugCoverage('лозартан\nибупрофен\nварфарин\nспиронолактон');
 assert.deepEqual(result.unrecognized,[]);
 assert.ok(result.unverifiedPairCount>=1);
 assert.ok(result.unverifiedPairs.some(s=>s.includes('лозартан')));
});

test('hypokalemia adds clinically relevant QT warning without fabricating ECG results',()=>{
 const clinical=extractMedicationSafetyContext('QTc: неизвестна\nКалий: 3,1 ммоль/л\nВозраст: 48 лет').context;
 const checked=checkMedicationRegimen({current:'моксифлоксацин\nметформин\nпантопразол',context:clinical});
 assert.equal(clinical.qtcMs,undefined);
 assert.ok(checked.organAlerts.some(a=>a.risk.includes('гипокалиемии')));
 assert.equal(checked.organAlerts.some(a=>a.risk.includes('выраженном удлинении QTc')),false);
});


/**
 * W5 safety fixtures are authored, synthetic counterexamples, not an estimate
 * of population sensitivity/specificity or a clinical model validation.
 */
test('W5: incompatible numeric units must not become contraindication-triggering facts',()=>{
 const cases=[
  {note:'Potassium: 6.0 mg/dL', key:'potassium',drug:'spironolactone'},
  {note:'QTc: 520 s',key:'qtcMs',drug:'moxifloxacin'},
  {note:'Age: 75 months',key:'ageYears',drug:'moxifloxacin'},
  {note:'eGFR: 24 mg/dL',key:'egfr',drug:'metformin'},
 ] as const;
 for(const item of cases){
  const result=extractMedicationSafetyContext(item.note);
  assert.equal(result.context[item.key],undefined,item.note);
  assert.ok(result.issues.length>=1,item.note);
  const checked=checkMedicationRegimen({current:item.drug,context:result.context});
  assert.equal(checked.organAlerts.length,0,'Do not derive organ contraindication from mislabelled measurement: '+item.note);
 }
});

test('W5: malformed or out-of-range reading invalidates the whole field, even if another value looks valid',()=>{
 const cases=[
  'СКФ: 25 мл/мин/1,73 м²\nСКФ: 999 мл/мин/1,73 м²',
  'СКФ: 25 мл/мин/1,73 м²\nСКФ: <30 мл/мин/1,73 м²',
  'Калий: 5,9 ммоль/л\nКалий: неизвестно',
  'QTc: 520 мс\nQTc: уточнить',
 ] as const;
 for(const note of cases){
  const parsed=extractMedicationSafetyContext(note);
  assert.equal(Object.values(parsed.context).length,0,note);
  assert.ok(parsed.issues.length>=1,note);
 }
 const egfr=extractMedicationSafetyContext(cases[0]);
 const checked=checkMedicationRegimen({current:'метформин',context:egfr.context});
 assert.ok(checked.missing.some(s=>s.includes('СКФ')));
 assert.equal(checked.organAlerts.length,0,'A contradictory record must not become verified renal failure');
});

test('W5: stale laboratory evidence and ambiguous bleeding status fail closed',()=>{
 const dated=extractMedicationSafetyContext('K+: 5.9 mmol/L yesterday\nQTc: 540 ms (previous result)');
 assert.equal(dated.context.potassium,undefined);
 assert.equal(dated.context.qtcMs,undefined);
 assert.equal(dated.issues.length,2);
 const bleeding=extractMedicationSafetyContext('Active bleeding: yes\nActive bleeding: pending');
 assert.equal(bleeding.context.activeBleeding,undefined);
 assert.ok(bleeding.issues.some(s=>s.includes('кровотечение')));
 const checked=checkMedicationRegimen({current:'apixaban',context:bleeding.context});
 assert.equal(checked.organAlerts.length,0);
 const contradictory=extractMedicationSafetyContext('Активное кровотечение: нет\nАктивное кровотечение: да');
 assert.equal(contradictory.context.activeBleeding,undefined);
 assert.ok(contradictory.issues.some(s=>s.includes('Противоречивые')));
});

test('W5: explicit current facts with valid units still drive expected organ safety checks',()=>{
 const note='Age: 75 years\neGFR: 39 mL/min/1.73 m2\nPotassium: 3.2 mmol/L\nQTc: 525 ms';
 const extracted=extractMedicationSafetyContext(note);
 assert.deepEqual(extracted.context,{egfr:39,potassium:3.2,qtcMs:525,ageYears:75});
 assert.deepEqual(extracted.issues,[]);
 const result=checkMedicationRegimen({current:'moxifloxacin + metformin',context:extracted.context});
 for(const needle of ['Метформин: при СКФ','QTc','гипокалиемии','сухожилий']){
  assert.ok(result.organAlerts.some(a=>a.risk.includes(needle)),needle);
 }
});

test('W5: valid duplicate readings and equivalent potassium units are not flagged as contradictions',()=>{
 const potassium=extractMedicationSafetyContext('Калий: 5,8 ммоль/л\nK+: 5.8 mEq/L');
 assert.equal(potassium.context.potassium,5.8);
 assert.deepEqual(potassium.issues,[]);
 const bleeding=extractMedicationSafetyContext('Active bleeding: no\nАктивное патологическое кровотечение: нет');
 assert.equal(bleeding.context.activeBleeding,false);
 assert.deepEqual(bleeding.issues,[]);
});

test('W5: dose text, a historical note and an unsupported comparison are never guessed as measurements',()=>{
 const parsed=extractMedicationSafetyContext('Назначен метформин 500 мг\nКалий: <5,0 ммоль/л\nСтарая запись: QTc 550 мс');
 assert.equal(parsed.context.potassium,undefined);
 assert.equal(parsed.context.qtcMs,undefined);
 assert.ok(parsed.issues.some(s=>s.includes('Калий')));
 assert.equal(checkMedicationRegimen({current:'moxifloxacin',context:parsed.context}).organAlerts.length,0);
});
