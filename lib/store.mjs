import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const FILE_NAME = 'picnics.json';

function newId() {
  return crypto.randomBytes(18).toString('base64url');
}

function clone(value) {
  return structuredClone(value);
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

  async function createPicnic({ name, date, place, items }) {
    const picnic = {
      id: newId(),
      name,
      date: date || '',
      place: place || '',
      createdAt: new Date().toISOString(),
      items: items.map((label, index) => ({ id: `i${index + 1}`, label, claimedBy: null })),
    };
    picnics.set(picnic.id, picnic);
    await persist();
    return clone(picnic);
  }

  async function getPicnic(id) {
    const picnic = picnics.get(id);
    return picnic ? clone(picnic) : null;
  }

  async function setClaim(id, itemId, name, { claiming }) {
    const picnic = picnics.get(id);
    if (!picnic) return { ok: false, reason: 'not_found', picnic: null };

    const item = picnic.items.find(i => i.id === itemId);
    if (!item) return { ok: false, reason: 'not_found', picnic: clone(picnic) };

    const trimmedName = name.trim();

    if (claiming) {
      if (item.claimedBy && item.claimedBy !== trimmedName) {
        return { ok: false, reason: 'taken', picnic: clone(picnic) };
      }
      item.claimedBy = trimmedName;
    } else {
      if (item.claimedBy && item.claimedBy !== trimmedName) {
        return { ok: false, reason: 'not_yours', picnic: clone(picnic) };
      }
      item.claimedBy = null;
    }

    await persist();
    return { ok: true, picnic: clone(picnic) };
  }

  return {
    createPicnic,
    getPicnic,
    claimItem: (id, itemId, name) => setClaim(id, itemId, name, { claiming: true }),
    unclaimItem: (id, itemId, name) => setClaim(id, itemId, name, { claiming: false }),
  };
}
