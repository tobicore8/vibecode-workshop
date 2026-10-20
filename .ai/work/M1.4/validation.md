# M1.4 validation — HTTP API

Step: M1.4, API: create, read, claim and unclaim with validation and clear errors.
Human owner: Eduardo. Branch: `m1.4-api`. Base SHA: `08d6905672b4660a7afbae0a0655415e203eafdb` (main). Head SHA: `d8aae81e1db3d594c71c21b146084e7cc703a125`.

Scope of the step, from [docs/contract.md](../../docs/contract.md) and [docs/team.md](../../docs/team.md): `server.mjs` and `test/app.test.mjs` only. No file owned by Thilo or Tobias was touched.

## What was implemented

| Contract route | Result |
|---|---|
| `POST /api/picnics` | `201 { picnic }`, `400` invalid input |
| `GET /api/picnics/:id` | `200 { picnic }`, `404` unknown picnic |
| `POST /api/picnics/:id/items/:itemId/claim` | `200 { picnic }`, `400` no name, `404`, `409 { error, picnic }` taken |
| `POST /api/picnics/:id/items/:itemId/unclaim` | `200 { picnic }`, `400`, `404`, `409 { error, picnic }` not yours |
| `GET /api/health` | unchanged: `200 { ok: true, revision }` |

Also: bodies over 16 KB get `413`, a body that is not JSON gets `400`, unknown paths get `404`, and a known path with an unsupported method gets `405` with an `allow` header. The server serves exactly the pages in the contract: `/`, `/p/:id`, `/style.css`, `/create.js`, `/picnic.js`.

## Checks that were run

- `node --check server.mjs` and `node --check test/app.test.mjs`: exit 0.
- `node --test test/app.test.mjs`: 14 tests, 14 passed, 0 failed.
- `npm test` (whole suite): 32 tests, 25 passed, 7 failed. The 7 failures are `test/deploy.test.mjs` only: `preview names an uninstalled release…`, `deploy refuses a dirty tree…`, `releases cannot occupy…`, `prune keeps the active release…`, `a first deploy keeps only the active release…`, `an unreadable previous drop-in does not prune`, `deploy lock rejects a second holder…`. They fail on this Windows machine before and after this change, because `scripts/deploy.mjs` accepts only POSIX deployment paths (`/^\/[A-Za-z0-9_./-]+$/`) while the tests build paths with `join('/home/vc-team', …)`, which produces backslashes here. The same suite passes on Linux CI (ubuntu-latest, Node 22). This change touches neither file.
- Live check on this machine, `PORT=3111 APP_REVISION=local-check node server.mjs`: `GET /` → `200`; `GET /api/health` → `200 {"ok":true,"revision":"local-check"}`; `POST /api/picnics` → `503 {"error":"This server has no storage connected yet."}` (no store wired yet, that is M1.6); `GET /p/abc` → `404` (`public/picnic.html` arrives with M1.5); `GET /.env` → `404`.

## Not proven

- No Linux run of the whole suite on this machine; no Docker or WSL guest was available. The deploy-test failures above are expected to disappear on Linux, but that was not observed here.
- No browser check. This step adds no user-visible interface: the only new page route serves `public/picnic.html`, a file Tobias owns and ships with M1.5. The journey in a browser belongs to M1.5 and M1.6.
- No store was wired, so no claim survived a restart or a second guest. That is M1.3 and M1.6.
- The real store from M1.3 was not available, so the API was tested against a fake store written to the contract's interface in `test/app.test.mjs`. The fake implements first-claim-wins and the three `reason` values; it is not evidence that Thilo's store behaves the same way.

## Decisions a reviewer should check

1. `createApp({ revision, store, publicDir })`. `publicDir` is an optional test seam and defaults to the repository's `public/`, so M1.6 still wires only `store`. It lets the tests serve fixture pages without depending on Tobias's files.
2. Without a store the API answers `503 { error }`; pages and `/api/health` keep working. This keeps the starter deployable before M1.6 instead of faking persistence.
3. `date` is accepted only as `""` or a real `YYYY-MM-DD` calendar date. The contract fixes the format; rejecting `2026-02-30` is a stricter reading and is flagged here rather than hidden.
4. An unknown path answers `404` for every method. `405` is used only when the path exists but the method does not. The starter answered `405` for any unsupported method.
5. A missing page file answers `404`; other read failures answer `500`. The starter answered `500` for both.
6. A body over 16 KB is drained and then refused with `413`, so the client always receives the status instead of a reset connection.
7. `404` carries `{ error }` only. `409` carries `{ error, picnic }`, because the UI has to redraw from the returned picnic.
8. Duplicate item labels are allowed. The contract only requires unique item ids, which the store assigns.
9. `GET` and `HEAD` are both allowed on `GET /api/picnics/:id` and on `/api/health`.

## Handoff

Human owner: Eduardo. Coder session: this session. Independent reviewer: still to be assigned (Thilo, in a fresh session). Committer: not started. Branch `m1.4-api`, head `d8aae81`, no PR yet.

Not covered by a step brief: `.ai/work/M1.4/brief.md` does not exist, because no milestone-lead session wrote one. The acceptance cases above were taken from the contract and the split in `docs/team.md`, which the team agreed in `main` at `08d6905`.
