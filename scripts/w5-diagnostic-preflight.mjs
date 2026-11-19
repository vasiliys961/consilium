#!/usr/bin/env node
/**
 * Offline audit-preparation tool. Read existing synthetic W5 free-model JSONL.
 * No API, network, browser, model or medical data calls. The preflight is
 * non-diagnostic, does not compare against hidden human gold criteria and
 * cannot mark any output clinically safe.
 */
import {readFileSync} from 'node:fs';
import {W5_DIAGNOSTIC_CASES} from '../lib/w5-diagnostic-cases.ts';
import {screenW5DiagnosticAnswer} from '../lib/w5-diagnostic-preflight.ts';

const path=process.argv[2];
if(!path||process.argv.length!==3){
 process.stderr.write('Usage: node --experimental-strip-types scripts/w5-diagnostic-preflight.mjs synthetic-model-results.jsonl\n');
 process.exitCode=2;
}else{
 try{
  const raw=readFileSync(path,'utf8');
  if(raw.length>2000000)throw Error('File exceeds 2 MB synthetic review limit');
  const valid=new Set(W5_DIAGNOSTIC_CASES.map(x=>x.id)),seen=new Set(),rows=[];
  for(const [index,line] of raw.split(/\r?\n/u).entries()){
   if(!line.trim())continue;
   let item;
   try{item=JSON.parse(line);}catch{throw Error('Invalid JSON on line '+(index+1));}
   // Ignore only the documented trial header, never an unknown case result.
   if(item?.kind==='W5-free-model-run'||item?.kind==='W5-free-model-diagnostic-baseline')continue;
   if(typeof item?.caseId!=='string'||!valid.has(item.caseId))
    throw Error('Unrecognized W5 synthetic case on line '+(index+1));
   if(seen.has(item.caseId))throw Error('Duplicate model result for '+item.caseId);
   seen.add(item.caseId);
   if(!['answered','empty','provider-error'].includes(item.status))
    throw Error('Invalid model result status for '+item.caseId);
   if(item.status==='answered'&&(typeof item.answer!=='string'||!item.answer.trim()))
    throw Error('Answered result missing text for '+item.caseId);
   if(item.status!=='answered'&&typeof item.answer==='string'&&item.answer.trim())
    throw Error('Failed result cannot carry a nonempty answer');
   const result=screenW5DiagnosticAnswer(item.caseId,item.status==='answered'?item.answer:null);
   rows.push({caseId:result.caseId,modelAnswerAvailable:result.modelAnswerAvailable,
    reviewStatus:result.clinicianReview,clinicalSafetyEstablished:false,
    flags:result.findings.map(x=>({code:x.code,description:x.description}))});
  }
  const answered=rows.filter(x=>x.modelAnswerAvailable).length;
  const flagged=rows.filter(x=>x.flags.length>0);
  process.stdout.write(JSON.stringify({
   kind:'W5-diagnostic-offline-preflight',
   method:'heuristic review prioritization, NOT automated clinical scoring',
   modelCallsMade:0,costUsd:0,
   syntheticCasesTotal:W5_DIAGNOSTIC_CASES.length,
   modelRows:rows.length,answered,nonAnswers:rows.length-answered,
   casesWithoutModelAnswer:W5_DIAGNOSTIC_CASES.length-answered,
   casesClinicianReviewed:0,clinicalValidation:false,
   flaggedCaseCount:flagged.length,flagCount:rows.reduce((n,x)=>n+x.flags.length,0),
   cases:rows,
  },null,2)+'\n');
 }catch(error){
  process.stderr.write('W5 offline diagnostic preflight rejected: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=1;
 }
}
