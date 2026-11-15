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
 assert.equal(coverage.recognized.length,2);assert.deepEqual(coverage.unrecognized,['Метформин']);assert.equal(coverage.ruleCount,13);
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
