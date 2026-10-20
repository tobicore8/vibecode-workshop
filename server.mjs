import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BODY_BYTES = 16 * 1024;
const NAME_MAX_LENGTH = 80;
const PLACE_MAX_LENGTH = 120;
const ITEM_LABEL_MAX_LENGTH = 80;
const ITEM_MAX_COUNT = 50;
const CLAIM_NAME_MAX_LENGTH = 40;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const HTML_TYPE = 'text/html; charset=utf-8';
const CSS_TYPE = 'text/css; charset=utf-8';
const JS_TYPE = 'text/javascript; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const ROUTES = [
  { pattern: /^\/$/, methods: ['GET', 'HEAD'], asset: 'index.html', type: HTML_TYPE },
  { pattern: /^\/p\/([^/]+)$/, methods: ['GET', 'HEAD'], asset: 'picnic.html', type: HTML_TYPE },
  { pattern: /^\/style\.css$/, methods: ['GET', 'HEAD'], asset: 'style.css', type: CSS_TYPE },
  { pattern: /^\/create\.js$/, methods: ['GET', 'HEAD'], asset: 'create.js', type: JS_TYPE },
  { pattern: /^\/picnic\.js$/, methods: ['GET', 'HEAD'], asset: 'picnic.js', type: JS_TYPE },
  { pattern: /^\/api\/health$/, methods: ['GET', 'HEAD'], handle: handleHealth },
  { pattern: /^\/api\/picnics$/, methods: ['POST'], handle: handleCreatePicnic },
  { pattern: /^\/api\/picnics\/([^/]+)$/, methods: ['GET', 'HEAD'], handle: handleGetPicnic },
  { pattern: /^\/api\/picnics\/([^/]+)\/items\/([^/]+)\/claim$/, methods: ['POST'], handle: handleClaimItem },
  { pattern: /^\/api\/picnics\/([^/]+)\/items\/([^/]+)\/unclaim$/, methods: ['POST'], handle: handleUnclaimItem },
];

export function createApp({
  revision = process.env.APP_REVISION || 'development',
  store = null,
  publicDir = fileURLToPath(new URL('./public', import.meta.url)),
} = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'no-store');
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; }
    catch { res.writeHead(400); return res.end('Bad request'); }
    const match = ROUTES.map(route => ({ route, params: route.pattern.exec(path) })).find(entry => entry.params);
    if (!match) { res.writeHead(404); return res.end('Not found'); }
    const { route, params } = match;
    if (!route.methods.includes(req.method)) {
      res.writeHead(405, { allow: route.methods.join(', ') });
      return res.end('Method not allowed');
    }
    const head = req.method === 'HEAD';
    const context = { revision, store, publicDir, head };
    try {
      if (route.asset) return await sendAsset(res, context, route);
      await route.handle(context, req, res, params);
    } catch (error) {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message, ...error.extra }, head);
      console.error('Request failed:', error);
      if (res.headersSent) return res.end();
      sendJson(res, 500, { error: 'Something went wrong on our side. Please try again.' }, head);
    }
  });
}

async function sendAsset(res, { publicDir, head }, route) {
  let body;
  try {
    body = await readFile(join(publicDir, route.asset));
  } catch (error) {
    if (error.code === 'ENOENT') { res.writeHead(404); return res.end('Not found'); }
    console.error('Asset unavailable:', error.message);
    res.writeHead(500);
    return res.end('Page temporarily unavailable');
  }
  res.writeHead(200, { 'content-type': route.type, 'content-length': body.length });
  res.end(head ? undefined : body);
}

function sendJson(res, status, payload, head) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': JSON_TYPE, 'content-length': Buffer.byteLength(body) });
  res.end(head ? undefined : body);
}

function requireStore(store) {
  if (!store) throw new HttpError(503, 'This server has no storage connected yet.');
  return store;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { tooLarge = true; continue; }
      chunks.push(chunk);
    }
  } catch {
    throw new HttpError(400, 'That request could not be read. Please try again.');
  }
  if (tooLarge) throw new HttpError(413, 'That request is too large.');
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) throw new HttpError(400, 'Send the details as JSON.');
  let body;
  try { body = JSON.parse(raw); }
  catch { throw new HttpError(400, 'That request is not valid JSON.'); }
  return body;
}

function decodeSegment(segment) {
  try { return decodeURIComponent(segment); }
  catch { return segment; }
}

