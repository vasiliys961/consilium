import test from 'node:test';
import assert from 'node:assert/strict';
import {knownDrugInteractions,checkMedicationRegimen,localDrugCoverage} from './drug-interaction-rules.ts';
import {extractMedicationSafetyContext} from './medication-context.ts';

/**
 * 500 independent deterministic INPUT VARIATIONS (five groups x 100) for the
 * narrowly implemented C3 rules. All patients/data are fictional. No LLM, API
 * or external network. This is regression coverage, NOT external clinical
 * validation or proof that unrecognized pairs are safe.
 */
const pairAnchors=[
 {en:['sildenafil','nitroglycerin'],ru:['силденафил','нитроглицерин'],brand:['viagra','нитроглицерин'],doses:['50 мг','0,5 мг'],risk:'гипотензии'},
 {en:['simvastatin','clarithromycin'],ru:['симвастатин','кларитромицин'],brand:['зокор','clarithromycin'],doses:['20 мг','500 мг'],risk:'рабдомиолиза'},
 {en:['warfarin','ibuprofen'],ru:['варфарин','ибупрофен'],brand:['coumadin','ибупрофен'],doses:['5 мг','400 мг'],risk:'кровотечения'},
 {en:['apixaban','aspirin'],ru:['апиксабан','аспирин'],brand:['eliquis','аспирин'],doses:['5 мг','100 мг'],risk:'кровотечения'},
 {en:['rivaroxaban','clopidogrel'],ru:['ривароксабан','клопидогрел'],brand:['xarelto','клопидогрел'],doses:['20 мг','75 мг'],risk:'кровотечения'},
 {en:['digoxin','amiodarone'],ru:['дигоксин','амиодарон'],brand:['digoxin','кордарон'],doses:['0,125 мг','200 мг'],risk:'дигоксина'},
 {en:['lithium','enalapril'],ru:['литий','эналаприл'],brand:['литий','эналаприл'],doses:['300 мг','10 мг'],risk:'лития'},
 {en:['spironolactone','losartan'],ru:['спиронолактон','лозартан'],brand:['верошпирон','лозартан'],doses:['25 мг','50 мг'],risk:'гиперкалиемии'},
 {en:['moxifloxacin','sotalol'],ru:['моксифлоксацин','соталол'],brand:['авелокс','соталол'],doses:['400 мг','80 мг'],risk:'QT'},
 {en:['clarithromycin','colchicine'],ru:['кларитромицин','колхицин'],brand:['клацид','колхицин'],doses:['500 мг','0,5 мг'],risk:'колхицина'},
] as const;
const normalMedications=[
 'амлодипин','пантопразол','бисопролол','фуросемид','метформин',
 'левотироксин','аторвастатин','омепразол','парацетамол','витамин D',
];
const unknownMedications=[
 'барicitinib','ivermectin','levothyroxine','furosemide','bisoprolol',
 'pantoprazole','omeprazole','rosuvastatin','gabapentin','dulaglutide',
];
function labelledPair(index:number,variant:number):[string,string]{
 const p=pairAnchors[index];
 if(variant===0)return [p.en[0],p.en[1]];
 if(variant===1)return [p.ru[0],p.ru[1]];
 if(variant===2)return [p.brand[0],p.brand[1]];
 if(variant===3)return [p.en[0]+' '+p.doses[0],p.en[1]+' '+p.doses[1]];
 if(variant===4)return [p.ru[0]+' '+p.doses[0],p.ru[1]+' '+p.doses[1]];
 if(variant===5)return ['таб. '+p.brand[0]+' '+p.doses[0],p.brand[1]+' '+p.doses[1]];
 if(variant===6)return [p.en[0]+' per os',p.en[1]+' per os'];
 if(variant===7)return [p.ru[0]+' внутрь',p.ru[1]+' внутрь'];
 if(variant===8)return [p.en[0]+' '+p.doses[0]+' 1 раз/сут',p.en[1]+' '+p.doses[1]+' 1 раз/сут'];
 return [p.en[1],p.en[0]];
}

