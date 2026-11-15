import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allowedAppOrigin,isPreviewInstance,localOrigin,localPorts} from './local-ports.ts';

test('local instances have separate ports and strict origin checks', () => {
  const previous = process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW;
  try {
    delete process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW;
    assert.equal(isPreviewInstance(), false);
    assert.deepEqual(Object.values(localPorts()), [3107, 3108, 3110, 3111, 3112, 3113]);
    assert.equal(localOrigin('radiology'), 'http://127.0.0.1:3110');
    assert.equal(allowedAppOrigin('http://localhost:3107'), true);
    assert.equal(allowedAppOrigin('http://127.0.0.1:3207'), false);

    process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW = '1';
    assert.equal(isPreviewInstance(), true);
    assert.deepEqual(Object.values(localPorts()), [3207, 3208, 3210, 3211, 3212, 3213]);
    assert.equal(localOrigin('radiology'), 'http://127.0.0.1:3210');
    assert.equal(allowedAppOrigin('http://127.0.0.1:3207'), true);
    assert.equal(allowedAppOrigin('http://localhost:3207'), true);
    assert.equal(allowedAppOrigin('http://127.0.0.1:3107'), false);
    assert.equal(allowedAppOrigin('http://localhost:3107'), false);
    assert.equal(allowedAppOrigin('http://evil.example:3207'), false);
    assert.equal(allowedAppOrigin(null), false);

    process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW = 'unexpected';
    assert.equal(localPorts().app, 3107);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW;
    else process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW = previous;
  }
});
