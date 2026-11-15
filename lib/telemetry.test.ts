import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,statSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {terminalEvent,appendTerminalEvent,formatTerminalEvent} from './telemetry.ts';

test('terminal events accept operational fields and exclude clinical text, filenames, keys and arbitrary error messages',()=>{
 const event=terminalEvent('technical-run','model.responded',{model:'technical-model',provider:'test',httpStatus:200,inputTokens:20,outputTokens:10,estimatedUsd:0.0002,text:'SYNTHETIC_PRIVATE_TEXT',filename:'PRIVATE_FILE',apiKey:'SECRET_KEY',reason:'SECRET_ERROR',runId:'override',at:'override'});
 assert.equal(event.runId,'technical-run');assert.equal(event.reason,'unknown');assert.equal(event.httpStatus,200);
 for(const value of ['SYNTHETIC_PRIVATE_TEXT','PRIVATE_FILE','SECRET_KEY','SECRET_ERROR','override'])assert.ok(!JSON.stringify(event).includes(value));
});
test('local log file is readable by the Cursor terminal viewer, with bounded rotation and sanitized contents',()=>{
 const directory=mkdtempSync(join(tmpdir(),'concilium-logs-'));const path=join(directory,'events.jsonl');
 try{
  writeFileSync(path,'x'.repeat(2*1024*1024),{mode:0o600});
  const event=terminalEvent('test-run','run.completed',{clinicalDraft:'generated',modelResponses:2,readFiles:1,unassessedFiles:0,durationMs:1200,estimatedUsd:0.004});
  appendTerminalEvent({...event,text:'SYNTHETIC_PRIVATE_TEXT'},path);
  assert.ok(existsSync(`${path}.1`));assert.equal(statSync(path).mode&0o777,0o600);
  const stored=readFileSync(path,'utf8');assert.ok(!stored.includes('SYNTHETIC_PRIVATE_TEXT'));assert.equal(JSON.parse(stored).runId,'test-run');
  const viewer=spawnSync(process.execPath,['--experimental-strip-types','scripts/watch-logs.ts','--once'],{cwd:process.cwd(),env:{...process.env,CONCILIUM_LOG_FILE:path},encoding:'utf8'});
  assert.equal(viewer.status,0,viewer.stderr);assert.match(viewer.stdout,/Ответ сформирован/);assert.match(viewer.stdout,/0\.004000/);assert.match(viewer.stdout,/вызовов с ответом: 2/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('terminal formatting keeps failure and truncation visible instead of declaring a clinical success',()=>{
 assert.match(formatTerminalEvent(terminalEvent('test','model.failed',{model:'test-model',reason:'TimeoutError'})),/ОШИБКА модели/);
 assert.match(formatTerminalEvent(terminalEvent('test','model.responded',{model:'test-model',httpStatus:200,finishReason:'length',inputTokens:10,outputTokens:20})),/length/);
 assert.match(formatTerminalEvent(terminalEvent('test','run.completed',{clinicalDraft:'unavailable',modelResponses:1,readFiles:0,unassessedFiles:1,estimatedUsd:0})),/Клинический ответ не получен/);
});

test('default Cursor viewer waits for new events and does not replay old errors as current failures',async()=>{
 const {spawn}=await import('node:child_process');
 const directory=mkdtempSync(join(tmpdir(),'concilium-live-'));const path=join(directory,'events.jsonl');
 appendTerminalEvent(terminalEvent('old-test','request.rejected',{reason:'invalid_json',httpStatus:400}),path);
 const child=spawn(process.execPath,['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--experimental-strip-types','scripts/watch-logs.ts'],{cwd:process.cwd(),env:{...process.env,CONCILIUM_LOG_FILE:path},stdio:['ignore','pipe','pipe']});
 const stopped=new Promise(resolve=>child.once('exit',resolve));
 try{
  await new Promise<void>((resolve,reject)=>{
   let output='',written=false;
   // Node's test runner starts many child processes concurrently on CI; allow the viewer to warm up.
   // Heavily parallel GitHub Actions runners can delay a child Node process starting.
   // The assertion still requires a new event; do not accept stale log entries.
   const timer=setTimeout(()=>reject(new Error('live viewer did not show the new event')),30000);
   child.on('error',error=>{clearTimeout(timer);reject(error);});
   child.stdout.on('data',chunk=>{
    output+=chunk.toString();
    if(!written&&output.includes('Ожидаю новые события.')){written=true;assert.ok(!output.includes('old-test'));assert.ok(!output.includes('invalid_json'));appendTerminalEvent(terminalEvent('new-run','model.started',{model:'technical-model',provider:'test'}),path);}
    if(output.includes('technical-model')){clearTimeout(timer);assert.ok(!output.includes('invalid_json'));resolve();}
   });
  });
 }finally{child.kill('SIGTERM');await stopped;rmSync(directory,{recursive:true,force:true});}
});

test('C2: local ECG and council coordinator failures remain readable without exposing exception details',()=>{
 const failedModule=terminalEvent('safe-run','module.failed',{module:'ECGFounder',status:'not_assessed',durationMs:12,text:'PRIVATE_ECG_TEXT',reason:'PRIVATE_STACK'});
 const moduleText=formatTerminalEvent(failedModule);
 assert.match(moduleText,/ECGFounder: технический сбой/);
 assert.match(moduleText,/остальные этапы разбора продолжаются/);
 assert.doesNotMatch(JSON.stringify(failedModule)+moduleText,/PRIVATE_ECG_TEXT|PRIVATE_STACK/);
 const failedStage=terminalEvent('safe-run','stage.failed',{stage:'consilium',reason:'PRIVATE_COORDINATOR_STACK'});
 const stageText=formatTerminalEvent(failedStage);
 assert.match(stageText,/Консилиум: этап не завершён/);
 assert.match(stageText,/доступные результаты других этапов сохранены/);
 const noVotes=formatTerminalEvent(terminalEvent('safe-run','stage.completed',{stage:'consilium',status:'not_assessed'}));
 assert.match(noVotes,/Консилиум: нет полученных мнений/);
 assert.doesNotMatch(JSON.stringify(failedStage)+stageText,/PRIVATE_COORDINATOR_STACK/);
});
