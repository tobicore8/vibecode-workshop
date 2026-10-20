# Picnic Planner — shared contract

M1.3 (storage), M1.4 (API) and M1.5 (UI) are built in parallel against this file. Do not change it on your own branch. If it must change, agree with the other two first, then change it in a small PR to main that everyone rebases onto.

## File ownership

| Owner | Step | Owns (only this person edits) | Branch |
|---|---|---|---|
| Thilo | M1.1, M1.3 | `lib/store.mjs`, `test/store.test.mjs`, deployment and `docs/deploy.md` notes | `m1.1-live-page`, `m1.3-store` |
| Eduardo | M1.4 | `server.mjs`, `test/app.test.mjs` | `m1.4-api` |
| Tobias | M1.5 | everything in `public/` | `m1.5-ui` |

Shared files (`PLAN.md`, `IDEA.md`, this contract, `package.json`) change only through a small PR to main that the team agrees on.

## Data shape

```json
{
  "id": "k3J9x0Qm2LpZ7vT1nB8cRw",
  "name": "Sunday in the park",
  "date": "2026-10-25",
  "place": "Tiergarten, by the pond",
  "createdAt": "2026-10-20T12:00:00.000Z",
  "items": [
    { "id": "i1", "label": "Cups", "claimedBy": null },
    { "id": "i2", "label": "Blanket", "claimedBy": "Eduardo" }
  ]
}
```

- `id`: picnic id, URL-safe, at least 22 random characters, so links can't be guessed.
- `name`: 1–80 characters after trimming. Required.
- `date`: `"YYYY-MM-DD"` or `""`. `place`: 0–120 characters.
- `items`: 1–50 items. `label` is 1–80 characters after trimming. Item `id` is unique within its picnic.
- `claimedBy`: `null` or a name of 1–40 characters after trimming.

## Storage interface — `lib/store.mjs` (Thilo)

```js
export async function openStore({ dir }) // → store
store.createPicnic({ name, date, place, items: ['Cups', 'Blanket'] }) // → picnic
store.getPicnic(id)                         // → picnic | null
store.claimItem(id, itemId, name)           // → { ok: true, picnic } | { ok: false, reason, picnic }
store.unclaimItem(id, itemId, name)         // → { ok: true, picnic } | { ok: false, reason, picnic }
```

- All methods may be `async`. Returned picnics are copies. Mutating them doesn't change stored data.
- The store receives already-validated, trimmed input. The API validates.
- `reason` values:
  - `"not_found"`: unknown picnic or item. `picnic` is `null` for an unknown picnic.
  - `"taken"`: claimed by a different name.
  - `"not_yours"`: unclaiming an item claimed by a different name.
- Names are compared exactly after trimming. Claiming an item you already hold succeeds, and so does unclaiming an item nobody holds.
- **First claim wins.** Two claims for the same item never both succeed, and a claim is never silently overwritten.
- `dir` comes from `process.env.DATA_DIR`, defaulting to `~/.local/share/vibecode-workshop/data`. Data must never be written inside the release folder or `public/`.
- A missing data file means empty storage. A corrupt file is logged and kept, never silently replaced.
- A completed write survives a process restart. A crash mid-write must not leave a half-written file.

## HTTP API — `server.mjs` (Eduardo)

Requests and responses are JSON with `content-type: application/json`. Errors return `{ "error": "Human-readable message" }`, which the UI may show as-is.

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `POST /api/picnics` | `{ name, date?, place?, items: [string] }` | `201 { picnic }` | `400` invalid input |
| `GET /api/picnics/:id` | — | `200 { picnic }` | `404` |
| `POST /api/picnics/:id/items/:itemId/claim` | `{ name }` | `200 { picnic }` | `400` no name, `404`, `409 { error, picnic }` taken |
| `POST /api/picnics/:id/items/:itemId/unclaim` | `{ name }` | `200 { picnic }` | `400`, `404`, `409 { error, picnic }` not yours |
| `GET /api/health` | — | unchanged: `200 { ok: true, revision }` | — |

- Bodies over 16 KB get `413`. Body that isn't JSON gets `400`. Other methods keep returning `405`.
- Empty strings are dropped from `items` before counting. Too many items, or text that is too long, gets `400`. It isn't silently truncated.
- `createApp({ revision, store })` takes the store as a parameter, so API tests can pass a fake in-memory store before M1.3 merges.

## Pages and assets — `public/` (Tobias)

The server serves exactly these. Adding a new file to `public/` needs a one-line change by Eduardo, so ask.

| URL | File | Purpose |
|---|---|---|
| `/` | `public/index.html` | Create a picnic: name, date, place, items. On success, go to `/p/<id>` |
| `/p/:id` | `public/picnic.html` | The shared picnic page. JS reads the id from `location.pathname` |
| `/style.css` | `public/style.css` | Styles |
| `/create.js` | `public/create.js` | Script for `index.html` |
| `/picnic.js` | `public/picnic.js` | Script for `picnic.html` |
| `/background.jpg` | `public/background.jpg` | Background photo, referenced from `style.css` |

- Show user text with `textContent`, never `innerHTML`.
- Remember the guest's name in `localStorage` on that device. It's only a convenience. The server is the source of truth.
- Show "Unclaim" only on items claimed by the name stored on this device.
- After a `409`, show the message and redraw from the returned `picnic`.
- It has to work at phone width (about 375 px) first.

## Outstanding for M1.4 (Eduardo)

`public/` on `m1.5-ui` now has all five files above, including `background.jpg` (~1.2 MB, added after this contract was first written). `server.mjs`'s asset map currently only has `/` and `/style.css`. To close the gap:

1. Add to the `assets` map in `server.mjs`: `/p/:id` → serve `public/picnic.html` for any id (dynamic, not a literal map entry), `/create.js` → `public/create.js` (`text/javascript`), `/picnic.js` → `public/picnic.js` (`text/javascript`), `/background.jpg` → `public/background.jpg` (`image/jpeg`).
2. Build the four `POST`/`GET` routes in the HTTP API table above, backed by `createApp({ revision, store })` so M1.4 can be tested with a fake store before M1.3 merges.
3. Pull `m1.5-ui` (or cherry-pick its `public/` commits) to get the actual files these routes need to serve — they don't exist on `main` yet.
