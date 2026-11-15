import test from 'node:test';import assert from 'node:assert/strict';
import {generateProtocol,protocolHeadings,protocolPrompt,parseProtocol} from './generate.ts';
import {protocolText} from './document.ts';
test('ready maternal templates generate a structured editable protocol and explicitly prohibit invented normality, consent and prescriptions',async()=>{
 const sections=protocolHeadings('encounter').map(id=>({id,title:id,text:'Not supplied.'}));let prompt='';const result=await generateProtocol({kind:'encounter',source:'Patient: Example Name\nReason: technical fixture',locale:'en'},{env:{ OPENROUTER_API_KEY: 'unit-test' },fetch:async(_input,init)=>{const request=JSON.parse(String(init?.body));prompt=request.messages[0].content;assert.ok(!request.messages[1].content.includes('Example Name'));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sections})}}],usage:{prompt_tokens:30,completion_tokens:20}}));}});
 assert.ok(result);assert.match(prompt,/Missing data must be explicitly marked not supplied/);assert.match(prompt,/Never invent normal findings/);assert.match(protocolText(result!.document),/Examination\nNot supplied/);
});
test('a protocol with missing sections or hallucinated section IDs is refused',()=>{assert.equal(parseProtocol('{"sections":[{"id":"unexpected","title":"X","text":"Y"}]}','ecg'),null);assert.match(protocolPrompt('radiology','ru'),/Findings/);});