// A: 100 structured clinical-fact inputs (values, boundaries, aliases, languages).
for(let i=0;i<100;i++){
 test('C3 synthetic A context '+String(i+1).padStart(3,'0'),()=>{
  let note='',key:'egfr'|'potassium'|'qtcMs'|'ageYears'|'activeBleeding'|'decompensatedCirrhosis'|'severeHepaticImpairment';
  let expected:number|boolean;
  if(i<20){
   const v=17+i*3.5;note=(i%2?'eGFR':'СКФ')+': '+String(v).replace('.',i%3===0?',':'.')+' мл/мин/1,73 м²';
   key='egfr';expected=v;
  } else if(i<40){
   const v=Number((3.0+(i-20)*0.15).toFixed(2));
   note=(i%3===0?'K+':i%3===1?'Калий':'Potassium')+': '+String(v).replace('.',i%2?',':'.')+' ммоль/л';
   key='potassium';expected=v;
  }else if(i<60){
   const v=360+(i-40)*10;note='QTc: '+v+' мс';
   key='qtcMs';expected=v;
  }else if(i<80){
   const v=30+(i-60)*3;note=(i%2?'Age':'Возраст')+': '+v+(i%2?' years':' лет');
   key='ageYears';expected=v;
  }else if(i<90){
   key='activeBleeding';expected=i%2===0;
   note='Активное патологическое кровотечение: '+(expected?'да':'нет');
  }else if(i<95){
   key='decompensatedCirrhosis';expected=i%2===0;
   note='Декомпенсированный цирроз: '+(expected?'да':'нет');
  }else{
   key='severeHepaticImpairment';expected=i%2===0;
   note='Тяжёлая печёночная недостаточность: '+(expected?'подтверждена':'нет');
  }
  const parsed=extractMedicationSafetyContext('- '+note+'\nУточнение анамнеза: другие данные не представлены.');
  assert.equal(parsed.context[key],expected,'Explicit clinical fact must not be dropped or altered');
  assert.deepEqual(parsed.issues,[]);
 });
}

