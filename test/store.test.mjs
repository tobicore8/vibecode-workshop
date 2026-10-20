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

test('create then get returns the same picnic, with no claimToken leaked', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const created = await store.createPicnic({ name: 'Sunday', date: '2026-10-25', time: '15:30', place: 'Park', items: ['Cups', 'Blanket'] });
  assert.equal(created.name, 'Sunday');
  assert.equal(created.time, '15:30');
  assert.equal(created.items.length, 2);
  assert.ok(created.id.length >= 22);
  assert.equal('claimToken' in created.items[0], false);

  const fetched = await store.getPicnic(created.id);
  assert.deepEqual(fetched, created);
});

test('unknown id returns null from getPicnic and not_found from claim/unclaim', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  assert.equal(await store.getPicnic('nope'), null);

  const claim = await store.claimItem('nope', 'i1', 'Alice');
  assert.deepEqual(claim, { ok: false, reason: 'not_found', picnic: null });

  const unclaim = await store.unclaimItem('nope', 'i1', 'some-token');
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

test('claiming hands back a token; a second claim without that token is taken', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;

  const first = await store.claimItem(picnic.id, itemId, 'Alice');
  assert.equal(first.ok, true);
  assert.equal(first.picnic.items[0].claimedBy, 'Alice');
  assert.ok(first.token);

  const conflict = await store.claimItem(picnic.id, itemId, 'Bob');
  assert.deepEqual(conflict, { ok: false, reason: 'taken', picnic: conflict.picnic });
  assert.equal(conflict.picnic.items[0].claimedBy, 'Alice', 'no silent overwrite');
});

test('re-claiming with the right token succeeds even under a different typed name', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;

  const first = await store.claimItem(picnic.id, itemId, 'Alice');
  const again = await store.claimItem(picnic.id, itemId, 'Alice (ice box)', first.token);
  assert.equal(again.ok, true);
  assert.equal(again.picnic.items[0].claimedBy, 'Alice (ice box)');
});

test('claiming with someone else\'s typed name but no token is still taken', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;
  await store.claimItem(picnic.id, itemId, 'Alice');

  // Forwarding the link and typing the same name is not proof of identity.
  const impersonation = await store.claimItem(picnic.id, itemId, 'Alice');
  assert.equal(impersonation.ok, false);
  assert.equal(impersonation.reason, 'taken');
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

test('unclaiming without the right token returns not_yours and does not release it', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;
  await store.claimItem(picnic.id, itemId, 'Alice');

  const wrongToken = await store.unclaimItem(picnic.id, itemId, 'not-the-real-token');
  assert.deepEqual(wrongToken, { ok: false, reason: 'not_yours', picnic: wrongToken.picnic });

  const noToken = await store.unclaimItem(picnic.id, itemId, undefined);
  assert.equal(noToken.ok, false);
  assert.equal(noToken.picnic.items[0].claimedBy, 'Alice', 'still claimed after failed attempts');
});

test('unclaiming with the right token releases it; unclaiming an unclaimed item succeeds', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups'] });
  const itemId = picnic.items[0].id;
  const claimed = await store.claimItem(picnic.id, itemId, 'Alice');

  const released = await store.unclaimItem(picnic.id, itemId, claimed.token);
  assert.equal(released.ok, true);
  assert.equal(released.picnic.items[0].claimedBy, null);

  const again = await store.unclaimItem(picnic.id, itemId, claimed.token);
  assert.equal(again.ok, true, 'unclaiming an already-unclaimed item is idempotent');
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

test('data and claim tokens survive a reopen of the store from the same dir', async t => {
  const dir = await tempDir(t);
  const store = await openStore({ dir });
  const picnic = await store.createPicnic({ name: 'Sunday', items: ['Cups', 'Blanket'] });
  const claimed = await store.claimItem(picnic.id, picnic.items[0].id, 'Alice');

  const reopened = await openStore({ dir });
  const fetched = await reopened.getPicnic(picnic.id);
  assert.equal(fetched.items[0].claimedBy, 'Alice');

  const released = await reopened.unclaimItem(picnic.id, picnic.items[0].id, claimed.token);
  assert.equal(released.ok, true, 'the token persisted across the reopen');
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
