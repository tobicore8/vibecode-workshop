import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_FILE, openStore } from '../lib/store.mjs';

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'picnic-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const sample = { name: 'Sunday in the park', date: '2026-10-25', place: 'By the pond', items: ['Cups', 'Blanket'] };

test('a created picnic can be read back with unclaimed items and an unguessable id', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic(sample);
  assert.match(picnic.id, /^[A-Za-z0-9_-]{22,}$/);
  assert.deepEqual(picnic.items, [
    { id: 'i1', label: 'Cups', claimedBy: null },
    { id: 'i2', label: 'Blanket', claimedBy: null },
  ]);
  assert.deepEqual(await store.getPicnic(picnic.id), picnic);
  assert.notEqual((await store.createPicnic(sample)).id, picnic.id);
});

test('unknown picnics and items are not found', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  assert.equal(await store.getPicnic('nope'), null);
  assert.deepEqual(await store.claimItem('nope', 'i1', 'Thilo'), { ok: false, reason: 'not_found', picnic: null });
  const picnic = await store.createPicnic(sample);
  const result = await store.claimItem(picnic.id, 'i99', 'Thilo');
  assert.equal(result.reason, 'not_found');
  assert.equal(result.picnic.id, picnic.id);
});

test('first claim wins; the holder may re-claim and unclaim, others may not', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const { id } = await store.createPicnic(sample);
  const claimed = await store.claimItem(id, 'i1', '  Thilo ');
  assert.equal(claimed.ok, true);
  assert.equal(claimed.picnic.items[0].claimedBy, 'Thilo');
  assert.equal((await store.claimItem(id, 'i1', 'Thilo')).ok, true);

  const taken = await store.claimItem(id, 'i1', 'Eduardo');
  assert.deepEqual([taken.ok, taken.reason, taken.picnic.items[0].claimedBy], [false, 'taken', 'Thilo']);
  const notYours = await store.unclaimItem(id, 'i1', 'Eduardo');
  assert.deepEqual([notYours.ok, notYours.reason], [false, 'not_yours']);

  const released = await store.unclaimItem(id, 'i1', 'Thilo');
  assert.equal(released.picnic.items[0].claimedBy, null);
  assert.equal((await store.unclaimItem(id, 'i1', 'Tobias')).ok, true, 'unclaiming a free item succeeds');
});

test('simultaneous claims for one item never both succeed', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const { id } = await store.createPicnic(sample);
  const results = await Promise.all(['Thilo', 'Eduardo', 'Tobias'].map(name => store.claimItem(id, 'i2', name)));
  assert.equal(results.filter(result => result.ok).length, 1);
  const winner = results.findIndex(result => result.ok);
  assert.equal((await store.getPicnic(id)).items[1].claimedBy, ['Thilo', 'Eduardo', 'Tobias'][winner]);
});

test('returned picnics are copies', async t => {
  const store = await openStore({ dir: await tempDir(t) });
  const picnic = await store.createPicnic(sample);
  picnic.items[0].claimedBy = 'Mallory';
  (await store.getPicnic(picnic.id)).name = 'changed';
  const stored = await store.getPicnic(picnic.id);
  assert.equal(stored.items[0].claimedBy, null);
  assert.equal(stored.name, sample.name);
});

test('picnics and claims survive reopening the store from the same directory', async t => {
  const dir = await tempDir(t);
  const first = await openStore({ dir });
  const { id } = await first.createPicnic(sample);
  await first.claimItem(id, 'i2', 'Eduardo');
  const reopened = await openStore({ dir });
  const picnic = await reopened.getPicnic(id);
  assert.equal(picnic.name, sample.name);
  assert.equal(picnic.items[1].claimedBy, 'Eduardo');
  assert.deepEqual((await readdir(dir)).sort(), [DATA_FILE]);
});

test('a missing directory or file means empty storage', async t => {
  const dir = join(await tempDir(t), 'nested', 'data');
  const store = await openStore({ dir });
  assert.equal(await store.getPicnic('anything'), null);
});

test('a corrupt file is kept aside and not overwritten', async t => {
  const dir = await tempDir(t);
  await writeFile(join(dir, DATA_FILE), '{ not json');
  const logged = [];
  t.mock.method(console, 'error', message => logged.push(message));
  const store = await openStore({ dir });
  assert.equal(await store.getPicnic('anything'), null);
  await store.createPicnic(sample);
  const kept = (await readdir(dir)).find(name => name.startsWith(`${DATA_FILE}.corrupt-`));
  assert.ok(kept, 'corrupt file kept');
  assert.equal(await readFile(join(dir, kept), 'utf8'), '{ not json');
  assert.match(logged.join('\n'), /unreadable/);
});
