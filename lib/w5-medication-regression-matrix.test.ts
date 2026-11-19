import assert from 'node:assert/strict';
import test from 'node:test';
import {checkMedicationRegimen, type MedicationSeverity} from './drug-interaction-rules.ts';

/**
 * W5 / first offline clinical regression pack.
 *
 * These 30 fictional cases test only the *existing deterministic medication
 * checker*. No patient information, provider keys, model calls or browser.
 * A passing test is NOT proof of diagnosis, comprehensive interaction
 * detection, medical validity of a label, or independent clinical validation.
 *
 * To prevent silent false negatives and false positives, each expectation is
 * recorded explicitly. Add a fixture whenever a real clinical defect is fixed.
 */
type Regimen = Parameters<typeof checkMedicationRegimen>[0];
type Result = ReturnType<typeof checkMedicationRegimen>;
type ExpectedSignal = {
  kind: 'pair' | 'organ' | 'missing';
  contains: RegExp;
  severity?: MedicationSeverity;
};
type RiskCase = {
  id: string;
  vignette: string;
  input: Regimen;
  required: ExpectedSignal[];
};

const must = (kind: ExpectedSignal['kind'], contains: RegExp, severity?: MedicationSeverity): ExpectedSignal =>
  ({kind, contains, severity});

const highRiskCases: RiskCase[] = [
  {id:'R01',vignette:'AF, apixaban; a systemic NSAID is proposed',
   input:{current:'apixaban 5 mg',proposed:'ibuprofen 400 mg'},
   required:[must('pair',/Апиксабан и системный НПВП/,'major')]},
  {id:'R02',vignette:'Warfarin and a systemic NSAID',
   input:{current:'warfarin',proposed:'naproxen'},
   required:[must('pair',/Варфарин и НПВП/,'major')]},
  {id:'R03',vignette:'Sildenafil and an as-needed systemic nitrate',
   input:{current:'sildenafil',proposed:'nitroglycerin'},
   required:[must('pair',/Силденафил и нитраты/,'contraindicated')]},
  {id:'R04',vignette:'Rivaroxaban and an antiplatelet, indications need review',
   input:{current:'Xarelto',proposed:'aspirin'},
   required:[must('pair',/Ривароксабан и антиагрегант/,'major')]},
  {id:'R05',vignette:'Lithium with an ACE inhibitor',
   input:{current:'lithium',proposed:'enalapril',context:{egfr:60}},
   required:[must('pair',/Литий и ингибитор АПФ/,'major')]},
  {id:'R06',vignette:'Digoxin with amiodarone',
   input:{current:'digoxin',proposed:'Cordarone',context:{egfr:48}},
   required:[must('pair',/Дигоксин и амиодарон/,'major')]},
  {id:'R07',vignette:'Spironolactone plus trimethoprim',
   input:{current:'spironolactone',proposed:'trimethoprim',context:{egfr:38,potassium:4.8}},
   required:[must('pair',/Спиронолактон и триметоприм/,'major')]},
  {id:'R08',vignette:'QTc 520, potassium 3.2, moxifloxacin plus amiodarone',
   input:{current:'amiodarone',proposed:'moxifloxacin',context:{qtcMs:520,potassium:3.2,ageYears:67}},
   required:[must('pair',/удлинение QT/,'major'),must('organ',/выраженном удлинении QTc/,'major'),must('organ',/гипокалиемии/,'major')]},
  {id:'R09',vignette:'Simvastatin and clarithromycin',
   input:{current:'simvastatin',proposed:'clarithromycin'},
   required:[must('pair',/Симвастатин и некоторые макролиды/,'contraindicated')]},
  {id:'R10',vignette:'Colchicine with clarithromycin and CKD',
   input:{current:'colchicine',proposed:'clarithromycin',context:{egfr:26}},
   required:[must('pair',/токсичности колхицина/,'contraindicated')]},
  {id:'R11',vignette:'Metformin with eGFR 25',
   input:{current:'metformin',context:{egfr:25}},
   required:[must('organ',/СКФ <30/,'contraindicated')]},
  {id:'R12',vignette:'Proposed metformin initiation with eGFR 38',
   input:{current:'',proposed:'метформин',context:{egfr:38}},
   required:[must('organ',/начало при СКФ 30–44/,'major')]},
  {id:'R13',vignette:'Spironolactone with potassium 5.8',
   input:{current:'спиронолактон',context:{egfr:35,potassium:5.8}},
   required:[must('organ',/K\+ ≥5,5/,'contraindicated')]},
  {id:'R14',vignette:'Active bleeding while taking apixaban',
   input:{current:'apixaban',context:{activeBleeding:true}},
   required:[must('organ',/активное патологическое кровотечение/,'contraindicated')]},
  {id:'R15',vignette:'Active bleeding while taking rivaroxaban',
   input:{current:'rivaroxaban',context:{activeBleeding:true}},
   required:[must('organ',/активное патологическое кровотечение/,'contraindicated')]},
  {id:'R16',vignette:'Decompensated cirrhosis and simvastatin',
   input:{current:'simvastatin',context:{decompensatedCirrhosis:true}},
   required:[must('organ',/декомпенсированном циррозе/,'contraindicated')]},
  {id:'R17',vignette:'Severe hepatic impairment and apixaban',
   input:{current:'apixaban',context:{severeHepaticImpairment:true}},
   required:[must('organ',/тяжёлой печёночной недостаточности/,'major')]},
  {id:'R18',vignette:'Older adult prescribed a fluoroquinolone',
   input:{current:'moxifloxacin',context:{ageYears:72,qtcMs:420,potassium:4.1}},
   required:[must('organ',/Возраст >60 лет/,'monitor')]},
  {id:'R19',vignette:'Amiodarone plus moxifloxacin but no QTc available',
   input:{current:'amiodarone',proposed:'moxifloxacin'},
   required:[must('pair',/удлинение QT/,'major'),must('missing',/исходная QTc не указана/)]},
  {id:'R20',vignette:'Metformin with no renal function recorded',
   input:{current:'метформин'},
   required:[must('missing',/Метформин: СКФ не указана/)]},
];

