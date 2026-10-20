# M1.5 — UI: create a picnic, share the link, claim and unclaim on a phone

## Outcome

An organiser can create a picnic (name, optional date/place, items) and lands on a shareable `/p/:id` page. Anyone with that link can type their name once, claim an unclaimed item, unclaim their own claim, and see a live count of what's covered. Conflicts and a missing picnic both show a friendly message instead of breaking the page.

## Audit

Starting point: `public/index.html` and `public/style.css` are the generic starter landing page; no `picnic.html`, `create.js` or `picnic.js` exist. `server.mjs` only serves `/`, `/style.css` and `/api/health` — it does not yet serve `/p/:id`, `/create.js` or `/picnic.js`, and no API routes exist. That wiring is Eduardo's M1.4 (contract note: "Adding a new file to public/ needs a one-line change by Eduardo"). M1.3/M1.4 are not merged, so this step is built and tested against the data shape and HTTP contract in `docs/contract.md`, using a throwaway (uncommitted) mock server for local verification. Base SHA: `08d6905`.

## Acceptance

- [ ] Normal: organiser fills name + at least one item, submits, lands on `/p/<id>`. A guest on that link claims an unclaimed item under a typed name; a second load shows the claim.
- [ ] Empty/failure: submitting with no name or no items shows an inline message, no navigation. Opening a link for an unknown picnic shows a friendly "picnic not found" message, not a crash.
- [ ] Conflict: claiming an already-claimed item surfaces the server's `409` message and redraws from the returned picnic, no silent overwrite.
- [ ] Phone width (~375px): the create form and the claim list are usable one-handed; "Unclaim" only appears on items claimed by the name stored on this device.

## Boundaries and dependencies

Only files under `public/` are touched (`index.html`, `picnic.html`, `create.js`, `picnic.js`, `style.css`), per the contract's file ownership. `server.mjs`, `lib/store.mjs` and the test files are out of scope — not edited here. Depends only on `docs/contract.md` (M1.2), not on M1.3/M1.4 landing first. Real end-to-end wiring happens at M1.6.

## Handoff

Human owner: Tobias. Coder/reviewer: this session (no independent reviewer yet — flagged in validation.md). Branch: `m1.5-ui`. Evidence: `.ai/work/M1.5/validation.md`.
