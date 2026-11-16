import assert from 'node:assert/strict';
import test from 'node:test';
import {knownDrugInteractions,localDrugCoverage,checkMedicationRegimen,checkProposedMedications} from './drug-interaction-rules.ts';

test('a proposed active ingredient is checked against current drugs, including aliases and doses',()=>{
  const alerts=knownDrugInteractions('Верошпирон 25 мг','Losartan 50 mg');
  assert.equal(alerts.length,1);
  assert.match(alerts[0].url,/0fed2822-3a03-4b64-9857-c682fcd462bc/);
  assert.match(alerts[0].action,/почек/);
  assert.equal(knownDrugInteractions('Верошпирон 25 мг','Наблюдение за Лозартаном').length,0);
  assert.deepEqual(knownDrugInteractions('spironolactone','losartan\ntrimethoprim\nLOSARTAN').map(alert=>alert.second.toLowerCase()),['losartan','trimethoprim']);
});

test('numbered prescriptions and plus-separated names are parsed; unsupported drugs are visible',()=>{
 assert.equal(knownDrugInteractions('1. таб. Варфарин 5 мг + Ибупрофен 200 мг').length,1);
 const coverage=localDrugCoverage('Верошпирон 25 мг, Лозартан 50 мг, Метформин');
 assert.equal(coverage.recognized.length,3);assert.deepEqual(coverage.unrecognized,[]);assert.equal(coverage.ruleCount,20);
});

test('C3: risk matrix has source-backed actionable signals and avoids route/lookalike false positives',()=>{
 const matrix:[string,string,number,string][]=[
  ['sildenafil','nitroglycerin',1,'contraindicated'],['Viagra','riociguat',1,'contraindicated'],
  ['Zocor','clarithromycin',1,'contraindicated'],['симвастатин','эритромицин',1,'contraindicated'],
  ['spironolactone','losartan',1,'monitor'],['Верошпирон','trimethoprim',1,'major'],
  ['варфарин','ibuprofen',1,'major'],['warfarin','кларитромицин',1,'major'],
  ['эликвис','ибупрофен',1,'major'],['apixaban','clopidogrel',1,'major'],
  ['apixaban','rifampin',1,'major'],['литий','naproxen',1,'major'],
  ['lithium','enalapril',1,'major'],['digoxin','амиодарон',1,'major'],
  ['warfarin','metformin',0,''],['warfarin','ibuprofen ophthalmic',0,''],
  ['warfarin','ibuprofen гель',0,''],['spironolactone','Наблюдение за Лозартаном',0,''],
  ['simvastatin','azithromycin',0,''],['apixaban','paracetamol',0,''],
 ];
 for(const [a,b,n,severity] of matrix){
  const found=knownDrugInteractions(a,b);assert.equal(found.length,n,a+' + '+b);
  if(n){assert.equal(found[0].severity,severity);assert.equal(found[0].relation,'current-proposed');assert.ok(found[0].source);assert.ok(found[0].section);assert.ok(found[0].monitoring);assert.match(found[0].url,/^https:\/\/dailymed/);}
 }
});
test('C3: current, proposed, stopped and alternative treatment are not mistaken for co-prescribing',()=>{
 assert.equal(knownDrugInteractions('warfarin + ibuprofen')[0].relation,'current-current');
 assert.equal(knownDrugInteractions('','warfarin + ibuprofen')[0].relation,'proposed-proposed');
 assert.equal(checkProposedMedications('warfarin + ibuprofen',['paracetamol']).length,0);
 const options=checkMedicationRegimen({current:'ibuprofen',alternatives:'warfarin\napixaban'});
 assert.equal(options.alerts.length,0);
 assert.equal(options.alternatives.length,2);
 assert.equal(options.alternatives[0].alerts.length,1);
 assert.equal(options.alternatives[1].alerts.length,1);
 const stopped=checkMedicationRegimen({current:'warfarin\nibuprofen',stopped:'варфарин'});
 assert.equal(stopped.alerts.length,0);
 assert.deepEqual(stopped.stopped,['варфарин']);
 const stillActive=checkMedicationRegimen({current:'warfarin + naproxen',stopped:'ibuprofen'});
 assert.equal(stillActive.alerts.length,1,'Stopping ibuprofen must not hide a warfarin–naproxen risk');
});
test('C3: same drug, different renal context changes action; liver warnings require stated context',()=>{
 const low=checkMedicationRegimen({current:'metformin',context:{egfr:26}});
 assert.equal(low.organAlerts[0].severity,'contraindicated');
 const start=checkMedicationRegimen({current:'',proposed:'метформин',context:{egfr:38}});
 assert.match(start.organAlerts[0].risk,/начало/);
 const continuing=checkMedicationRegimen({current:'metformin',context:{egfr:38}});
 assert.match(continuing.organAlerts[0].risk,/продолжения/);
 assert.equal(checkMedicationRegimen({current:'metformin',context:{egfr:65}}).organAlerts.length,0);
 assert.match(checkMedicationRegimen({current:'metformin'}).missing.join(' '),/СКФ/);
 assert.equal(checkMedicationRegimen({current:'simvastatin',context:{decompensatedCirrhosis:true}}).organAlerts[0].severity,'contraindicated');
 assert.match(checkMedicationRegimen({current:'apixaban',context:{severeHepaticImpairment:true}}).organAlerts[0].risk,/печёночной/);
 assert.equal(checkMedicationRegimen({current:'apixaban'}).organAlerts.length,0);
});

