import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,readCases,exportCase} from './casebook.ts';
import {extractMedicationSafetyContext} from './medication-context.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';
import {runConsilium} from './consilium.ts';
import type {MedicationContext} from './drug-interaction-rules.ts';

// Expected checks are specified independently of the implementation output.
// Diagnostic questions are deliberately NOT graded by these local rules.
// This is not an expert gold standard or a LIVE_LLM benchmark.
type Scenario={id:string;input:string;current:string;proposed?:string;stopped?:string;alternatives?:string;facts?:MedicationContext;risks:string[];missing?:string;clinicalQuestion:string};
const cases:Scenario[]=[
 {id:'W5-01 AF',input:'Age: 78 years',current:'apixaban\naspirin',facts:{ageYears:78},risks:['антиагрегант'],clinicalQuestion:'Stroke prevention indication and individualized bleeding risk'},
 {id:'W5-02 HF/CKD',input:'СКФ: 28 мл/мин/1,73 м²\nКалий: 5,9 ммоль/л',current:'spironolactone\nlosartan\nfurosemide',facts:{egfr:28,potassium:5.9},risks:['повышающие калий','K+ ≥5,5'],clinicalQuestion:'Decompensation and renal/potassium management'},
 {id:'W5-03 QT',input:'QTc: 515 ms',current:'moxifloxacin\namiodarone',facts:{qtcMs:515},risks:['удлинение QT','выраженном удлинении QTc'],clinicalQuestion:'Arrhythmia risk and alternative antibiotic'},
 {id:'W5-04 AV block',input:'Synthetic bradycardia and reported AV block; heart rate not measured by this test.',current:'metoprolol\nverapamil',risks:[],clinicalQuestion:'Urgent bradycardia/AV block evaluation: NOT covered by these local rules'},
 {id:'W5-05 bleeding',input:'Active pathological bleeding: yes',current:'rivaroxaban',facts:{activeBleeding:true},risks:['активное патологическое кровотечение'],clinicalQuestion:'Urgent bleeding assessment'},
 {id:'W5-06 dyspnea',input:'Synthetic sudden dyspnea; no examination or imaging findings supplied.',current:'',risks:[],clinicalQuestion:'PE, ACS, pneumothorax and other dangerous alternatives: NOT locally assessed'},
 {id:'W5-07 pneumonia',input:'Synthetic suspected pneumonia. QTc: unknown',current:'moxifloxacin',risks:[],clinicalQuestion:'Severity, missing vitals and confirmation of pneumonia'},
 {id:'W5-08 COPD',input:'Synthetic COPD exacerbation. Age: unknown',current:'moxifloxacin\nprednisone',risks:['тендинита и разрыва сухожилий'],clinicalQuestion:'Respiratory failure, alternative diagnoses and antibiotic indication'},
 {id:'W5-09 possible PE',input:'Synthetic pleuritic chest pain and dyspnea. No CTPA or D-dimer provided.',current:'apixaban',risks:[],clinicalQuestion:'Do not exclude PE from absent data or anticoagulant use'},
 {id:'W5-10 severe CKD',input:'eGFR: 23 mL/min/1.73 m2',current:'metformin',facts:{egfr:23},risks:['Метформин: СКФ <30'],clinicalQuestion:'Verify renal measurement and medication indication'},
 {id:'W5-11 hyperkalemia',input:'K+: 6.1 mmol/L',current:'spironolactone\npotassium chloride\nlosartan',facts:{potassium:6.1},risks:['повышающие калий','добавка калия','K+ ≥5,5'],clinicalQuestion:'Urgent potassium/ECG reassessment'},
 {id:'W5-12 conflicting renal values',input:'eGFR: 23\neGFR: 80',current:'metformin',risks:[],missing:'СКФ не указана',clinicalQuestion:'Resolve discordant renal measurements before interpreting risk'},
 {id:'W5-13 hypokalemia',input:'K+: 3.1 mmol/L',current:'moxifloxacin',facts:{potassium:3.1},risks:['гипокалиемии'],clinicalQuestion:'Current electrolytes and arrhythmia risk'},
 {id:'W5-14 polypharmacy',input:'eGFR: 42',current:'lithium\nibuprofen\nenalapril\namlodipine\npantoprazole',facts:{egfr:42},risks:['Литий и системный НПВП','Литий и ингибитор'],clinicalQuestion:'Lithium concentration, kidney injury and full regimen review'},
 {id:'W5-15 alternatives',input:'eGFR: 80',current:'ibuprofen',alternatives:'warfarin\napixaban',facts:{egfr:80},risks:[],clinicalQuestion:'Options are mutually exclusive, not simultaneous anticoagulation'},
 {id:'W5-16 stopped medicine',input:'Active bleeding: no',current:'warfarin\nibuprofen',proposed:'apixaban',stopped:'warfarin',facts:{activeBleeding:false},risks:['Апиксабан и системный НПВП'],clinicalQuestion:'Verify switching timing without treating stopped warfarin as current'},
 {id:'W5-17 hepatic impairment',input:'Decompensated cirrhosis: yes\nSevere hepatic impairment: yes',current:'simvastatin\napixaban',facts:{decompensatedCirrhosis:true,severeHepaticImpairment:true},risks:['декомпенсированном циррозе','тяжёлой печёночной недостаточности'],clinicalQuestion:'Confirm hepatic status and treatment options'},
 {id:'W5-18 incomplete bleeding history',input:'Active bleeding: unknown',current:'apixaban\naspirin',risks:['антиагрегант'],clinicalQuestion:'Unknown bleeding history must not become a negative finding'},
 {id:'W5-19 missing renal measurement',input:'No laboratory results supplied.',current:'metformin',risks:[],missing:'СКФ не указана',clinicalQuestion:'Missing eGFR is not normal eGFR'},
 {id:'W5-20 negative medication history',input:'Не принимает варфарин. Active bleeding: no',current:'ibuprofen',stopped:'warfarin',risks:[],clinicalQuestion:'Preserve medication negation; no invented coadministration'},
 {id:'W5-21 conflicting potassium',input:'Калий: 4,0 ммоль/л\nКалий: 6,2 ммоль/л',current:'spironolactone',risks:[],missing:'калий не указан',clinicalQuestion:'Resolve conflicting potassium, do not select a normal value'},
 {id:'W5-22 OCR ambiguity',input:'СКФ: 8O мл/мин/1,73 м²\nКалий: ? ммоль/л',current:'metformin',risks:[],missing:'СКФ не указана',clinicalQuestion:'Check original document; do not repair OCR digits by guessing'},
 {id:'W5-23 follow-up',input:'K+: 5.9 mmol/L',current:'spironolactone',facts:{potassium:5.9},risks:['K+ ≥5,5'],clinicalQuestion:'New abnormal potassium changes risk while earlier results remain historical'},
 {id:'W5-24 unavailable specialists',input:'Synthetic consultation; no specialist response available.',current:'',risks:[],clinicalQuestion:'No completed opinions may be invented after provider failure'},
 {id:'W5-25 unsupported material',input:'Synthetic unsupported attachment; content not read.',current:'',risks:[],clinicalQuestion:'Unread material is not a normal finding; preserve original and draft'},
];

