import test from 'node:test';import assert from 'node:assert/strict';
import { workflowGuide } from './workflow-guide.ts';import { conduct } from './conductor.ts';
test('assistant guides collection, preparation, analysis failure and physician review using actual state',()=>{
 assert.equal(workflowGuide({context:'',files:[]}).stage,'collect');
 assert.equal(workflowGuide({context:'Question',files:[]}).stage,'ready');
 assert.equal(workflowGuide({context:'Question',files:[],busy:true}).stage,'running');
 const result=conduct({});assert.equal(workflowGuide({context:'Question',files:[],result}).stage,'resolve');
 result.clinicalDraft='generated';assert.equal(workflowGuide({context:'Question',files:[],result}).stage,'decide');
 assert.equal(workflowGuide({context:'Question',files:[],result,decision:true}).stage,'followup');
 assert.equal(workflowGuide({context:'Question',files:[],result,changed:true}).stage,'ready');
});
