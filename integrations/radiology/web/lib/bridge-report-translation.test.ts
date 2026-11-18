import test from 'node:test';
import assert from 'node:assert/strict';
import {translateBridgeReport,validBridgeTranslation} from './bridge-report-translation.ts';
const session='11111111-1111-4111-8111-111111111111';
const request={type:'concilium.translate-report' as const,session,requestId:'22222222-2222-4222-8222-222222222222',text:'ОПИСАНИЕ: синтетический признак 4 мм не подтверждён. Оценён 1 срез.',language:'en' as const};
test('translation sends the complete existing report through text-only follow-up once',async()=>{
 const calls:string[]=[];
 const text=await translateBridgeReport(request,async(url,init)=>{
  calls.push(String(url));
  if(init?.method!=='POST')return Response.json({enabled:true,workstationConnected:true});
  const body=JSON.parse(String(init.body));
  assert.equal(body.mode,'translate');assert.equal(body.outputLanguage,'en');assert.equal(body.report,request.text);
  assert.deepEqual(body.history,[]);assert.equal(body.clinicalContext,'');
  assert.doesNotMatch(JSON.stringify(body),/image_url|data:image|sources|interpret/);
  return Response.json({text:'FINDINGS: synthetic 4 mm sign is unconfirmed. 1 slice assessed.'});
 });
 assert.match(text,/unconfirmed/);assert.deepEqual(calls,['/api/ai/deidentified-openrouter-review','/api/ai/complete-volume-opus']);
});
test('wrong session, unknown language and image-bearing messages cannot trigger translation',async()=>{
 for(const value of [{...request,session:'other'},{...request,language:'unknown'},{...request,image:'data:image/png;base64,AAAA'},{...request,text:''}])assert.equal(validBridgeTranslation(value,session),false);
 let calls=0;await assert.rejects(()=>translateBridgeReport({...request,text:''},async()=>{calls++;throw Error();}));assert.equal(calls,0);
});
test('translation failures do not cause an automatic paid retry',async()=>{
 let posts=0;
 await assert.rejects(()=>translateBridgeReport(request,async(_url,init)=>{if(init?.method!=='POST')return Response.json({enabled:true,workstationConnected:true});posts++;return Response.json({error:'unavailable'},{status:502});}));
 assert.equal(posts,1);
});
