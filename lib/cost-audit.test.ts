import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeModelCosts } from './cost-audit.ts';
import type { CaseResult } from './conductor.ts';

type Call = NonNullable<CaseResult['cost']['calls']>[number];
const call = (changes: Partial<Call> = {}): Call => ({
  model: 'anthropic/claude-opus-5.5', inputTokens: 200, outputTokens: 50,
  durationMs: 800, status: 'received', usageAvailable: true,
  usd: 0.014, billingSource: 'openrouter', stage: 'consilium', ...changes,
});
const cost = (calls: Call[], totalUsd: number): CaseResult['cost'] => ({
  steps: [], credits: 0, calls, totalUsd,
});

test('groups bills by explicit stage and model, never inferring stage from model', () => {
  const summary = summarizeModelCosts(cost([
    call(), call({status:'truncated',usd:0.002,outputTokens:10}),
    call({stage:'synthesis',usd:0.007}),
    call({model:'openai/gpt-6.1-sol',usd:0.003,stage:'consilium'}),
  ],0.026));
  assert.equal(summary.rows.length,3);
  const council = summary.rows.find(row=>row.stage==='consilium' && row.model.includes('opus'))!;
  assert.equal(council.calls,2);
  assert.equal(council.truncated,1);
  assert.equal(council.inputTokens,400);
  assert.equal(council.billedUsd,0.016);
  assert.equal(summary.accountedUsd,0.026);
  assert.equal(summary.differenceUsd,0);
  assert.equal(summary.billedResponses,4);
});

test('retains cost of failed responses and clearly separates estimated spend', () => {
  const summary=summarizeModelCosts(cost([
    call({stage:'imaging',status:'failed',usageAvailable:false,billingSource:'estimate',usd:0.004,inputTokens:0,outputTokens:0}),
    call({stage:'imaging',status:'received',usd:0.01}),
  ],0.014));
  assert.equal(summary.rows.length,1);
  assert.equal(summary.rows[0].failed,1);
  assert.equal(summary.rows[0].estimatedUsd,0.004);
  assert.equal(summary.rows[0].billedUsd,0.01);
  assert.equal(summary.missingUsageResponses,1);
  assert.equal(summary.estimatedResponses,1);
});

test('old records and missing per-call data do not invent an invoice', () => {
  const noCalls=summarizeModelCosts({totalUsd:0.08,credits:8,steps:[]});
  assert.deepEqual(noCalls.rows,[]);
  assert.equal(noCalls.reportedUsd,0.08);
  assert.equal(noCalls.accountedUsd,0);
  assert.equal(noCalls.differenceUsd,0.08);

  const legacy=summarizeModelCosts(cost([call({stage:undefined,billingSource:undefined,usageAvailable:undefined})],0.014));
  assert.equal(legacy.rows[0].stage,'unclassified');
  assert.equal(legacy.estimatedResponses,1);
  assert.equal(legacy.missingUsageResponses,1);
});

test('invalid numeric metadata cannot create negative or nonfinite totals', () => {
 const summary=summarizeModelCosts(cost([call({
   usd:Number.NaN,inputTokens:-4,outputTokens:Infinity,durationMs:-1,billingSource:'estimate',
 })],0));
 assert.equal(summary.accountedUsd,0);
 assert.equal(summary.rows[0].inputTokens,0);
 assert.equal(summary.rows[0].outputTokens,0);
 assert.equal(summary.rows[0].durationMs,0);
});
