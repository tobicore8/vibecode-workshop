import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';

const PAGES = {
  'index.html': '<!doctype html><title>Create</title><h1>Create a picnic</h1>',
  'picnic.html': '<!doctype html><title>Picnic</title><h1>Picnic page</h1>',
  'style.css': 'body { color: #222; }',
  'create.js': 'export const create = true;',
  'picnic.js': 'export const picnic = true;',
};

function fakeStore() {
  const picnics = new Map();
  let created = 0;
  return {
    async createPicnic({ name, date, place, items }) {
      created += 1;
      const id = `picnic-${created}`;
      const picnic = {
        id,
        name,
        date,
        place,
        createdAt: '2026-10-20T12:00:00.000Z',
        items: items.map((label, index) => ({ id: `${id}-item-${index + 1}`, label, claimedBy: null })),
      };
      picnics.set(id, picnic);
      return structuredClone(picnic);
    },
    async getPicnic(id) {
      const picnic = picnics.get(id);
      return picnic ? structuredClone(picnic) : null;
    },
    async claimItem(id, itemId, name) {
      const picnic = picnics.get(id);
      if (!picnic) return { ok: false, reason: 'not_found', picnic: null };
      const item = picnic.items.find(entry => entry.id === itemId);
      if (!item) return { ok: false, reason: 'not_found', picnic: structuredClone(picnic) };
      if (item.claimedBy && item.claimedBy !== name) {
        return { ok: false, reason: 'taken', picnic: structuredClone(picnic) };
      }
      item.claimedBy = name;
      return { ok: true, picnic: structuredClone(picnic) };
    },
    async unclaimItem(id, itemId, name) {
      const picnic = picnics.get(id);
      if (!picnic) return { ok: false, reason: 'not_found', picnic: null };
      const item = picnic.items.find(entry => entry.id === itemId);
      if (!item) return { ok: false, reason: 'not_found', picnic: structuredClone(picnic) };
      if (item.claimedBy && item.claimedBy !== name) {
        return { ok: false, reason: 'not_yours', picnic: structuredClone(picnic) };
      }
      item.claimedBy = null;
      return { ok: true, picnic: structuredClone(picnic) };
    },
  };
}

async function fixture(t, { withStore = true, publicDir } = {}) {
  let dir = publicDir;
  if (!dir) {
    dir = mkdtempSync(join(tmpdir(), 'picnic-public-'));
    for (const [name, body] of Object.entries(PAGES)) writeFileSync(join(dir, name), body);
    writeFileSync(join(dir, 'secret.txt'), 'not for the web');
  }
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const app = createApp({ revision: 'test-revision', store: withStore ? fakeStore() : null, publicDir: dir });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.close(resolve); app.closeAllConnections(); }));
  return `http://127.0.0.1:${app.address().port}`;
}

async function createPicnic(origin, body = { name: 'Sunday in the park', items: ['Cups', 'Blanket'] }) {
  const response = await fetch(`${origin}/api/picnics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response;
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

test('the picnic page and the page scripts are served', async t => {
  const origin = await fixture(t);
  const page = await fetch(`${origin}/p/picnic-1`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Picnic page/);
  for (const script of ['/create.js', '/picnic.js']) {
    const response = await fetch(origin + script);
    assert.equal(response.status, 200, script);
    assert.match(response.headers.get('content-type'), /javascript/, script);
  }
});

test('repository files and traversal requests cannot be downloaded', async t => {
  const origin = await fixture(t);
  for (const path of ['/.env', '/AGENTS.md', '/package.json', '/.git/config', '/%2e%2e/.env', '/public/../server.mjs', '/secret.txt']) {
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
  const get = await fetch(`${origin}/api/picnics`);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
});

test('a valid picnic is created and can be read back', async t => {
  const origin = await fixture(t);
  const created = await createPicnic(origin);
  assert.equal(created.status, 201);
  assert.match(created.headers.get('content-type'), /application\/json/);
  const { picnic } = await created.json();
  assert.equal(picnic.name, 'Sunday in the park');
  assert.equal(picnic.date, '');
  assert.equal(picnic.place, '');
  assert.deepEqual(picnic.items.map(item => item.label), ['Cups', 'Blanket']);
  assert.equal(picnic.items[0].claimedBy, null);

  const read = await fetch(`${origin}/api/picnics/${picnic.id}`);
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).picnic, picnic);
});

test('a picnic without a name or without items is rejected', async t => {
  const origin = await fixture(t);
  const cases = [
    { name: '  ', items: ['Cups'] },
    { items: ['Cups'] },
    { name: 'Sunday in the park', items: [] },
    { name: 'Sunday in the park', items: ['   ', ''] },
    { name: 'Sunday in the park' },
  ];
  for (const body of cases) {
    const response = await createPicnic(origin, body);
    assert.equal(response.status, 400, JSON.stringify(body));
    const payload = await response.json();
    assert.equal(typeof payload.error, 'string');
    assert.ok(payload.error.length > 0);
  }
  assert.equal((await fetch(`${origin}/api/picnics`)).status, 405);
});

test('text that is too long and lists that are too big are rejected', async t => {
  const origin = await fixture(t);
  const longName = await createPicnic(origin, { name: 'x'.repeat(81), items: ['Cups'] });
  assert.equal(longName.status, 400);
  const longItem = await createPicnic(origin, { name: 'Sunday', items: ['x'.repeat(81)] });
  assert.equal(longItem.status, 400);
  const longPlace = await createPicnic(origin, { name: 'Sunday', place: 'x'.repeat(121), items: ['Cups'] });
  assert.equal(longPlace.status, 400);
  const manyItems = await createPicnic(origin, { name: 'Sunday', items: Array.from({ length: 51 }, (_, i) => `Item ${i}`) });
  assert.equal(manyItems.status, 400);
  const fiftyItems = await createPicnic(origin, { name: 'Sunday', items: Array.from({ length: 50 }, (_, i) => `Item ${i}`) });
  assert.equal(fiftyItems.status, 201);
});

test('a date must look like a date', async t => {
  const origin = await fixture(t);
  const good = await createPicnic(origin, { name: 'Sunday', date: '2026-10-25', place: 'Tiergarten', items: ['Cups'] });
  assert.equal(good.status, 201);
  const { picnic } = await good.json();
  assert.equal(picnic.date, '2026-10-25');
  assert.equal(picnic.place, 'Tiergarten');
  for (const date of ['25-10-2026', '2026-13-01', '2026-02-30', 'tomorrow']) {
    const response = await createPicnic(origin, { name: 'Sunday', date, items: ['Cups'] });
    assert.equal(response.status, 400, date);
  }
});

test('an oversized body is rejected with 413 and a broken body with 400', async t => {
  const origin = await fixture(t);
  const oversized = await createPicnic(origin, { name: 'x'.repeat(20000), items: ['Cups'] });
  assert.equal(oversized.status, 413);
  const broken = await fetch(`${origin}/api/picnics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  });
  assert.equal(broken.status, 400);
  const empty = await fetch(`${origin}/api/picnics`, { method: 'POST' });
  assert.equal(empty.status, 400);
});

