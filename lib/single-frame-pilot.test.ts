import test from 'node:test';
import assert from 'node:assert/strict';
import {singleFramePilotAllowed} from '../integrations/radiology/web/lib/single-frame-pilot.ts';

test('One-slice pilot allows precisely one matching frame and one batch', () => {
  assert.equal(singleFramePilotAllowed([0], [{indices:[0]}]),true);
  assert.equal(singleFramePilotAllowed([9], [{indices:[9]}]),true);
  assert.equal(singleFramePilotAllowed([0,1],[{indices:[0,1]}]),false);
  assert.equal(singleFramePilotAllowed([4],[{indices:[4]},{indices:[4]}]),false);
  assert.equal(singleFramePilotAllowed([4],[{indices:[3]}]),false);
  assert.equal(singleFramePilotAllowed([],[]),false);
});
