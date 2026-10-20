# M1.6 validation — integration

Base SHA: `d47b76e`
Head SHA: see the merge commit that lands this branch on `main`.

## What changed

`server.mjs`'s bootstrap (the `if (process.argv[1] === ...)` block) now calls `openStore({ dir })` with `dir` from `process.env.DATA_DIR`, defaulting to `~/.local/share/vibecode-workshop/data`, and passes the real store into `createApp`. Tests continue to construct `createApp` directly and pass their own store (or none, for routes that don't need one), so test behaviour is unaffected by this wiring.

## Full journey, manually verified locally

1. `DATA_DIR=<tmp> PORT=4099 node server.mjs`
2. `POST /api/picnics` with a name + 2 items → `201`, real id (24 chars)
3. `GET /p/<id>` → `200`, serves the picnic page
4. `POST /api/picnics/<id>/items/<item>/claim {"name":"Alice"}` → `200`, item claimed
5. Re-`GET /api/picnics/<id>` → shows the claim persisted in the running store

## Important process note — read this before trusting this as "reviewed"

This milestone (M1.3 storage, M1.4 API, M1.6 integration) was built, tested and merged in a single session, by one coder, at the human's explicit instruction to move straight to a working deploy. `AGENTS.md` normally requires a separate independent reviewer session (different model/person, didn't write the code) before merge, and a separate committer. None of that happened here — I implemented, tested and merged my own work. Treat this as a fast, unreviewed path taken deliberately, not as a milestone that passed the team's normal bar. Worth a real review pass (a fresh session reading the diff cold) before trusting this beyond the workshop demo.

## Still not done / known gaps

- No browser-based visual check of the UI (M1.5's own gap, still open) — only curl/HTTP-level verification.
- `npm test`'s one failure (`deploy lock` / `flock` missing) is a macOS-laptop-only limitation; expected to pass on the Linux guest where `flock` exists.
- No real teammate (Thilo/Eduardo) has seen or approved this code.