for(const scenario of cases)test('W5 local case continuity '+scenario.id,async()=>{
 const extracted=extractMedicationSafetyContext(scenario.input);
 for(const [key,value] of Object.entries(scenario.facts??{}))assert.equal(extracted.context[key as keyof MedicationContext],value);
 const checked=checkMedicationRegimen({...scenario,context:extracted.context});
 const actual=[...checked.alerts,...checked.organAlerts].map(a=>a.risk);
 const fn=scenario.risks.filter(expected=>!actual.some(risk=>risk.includes(expected)));
 const fp=actual.filter(risk=>!scenario.risks.some(expected=>risk.includes(expected)));
 assert.deepEqual(fn,[],'Missing expected local finding');
 assert.deepEqual(fp,[],'Unexpected local finding');
 if(scenario.missing)assert.ok(checked.missing.some(text=>text.includes(scenario.missing!)));
 if(scenario.alternatives)assert.deepEqual(checked.alternatives.map(option=>option.alerts.length),[1,1]);
 if(scenario.id.startsWith('W5-23')){
  const old=checkMedicationRegimen({current:scenario.current,context:{potassium:4}});
  assert.equal(old.organAlerts.length,0);assert.equal(checked.organAlerts.length,1);
 }
 if(scenario.id.startsWith('W5-24')){
  const voices=await runConsilium({OPENROUTER_API_KEY:'SYNTHETIC_NO_NETWORK'},
   {locale:'en',note:scenario.input,draft:'Synthetic unsigned draft',citations:[],modalities:[]},
   async()=>Response.json({error:{message:'Synthetic unavailable'}},{status:503}));
  assert.ok(voices.length>0);assert.ok(voices.every(voice=>voice.status!=='done'));
 }
 const value=newCase();value.title=scenario.id;value.context=scenario.input;value.currentMedications=scenario.current;
 value.workspaceDraft={question:scenario.clinicalQuestion,note:'Synthetic unsent note',decision:'Synthetic unapproved decision',tab:'analysis'};
 if(scenario.id.startsWith('W5-25'))value.files=[{name:'synthetic-unsupported.xyz',sha256:'f'.repeat(64)}];
 await persistCase(value);
 const reopened=(await readCases()).find(item=>item.id===value.id)!;
 assert.deepEqual(reopened,value);assert.ok(exportCase(reopened).includes(scenario.clinicalQuestion));
 console.log('W5_CASE '+JSON.stringify({id:scenario.id,evidence:'LOCAL_RULES',input:scenario.input,expectedLocalRisks:scenario.risks,extracted:extracted.context,issues:extracted.issues,actual,localFN:fn.length,localFP:fp.length,reopened:true,clinicalQuestion:scenario.clinicalQuestion,diagnosticReasoning:'NOT_TESTED',clinicalFN:null,clinicalFP:null}));
});
