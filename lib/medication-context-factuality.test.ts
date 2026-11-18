import test from 'node:test';
import assert from 'node:assert/strict';
import {extractMedicationSafetyContext} from './medication-context.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';

// Synthetic factuality regressions; expectations are fixed before extraction.
// LOCAL_RULES only: no model, diagnostic reasoning or clinical validation.
const accepted = [
 ['RU eGFR', 'СКФ: 23 мл/мин/1,73 м²', 'egfr', 23],
 ['EN eGFR', 'eGFR: 42 mL/min/1.73 m2', 'egfr', 42],
 ['bare eGFR', 'eGFR: 29', 'egfr', 29],
 ['RU potassium', 'Калий: 5,9 ммоль/л', 'potassium', 5.9],
 ['EN potassium', 'Potassium: 3.2 mmol/L', 'potassium', 3.2],
 ['equivalent potassium unit', 'K+: 5.6 mEq/L', 'potassium', 5.6],
 ['RU QTc', 'QTc: 515 мс', 'qtcMs', 515],
 ['EN QTc', 'QTc: 490 ms', 'qtcMs', 490],
 ['RU age', 'Возраст: 76 лет', 'ageYears', 76],
 ['EN age', 'Age: 68 years', 'ageYears', 68],
 ['duplicate result', 'eGFR: 23\neGFR: 23', 'egfr', 23],
 ['bullet decimal comma', '- K+: 5,70 ммоль/л', 'potassium', 5.7],
] as const;
for (const [id, input, key, expected] of accepted) test('W4 factuality accepts '+id, () => {
 const result=extractMedicationSafetyContext(input);
 assert.equal(result.context[key],expected);
 assert.deepEqual(result.issues,[]);
});
const rejected = [
 ['historical eGFR', 'eGFR: 80 mL/min/1.73 m2 (previous result)', 'egfr'],
 ['planned potassium', 'Калий: 4,0 ммоль/л — целевое значение, измерение запланировано', 'potassium'],
 ['negated QTc', 'QTc: 420 ms not measured', 'qtcMs'],
 ['age in months', 'Age: 72 months', 'ageYears'],
 ['potassium mass unit', 'K+: 4 mg/dL', 'potassium'],
 ['absolute GFR', 'eGFR: 25 mL/min', 'egfr'],
 ['QTc wrong unit', 'QTc: 500 seconds', 'qtcMs'],
 ['two values on one line', 'Калий: 4,0 ммоль/л; повторно 6,2 ммоль/л', 'potassium'],
 ['valid plus unknown', 'eGFR: 80\neGFR: unknown', 'egfr'],
 ['valid plus impossible', 'Калий: 4,0 ммоль/л\nКалий: 60 ммоль/л', 'potassium'],
 ['valid plus comparison', 'eGFR: 80\neGFR: <30', 'egfr'],
 ['late conflicting value', 'eGFR: 80\n'+'Synthetic clinical context. '.repeat(160)+'\neGFR: 23', 'egfr'],
 ['valid plus unrecognized unit', 'QTc: 420 ms\nQTc: 520 seconds', 'qtcMs'],
] as const;
for (const [id, input, key] of rejected) test('W4 factuality leaves unknown: '+id, () => {
 const result=extractMedicationSafetyContext(input);
 assert.equal(result.context[key],undefined);
 assert.ok(result.issues.length>0,'Explain why an explicit field cannot be used');
 if(key==='egfr') {
  const checked=checkMedicationRegimen({current:'metformin',context:result.context});
  assert.ok(checked.missing.some(s=>s.includes('СКФ')));
  assert.equal(checked.organAlerts.length,0,'Unknown renal function is not a measured contraindication');
 }
});