for (const scenario of highRiskCases) {
  test('W5 risk '+scenario.id+': '+scenario.vignette, () => {
    const result = checkMedicationRegimen(scenario.input);
    for (const requirement of scenario.required) {
      const values = requirement.kind === 'pair' ? result.alerts :
        requirement.kind === 'organ' ? result.organAlerts : result.missing.map(risk => ({risk}));
      const hit = values.find(item =>
        requirement.contains.test(item.risk) &&
        (!requirement.severity || ('severity' in item && item.severity === requirement.severity)));
      assert.ok(hit,
        scenario.id+': missing expected '+requirement.kind+' signal '+requirement.contains+
        '; actual: '+JSON.stringify(values.map(item => item.risk)));
      if (requirement.kind !== 'missing' && hit && 'url' in hit) {
        assert.match(hit.url, /^https:\/\/dailymed\.nlm\.nih\.gov\//);
      }
    }
  });
}

const guardCases: Array<{
  id:string; vignette:string; input:Regimen; verify:(result:Result)=>void;
}> = [
  {id:'G01',vignette:'Unrelated renal impairment does not invent a metformin warning',
   input:{current:'apixaban',context:{egfr:22}},
   verify:r=>assert.equal(r.organAlerts.some(a=>/Метформин/.test(a.risk)),false)},
  {id:'G02',vignette:'Metformin with eGFR 75 has no false renal alert',
   input:{current:'metformin',context:{egfr:75}},
   verify:r=>assert.equal(r.organAlerts.length,0)},
  {id:'G03',vignette:'Spironolactone with potassium 4.3 has no hyperkalemia alert',
   input:{current:'spironolactone',context:{egfr:75,potassium:4.3}},
   verify:r=>assert.equal(r.organAlerts.length,0)},
  {id:'G04',vignette:'Explicit absence of bleeding does not become active bleeding',
   input:{current:'apixaban',context:{activeBleeding:false}},
   verify:r=>assert.equal(r.organAlerts.some(a=>/активное патологическое кровотечение/.test(a.risk)),false)},
  {id:'G05',vignette:'A stopped warfarin course is excluded from current combinations',
   input:{current:'warfarin\nibuprofen',stopped:'варфарин'},
   verify:r=>assert.equal(r.alerts.some(a=>/Варфарин/.test(a.risk)),false)},
  {id:'G06',vignette:'Two separately listed anticoagulant alternatives are not co-prescribed',
   input:{current:'',alternatives:'apixaban\nrivaroxaban'},
   verify:r=>{assert.equal(r.alerts.length,0);assert.equal(r.alternatives.length,2);
      assert.ok(r.alternatives.every(a=>a.alerts.length===0));}},
  {id:'G07',vignette:'Topical ibuprofen gel is not treated as systemic NSAID',
   input:{current:'apixaban',proposed:'ibuprofen гель'},
   verify:r=>assert.equal(r.alerts.length,0)},
  {id:'G08',vignette:'Ophthalmic ibuprofen is not treated as systemic NSAID',
   input:{current:'warfarin',proposed:'ibuprofen eye drops'},
   verify:r=>assert.equal(r.alerts.length,0)},
  {id:'G09',vignette:'An unverified drug pair must not be certified as safe',
   input:{current:'paracetamol\nlevothyroxine'},
   verify:r=>{assert.equal(r.alerts.length,0);assert.ok(r.coverage.unverifiedPairCount>0);}},
  {id:'G10',vignette:'An alternative is not combined with a separate proposed drug',
   input:{current:'warfarin',proposed:'amiodarone',alternatives:'moxifloxacin'},
   verify:r=>{assert.equal(r.alerts.length,0);assert.equal(r.alternatives.length,1);
      assert.ok(r.alternatives[0].alerts.some(a=>/Моксифлоксацин и варфарин/.test(a.risk)));
      assert.ok(r.alternatives[0].alerts.every(a=>!/удлинение QT/.test(a.risk)));}},
];

for (const scenario of guardCases) {
  test('W5 false-positive guard '+scenario.id+': '+scenario.vignette, () => {
    scenario.verify(checkMedicationRegimen(scenario.input));
  });
}

test('W5 pack definition: twenty must-detect cases and ten false-positive guards', () => {
  assert.equal(highRiskCases.length,20);
  assert.equal(guardCases.length,10);
  const ids = [...highRiskCases.map(c=>c.id),...guardCases.map(c=>c.id)];
  assert.equal(new Set(ids).size,30);
});