function trimmedText(value, { max, missing, tooLong }) {
  if (typeof value !== 'string') throw new HttpError(400, missing);
  const text = value.trim();
  if (!text) throw new HttpError(400, missing);
  if (text.length > max) throw new HttpError(400, tooLong);
  return text;
}

function validateDate(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, 'Use a date like 2026-10-25.');
  const date = value.trim();
  if (!date) return '';
  if (!DATE_PATTERN.test(date) || !isRealDate(date)) {
    throw new HttpError(400, 'Use a date like 2026-10-25.');
  }
  return date;
}

function isRealDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validatePlace(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, 'The place should be text.');
  const place = value.trim();
  if (place.length > PLACE_MAX_LENGTH) {
    throw new HttpError(400, `That place is too long. Keep it under ${PLACE_MAX_LENGTH} characters.`);
  }
  return place;
}

function validateItems(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Add at least one item to the list.');
  const labels = [];
  for (const entry of value) {
    if (typeof entry !== 'string') throw new HttpError(400, 'Every item on the list needs a name.');
    const label = entry.trim();
    if (!label) continue;
    if (label.length > ITEM_LABEL_MAX_LENGTH) {
      throw new HttpError(400, `That item name is too long. Keep it under ${ITEM_LABEL_MAX_LENGTH} characters.`);
    }
    labels.push(label);
  }
  if (!labels.length) throw new HttpError(400, 'Add at least one item to the list.');
  if (labels.length > ITEM_MAX_COUNT) {
    throw new HttpError(400, `That list has more than ${ITEM_MAX_COUNT} items. Split it into smaller lists.`);
  }
  return labels;
}

function validatePicnicInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Send the picnic details as JSON.');
  }
  const name = trimmedText(body.name, {
    max: NAME_MAX_LENGTH,
    missing: 'Give the picnic a name.',
    tooLong: `That picnic name is too long. Keep it under ${NAME_MAX_LENGTH} characters.`,
  });
  return { name, date: validateDate(body.date), place: validatePlace(body.place), items: validateItems(body.items) };
}

function validateClaimName(value) {
  return trimmedText(value, {
    max: CLAIM_NAME_MAX_LENGTH,
    missing: 'Enter your name so everyone knows it is yours.',
    tooLong: `That name is too long. Keep it under ${CLAIM_NAME_MAX_LENGTH} characters.`,
  });
}

function handleHealth({ revision, head }, req, res) {
  sendJson(res, 200, { ok: true, revision }, head);
}

async function handleCreatePicnic({ store, head }, req, res) {
  const input = validatePicnicInput(await readJsonBody(req));
  const picnic = await requireStore(store).createPicnic(input);
  sendJson(res, 201, { picnic }, head);
}

async function handleGetPicnic({ store, head }, req, res, params) {
  const picnic = await requireStore(store).getPicnic(decodeSegment(params[1]));
  if (!picnic) throw new HttpError(404, "We couldn't find that picnic.");
  sendJson(res, 200, { picnic }, head);
}

async function handleClaimItem({ store, head }, req, res, params) {
  const body = await readJsonBody(req);
  const name = validateClaimName(body && typeof body === 'object' && !Array.isArray(body) ? body.name : undefined);
  const result = await requireStore(store).claimItem(decodeSegment(params[1]), decodeSegment(params[2]), name);
  applyItemResult(res, result, head);
}

async function handleUnclaimItem({ store, head }, req, res, params) {
  const body = await readJsonBody(req);
  const name = validateClaimName(body && typeof body === 'object' && !Array.isArray(body) ? body.name : undefined);
  const result = await requireStore(store).unclaimItem(decodeSegment(params[1]), decodeSegment(params[2]), name);
  applyItemResult(res, result, head);
}

function applyItemResult(res, result, head) {
  if (result.ok) return sendJson(res, 200, { picnic: result.picnic }, head);
  if (result.reason === 'taken') {
    throw new HttpError(409, 'Someone else already claimed that.', { picnic: result.picnic });
  }
  if (result.reason === 'not_yours') {
    throw new HttpError(409, 'Only the person who claimed that can release it.', { picnic: result.picnic });
  }
  if (result.reason === 'not_found') {
    const message = result.picnic ? "We couldn't find that item." : "We couldn't find that picnic.";
    throw new HttpError(404, message);
  }
  throw new HttpError(409, 'That item could not be updated.', { picnic: result.picnic });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const app = createApp();
  app.on('error', error => { console.error(error.message); process.exitCode = 1; });
  app.listen(port, host, () => console.log(`Workshop app listening on ${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      app.close(() => process.exit(0));
      app.closeIdleConnections();
    });
  }
}
