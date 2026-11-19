import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMedicationRegimen,type MedicationSeverity} from './drug-interaction-rules.ts';
import {extractMedicationSafetyContext} from './medication-context.ts';

/**
 * This is a deliberately small, curated engineering regression matrix.
 * "Positive" means expected to trigger this specific existing local rule;
 * "negative" means this exact local alert should not be raised.
 * It does NOT estimate true clinical sensitivity or specificity.
 */
type Fixture={
 id:string;positive:boolean;scope:'pair'|'organ';risk:string;
 severity?:MedicationSeverity;
 current:string;proposed?:string;stopped?:string;alternatives?:string;facts?:string;
 issueExpected?:boolean;
};
const fixtures:ReadonlyArray<Fixture>=[
 // Dangerous signals: expected local rule matches.
 {id:'P01-nitrates-pde5',positive:true,scope:'pair',current:'sildenafil',proposed:'nitroglycerin',risk:'Силденафил и нитраты',severity:'contraindicated'},
 {id:'P02-simvastatin-macrolide',positive:true,scope:'pair',current:'simvastatin',proposed:'clarithromycin',risk:'Симвастатин и некоторые макролиды',severity:'contraindicated'},
 {id:'P03-warfarin-nsaid',positive:true,scope:'pair',current:'warfarin',proposed:'ibuprofen',risk:'Варфарин и НПВП',severity:'major'},
 {id:'P04-spironolactone-raas',positive:true,scope:'pair',current:'spironolactone',proposed:'losartan',risk:'Спиронолактон и препараты',severity:'monitor'},
 {id:'P05-metformin-renal',positive:true,scope:'organ',current:'metformin',facts:'eGFR: 25 mL/min/1.73 m2',risk:'Метформин: СКФ',severity:'contraindicated'},
 {id:'P06-spironolactone-potassium',positive:true,scope:'organ',current:'spironolactone',facts:'Potassium: 5.8 mmol/L',risk:'Спиронолактон: K+',severity:'contraindicated'},
 {id:'P07-apixaban-bleeding',positive:true,scope:'organ',current:'apixaban',facts:'Active pathological bleeding: yes',risk:'активное патологическое кровотечение',severity:'contraindicated'},
 {id:'P08-moxi-long-qtc',positive:true,scope:'organ',current:'moxifloxacin',facts:'QTc: 530 ms',risk:'выраженном удлинении QTc',severity:'major'},
 {id:'P09-moxi-low-potassium',positive:true,scope:'organ',current:'moxifloxacin',facts:'K+: 3.2 mmol/L',risk:'гипокалиемии',severity:'major'},
 {id:'P10-colchicine-macrolide-renal',positive:true,scope:'pair',current:'colchicine',proposed:'clarithromycin',facts:'eGFR: 26 mL/min',risk:'Кларитромицин и колхицин',severity:'contraindicated'},
 {id:'P11-simvastatin-cirrhosis',positive:true,scope:'organ',current:'simvastatin',facts:'Decompensated cirrhosis: yes',risk:'Симвастатин противопоказан',severity:'contraindicated'},
 {id:'P12-warfarin-clopidogrel',positive:true,scope:'pair',current:'warfarin',proposed:'clopidogrel',risk:'Варфарин и антиагрегант',severity:'major'},
 {id:'P13-lithium-naproxen',positive:true,scope:'pair',current:'lithium',proposed:'naproxen',risk:'Литий и системный НПВП',severity:'major'},
 {id:'P14-rivaroxaban-nsaid',positive:true,scope:'pair',current:'rivaroxaban',proposed:'ibuprofen',risk:'Ривароксабан и системный НПВП',severity:'major'},
 // Negative controls: avoid manufacturing this specific risk from insufficient context.
 {id:'N01-metformin-normal-renal',positive:false,scope:'organ',current:'metformin',facts:'eGFR: 70 mL/min',risk:'Метформин: СКФ',severity:'contraindicated'},
 {id:'N02-spironolactone-normal-potassium',positive:false,scope:'organ',current:'spironolactone',facts:'K+: 4.4 mmol/L',risk:'Спиронолактон: K+',severity:'contraindicated'},
 {id:'N03-bleeding-explicitly-absent',positive:false,scope:'organ',current:'apixaban',facts:'Active pathological bleeding: no',risk:'активное патологическое кровотечение',severity:'contraindicated'},
 {id:'N04-moxi-normal-qtc',positive:false,scope:'organ',current:'moxifloxacin',facts:'QTc: 430 ms',risk:'выраженном удлинении QTc',severity:'major'},
 {id:'N05-topical-nsaid',positive:false,scope:'pair',current:'apixaban',proposed:'ibuprofen gel',risk:'Апиксабан и системный НПВП',severity:'major'},
 {id:'N06-stopped-warfarin',positive:false,scope:'pair',current:'warfarin',proposed:'ibuprofen',stopped:'warfarin',risk:'Варфарин и НПВП',severity:'major'},
 {id:'N07-colchicine-macrolide-no-renal',positive:false,scope:'pair',current:'colchicine',proposed:'clarithromycin',facts:'eGFR: 74 mL/min',risk:'Кларитромицин и колхицин',severity:'contraindicated'},
 {id:'N08-metformin-wrong-renal-unit',positive:false,scope:'organ',current:'metformin',facts:'eGFR: 25 mg/dL',risk:'Метформин: СКФ',severity:'contraindicated',issueExpected:true},
 {id:'N09-spironolactone-wrong-potassium-unit',positive:false,scope:'organ',current:'spironolactone',facts:'K+: 5.8 mg/dL',risk:'Спиронолактон: K+',severity:'contraindicated',issueExpected:true},
 {id:'N10-moxi-wrong-qtc-unit',positive:false,scope:'organ',current:'moxifloxacin',facts:'QTc: 520 s',risk:'выраженном удлинении QTc',severity:'major',issueExpected:true},
 {id:'N11-bleeding-undetermined',positive:false,scope:'organ',current:'apixaban',facts:'Active pathological bleeding: pending',risk:'активное патологическое кровотечение',severity:'contraindicated',issueExpected:true},
 {id:'N12-alternative-anticoagulants',positive:false,scope:'pair',current:'',alternatives:'apixaban\nrivaroxaban',risk:'Апиксабан и ривароксабан',severity:'major'},
 {id:'N13-topical-warfarin',positive:false,scope:'pair',current:'warfarin',proposed:'ibuprofen ophthalmic',risk:'Варфарин и НПВП',severity:'major'},
 {id:'N14-contradictory-renal',positive:false,scope:'organ',current:'metformin',facts:'eGFR: 25 mL/min\neGFR: 999 mL/min',risk:'Метформин: СКФ',severity:'contraindicated',issueExpected:true},
];