// B: 100 positive, source-attributed drug-pair detection cases with aliases/doses.
for(let i=0;i<100;i++){
 test('C3 synthetic B names-doses '+String(i+1).padStart(3,'0'),()=>{
  const anchor=Math.floor(i/10),variant=i%10;
  const [a,b]=labelledPair(anchor,variant);
  const alerts=knownDrugInteractions(a,b);
  assert.equal(alerts.length,1,'A known and documented pair was missed or duplicated: '+a+' / '+b);
  assert.ok(alerts[0].risk.includes(pairAnchors[anchor].risk),'Wrong clinical category');
  assert.equal(alerts[0].relation,'current-proposed');
  assert.ok(alerts[0].source.includes('DailyMed'));
  assert.match(alerts[0].url,/^https:\/\/dailymed\.nlm\.nih\.gov\//);
  assert.ok(alerts[0].monitoring&&alerts[0].mechanism&&alerts[0].section);
 });
}

// C: 100 actual 4-drug regimens; two known interacting plus two distractors.
for(let i=0;i<100;i++){
 test('C3 synthetic C four-drug regimen '+String(i+1).padStart(3,'0'),()=>{
  const index=Math.floor(i/10),variant=i%10;
  const [a,b]=labelledPair(index,variant);
  const bg1=normalMedications[variant],bg2=normalMedications[(variant+3)%10];
  const checked=checkMedicationRegimen({
   current:[a,b,bg1,bg2].join('\n'),
   context:{egfr:85,potassium:4.3,ageYears:45,qtcMs:420,activeBleeding:false},
  });
  assert.equal(checked.alerts.length,1,'Known pair must remain detectable in polypharmacy');
  assert.ok(checked.alerts[0].risk.includes(pairAnchors[index].risk));
  assert.ok(checked.coverage.unverifiedPairCount>=1,
   'A known pair must not imply that other drug combinations were verified safe');
 });
}

// D: 100 actual clinical threshold tests with distinct age/eGFR/K/QTc factors.
const egfrValues=[18,22,25,28,29,30,31,35,40,44,45,46,50,60,90,20,32,43,55,70];
const potassiumValues=[4.0,4.1,4.5,4.9,5.0,5.01,5.1,5.3,5.49,5.5,5.6,5.8,6,4.3,4.7,5.2,5.4,5.7,5.9,5.0];
for(let i=0;i<100;i++){
 test('C3 synthetic D patient-context '+String(i+1).padStart(3,'0'),()=>{
  if(i<20){
   const egfr=egfrValues[i],starting=i%2===0;
   const v=checkMedicationRegimen({current:starting?'амлодипин\nпантопразол':'метформин\nамлодипин\nпантопразол',
    proposed:starting?'метформин':'',context:{egfr}});
   const organ=v.organAlerts.filter(a=>a.drug.toLowerCase().includes('метформин'));
   assert.equal(organ.length,egfr<45?1:0);
   if(egfr<30)assert.equal(organ[0].severity,'contraindicated');
   else if(egfr<45)assert.equal(organ[0].severity,'major');
   if(egfr>=30&&egfr<45)assert.equal(organ[0].risk.includes('начало'),starting);
  }else if(i<40){
   const j=i-20,potassium=potassiumValues[j],starting=j%2===0;
   const v=checkMedicationRegimen({current:starting?'лозартан\nпантопразол':'спиронолактон\nлозартан\nпантопразол',
    proposed:starting?'спиронолактон':'',context:{egfr:66,potassium}});
   const alert=v.organAlerts.find(a=>a.drug.toLowerCase().includes('спиронолактон'));
   const flagged=potassium>=5.5||(potassium>5&&starting);
   assert.equal(Boolean(alert),flagged);
   if(potassium>=5.5)assert.equal(alert?.severity,'contraindicated');
   else if(potassium>5&&starting)assert.equal(alert?.severity,'major');
  }else if(i<60){
   const j=i-40,qtc=470+(j%8)*10,potassium=3.1+(j%5)*0.2,age=57+(j%7);
   const v=checkMedicationRegimen({current:'моксифлоксацин\nамиодарон\nбисопролол',context:{egfr:72,qtcMs:qtc,potassium,ageYears:age}});
   assert.equal(v.alerts.length,1);
   assert.equal(v.organAlerts.filter(a=>a.risk.includes('выраженном удлинении QTc')).length,qtc>=500?1:0);
   assert.equal(v.organAlerts.filter(a=>a.risk.includes('гипокалиемии')).length,potassium<3.5?1:0);
   assert.equal(v.organAlerts.filter(a=>a.risk.includes('Возраст >60')).length,age>60?1:0);
  }else if(i<80){
   const j=i-60,positive=j%2===0,drug=j<10?'апиксабан':'ривароксабан';
   const v=checkMedicationRegimen({current:[drug,'аспирин','метформин'].join('\n'),
    context:{egfr:76,activeBleeding:positive}});
   assert.equal(v.organAlerts.filter(a=>a.risk.includes('активное патологическое кровотечение')).length,positive?1:0);
   assert.equal(v.alerts.length,1);
  }else{
   const j=i-80,positive=j%2===0,simvastatin=j<10;
   const v=checkMedicationRegimen({current:[simvastatin?'симвастатин':'апиксабан','метформин','амлодипин'].join('\n'),
    context:{egfr:78,decompensatedCirrhosis:simvastatin&&positive,severeHepaticImpairment:!simvastatin&&positive}});
   const important=v.organAlerts.filter(a=>a.risk.includes('циррозе')||a.risk.includes('тяжёлой печёночной'));
   assert.equal(important.length,positive?1:0);
   if(positive)assert.equal(important[0].severity,simvastatin?'contraindicated':'major');
  }
 });
}

// E: 100 "do not hallucinate safety" / stop / alternatives / topical / missing-data cases.
const topicalForms=['ибупрофен гель','ibuprofen topical','диклофенак крем','diclofenac gel','naproxen ophthalmic'];
for(let i=0;i<100;i++){
 test('C3 synthetic E negative and options '+String(i+1).padStart(3,'0'),()=>{
  if(i<20){
   const bg=normalMedications[i%10];
   const v=checkMedicationRegimen({current:['варфарин','ибупрофен',bg].join('\n'),proposed:'апиксабан',stopped:'warfarin',
    context:{egfr:70,activeBleeding:false}});
   assert.equal(v.alerts.length,1);
   assert.ok(v.alerts[0].risk.includes('Апиксабан и системный НПВП'));
   assert.ok(!v.alerts.some(a=>a.risk.includes('Варфарин')));
  }else if(i<40){
   const j=i-20,a=unknownMedications[j%10],b=unknownMedications[(j+3)%10];
   const v=checkMedicationRegimen({current:a+'\n'+b,context:{egfr:90}});
   assert.deepEqual(v.alerts,[],'Uncovered must NOT automatically mean known-safe');
   assert.ok(v.coverage.unrecognized.includes(a));
   assert.ok(v.coverage.unrecognized.includes(b));
   assert.equal(v.coverage.unverifiedPairCount,1);
  }else if(i<60){
   const j=i-40,drug=['апиксабан','ривароксабан','варфарин','литий'][j%4];
   const topical=topicalForms[j%5];
   const v=checkMedicationRegimen({current:[drug,topical,'пантопразол'].join('\n'),context:{egfr:82}});
   assert.equal(v.alerts.length,0,'Topical formulation must not be silently treated as systemic');
   assert.ok(v.coverage.unrecognized.includes(topical));
  }else if(i<80){
   const j=i-60,bg=normalMedications[j%10];
   const v=checkMedicationRegimen({current:'ибупрофен\n'+bg,
    alternatives:'варфарин\nапиксабан\nривароксабан',context:{egfr:82}});
   assert.equal(v.alerts.length,0,'Alternatives must not interact with one another');
   assert.deepEqual(v.alternatives.map(a=>a.alerts.length),[1,1,1],
    'Each anticoagulant is screened with the separately continuing NSAID');
  }else if(i<90){
   const j=i-80,a=20+j,b=75+j;
   const note='СКФ: '+a+' мл/мин/1,73 м²\nСКФ: '+b+' мл/мин/1,73 м²';
   const clinical=extractMedicationSafetyContext(note);
   assert.equal(clinical.context.egfr,undefined,'Conflicting measures are not reconciled by guess');
   assert.ok(clinical.issues.some(s=>s.includes('СКФ')));
   const v=checkMedicationRegimen({current:'метформин\nамлодипин\nомепразол',context:clinical.context});
   assert.ok(v.missing.some(s=>s.includes('СКФ не указана')));
   assert.equal(v.organAlerts.length,0,'Do not invent renal contraindication from conflicting data');
  }else{
   const age=62+(i-90),egfr=20+(i-90);
   const freeText='Пациент '+age+' лет. В анамнезе ХБП, СКФ '+egfr+
    ' мл/мин/1,73 м². В терапии метформин; необходима оценка риска.';
   const clinical=extractMedicationSafetyContext(freeText);
   assert.equal(clinical.context.egfr,undefined,
    'This unsupported free-text pattern must not be claimed as parsed by current C3');
   const v=checkMedicationRegimen({current:'метформин\nамлодипин\nомепразол',context:clinical.context});
   assert.ok(v.missing.some(s=>s.includes('СКФ не указана')));
  }
 });
}
