import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';

/** Physician-oriented adversarial screening using actual C3 code, no LLM, HTTP, patient data or cost. */
const fourDrugCases=[
 {
  id:'01_HFrEF_CKD_HYPERK',
  current:'лозартан 50 мг\nспиронолактон 25 мг\nкалия хлорид\nфуросемид',
  context:{egfr:27,potassium:5.9},expectedPairs:2,organTerms:['гиперкалиемия'],uncovered:['фуросемид']
 },
 {
  id:'02_WARFARIN_TWO_NSAIDS',
  current:'варфарин\nибупрофен\nнапроксен\nпантопразол',
  context:{egfr:74},expectedPairs:2,organTerms:[],uncovered:['пантопразол']
 },
 {
  id:'03_QT_DIGOXIN_POLYPHARMACY',
  current:'амиодарон\nдигоксин\nмоксифлоксацин\nбисопролол',
  context:{qtcMs:520,ageYears:68,egfr:55},expectedPairs:2,organTerms:['QTc','сухожилий'],uncovered:['бисопролол']
 },
 {
  id:'04_CKD_COLCHICINE_MACROLIDE',
  current:'колхицин\nкларитромицин\nметформин\nамлодипин',
  context:{egfr:23},expectedPairs:1,organTerms:['Метформин'],uncovered:['амлодипин']
 },
 {
  id:'05_APIXABAN_ANTIPLATELET_NSAID',
  current:'апиксабан\nаспирин\nклопидогрел\nибупрофен',
  context:{egfr:80},expectedPairs:3,organTerms:[],uncovered:[]
 },
 {
  id:'06_LITHIUM_ACEI_NSAID_CKD',
  current:'литий\nэналаприл\nибупрофен\nметформин',
  context:{egfr:42},expectedPairs:2,organTerms:['Метформин'],uncovered:[]
 },
 {
  id:'07_CLARITHROMYCIN_SIMVASTATIN_LURASIDONE',
  current:'кларитромицин\nсимвастатин\nлуразидон\nметформин',
  context:{egfr:85},expectedPairs:2,organTerms:[],uncovered:[]
 },
 {
  id:'08_RIVAROXABAN_NSAID_ASPIRIN',
  current:'ривароксабан\nибупрофен\nаспирин\nметформин',
  context:{egfr:85},expectedPairs:2,organTerms:[],uncovered:[]
 },
 {
  id:'09_WARFARIN_DUAL_ANTIPLATELET',
  current:'варфарин\nаспирин\nклопидогрел\nметформин',
  context:{egfr:80},expectedPairs:2,organTerms:[],uncovered:[]
 },
] as const;
for(const item of fourDrugCases){
 test('C3 audit '+item.id,()=>{
  const output=checkMedicationRegimen({current:item.current,context:item.context});
  const info={id:item.id,pairs:output.alerts.map(a=>({first:a.first,second:a.second,severity:a.severity,source:a.url})),organ:output.organAlerts.map(a=>a.risk),uncovered:output.coverage.unrecognized};
  console.log('C3_AUDIT '+JSON.stringify(info));
  assert.equal(output.alerts.length,item.expectedPairs,'Clinically material co-medications were missed or invented: '+item.id);
  for(const expected of item.organTerms)assert.ok(output.organAlerts.some(a=>a.risk.includes(expected)),'Missing organ factor '+expected);
  for(const expected of item.uncovered)assert.ok(output.coverage.unrecognized.includes(expected),'Uncovered medicine incorrectly claimed recognized: '+expected);
  for(const alert of output.alerts){assert.match(alert.url,/^https:\/\/dailymed\.nlm\.nih\.gov\//);assert.ok(alert.action&&alert.mechanism&&alert.monitoring&&alert.section);}
 });
}
test('C3 audit 10_ANTICOAGULANT_SWITCH keeps NSAID risk after stopping warfarin',()=>{
 const withoutStop=checkMedicationRegimen({current:'варфарин\nибупрофен\nбисопролол',proposed:'апиксабан'});
 const withStop=checkMedicationRegimen({current:'варфарин\nибупрофен\nбисопролол',proposed:'апиксабан',stopped:'warfarin'});
 console.log('C3_AUDIT '+JSON.stringify({id:'10_ANTICOAGULANT_SWITCH',before:withoutStop.alerts.map(a=>a.risk),after:withStop.alerts.map(a=>a.risk)}));
 assert.equal(withoutStop.alerts.length,3);
 assert.equal(withStop.alerts.length,1);
 assert.match(withStop.alerts[0].risk,/Апиксабан.*НПВП/);
});
test('C3 audit 11_ALTERNATIVES three anticoagulants are never co-prescribed',()=>{
 const result=checkMedicationRegimen({current:'ибупрофен\nомепразол\nметформин',alternatives:'варфарин\nапиксабан\nривароксабан',context:{egfr:84}});
 const counts=result.alternatives.map(x=>x.alerts.length);
 console.log('C3_AUDIT '+JSON.stringify({id:'11_ALTERNATIVES',baseline:result.alerts.length,counts,risks:result.alternatives.map(x=>x.alerts.map(a=>a.risk))}));
 assert.equal(result.alerts.length,0,'Alternatives must not be automatically co-administered');
 assert.deepEqual(counts,[1,1,1],'Each alternative must be separately screened against continuing ibuprofen');
});
test('C3 audit 12_TOPICAL_NSAID no false systemic interaction',()=>{
 const result=checkMedicationRegimen({current:'апиксабан\nибупрофен гель\nметформин\nлозартан',context:{egfr:78}});
 console.log('C3_AUDIT '+JSON.stringify({id:'12_TOPICAL_NSAID',pairs:result.alerts.length,uncovered:result.coverage.unrecognized}));
 assert.equal(result.alerts.length,0);
 assert.ok(result.coverage.unrecognized.includes('ибупрофен гель'),'Topical formulation must not be considered validated for systemic DDI rules');
});