function runFixture(fixture:Fixture){
 const extracted=extractMedicationSafetyContext(fixture.facts??'');
 const checked=checkMedicationRegimen({
  current:fixture.current,proposed:fixture.proposed,stopped:fixture.stopped,
  alternatives:fixture.alternatives,context:extracted.context,
 });
 const source=fixture.scope==='pair'?checked.alerts:checked.organAlerts;
 const detected=source.some(a=>a.risk.includes(fixture.risk)&&
  (fixture.severity===undefined||a.severity===fixture.severity));
 return {detected,extracted,source,checked};
}
for(const fixture of fixtures){
 test('W5 offline fixture '+fixture.id,()=>{
  const {detected,extracted,source}=runFixture(fixture);
  assert.equal(detected,fixture.positive,fixture.id+
   ': expected='+fixture.positive+', observed='+detected+', available='+source.map(a=>a.risk+' ('+a.severity+')').join('; '));
  if(fixture.issueExpected)assert.ok(extracted.issues.length>=1,fixture.id+': issue should be visible');
  if(fixture.positive){
   const alert=source.find(a=>a.risk.includes(fixture.risk)&&(!fixture.severity||a.severity===fixture.severity));
   assert.ok(alert?.section&&alert.url.startsWith('https://dailymed.nlm.nih.gov/'),fixture.id+': local source metadata required');
  }
 });
}
test('W5 offline acceptance summary: 14 targeted positives and 14 negatives, no fixture mismatches',()=>{
 const positives=fixtures.filter(f=>f.positive),negatives=fixtures.filter(f=>!f.positive);
 const missed=positives.filter(f=>!runFixture(f).detected).map(f=>f.id);
 const unexpected=negatives.filter(f=>runFixture(f).detected).map(f=>f.id);
 const summary={positiveFixtures:positives.length,negativeFixtures:negatives.length,missedFixtureSignals:missed,
  unexpectedFixtureSignals:unexpected,source:'curated synthetic local fixtures, no real-world model inference'};
 console.log('W5_OFFLINE_SAFETY_MATRIX '+JSON.stringify(summary));
 assert.equal(positives.length,14);assert.equal(negatives.length,14);
 assert.deepEqual(missed,[]);assert.deepEqual(unexpected,[]);
});
