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
    body: JSON.stringify({ name: 'Sunday in the park', date: '2026-10-25', time: '15:30', place: 'Tiergarten', items: ['Cups', 'Blanket'] }),
  });
  assert.equal(response.status, 201);
  const { picnic } = await response.json();
  assert.equal(picnic.name, 'Sunday in the park');
  assert.equal(picnic.time, '15:30');
  assert.equal(picnic.items.length, 2);
  assert.ok(picnic.id.length >= 22);
});

test('create: an invalid time is rejected, a missing time is fine', async t => {
  const origin = await fixture(t, { withStore: true });
  const badTime = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', time: '25:99', items: ['Cups'] }),
  });
  assert.equal(badTime.status, 400);

  const noTime = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['Cups'] }),
  });
  assert.equal(noTime.status, 201);
  const { picnic } = await noTime.json();
  assert.equal(picnic.time, '');
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

test('claim returns a claim token that never appears in a plain GET', async t => {
  const origin = await fixture(t, { withStore: true });
  const created = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['Cups'] }),
  }).then(r => r.json());
  const { id } = created.picnic;
  const itemId = created.picnic.items[0].id;

  const claimed = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }),
  }).then(r => r.json());
  assert.ok(claimed.claimToken, 'claim response carries a token');
  assert.equal('claimToken' in claimed.picnic.items[0], false, 'the picnic object itself never carries the token');

  const fetched = await fetch(`${origin}/api/picnics/${id}`).then(r => r.json());
  assert.equal('claimToken' in fetched.picnic.items[0], false, 'a later GET does not leak it either');
});

test('claiming under someone else\'s typed name with no token is still a conflict (no impersonation)', async t => {
  const origin = await fixture(t, { withStore: true });
  const created = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['Cups'] }),
  }).then(r => r.json());
  const { id } = created.picnic;
  const itemId = created.picnic.items[0].id;

  const claimed = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }),
  });
  assert.equal(claimed.status, 200);

  // A second "device" that only knows (or forwards) Alice's name, without her token.
  const impersonatedClaim = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }),
  });
  assert.equal(impersonatedClaim.status, 409);

  const impersonatedUnclaim = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/unclaim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }),
  });
  assert.equal(impersonatedUnclaim.status, 400, 'no claimToken at all is a bad request, not an authorized unclaim');
});

test('unclaiming with the real token works; a wrong token is a 409 conflict', async t => {
  const origin = await fixture(t, { withStore: true });
  const created = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['Cups'] }),
  }).then(r => r.json());
  const { id } = created.picnic;
  const itemId = created.picnic.items[0].id;

  const { claimToken } = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alice' }),
  }).then(r => r.json());

  const wrongToken = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/unclaim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimToken: 'not-the-real-token' }),
  });
  assert.equal(wrongToken.status, 409);

  const realUnclaim = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/unclaim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ claimToken }),
  });
  assert.equal(realUnclaim.status, 200);
});

test('claim without a name, or unclaim without a claimToken, returns 400', async t => {
  const origin = await fixture(t, { withStore: true });
  const created = await fetch(`${origin}/api/picnics`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sunday', items: ['Cups'] }),
  }).then(r => r.json());
  const itemId = created.picnic.items[0].id;
  const { id } = created.picnic;

  const noName = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(noName.status, 400);

  const noToken = await fetch(`${origin}/api/picnics/${id}/items/${itemId}/unclaim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(noToken.status, 400);
});
