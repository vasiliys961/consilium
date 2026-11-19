import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOrderDocumentation} from './order-dose-documentation.ts';

const audit=(order:string)=>reviewOrderDocumentation(order,'').entries[0];

test('W5 dose documentation: unnamed dose has missing amount route frequency',()=>{
 assert.deepEqual(audit('metformin').gaps,['amount_or_unit','route','frequency']);
});
test('W5 dose documentation: amount is not mistaken for complete prescription',()=>{
 assert.deepEqual(audit('metformin 500 mg').gaps,['route','frequency']);
});
test('W5 dose documentation: complete syntax still does not assert medical dose safety',()=>{
 const r=audit('apixaban 5 mg oral twice daily');
 assert.deepEqual(r.gaps,[]);
 assert.equal(r.order,'apixaban 5 mg oral twice daily');
});
test('W5 dose documentation: bottle concentration alone is not administered dose',()=>{
 const r=audit('amoxicillin 250 mg/5 mL oral twice daily');
 assert.deepEqual(r.gaps,['concentration_only']);
});
test('W5 dose documentation: separate administered volume can be identified syntactically',()=>{
 const r=audit('amoxicillin 250 mg/5 mL 10 mL oral twice daily');
 assert.deepEqual(r.gaps,[]);
});
test('W5 dose documentation: weight based regimens require actual patient weight',()=>{
 const r=audit('enoxaparin 1 mg/kg SC q12h');
 assert.deepEqual(r.gaps,['patient_weight']);
});
test('W5 dose documentation: laboratory concentration units cannot masquerade as dose',()=>{
 const r=audit('metformin 500 mg/dL oral once daily');
 assert.ok(r.gaps.includes('invalid_units'));
 assert.ok(r.gaps.includes('amount_or_unit'));
});
test('W5 dose documentation: Russian dose route and frequency supported',()=>{
 const r=audit('метформин 500 мг внутрь 2 раза в день');
 assert.deepEqual(r.gaps,[]);
});
test('W5 dose documentation: alternatives assessed independently, no phantom co-administration',()=>{
 const r=reviewOrderDocumentation('metformin 500 mg','apixaban 5 mg oral twice daily\nwarfarin');
 assert.equal(r.entries.length,3);
 assert.deepEqual(r.entries.map(x=>x.scope),['proposed','alternative','alternative']);
 assert.deepEqual(r.entries[1].gaps,[]);
 assert.deepEqual(r.entries[2].gaps,['amount_or_unit','route','frequency']);
 assert.equal(r.entries[1].alternative,'apixaban 5 mg oral twice daily');
});
test('W5 dose documentation: excessive alternatives are explicitly unexamined',()=>{
 const r=reviewOrderDocumentation('',Array.from({length:14},(_,i)=>'syntheticdrug'+i).join('\n'));
 assert.equal(r.entries.length,12);
 assert.equal(r.unexaminedAlternatives,2);
});
test('W5 dose documentation: independent calls are deterministic and have no cached results',()=>{
 const a=reviewOrderDocumentation('apixaban 5 mg oral twice daily','');
 const b=reviewOrderDocumentation('apixaban 5 mg oral twice daily','');
 assert.deepEqual(a,b);
});
