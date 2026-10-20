# Current focus

Picnic Planner, M1. The full M1 journey (create → share → claim → unclaim, persisted) is implemented and merged to `main`: M1.3 storage (`lib/store.mjs`), M1.4 API (`server.mjs` routes), M1.5 UI (`public/`), M1.6 integration (real store wired in). All test suites pass locally except a pre-existing, environment-specific `deploy.test.mjs` failure (`flock` missing on macOS — expected fine on the Linux guest).

- M1.3/M1.4/M1.6 were built by Tobias's session directly (Thilo/Eduardo unavailable), skipping the normal independent-reviewer/committer split — see the process note in `PLAN.md`. Needs a real review pass later.
- M1.5 (UI) still has no browser-based visual verification — only HTTP/curl-level checks and code review.

Next: deploy `main` to the team guest (`https://team-07.intra.land`) and verify the live journey; then get Thilo/Eduardo to review the unreviewed steps when available; then M1.7 (watch an outsider use it).
