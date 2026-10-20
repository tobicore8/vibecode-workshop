# M1.3 — Storage

## Outcome

The API (M1.4) can create picnics and record claims through `lib/store.mjs`. Data survives process restarts and redeploys, and the first claim on an item wins.

## Audit

Base SHA: `08d6905672b4660a7afbae0a0655415e203eafdb` (main, planning docs only). The starter has no storage and no `lib/`. The interface is fixed in docs/contract.md ("Storage interface"). .ai/rules.md requires durable data outside release directories.

## Acceptance

- [ ] Normal case: a created picnic reads back with an id of at least 22 URL-safe characters and items `i1…iN`, all unclaimed.
- [ ] Claims: first claim wins. Re-claiming by the same name succeeds, a different name gets `taken`, unclaiming by a different name gets `not_yours`, and unclaiming a free item succeeds.
- [ ] Concurrency: simultaneous claims for one item give exactly one success.
- [ ] Empty or failure case: an unknown picnic or item gives `not_found`. A missing file or directory means empty storage. A corrupt file is logged and kept, never overwritten.
- [ ] Data boundary: picnics survive reopening the store from the same directory. The default directory is `DATA_DIR` or `~/.local/share/vibecode-workshop/data`. Returned picnics are copies.

## Boundaries and dependencies

No HTTP, validation or UI; those are M1.4 and M1.5. `server.mjs` is untouched. Wiring it up is M1.6. Depends only on the M1.2 contract.

## Handoff

Human owner: Thilo. Coder: Claude Code session (Opus 5.5). Reviewer: Tobias's fresh session (see docs/team.md). Branch `m1.3-store`. Evidence: .ai/work/M1.3/validation.md, review.md.
