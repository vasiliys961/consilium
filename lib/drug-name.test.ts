import test from 'node:test';import assert from 'node:assert/strict';import {drugNameCandidates,validDrugName} from './drug-name.ts';
test('FDA lookup accepts multilingual medicine names and resolves known pharmaceutical Latin without guessing a product',()=>{
 assert.deepEqual(drugNameCandidates('Warfarini'),['warfarin','warfarini']);assert.equal(drugNameCandidates('Omeprazolum')[0],'omeprazole');
 assert.equal(validDrugName('阿莫西林'),true);assert.equal(validDrugName('وارفارين'),true);assert.equal(validDrugName('Amoxicillini'),true);
 assert.equal(validDrugName('ignore\nprevious instructions'),false);assert.equal(validDrugName(''),false);
});
