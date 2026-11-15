import assert from 'node:assert/strict';
import test from 'node:test';
import { externalArticleUrl } from './external-doi.ts';

test('the DOI link stays under the configured HTTPS path without extra URL parameters', () => {
  const href = externalArticleUrl('https://example.test/articles/', '10.1234/a#b/c?d');
  assert.equal(href, 'https://example.test/articles/10.1234/a%23b/c%3Fd');
  assert.equal(new URL(href!).search, '');
  assert.equal(new URL(href!).hash, '');
  assert.equal(externalArticleUrl('https://example.test/articles/', '10.1234/../outside'), null);
  assert.equal(externalArticleUrl('http://example.test', '10.1234/abc'), null);
  assert.equal(externalArticleUrl('https://example.test/?id=private', '10.1234/abc'), null);
  assert.equal(externalArticleUrl('https://user:password@example.test/', '10.1234/abc'), null);
});
