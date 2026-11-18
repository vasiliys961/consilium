/** No provider inference. Characterizes the EXISTING router and conversation
 * parser with synthetic requests and hand-authored responses. Not a model benchmark.
 * Run: node --require ./scripts/openrouter-only.cjs --experimental-strip-types scripts/evaluate-copilot-offline.ts
 */
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {planPhysicianTask,copilotRequestedOpen} from '../lib/physician-task-router.ts';
import {parsePhysicianAgentJson,converseWithPhysician} from '../lib/physician-agent.ts';

type Fixture={id:string;question:string;expected:string[];direct?:string;coordinationRequired?:boolean;clarificationRequired?:boolean};
const fixtures:Fixture[]=JSON.parse(await readFile(new URL('../docs/fixtures/copilot-coordinator-tasks.json',import.meta.url),'utf8'));
let unexpectedNetworkCalls=0;
globalThis.fetch=async()=>{unexpectedNetworkCalls++;throw Error('Network forbidden in offline Copilot assessment');};
const routes=fixtures.map(f=>{
 const actual=planPhysicianTask(f.question).steps.map(step=>step.tool),direct=copilotRequestedOpen(f.question);
 return {id:f.id,expected:f.expected,actual,routeMatches:JSON.stringify(actual)===JSON.stringify(f.expected),
  ...(f.direct?{expectedDirect:f.direct,actualDirect:direct,directMatches:direct===f.direct}:{}),
  coordinationRequired:f.coordinationRequired??false,sequenceExecutionImplemented:false};
});
const parserCases=[
 {name:'valid-existing-tools',raw:{reply:'Open ECG.',question:null,tools:['ecg','clinical']},expected:['ecg','clinical']},
 {name:'untrusted-url',raw:{reply:'Navigate.',question:null,tools:['https://outside.invalid/collect']},expected:[]},
 {name:'unknown-destructive-tool',raw:{reply:'Navigate.',question:null,tools:['delete-case','write-env','publish','hub']},expected:[]},
 {name:'tool-object-is-not-a-module-id',raw:{reply:'Navigate.',question:null,tools:{name:'ecg'}},expected:null},
 {name:'oversized-model-reply',raw:{reply:'x'.repeat(1601),question:null,tools:['ecg']},expected:null},
];
for(const c of parserCases)assert.deepEqual(parsePhysicianAgentJson(JSON.stringify(c.raw))?.tools??null,c.expected);
const transportScenarios=['valid','invalid-json','unavailable','payment-required','network-error'] as const;
const transport=[];
for(const scenario of transportScenarios){
 let calls=0;
 const result=await converseWithPhysician({text:'Open ECG after reviewing the supplied study.',locale:'en'},
  {OPENROUTER_API_KEY:'synthetic-offline-only',NODE_ENV:'test'},async(_url,init)=>{
   calls++;const body=JSON.parse(String(init?.body));assert.equal(body.max_tokens,800);
   if(scenario==='network-error')throw new TypeError('SYNTHETIC_TRANSPORT_ERROR');
   if(scenario==='unavailable'||scenario==='payment-required')return Response.json({error:{message:'Synthetic provider rejection'}},{status:scenario==='payment-required'?402:503});
   const content=scenario==='invalid-json'?'not-json':JSON.stringify({reply:'Open ECG and then Clinical Review.',question:null,translatedReply:null,translatedQuestion:null,tools:['ecg','clinical']});
   return Response.json({choices:[{finish_reason:'stop',message:{content}}],usage:{prompt_tokens:100,completion_tokens:50}});
  });
 assert.equal(calls,1);assert.equal(result.usedModel,scenario==='valid');
 transport.push({scenario,stubbedResponses:calls,usedSyntheticModelResult:result.usedModel,warning:result.warning});
}
assert.equal(unexpectedNetworkCalls,0);
const report={method:'Existing deterministic router + hand-authored response/transport fixtures. No candidate model was executed.',
 date:'2026-11-18',paidCalls:0,unexpectedNetworkCalls,candidateModelQualityMeasured:false,candidateLatencyMeasured:false,
 localRoutes:{count:routes.length,matches:routes.filter(r=>r.routeMatches).length,directCount:routes.filter(r=>'directMatches'in r).length,directMatches:routes.filter(r=>r.directMatches).length,details:routes},
 parserCases:parserCases.length,transport};
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
