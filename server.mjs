import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';
import { openStore } from './lib/store.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const INVALID_BODY = Symbol('invalid-body');

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/create.js', ['create.js', 'text/javascript; charset=utf-8']],
  ['/picnic.js', ['picnic.js', 'text/javascript; charset=utf-8']],
  ['/background.jpg', ['background.jpg', 'image/jpeg']],
]);

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req, res) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      sendJson(res, 413, { error: 'Request body is too large.' });
      req.destroy();
      return INVALID_BODY;
    }
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    sendJson(res, 400, { error: 'Request body must be valid JSON.' });
    return INVALID_BODY;
  }
}

function validateCreateInput(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Invalid request body.' };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Picnic name is required.' };
  if (name.length > 80) return { error: 'Picnic name must be 80 characters or fewer.' };

  const date = typeof body.date === 'string' ? body.date : '';
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date must look like YYYY-MM-DD.' };

  const place = typeof body.place === 'string' ? body.place.trim() : '';
  if (place.length > 120) return { error: 'Place must be 120 characters or fewer.' };

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (items.length === 0) return { error: 'Add at least one item.' };
  if (items.length > 50) return { error: 'Add 50 items or fewer.' };
  if (items.some(item => item.length > 80)) return { error: 'Items must be 80 characters or fewer.' };

  return { value: { name, date, place, items } };
}

export function createApp({ revision = process.env.APP_REVISION || 'development', store } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'no-store');

    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; }
    catch { res.writeHead(400); return res.end('Bad request'); }

    if (path === '/api/health') {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { allow: 'GET, HEAD' });
        return res.end('Method not allowed');
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, revision }));
    }

    if (path === '/api/picnics') {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        return res.end('Method not allowed');
      }
      const body = await readJsonBody(req, res);
      if (body === INVALID_BODY) return;
      const { error, value } = validateCreateInput(body);
      if (error) return sendJson(res, 400, { error });
      const picnic = await store.createPicnic(value);
      return sendJson(res, 201, { picnic });
    }

    const picnicMatch = path.match(/^\/api\/picnics\/([^/]+)$/);
    if (picnicMatch) {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' });
        return res.end('Method not allowed');
      }
      const picnic = await store.getPicnic(picnicMatch[1]);
      if (!picnic) return sendJson(res, 404, { error: 'Picnic not found.' });
      return sendJson(res, 200, { picnic });
    }

    const actionMatch = path.match(/^\/api\/picnics\/([^/]+)\/items\/([^/]+)\/(claim|unclaim)$/);
    if (actionMatch) {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        return res.end('Method not allowed');
      }
      const [, id, itemId, action] = actionMatch;
      const body = await readJsonBody(req, res);
      if (body === INVALID_BODY) return;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return sendJson(res, 400, { error: 'Your name is required.' });

      const result = action === 'claim'
        ? await store.claimItem(id, itemId, name)
        : await store.unclaimItem(id, itemId, name);

      if (result.ok) return sendJson(res, 200, { picnic: result.picnic });
      if (result.reason === 'not_found') return sendJson(res, 404, { error: 'Picnic or item not found.' });
      const message = result.reason === 'taken'
        ? 'Someone else already claimed this.'
        : 'Only the person who claimed this can unclaim it.';
      return sendJson(res, 409, { error: message, picnic: result.picnic });
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { allow: 'GET, HEAD' });
      return res.end('Method not allowed');
    }

    if (/^\/p\/[^/]+$/.test(path)) {
      try {
        const html = await readFile(new URL('./public/picnic.html', import.meta.url));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(req.method === 'HEAD' ? undefined : html);
      } catch (error) {
        console.error('Picnic page unavailable:', error.message);
        res.writeHead(500);
        return res.end('Page temporarily unavailable');
      }
    }

    const asset = assets.get(path);
    if (!asset) { res.writeHead(404); return res.end('Not found'); }
    try {
      const body = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
      res.writeHead(200, { 'content-type': asset[1] });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error('Asset unavailable:', error.message);
      res.writeHead(500);
      res.end('Page temporarily unavailable');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const dir = process.env.DATA_DIR || path.join(homedir(), '.local/share/vibecode-workshop/data');
  const store = await openStore({ dir });
  const app = createApp({ store });
  app.on('error', error => { console.error(error.message); process.exitCode = 1; });
  app.listen(port, host, () => console.log(`Workshop app listening on ${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      app.close(() => process.exit(0));
      app.closeIdleConnections();
    });
  }
}
