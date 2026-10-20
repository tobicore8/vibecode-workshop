import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Picnics live in one JSON file outside the release directory, so data survives
// restarts and redeploys. See docs/contract.md for the interface.
export const DATA_FILE = 'picnics.json';

export function defaultDataDir() {
  return process.env.DATA_DIR || join(homedir(), '.local/share/vibecode-workshop/data');
}

async function load(file) {
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data.picnics !== 'object' || Array.isArray(data.picnics)) throw new Error('missing picnics object');
    return new Map(Object.entries(data.picnics));
  } catch (error) {
    // Keep the unreadable file for recovery and start empty, rather than overwriting it.
    const kept = `${file}.corrupt-${Date.now()}`;
    await rename(file, kept);
    console.error(`Picnic data unreadable (${error.message}); kept as ${kept}, starting empty`);
    return new Map();
  }
}

export async function openStore({ dir = defaultDataDir() } = {}) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, DATA_FILE);
  const picnics = await load(file);
  let queue = Promise.resolve();

  // Writes run one at a time; each writes the whole current state to a temporary
  // file and renames it into place, so a crash never leaves a half-written file.
  function save() {
    const run = queue.then(async () => {
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify({ version: 1, picnics: Object.fromEntries(picnics) }), { flush: true });
      await rename(temp, file);
    });
    queue = run.catch(() => {});
    return run;
  }

  const copy = picnic => picnic && structuredClone(picnic);

  // Check and change happen synchronously before any await, so two claims for
  // the same item can never both succeed.
  async function setClaim(id, itemId, name, claiming) {
    const picnic = picnics.get(id);
    const item = picnic?.items.find(entry => entry.id === itemId);
    if (!item) return { ok: false, reason: 'not_found', picnic: copy(picnic) ?? null };
    name = name.trim();
    if (claiming && item.claimedBy !== null && item.claimedBy !== name) return { ok: false, reason: 'taken', picnic: copy(picnic) };
    if (!claiming && item.claimedBy !== null && item.claimedBy !== name) return { ok: false, reason: 'not_yours', picnic: copy(picnic) };
    const previous = item.claimedBy;
    const next = claiming ? name : null;
    if (previous === next) return { ok: true, picnic: copy(picnic) };
    item.claimedBy = next;
    try { await save(); }
    catch (error) {
      if (item.claimedBy === next) item.claimedBy = previous;
      throw error;
    }
    return { ok: true, picnic: copy(picnic) };
  }

  return {
    async createPicnic({ name, date = '', place = '', items }) {
      let id;
      do { id = randomBytes(16).toString('base64url'); } while (picnics.has(id));
      const picnic = {
        id,
        name,
        date,
        place,
        createdAt: new Date().toISOString(),
        items: items.map((label, index) => ({ id: `i${index + 1}`, label, claimedBy: null })),
      };
      picnics.set(id, picnic);
      try { await save(); }
      catch (error) {
        picnics.delete(id);
        throw error;
      }
      return copy(picnic);
    },
    async getPicnic(id) {
      return copy(picnics.get(id)) ?? null;
    },
    claimItem: (id, itemId, name) => setClaim(id, itemId, name, true),
    unclaimItem: (id, itemId, name) => setClaim(id, itemId, name, false),
  };
}
