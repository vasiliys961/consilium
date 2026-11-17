import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Tested JavaScript installer exports a runtime ESM helper without a TypeScript declaration.
import {approvedRadiologyPreviewEnv} from '../scripts/approve-radiology-preview.mjs';
import {reviewedConnectionNotice} from '../integrations/radiology/web/lib/reviewed-connection-notice.ts';

test('Preview Radiology opt-in edits only specific flags, preserving existing secrets and comments', () => {
  const original = '# local preferences\nOPENROUTER_API_KEY=sample-secret-not-real\n' +
    'RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED=0\n' +
    'OTHER_FLAG=untouched\nRADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION=0\n';
  const result = approvedRadiologyPreviewEnv(original);
  assert.match(result, /OPENROUTER_API_KEY=sample-secret-not-real/);
  assert.match(result, /OTHER_FLAG=untouched/);
  assert.equal(result.match(/^RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED=/gm)?.length, 1);
  assert.equal(result.match(/^RADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION=/gm)?.length, 1);
  assert.match(result, /^RADIOLOGY_ENABLE_DEIDENTIFIED_OPENROUTER_PILOT=1$/m);
  assert.equal(approvedRadiologyPreviewEnv(result), result);
  assert.doesNotMatch(result, /^RADIOLOGY_ENABLE_AUTOMATIC_PUBLIC_VOLUME_RESEARCH=1$/m);
});

test('Readiness copy distinguishes permission from missing provider and session', () => {
  const message = reviewedConnectionNotice({enabled:false,workstationConnected:false,configurationStatus:'not-approved'});
  assert.match(message, /не разрешён/);
  assert.match(reviewedConnectionNotice({configurationStatus:'missing-provider'}), /OpenRouter/);
  assert.match(reviewedConnectionNotice({configurationStatus:'operator-required'}), /администратор/);
  assert.match(reviewedConnectionNotice({enabled:true,workstationConnected:true}), /Передача начнётся только/);
  assert.match(reviewedConnectionNotice(null), /локально/);
});
