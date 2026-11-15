import test from 'node:test';
import assert from 'node:assert/strict';
import {answerLibrary} from './library-answer.ts';
import {librarySemanticScore} from './library-query.ts';
test('book answer sends selected excerpts only, with verifiable page anchors and no web search',async()=>{
 let calls=0;
 const result=await answerLibrary({text:'Synthetic question',locale:'ru',referenceFiles:[{name:'excerpt.txt',text:'Synthetic source passage',librarySource:{title:'Test book',page:42,documentId:'book',chunkId:'chunk'}}]}, {OPENROUTER_API_KEY:'test'},async(_url,init)=>{
 calls++;const body=JSON.parse(String(init?.body));assert.match(body.messages[0].content,/ONLY/);assert.match(body.messages[0].content,/do not fill gaps/);assert.match(JSON.stringify(body.messages[1].content),/page\\":42/);
 return Response.json({choices:[{message:{content:JSON.stringify({answer:'Synthetic answer [1].',status:'answered',usedSources:[1]})}}],usage:{prompt_tokens:20,completion_tokens:6}});
 });
 assert.equal(calls,1);assert.equal(result.sources[0].page,42);assert.equal(result.text,'Synthetic answer [1].');
 await assert.rejects(()=>answerLibrary({text:'question'},{}),/no_excerpts/);
});
test('cross-language semantic matches are not rejected solely for falling below 0.8',()=>{
 assert.ok(librarySemanticScore(.72,.6,.72)>0);assert.equal(librarySemanticScore(.3,.1,.3),0);
});

test('selected book page pixels reach the answer model as literature, with their page anchor',async()=>{
 await answerLibrary({text:'Read the table',locale:'en',referenceFiles:[{name:'page.jpg',image:'data:image/jpeg;base64,TEST',librarySource:{title:'Synthetic handbook',page:19,documentId:'book',chunkId:'page-19'}}]}, {OPENROUTER_API_KEY:'test'},async(_url,init)=>{
 const content=JSON.parse(String(init?.body)).messages[1].content;
 assert.ok(content.some((part:{type:string})=>part.type==='image_url'));
 assert.match(JSON.stringify(content),/NOT a patient image/);
 return Response.json({choices:[{message:{content:JSON.stringify({answer:'The table says… [1]',status:'answered',usedSources:[1]})}}]});
 });
});

test('case synthesis receives selected book images without treating them as patient findings',async()=>{
 const {writeLightDraft}=await import('./draft.ts');
 let seen=false;
 const draft=await writeLightDraft({OPENROUTER_API_KEY:'test'},{locale:'en',note:'Synthetic clinical question',citations:[],referenceImages:[{image:'data:image/jpeg;base64,TEST',key:'library:book:page-19',title:'Handbook',page:19}]},async(_url,init)=>{
  const body=JSON.parse(String(init?.body));const content=body.messages[1].content;
  seen=Array.isArray(content)&&content.some((part:{type:string})=>part.type==='image_url');
  assert.match(JSON.stringify(content),/NOT patient observations/);
  return Response.json({choices:[{message:{content:JSON.stringify({summary:'Synthetic answer',statements:[]})}}]});
 });
 assert.ok(seen);assert.equal(draft?.summary,'Synthetic answer');
});
