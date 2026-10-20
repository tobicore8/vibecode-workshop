# M1.8 validation — claim authorization

Base SHA: `ec8ee9e` (deployed revision at the time this bug was found)
Coder: this session, directed by Tobias, same unreviewed-fast-path caveat as M1.3/M1.4/M1.6.

## The bug, reproduced before fixing

1. Open `/`, create a picnic.
2. Open the resulting `/p/:id` link, type "Tobias" as the name, claim "Blanket".
3. Open the same link in a private/incognito window (simulating a forwarded link on a different device), type "Tobias" as the name too.
4. Before this fix: that second window could unclaim "Blanket" — the old API authorized unclaim purely by matching the typed `name` against `claimedBy`, and the name is visible on the page itself, so no secret was ever required.

## What changed

- `lib/store.mjs`: items gained an internal `claimToken` (random, 24 bytes). `claimItem` now takes an optional `token` — a claimed item can only be re-claimed (idempotent) or released by whoever holds the matching token; a matching name with no/wrong token is `taken`/`not_yours`, same as a stranger. Every picnic object leaving the store (create, get, claim, unclaim) has `claimToken` stripped from its items via `toPublicPicnic`; the one exception is the claim response's separate top-level `token` field.
- `server.mjs`: claim request body gained optional `claimToken`; response gained `claimToken` (only on claim, only in that response). Unclaim now requires `claimToken` in the body instead of `name` — missing it is `400`, wrong value is `409`.
- `public/picnic.js`: stores each claimed item's token in `localStorage` under `picnicPlannerClaimTokens`, keyed by `${picnicId}:${itemId}`. The "Unclaim" button now renders based on "do I hold this item's token", not "does the typed name match `claimedBy`".
- `docs/contract.md`, `IDEA.md`, `PLAN.md`: updated to document the new data shape/API/store interface, resolve the now-falsified "a name is enough identity" assumption, and record this as tracked step M1.8.

## Tests

`test/store.test.mjs` (13 tests) and `test/app.test.mjs` (15 tests, up from 11) — both suites green, including new cases specifically for the old vulnerability:
- "claiming under someone else's typed name with no token is still a conflict (no impersonation)"
- "unclaiming with the real token works; a wrong token is a 409 conflict"
- "claim returns a claim token that never appears in a plain GET"

Full `npm test`: 44/44 passing locally and on the guest (no `flock`-related failure this time — same macOS-only gap as before, unrelated to this change, not re-checked here since M1.6's validation already covers it).

## Manual re-check of the original repro, after the fix

Repeated the exact steps above via curl (two separate "sessions", no shared token): the second claim attempt under the same name returns `409`, and an unclaim attempt with no token returns `400`. The original window, using its real stored token, unclaims successfully.

## Known gap, accepted for the workshop

If someone clears their browser storage, or claims from one device and later wants to unclaim from another, they're locked out of unclaiming their own item (nobody else can either — `claimToken` is still set, just unreachable to them). No recovery path exists; this is consistent with "no accounts" and wasn't asked for, but worth knowing before relying on this at a real event.

## Process note

Same as M1.3/M1.4/M1.6: single session, no independent reviewer, direct merge to `main` at Tobias's request after confirming the push.
