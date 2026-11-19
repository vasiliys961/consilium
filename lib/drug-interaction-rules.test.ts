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
 assert.equal(coverage.recognized.length,3);assert.deepEqual(coverage.unrecognized,[]);assert.equal(coverage.ruleCount,26);
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
 assert.equal(separated.alternatives[0].alerts.length,1,'moxifloxacin retains its real interaction with current warfarin');
 assert.equal(separated.alternatives[0].alerts.some(a=>a.risk.includes('QT')),false,'moxifloxacin must not be tested against proposed amiodarone from another option');
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

test('C3: dual anticoagulant use is flagged, but a planned switch can mark the old agent stopped',()=>{
 const pairs:[string,string][]=[['варфарин','апиксабан'],['warfarin','Xarelto'],['Eliquis','rivaroxaban']];
 for(const [a,b] of pairs){
  const finding=knownDrugInteractions(a,b);
  assert.equal(finding.length,1,a+' / '+b);assert.equal(finding[0].severity,'major');
  assert.match(finding[0].risk,/кровотечения/);
  assert.match(finding[0].source,/ELIQUIS|XARELTO/);
 }
 assert.equal(checkMedicationRegimen({current:'варфарин',proposed:'апиксабан',stopped:'warfarin'}).alerts.length,0);
 const options=checkMedicationRegimen({current:'',alternatives:'апиксабан\nривароксабан'});
 assert.equal(options.alerts.length,0);
 assert.equal(options.alternatives.every(option=>option.alerts.length===0),true);
});

test('C3 post-audit regression: rivaroxaban and warfarin bleeding risks with NSAIDs / antiplatelets',()=>{
 for(const [a,b] of [['ривароксабан','ибупрофен'],['Xarelto','аспирин'],['варфарин','клопидогрель']] as const){
  const alerts=knownDrugInteractions(a,b);
  assert.equal(alerts.length,1,a+' + '+b);
  assert.equal(alerts[0].severity,'major');
  assert.ok(alerts[0].source&&alerts[0].section&&alerts[0].mechanism);
 }
 assert.equal(knownDrugInteractions('ривароксабан','ибупрофен гель').length,0);
});

test('W5: renal and active-bleeding contraindications are assessed in alternatives separately',()=>{
 const result=checkMedicationRegimen({
  current:'warfarin',alternatives:'metformin\napixaban',
  context:{egfr:24,activeBleeding:true},
 });
 assert.equal(result.alternatives.length,2);
 assert.equal(result.organAlerts.length,0);
 assert.ok(result.alternatives[0].organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('СКФ')));
 assert.equal(result.alternatives[0].alerts.length,0,'metformin is not combined with the other option');
 assert.ok(result.alternatives[1].organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('кровотечение')));
 assert.ok(result.alternatives[1].alerts.some(a=>a.risk.includes('Варфарин и апиксабан')));
 assert.ok(!result.alternatives[1].organAlerts.some(a=>a.risk.includes('Метформин')));
});

test('W5: baseline safety warnings are not duplicated in every option',()=>{
 const result=checkMedicationRegimen({
  current:'metformin',alternatives:'apixaban\nrivaroxaban',
  context:{egfr:20,activeBleeding:true},
 });
 assert.ok(result.organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('Метформин')));
 assert.equal(result.alternatives.length,2);
 for(const option of result.alternatives){
  assert.ok(option.organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('кровотечение')));
  assert.equal(option.organAlerts.some(a=>a.risk.includes('Метформин')),false);
 }
 assert.equal(result.alternatives.some(a=>a.alerts.some(x=>x.risk.includes('Апиксабан и ривароксабан'))),false);
});

test('W5: potassium, QTc and hepatic risks reach their own alternative, not other options',()=>{
 const result=checkMedicationRegimen({
  current:'',alternatives:'spironolactone\nmoxifloxacin\nsimvastatin',
  context:{potassium:5.8,qtcMs:530,decompensatedCirrhosis:true},
 });
 const [potassium,qt,liver]=result.alternatives;
 assert.ok(potassium.organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('гиперкалиемия')));
 assert.ok(qt.organAlerts.some(a=>a.risk.includes('QTc')));
 assert.ok(liver.organAlerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('Симвастатин')));
 assert.equal(potassium.organAlerts.some(a=>a.risk.includes('QTc')),false);
 assert.equal(qt.organAlerts.some(a=>a.risk.includes('Симвастатин')),false);
});

test('W5: missing renal context and unknown option ingredients remain visible',()=>{
 const result=checkMedicationRegimen({current:'',alternatives:'metformin\nunknown-synthetic-medicine'});
 assert.ok(result.alternatives[0].missing.some(v=>v.includes('СКФ')));
 assert.deepEqual(result.alternatives[1].unrecognized,['unknown-synthetic-medicine']);
 assert.deepEqual(result.alternatives[0].alerts,[]);
});

test('W5: a contextual drug pair inside one alternative retains high severity',()=>{
 const result=checkMedicationRegimen({
  current:'',alternatives:'колхицин + кларитромицин\nwarfarin',
  context:{egfr:22},
 });
 assert.equal(result.alternatives.length,2);
 assert.ok(result.alternatives[0].alerts.some(a=>a.severity==='contraindicated'&&a.risk.includes('колхицина')));
 assert.equal(result.alternatives[1].alerts.length,0);
});

test('W5: proposed main treatment does not leak into an alternative',()=>{
 const result=checkMedicationRegimen({
  current:'warfarin',proposed:'amiodarone',alternatives:'moxifloxacin',
 });
 assert.ok(result.alternatives[0].alerts.some(a=>a.risk.includes('варфарин')));
 assert.equal(result.alternatives[0].alerts.some(a=>a.risk.includes('QT')),false);
});

test('W5: ophthalmic/topical products cannot trigger systemic single-drug alerts',()=>{
 const result=checkMedicationRegimen({
  current:'moxifloxacin eye drops',alternatives:'moxifloxacin ophthalmic\nspironolactone topical',
  context:{qtcMs:530,potassium:5.8},
 });
 assert.equal(result.organAlerts.length,0);
 assert.ok(result.alternatives.every(a=>a.organAlerts.length===0));
 assert.ok(result.alternatives.every(a=>a.alerts.length===0));
});
