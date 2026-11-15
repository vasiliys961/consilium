import assert from 'node:assert/strict';
import test from 'node:test';
import {knownDrugInteractions,localDrugCoverage} from './drug-interaction-rules.ts';

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
 assert.equal(coverage.recognized.length,2);assert.deepEqual(coverage.unrecognized,['Метформин']);assert.equal(coverage.ruleCount,4);
});
