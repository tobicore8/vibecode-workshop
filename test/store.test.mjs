import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../lib/store.mjs';

async function tempDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'picnic-store-'));
  return dir;
}

test('create then get returns the same picnic', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const created = await store.createPicnic({ name: 'Sunday', date: '2026-10-25', place: 'Park', items: ['Cups', 'Blanket'] });
  assert.equal(created.name, 'Sunday');
  assert.equal(created.items.length, 2);
  assert.ok(created.id.length >= 22);

  const fetched = await store.getPicnic(created.id);
  assert.deepEqual(fetched, created);
});

test('unknown id returns null from getPicnic and not_found from claim/unclaim', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  assert.equal(await store.getPicnic('nope'), null);

  const claim = await store.claimItem('nope', 'i1', 'Alice');
  assert.deepEqual(claim, { ok: false, reason: 'not_found', picnic: null });

  const unclaim = await store.unclaimItem('nope', 'i1', 'Alice');
  assert.deepEqual(unclaim, { ok: false, reason: 'not_found', picnic: null });
});

test('unknown item on a known picnic returns not_found with the picnic attached', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const result = await store.claimItem(picnic.id, 'does-not-exist', 'Alice');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_found');
  assert.equal(result.picnic.id, picnic.id);
});

test('claim, re-claim by the same name, and claim by another name returns taken', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;

  const first = await store.claimItem(picnic.id, itemId, 'Alice');
  assert.equal(first.ok, true);
  assert.equal(first.picnic.items[0].claimedBy, 'Alice');

  const again = await store.claimItem(picnic.id, itemId, 'Alice');
  assert.equal(again.ok, true, 'claiming your own already-claimed item succeeds');
  assert.equal(again.picnic.items[0].claimedBy, 'Alice');

  const conflict = await store.claimItem(picnic.id, itemId, 'Bob');
  assert.deepEqual(conflict, { ok: false, reason: 'taken', picnic: conflict.picnic });
  assert.equal(conflict.picnic.items[0].claimedBy, 'Alice', 'no silent overwrite');
});

test('two concurrent claims for the same item never both succeed', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;

  const [a, b] = await Promise.all([
    store.claimItem(picnic.id, itemId, 'Alice'),
    store.claimItem(picnic.id, itemId, 'Bob'),
  ]);
  const winners = [a, b].filter(r => r.ok);
  assert.equal(winners.length, 1, 'exactly one of the two concurrent claims wins');
});

test('unclaim by the wrong name returns not_yours and does not release it', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;
  await store.claimItem(picnic.id, itemId, 'Alice');

  const result = await store.unclaimItem(picnic.id, itemId, 'Bob');
  assert.deepEqual(result, { ok: false, reason: 'not_yours', picnic: result.picnic });
  assert.equal(result.picnic.items[0].claimedBy, 'Alice');

  const released = await store.unclaimItem(picnic.id, itemId, 'Alice');
  assert.equal(released.ok, true);
  assert.equal(released.picnic.items[0].claimedBy, null);
});

test('unclaiming an item nobody holds succeeds', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const result = await store.unclaimItem(picnic.id, picnic.items[0].id, 'Alice');
  assert.equal(result.ok, true);
  assert.equal(result.picnic.items[0].claimedBy, null);
});

test('returned picnics are copies; mutating them does not change stored data', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  picnic.name = 'Mutated';
  picnic.items[0].claimedBy = 'Hacker';

  const fetched = await store.getPicnic(picnic.id);
  assert.equal(fetched.name, 'Sunday');
  assert.equal(fetched.items[0].claimedBy, null);
});

test('data survives a reopen of the store from the same dir', async t => {
  const dir = await tempDir(t);
  const store = await openStore({ dir });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups', 'Blanket'] });
  await store.claimItem(picnic.id, picnic.items[0].id, 'Alice');

  const reopened = await openStore({ dir });
  const fetched = await reopened.getPicnic(picnic.id);
  assert.equal(fetched.name, 'Sunday');
  assert.equal(fetched.items[0].claimedBy, 'Alice');
});

test('a missing data file means empty storage, no error', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  assert.equal(await store.getPicnic('anything'), null);
});

test('a corrupt data file is logged and kept, never silently replaced', async t => {
  const dir = await tempDir(t);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'picnics.json');
  await writeFile(filePath, '{ this is not valid json', 'utf8');

  const store = await openStore({ dir });
  assert.equal(await store.getPicnic('anything'), null, 'starts empty rather than crashing');

  const onDisk = await readFile(filePath, 'utf8');
  assert.equal(onDisk, '{ this is not valid json', 'corrupt file is untouched immediately after opening');
});
