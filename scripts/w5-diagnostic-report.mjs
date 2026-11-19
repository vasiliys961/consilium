#!/usr/bin/env node
/** W5 synthetic diagnostic review: standard Node.js, no network, no LLM/API. */
import {readFileSync} from 'node:fs';
import {W5_DIAGNOSTIC_CASES} from '../lib/w5-diagnostic-cases.ts';
import {summarizeW5DiagnosticReviews} from '../lib/w5-diagnostic-review.ts';

if(process.argv[2]==='--template'){
 process.stdout.write(JSON.stringify({
  kind:'W5 synthetic diagnostic clinician review (NOT validated)',
  referenceApproved:false,
  model:'NOT RUN',
  reviewedAt:null,
  reviews:W5_DIAGNOSTIC_CASES.map(item=>({caseId:item.id,status:'not_assessed'})),
 },null,2)+'\n');
}else if(process.argv.length===3){
 try{
  const submitted=JSON.parse(readFileSync(process.argv[2],'utf8'));
  if(!submitted||!Array.isArray(submitted.reviews))throw Error('Expected JSON with reviews array');
  if(submitted.referenceApproved!==true)
   throw Error('Clinical reference criteria must be clinician-approved BEFORE model outputs are scored');
  const summary=summarizeW5DiagnosticReviews(submitted.reviews);
  process.stdout.write(JSON.stringify({model:submitted.model??'unspecified',
   benchmark:'W5 synthetic cases, independent human rubric; NOT independent clinical validation',
   ...summary},null,2)+'\n');
 }catch(error){
  process.stderr.write('W5 review rejected: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=1;
 }
}else{
 process.stderr.write('Usage: node --experimental-strip-types scripts/w5-diagnostic-report.mjs --template > review.json\n'+
  '   or: node --experimental-strip-types scripts/w5-diagnostic-report.mjs review.json\n');
 process.exitCode=2;
}
