import test from 'node:test';
import assert from 'node:assert/strict';
import {medicationEditorContext,editMedicationField,type MedicationEdits} from './medication-context-editor.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';
const empty:MedicationEdits={source:'',values:{}};
test('visible medication check uses explicit case facts and removes the false missing-value questions',()=>{
 const source='Возраст: 68\nСКФ: 42\nКалий: 5.3\nQTc: 480';
 const value=medicationEditorContext(source,empty);
 assert.deepEqual(value.fields,{egfr:'42',potassium:'5.3',ageYears:'68',qtcMs:'480'});
 const checked=checkMedicationRegimen({current:'ramipril; spironolactone',context:value.context});
 assert.ok(!checked.missing.some(item=>/Спиронолактон: (калий|СКФ) не указан/.test(item)));
 assert.ok(checked.alerts.some(item=>/гиперкалием/i.test(item.risk)));
});
test('conflicting, historical and planned measurements are not silently chosen as current facts',()=>{
 const conflict=medicationEditorContext('СКФ: 42\nСКФ: 18\nКалий: 5.3',empty);
 assert.equal(conflict.context.egfr,null);assert.ok(conflict.issues.length>0);assert.equal(conflict.context.potassium,5.3);
 const prose=medicationEditorContext('Раньше СКФ 42. Проверить калий 5.3. QTc предположительно 500.',empty);
 assert.equal(prose.hasValues,false);
 const checked=checkMedicationRegimen({current:'spironolactone',context:conflict.context});assert.ok(checked.missing.some(item=>/СКФ не указана/.test(item)));
});
test('manual correction and explicit clearing apply to the visible check and review context',()=>{
 const source='СКФ: 42\nКалий: 5.3';
 const edited=editMedicationField(source,empty,'potassium','5,8');
 assert.equal(medicationEditorContext(source,edited).context.potassium,5.8);
 const cleared=editMedicationField(source,edited,'egfr','');assert.equal(medicationEditorContext(source,cleared).context.egfr,null);
 assert.ok(checkMedicationRegimen({current:'spironolactone',context:medicationEditorContext(source,cleared).context}).organAlerts.some(item=>item.severity==='contraindicated'));
});
test('a new narrative invalidates manual overrides without reusing old patient measurements',()=>{
 const before='СКФ: 42\nКалий: 5.3',after='СКФ: 18\nКалий: 4.2';
 const edited=editMedicationField(before,empty,'egfr','65');
 assert.equal(medicationEditorContext(before,edited).context.egfr,65);
 assert.equal(medicationEditorContext(after,edited).context.egfr,18);
 assert.equal(medicationEditorContext('',edited).context.egfr,null);
 const next=editMedicationField(after,edited,'potassium','4.5');assert.deepEqual(next.values,{potassium:'4.5'});
});
test('invalid manual measurements remain unknown and the standalone checker retains direct entry',()=>{
 for(const [field,text]of [['egfr','-1'],['potassium','NaN'],['potassium','Infinity'],['ageYears','150'],['qtcMs','100']] as const){const state=editMedicationField('',empty,field,text);assert.equal(medicationEditorContext('',state).context[field],null);}
 const state=editMedicationField('',empty,'egfr','42');assert.equal(medicationEditorContext('',state).context.egfr,42);
});
