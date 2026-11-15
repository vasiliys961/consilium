import test from 'node:test';import assert from 'node:assert/strict';
import {generateProtocol,protocolHeadings,protocolPrompt,parseProtocol,protocolModel} from './generate.ts';
import {protocolText} from './document.ts';
test('ready maternal templates generate a structured editable protocol and explicitly prohibit invented normality, consent and prescriptions',async()=>{
 const sections=protocolHeadings('encounter').map(id=>({id,title:id,text:'Not supplied.'}));let prompt='';const result=await generateProtocol({kind:'encounter',source:'Patient: Example Name\nReason: technical fixture',locale:'en'},{env:{ OPENROUTER_API_KEY: 'unit-test' },fetch:async(_input,init)=>{const request=JSON.parse(String(init?.body));prompt=request.messages[0].content;assert.ok(!request.messages[1].content.includes('Example Name'));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sections})}}],usage:{prompt_tokens:30,completion_tokens:20}}));}});
 assert.ok(result);assert.match(prompt,/Missing data must be explicitly marked not supplied/);assert.match(prompt,/Never invent normal findings/);assert.match(protocolText(result!.document),/Examination\nNot supplied/);
});
test('a protocol with missing sections or hallucinated section IDs is refused',()=>{assert.equal(parseProtocol('{"sections":[{"id":"unexpected","title":"X","text":"Y"}]}','ecg'),null);assert.match(protocolPrompt('radiology','ru'),/Findings/);});


test('two clinical routes choose one appropriate model: Flash formats completed review, Sol works independently',async()=>{
 const {MODELS}=await import('../../lib/cost.ts');
 assert.equal(protocolModel('from-analysis'),MODELS.flash);
 assert.equal(protocolModel('standalone'),MODELS.sol);
 const sections=protocolHeadings('encounter').map(id=>({id,title:id,text:'Not supplied.'}));
 for(const mode of ['from-analysis','standalone'] as const){
  let requests=0;
  const expected=mode==='from-analysis'?MODELS.flash:MODELS.sol;
  const result=await generateProtocol({kind:'encounter',source:'Synthetic: findings, established diagnosis, treatment proposal and physician decision.',locale:'ru',mode,...(mode==='from-analysis'?{sourceAnalysisId:'analysis-123'}:{})},{env:{OPENROUTER_API_KEY:'unit-test'},reviewed:true,fetch:async(_url,init)=>{
   requests++;
   const payload=JSON.parse(String(init?.body));
   assert.equal(payload.model,expected);
   assert.equal(payload.messages.length,2);
   assert.equal(payload.max_tokens,mode==='from-analysis'?3800:7000);
   const prompt=payload.messages[0].content;
   assert.match(prompt,mode==='from-analysis'?/FORMATTING ONLY/:/INDEPENDENT PROTOCOL/);
   assert.match(prompt,/Never invent normal findings/);
   if(mode==='from-analysis'){
    assert.match(prompt,/without any fresh diagnostic reasoning/);
    assert.match(prompt,/new medication recommendation/);
    assert.match(prompt,/dosages, units, dates, negations/);
   }
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sections})}}],usage:{prompt_tokens:45,completion_tokens:40}});
  }});
  assert.ok(result);
  assert.equal(result.document.generationMode,mode);
  assert.equal(result.document.sourceAnalysisId,mode==='from-analysis'?'analysis-123':undefined);
  assert.equal(requests,1);
 }
});
test('completed-analysis route requires an analysis ID and does not silently run a standalone Sol request',async()=>{
 let calls=0;
 const result=await generateProtocol({kind:'encounter',source:'Synthetic completed case',locale:'en',mode:'from-analysis'},{env:{OPENROUTER_API_KEY:'unit-test'},fetch:async()=>{calls++;return Response.json({choices:[]});}});
 assert.equal(result,null);
 assert.equal(calls,0);
});
test('invalid Flash JSON does not automatically charge a second formatting attempt',async()=>{
 let calls=0;
 const result=await generateProtocol({kind:'encounter',source:'Synthetic',locale:'en',mode:'from-analysis',sourceAnalysisId:'analysis-123'},{env:{OPENROUTER_API_KEY:'unit-test'},reviewed:true,fetch:async()=>{
  calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:'{"sections":[]} '}}]});
 }});
 assert.equal(result,null);
 assert.equal(calls,1);
});
