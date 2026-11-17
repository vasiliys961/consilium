import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {radiologyPreviewApprovalOverrides} from './radiology-preview-approval-env.ts';

test('Radiology Preview inherits only previously saved exact approval flags; never exports keys',()=>{
 const saved=[
  'OPENROUTER_API_KEY=not-a-real-key',
  'RADIOLOGY_ENABLE_DEIDENTIFIED_OPENROUTER_PILOT=1',
  'RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED=1',
  'RADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION=1',
  'RADIOLOGY_ENABLE_AUTOMATIC_PUBLIC_VOLUME_RESEARCH=1',
  'RADIOLOGY_LOCAL_RESEARCH_OPERATOR_TOKEN=private-test-token',
  'POLZA_API_KEY=private-polza-test',
 ].join('\n');
 const flags=radiologyPreviewApprovalOverrides(saved);
 assert.deepEqual(flags,{
  RADIOLOGY_ENABLE_DEIDENTIFIED_OPENROUTER_PILOT:'1',
  RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED:'1',
  RADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION:'1',
 });
 assert.ok(!JSON.stringify(flags).includes('not-a-real-key'));
 assert.equal(Object.hasOwn(flags,'RADIOLOGY_ENABLE_AUTOMATIC_PUBLIC_VOLUME_RESEARCH'),false);
 assert.equal(Object.hasOwn(flags,'OPENROUTER_API_KEY'),false);
 const disabled=radiologyPreviewApprovalOverrides('RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED=0\nRADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION=true');
 assert.deepEqual(disabled,{RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED:'0'});
 const empty=radiologyPreviewApprovalOverrides('');
 assert.deepEqual(empty,{});
});

test('Saved Radiology Preview permissions are applied by child launcher after inherited variables',()=>{
 const launcher=readFileSync('lib/local-integrations.ts','utf8');
 assert.match(launcher,/isPreviewInstance\(\)/);
 assert.match(launcher,/radiologyPreviewApprovalOverrides\(readFileSync\(path,'utf8'\)\)/);
 assert.match(launcher,/\{\.\.\.originalEnv,\.\.\.process\.env,\.\.\.previewApproval\}/);
 assert.doesNotMatch(launcher,/console\.log\(.*previewApproval/);
});

test('Reviewed DICOM series: one explicit send click is the study attestation, not a second checkbox',()=>{
 const review=readFileSync('integrations/radiology/web/components/StudyPrivacyReview.tsx','utf8');
 assert.match(review,/reviewPreparedStudy\(groups, true\)/);
 assert.match(review,/onClick=\{\(\) => void release\(\)\}/);
 assert.match(review,/Проверил снимки · отправить в анализ \(платно\)/);
 assert.doesNotMatch(review,/checked=\{approved\}|setApproved\(|!approved/);
 assert.match(review,/disabled=\{sending \|\| preparing \|\| released/);
});

test('Clinical Radiology: prepare local images even when cloud is offline; refresh auth before paid POST',()=>{
 const flow=readFileSync('integrations/radiology/web/components/ReviewedSeriesAnalysis.tsx','utf8');
 const start=flow.slice(flow.indexOf('    async function start() {'),flow.indexOf('    async function finalize('));
 const send=flow.slice(flow.indexOf('    async function submitAll('),flow.indexOf('    function save()'));
 assert.doesNotMatch(start,/fetch\(.*deidentified-openrouter-review/);
 assert.match(start,/setStage\('review'\)/);
 assert.match(send,/fetch\('\/api\/ai\/deidentified-openrouter-review'/);
 assert.match(send,/reviewedConnectionReady\(connection\)/);
 assert.match(send,/if \(!permitted\) throw Error\(reason\)/);
 assert.ok(send.indexOf("if (!permitted) throw Error(reason)") < send.indexOf("fetch('/api/ai/approved-volume-gemini-batch'"));
 assert.match(send,/\'X-Opus-Reviewed-Volume\': \'1\'/);
 assert.doesNotMatch(send,/!plan \|\| !connected \|\| sending\.current/);
});

test('Specialist reviewed-frame analysis: one paid send action, no repeat consent checkbox or stale session',()=>{
 const ui=readFileSync('integrations/radiology/web/components/DeidentifiedOpenRouterPanel.tsx','utf8');
 assert.doesNotMatch(ui,/transferAuthorized|setTransferAuthorized/);
 assert.match(ui,/Отправить проверенные кадры в анализ \(платно\)/);
 assert.match(ui,/const ready = await probe\.json\(\) as Ready/);
 assert.match(ui,/!ready\.workstationConnected && token\.length < 24/);
});
