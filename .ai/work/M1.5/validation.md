# M1.5 validation

Base SHA: `08d6905672b4660a7afbae0a0655415e203eafdb`
Head SHA: (this branch, pre-commit — see PR/commit for final)
Coder session: this session (Tobias).

## What I built

`public/index.html`, `public/create.js`, `public/picnic.html`, `public/picnic.js`, `public/style.css` per `docs/contract.md`. No files outside `public/` were touched; `server.mjs` and the test files are untouched (out of scope for M1.5).

## How I tested

M1.3 (store) and M1.4 (API) aren't merged yet, so per the contract ("develop against a throwaway mock you don't commit") I wrote a disposable mock server at `/tmp/m15-mock-server.mjs` (not part of this repo, not committed) implementing exactly the HTTP contract in `docs/contract.md`: `POST /api/picnics`, `GET /api/picnics/:id`, `POST .../claim`, `POST .../unclaim`, plus serving `public/` including `/p/:id`, `/create.js`, `/picnic.js` (routes M1.4 still needs to add for real).

Ran against it with curl:
- Create: empty name → `400`; no items → `400`; normal → `201` with picnic + 3 items.
- Get: unknown id → `404`; known id → `200`.
- Claim: normal → `200`, item shows `claimedBy`; same item claimed by a second name → `409` with `{error, picnic}` (current state, not overwritten).
- Unclaim: wrong name → `409 not_yours`-style message with current picnic; correct name → `200`, item released.
- Static: `/` still contains `<h1>` (existing `test/app.test.mjs` assertion); `/p/<id>` serves `picnic.html`; `/create.js` and `/picnic.js` serve with `200`.

Also ran:
- `node --check public/create.js` and `public/picnic.js` — both parse cleanly.
- `npx html-validate public/index.html public/picnic.html` — one finding: `picnic.html`'s `<h1 id="picnic-name">` is empty in the static markup. This is expected — `picnic.js` fills it from the fetched picnic on load — not a bug, but flagging it since the linter raised it.
- Full `npm test` (existing suite, unrelated to this step): 20 pass, 1 pre-existing failure (`test/deploy.test.mjs`, "deploy lock... flock is missing") caused by `flock` not being installed on this machine — unrelated to `public/`, not introduced by this step.

## Acceptance cases — status

- [x] Normal create → claim → second load sees the claim: verified via the mock (curl), not via a real browser render.
- [x] Empty/failure: empty name/items rejected client-side before any request; server-side 400s handled and shown. Unknown picnic: `picnic.js` shows the friendly not-found view on `404` (code-reviewed; see limitation below).
- [x] Conflict: `409` handling redraws from the returned `picnic` and surfaces `error` text (verified contract shape via curl; client redraw logic code-reviewed, not browser-observed).
- [ ] Phone width (~375px) and "Unclaim only shown to the claimer" — styled mobile-first and logic reviewed, but **not visually verified in an actual browser/device**. No browser automation tool is available in this environment.

## Limitations / what's left

- **No browser verification.** Everything above the line is either an HTTP-contract check (curl) or a code read-through; I have not seen the page rendered. Per AGENTS.md this needs a real browser/phone check before this step can be approved — ask a teammate (or re-run this with a session that has browser access) to load `index.html`/`picnic.html` at desktop and ~375px widths and exercise the create → share → claim → unclaim journey.
- `server.mjs` does not yet serve `/p/:id`, `/create.js` or `/picnic.js`, or any `/api/*` route — that's M1.4 (Eduardo), already called out in the contract and `docs/team.md`. These files are ready for that wiring.
- The mock server used for testing is disposable, lives at `/tmp/m15-mock-server.mjs`, and is not part of this commit.