test('an unknown picnic returns 404', async t => {
  const origin = await fixture(t);
  const read = await fetch(`${origin}/api/picnics/does-not-exist`);
  assert.equal(read.status, 404);
  const payload = await read.json();
  assert.equal(typeof payload.error, 'string');
  assert.equal(payload.picnic, undefined);
});

test('claiming marks the item and a second claim returns 409 with the current picnic', async t => {
  const origin = await fixture(t);
  const { picnic } = await (await createPicnic(origin)).json();
  const itemId = picnic.items[0].id;

  const claimed = await fetch(`${origin}/api/picnics/${picnic.id}/items/${itemId}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana' }),
  });
  assert.equal(claimed.status, 200);
  assert.equal((await claimed.json()).picnic.items[0].claimedBy, 'Ana');

  const sameName = await fetch(`${origin}/api/picnics/${picnic.id}/items/${itemId}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana' }),
  });
  assert.equal(sameName.status, 200);

  const other = await fetch(`${origin}/api/picnics/${picnic.id}/items/${itemId}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ben' }),
  });
  assert.equal(other.status, 409);
  const conflict = await other.json();
  assert.equal(typeof conflict.error, 'string');
  assert.equal(conflict.picnic.items[0].claimedBy, 'Ana');
});

test('unclaiming by another name returns 409 and the owner can release the item', async t => {
  const origin = await fixture(t);
  const { picnic } = await (await createPicnic(origin)).json();
  const itemId = picnic.items[0].id;
  const claim = () => fetch(`${origin}/api/picnics/${picnic.id}/items/${itemId}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana' }),
  });
  const unclaim = name => fetch(`${origin}/api/picnics/${picnic.id}/items/${itemId}/unclaim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  await claim();
  const wrongName = await unclaim('Ben');
  assert.equal(wrongName.status, 409);
  const conflict = await wrongName.json();
  assert.equal(typeof conflict.error, 'string');
  assert.equal(conflict.picnic.items[0].claimedBy, 'Ana');

  const released = await unclaim('Ana');
  assert.equal(released.status, 200);
  assert.equal((await released.json()).picnic.items[0].claimedBy, null);
});

test('claiming without a name is rejected and an unknown item returns 404', async t => {
  const origin = await fixture(t);
  const { picnic } = await (await createPicnic(origin)).json();
  const itemId = picnic.items[0].id;
  const claim = body => fetch(`${origin}/api/picnics/${picnic.id}/items/${itemId}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal((await claim({ name: '   ' })).status, 400);
  assert.equal((await claim({})).status, 400);
  assert.equal((await claim({ name: 'x'.repeat(41) })).status, 400);

  const unknownItem = await fetch(`${origin}/api/picnics/${picnic.id}/items/nope/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana' }),
  });
  assert.equal(unknownItem.status, 404);
});

test('the api says so when no store is connected', async t => {
  const origin = await fixture(t, { withStore: false });
  const created = await createPicnic(origin);
  assert.equal(created.status, 503);
  assert.equal(typeof (await created.json()).error, 'string');
  const read = await fetch(`${origin}/api/picnics/anything`);
  assert.equal(read.status, 503);
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
});
