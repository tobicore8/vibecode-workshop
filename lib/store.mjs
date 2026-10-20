import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const FILE_NAME = 'picnics.json';

function newId() {
  return crypto.randomBytes(18).toString('base64url');
}

function newClaimToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function clone(value) {
  return structuredClone(value);
}

// claimToken is a per-claim secret, known only to the device that made the
// claim (see createApp in server.mjs) and never included in a picnic object
// handed back to callers — only the claim response's separate `token` field
// carries it, once, to the claimer.
function toPublicPicnic(picnic) {
  return {
    ...picnic,
    items: picnic.items.map(({ claimToken, ...item }) => item),
  };
}

export async function openStore({ dir }) {
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, FILE_NAME);

  const picnics = new Map();

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    for (const picnic of Object.values(parsed)) picnics.set(picnic.id, picnic);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Picnic data file is corrupt, starting this session empty without touching it on disk: ${error.message}`);
    }
  }

  // Not called during load, so a corrupt or missing file is left exactly as found
  // until the next real mutation naturally produces a fresh snapshot to write.
  let writeQueue = Promise.resolve();
  function persist() {
    const snapshot = JSON.stringify(Object.fromEntries(picnics));
    writeQueue = writeQueue.then(async () => {
      const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await writeFile(tmpPath, snapshot, 'utf8');
      try {
        await rename(tmpPath, filePath);
      } catch (error) {
        await unlink(tmpPath).catch(() => {});
        throw error;
      }
    });
    return writeQueue;
  }

  async function createPicnic({ name, date, time, place, items }) {
    const picnic = {
      id: newId(),
      name,
      date: date || '',
      time: time || '',
      place: place || '',
      createdAt: new Date().toISOString(),
      items: items.map((label, index) => ({ id: `i${index + 1}`, label, claimedBy: null, claimToken: null })),
    };
    picnics.set(picnic.id, picnic);
    await persist();
    return toPublicPicnic(clone(picnic));
  }

  async function getPicnic(id) {
    const picnic = picnics.get(id);
    return picnic ? toPublicPicnic(clone(picnic)) : null;
  }

  /**
   * token is the caller's proof of a prior claim on this exact item, if any
   * (the browser's stored secret for itemId). It authorizes both re-claiming
   * (idempotent, e.g. after a reload) and unclaiming — the typed `name` is
   * display-only and never grants access by itself.
   */
  async function claimItem(id, itemId, name, token = null) {
    const picnic = picnics.get(id);
    if (!picnic) return { ok: false, reason: 'not_found', picnic: null };

    const item = picnic.items.find(i => i.id === itemId);
    if (!item) return { ok: false, reason: 'not_found', picnic: toPublicPicnic(clone(picnic)) };

    const trimmedName = name.trim();

    if (item.claimedBy) {
      if (!item.claimToken || item.claimToken !== token) {
        return { ok: false, reason: 'taken', picnic: toPublicPicnic(clone(picnic)) };
      }
      item.claimedBy = trimmedName;
      await persist();
      return { ok: true, picnic: toPublicPicnic(clone(picnic)), token: item.claimToken };
    }

    item.claimedBy = trimmedName;
    item.claimToken = newClaimToken();
    await persist();
    return { ok: true, picnic: toPublicPicnic(clone(picnic)), token: item.claimToken };
  }

  async function unclaimItem(id, itemId, token) {
    const picnic = picnics.get(id);
    if (!picnic) return { ok: false, reason: 'not_found', picnic: null };

    const item = picnic.items.find(i => i.id === itemId);
    if (!item) return { ok: false, reason: 'not_found', picnic: toPublicPicnic(clone(picnic)) };

    if (!item.claimedBy) {
      return { ok: true, picnic: toPublicPicnic(clone(picnic)) };
    }

    if (!item.claimToken || item.claimToken !== token) {
      return { ok: false, reason: 'not_yours', picnic: toPublicPicnic(clone(picnic)) };
    }

    item.claimedBy = null;
    item.claimToken = null;
    await persist();
    return { ok: true, picnic: toPublicPicnic(clone(picnic)) };
  }

  return { createPicnic, getPicnic, claimItem, unclaimItem };
}