test('C3: official-label coverage adds QT, warfarin, steroid, colchicine, statin and antipsychotic signals',()=>{
 const cases:[string,string,string][]=[
  ['moxifloxacin','amiodarone','major'],['Авелокс','соталол','major'],
  ['моксифлоксацин','варфарин','major'],['moxifloxacin','преднизолон','major'],
  ['кларитромицин','колхицин','major'],['clarithromycin','lovastatin','contraindicated'],
  ['Клацид','луразидон','contraindicated'],['spironolactone','potassium chloride','major']
 ];
 for(const [a,b,severity] of cases){
  const result=knownDrugInteractions(a,b);
  assert.equal(result.length,1,a+' + '+b);assert.equal(result[0].severity,severity);
  assert.ok(result[0].mechanism);assert.ok(result[0].conditions);
  assert.match(result[0].url,/^https:\/\/dailymed/);
 }
 assert.equal(knownDrugInteractions('moxifloxacin','amiodarone eye drops').length,0);
});
test('C3: all simultaneous NSAIDs are reported; alternatives are NEVER combined with each other or a proposed plan',()=>{
 const pairs=knownDrugInteractions('warfarin','ibuprofen 200 mg\nnaproxen 250 mg');
 assert.equal(pairs.length,2);
 assert.deepEqual(pairs.map(x=>x.second),['ibuprofen 200 mg','naproxen 250 mg']);
 const separated=checkMedicationRegimen({current:'warfarin',proposed:'amiodarone',alternatives:'moxifloxacin\nibuprofen + naproxen'});
 assert.equal(separated.alternatives.length,2);
 assert.equal(separated.alternatives[0].alerts.length,0,'moxifloxacin should not be tested against proposed amiodarone from another option');
 assert.equal(separated.alternatives[1].alerts.length,2,'both drugs in one option tested against current warfarin');
});
test('C3: renal/hepatic impairment changes conditional colchicine risk, and aliases really stop drugs',()=>{
 const healthy=checkMedicationRegimen({current:'колхицин',proposed:'Клацид',context:{egfr:84}});
 assert.equal(healthy.alerts[0].severity,'major');
 const ckd=checkMedicationRegimen({current:'колхицин',proposed:'Клацид',context:{egfr:26}});
 assert.equal(ckd.alerts[0].severity,'contraindicated');
 const liver=checkMedicationRegimen({current:'colchicine',proposed:'clarithromycin',context:{severeHepaticImpairment:true}});
 assert.equal(liver.alerts[0].severity,'contraindicated');
 const stopped=checkMedicationRegimen({current:'Авелокс + Соталол',stopped:'moxifloxacin'});
 assert.equal(stopped.alerts.length,0);
 const potassium=checkMedicationRegimen({current:'spironolactone',context:{potassium:5.8,egfr:44}});
 assert.equal(potassium.organAlerts[0].severity,'contraindicated');
 const normal=checkMedicationRegimen({current:'spironolactone',context:{potassium:4.4,egfr:70}});
 assert.equal(normal.organAlerts.length,0);
 assert.ok(checkMedicationRegimen({current:'moxifloxacin',context:{qtcMs:520}}).organAlerts.some(a=>a.risk.includes('QTc')));
});
