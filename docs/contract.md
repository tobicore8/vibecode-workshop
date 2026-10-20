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
  "time": "15:30",
  "place": "Tiergarten, by the pond",
  "createdAt": "2026-10-20T12:00:00.000Z",
  "items": [
    { "id": "i1", "label": "Cups", "claimedBy": null, "claimToken": null },
    { "id": "i2", "label": "Blanket", "claimedBy": "Eduardo", "claimToken": "<random, server-internal>" }
  ]
}
```

- `id`: picnic id, URL-safe, at least 22 random characters, so links can't be guessed.
- `name`: 1–80 characters after trimming. Required.
- `date`: `"YYYY-MM-DD"` or `""`. `time`: `"HH:MM"` (24-hour) or `""`. `place`: 0–120 characters.
- `items`: 1–50 items. `label` is 1–80 characters after trimming. Item `id` is unique within its picnic.
- `claimedBy`: `null` or a name of 1–40 characters after trimming. **Display only — carries no authorization.**
- `claimToken`: `null` or a random server-generated secret. This is what actually authorizes unclaiming (and re-claiming) an item — never the name. It is stored **internally only**; any picnic object returned to a caller (create, get, claim, unclaim) must have this field stripped from every item. The one exception is a successful claim's response, which returns the new/existing token in a separate top-level `claimToken` field, once, to the claimer only.

Why: a typed name is public — anyone reading the shared page, or the person who forwarded the link, can type it too. Without a separate secret, "unclaim" would let anyone who knows (or guesses) a name release someone else's claim. The token is the thing a device actually holds that proves "I made this claim."

## Storage interface — `lib/store.mjs` (Thilo)

```js
export async function openStore({ dir })                    // → store
store.createPicnic({ name, date, time, place, items: ['Cups', 'Blanket'] }) // → picnic (no claimToken fields)
store.getPicnic(id)                                          // → picnic | null (no claimToken fields)
store.claimItem(id, itemId, name, token = null)               // → { ok: true, picnic, token } | { ok: false, reason, picnic }
store.unclaimItem(id, itemId, token)                          // → { ok: true, picnic } | { ok: false, reason, picnic }
```

- All methods may be `async`. Returned picnics are copies, with every item's `claimToken` stripped. Mutating a returned picnic doesn't change stored data.
- The store receives already-validated, trimmed input. The API validates.
- `claimItem`'s `token` param is the caller's proof of a *prior* claim on this exact item (omit/`null` for a first-time claim). If the item is already claimed, a matching token re-confirms it (idempotent, name may be updated); a missing/wrong token is `"taken"` — regardless of whether the typed name matches the existing claimer. On success, the response's `token` field is the item's current secret (freshly generated on first claim, unchanged on a matching re-claim) — the caller is responsible for giving this back to the real claimer only.
- `unclaimItem`'s `token` must match the item's stored `claimToken`. There is no name parameter — unclaiming is authorized by token alone.
- `reason` values:
  - `"not_found"`: unknown picnic or item. `picnic` is `null` for an unknown picnic.
  - `"taken"`: claim attempted without the matching token.
  - `"not_yours"`: unclaim attempted without the matching token.
- Unclaiming an item nobody holds succeeds regardless of the token passed (idempotent no-op).
- **First claim wins.** Two claims for the same item never both succeed, and a claim is never silently overwritten.
- `dir` comes from `process.env.DATA_DIR`, defaulting to `~/.local/share/vibecode-workshop/data`. Data must never be written inside the release folder or `public/`.
- A missing data file means empty storage. A corrupt file is logged and kept, never silently replaced.
- A completed write survives a process restart. A crash mid-write must not leave a half-written file.

## HTTP API — `server.mjs` (Eduardo)

Requests and responses are JSON with `content-type: application/json`. Errors return `{ "error": "Human-readable message" }`, which the UI may show as-is.

| Method & path | Body | Success | Errors |
|---|---|---|---|
| `POST /api/picnics` | `{ name, date?, time?, place?, items: [string] }` | `201 { picnic }` | `400` invalid input |
| `GET /api/picnics/:id` | — | `200 { picnic }` | `404` |
| `POST /api/picnics/:id/items/:itemId/claim` | `{ name, claimToken? }` | `200 { picnic, claimToken }` | `400` no name, `404`, `409 { error, picnic }` taken |
| `POST /api/picnics/:id/items/:itemId/unclaim` | `{ claimToken }` | `200 { picnic }` | `400` no claimToken, `404`, `409 { error, picnic }` not yours |
| `GET /api/health` | — | unchanged: `200 { ok: true, revision }` | — |

- Bodies over 16 KB get `413`. Body that isn't JSON gets `400`. Other methods keep returning `405`.
- Empty strings are dropped from `items` before counting. Too many items, or text that is too long, gets `400`. It isn't silently truncated.
- `createApp({ revision, store })` takes the store as a parameter, so API tests can pass a fake in-memory store before M1.3 merges.
- **Claim authorization (added M1.8):** `claim`'s response includes `claimToken` only in that one response — never inside a `picnic` object returned by any route. The UI must persist it (e.g. `localStorage`, keyed by picnic id + item id) and send it back as `claimToken` on a later `claim` (to re-confirm/rename your own claim) or `unclaim` (required). A `name` alone, with no token, never authorizes claiming an already-claimed item or unclaiming anything.

## Pages and assets — `public/` (Tobias)

The server serves exactly these. Adding a new file to `public/` needs a one-line change by Eduardo, so ask.

| URL | File | Purpose |
|---|---|---|
| `/` | `public/index.html` | Create a picnic: name, date, time, place, items. On success, go to `/p/<id>` |
| `/p/:id` | `public/picnic.html` | The shared picnic page. JS reads the id from `location.pathname` |
| `/style.css` | `public/style.css` | Styles |
| `/create.js` | `public/create.js` | Script for `index.html` |
| `/picnic.js` | `public/picnic.js` | Script for `picnic.html` |
| `/background.jpg` | `public/background.jpg` | Background photo, referenced from `style.css` |

- Show user text with `textContent`, never `innerHTML`.
- Remember the guest's name in `localStorage` on that device. It's only a convenience for display — **not** authorization. The server is the source of truth.
- Remember each claimed item's `claimToken` in `localStorage`, keyed by picnic id + item id (not just item id — ids repeat across different picnics). Show "Unclaim" only on items whose token is held on this device, not on items whose `claimedBy` happens to match the typed name.
- After a `409`, show the message and redraw from the returned `picnic`.
- It has to work at phone width (about 375 px) first.

## Status (2026-10-20)

M1.1–M1.7 are all merged to `main` and deployed to `https://team-07.intra.land`. M1.8 (claim-token authorization, described throughout this file) closed a real gap found after deploy: anyone who knew or was forwarded a claimer's typed name could unclaim their item. See `PLAN.md` for the step record and `.ai/work/M1.8/` for validation evidence.
