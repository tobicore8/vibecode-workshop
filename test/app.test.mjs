import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { openStore } from '../lib/store.mjs';

async function fixture(t, { withStore = false } = {}) {
  let store;
  if (withStore) {
    const dir = await mkdtemp(path.join(tmpdir(), 'picnic-app-'));
    store = await openStore({ dir });
  }
  const app = createApp({ revision: 'test-revision', store });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.close(resolve); app.closeAllConnections(); }));
  return `http://127.0.0.1:${app.address().port}`;
}

test('page, CSS and health are reachable and health identifies the served revision', async t => {
  const origin = await fixture(t);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /<h1>/);
  const css = await fetch(`${origin}/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const health = await fetch(`${origin}/api/health`);
  assert.deepEqual(await health.json(), { ok: true, revision: 'test-revision' });
});

test('repository files and traversal requests cannot be downloaded', async t => {
  const origin = await fixture(t);
  for (const path of ['/.env', '/AGENTS.md', '/package.json', '/.git/config', '/%2e%2e/.env', '/public/../server.mjs']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 404, path);
  }
});

test('HEAD has no body and unsupported writes are rejected', async t => {
  const origin = await fixture(t);
  const head = await fetch(origin, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await fetch(origin, { method: 'POST', body: 'data' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('new UI assets and the dynamic picnic page are served', async t => {
  const origin = await fixture(t);
  const createJs = await fetch(`${origin}/create.js`);
  assert.equal(createJs.status, 200);
  assert.match(createJs.headers.get('content-type'), /text\/javascript/);

  const picnicJs = await fetch(`${origin}/picnic.js`);
  assert.equal(picnicJs.status, 200);

  const background = await fetch(`${origin}/background.jpg`);
  assert.equal(background.status, 200);
  assert.match(background.headers.get('content-type'), /image\/jpeg/);

  const picnicPage = await fetch(`${origin}/p/any-id-at-all`);
  assert.equal(picnicPage.status, 200);
  assert.match(await picnicPage.text(), /picnic\.js/);
});

test('create: valid input returns 201 with a picnic', async t => {
  const origin = await fixture(t, { withStore: true });
  const response = await fetch(`${origin}/api/picnics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday in the park', date: '2026-10-25', place: 'Tiergarten', items: ['Cups', 'Blanket'] }),
  });
  assert.equal(response.status, 201);
  const { picnic } = await response.json();
  assert.equal(picnic.name, 'Sunday in the park');
  assert.equal(picnic.items.length, 2);
  assert.ok(picnic.id.length >= 22);
});

test('create: missing name or no items returns 400', async t => {
  const origin = await fixture(t, { withStore: true });
  const noName = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '', items: ['Cups'] }),
  });
  assert.equal(noName.status, 400);

  const noItems = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: [] }),
  });
  assert.equal(noItems.status, 400);
});

test('create: an oversized body returns 413', async t => {
  const origin = await fixture(t, { withStore: true });
  const response = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['x'.repeat(20 * 1024)] }),
  });
  assert.equal(response.status, 413);
});

test('create: a non-JSON body returns 400', async t => {
  const origin = await fixture(t, { withStore: true });
  const response = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
  assert.equal(response.status, 400);
});

test('get: unknown picnic returns 404', async t => {
  const origin = await fixture(t, { withStore: true });
  const response = await fetch(`${origin}/api/picnics/does-not-exist`);
  assert.equal(response.status, 404);
});

test('claim conflict returns 409 with the current picnic; wrong-name unclaim returns 409', async t => {
  const origin = await fixture(t, { withStore: true });
  const created = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['Cups'] }),
  }).then(r => r.json());
  const itemId = created.picnic.items[0].id;
  const id = created.picnic.id;

  const claimed = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }),
  });
  assert.equal(claimed.status, 200);

  const conflict = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bob' }),
  });
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json();
  assert.ok(conflictBody.error);
  assert.equal(conflictBody.picnic.items[0].claimedBy, 'Alice');

  const wrongUnclaim = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/unclaim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bob' }),
  });
  assert.equal(wrongUnclaim.status, 409);
});

test('claim/unclaim without a name returns 400', async t => {
  const origin = await fixture(t, { withStore: true });
  const created = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['Cups'] }),
  }).then(r => r.json());
  const response = await fetch(`${origin}/api/picnics/${created.picnic.id}/items/${created.picnic.items[0].id}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
});
