# Who does what — Picnic Planner

Three people, three layers, one contract. Read [IDEA.md](../IDEA.md), [PLAN.md](../PLAN.md) and [contract.md](contract.md) first.

## Thilo — hosting and storage (M1.1, M1.3)

1. **M1.1** on `m1.1-live-page`: connect to the assigned guest and deploy the starter as-is. Check `/api/health` and open it on a phone. Do this first, so hosting problems show up while the others build.
2. **M1.3** on `m1.3-store`: write `lib/store.mjs` and `test/store.test.mjs` to match the contract's storage interface. Tests must cover:
   - create, then get
   - unknown id
   - claim, re-claim by the same name, and a claim by another name returning `taken`
   - unclaim by the wrong name returning `not_yours`
   - data surviving a reopen of the store from the same `dir`
   - a missing file meaning empty storage
   - a corrupt file being kept and not overwritten
3. Do the deploy for **M1.6**.

## Eduardo — HTTP API (M1.4)

On `m1.4-api`: extend `server.mjs` with the routes, page URLs and limits in the contract, and update `test/app.test.mjs`.

- Accept `createApp({ revision, store })`. In tests, pass a small fake store that follows the contract interface. Don't wait for M1.3.
- Tests must cover:
  - valid create returning `201`
  - missing name or no items returning `400`
  - an oversized body returning `413`
  - unknown picnic returning `404`
  - claim conflict returning `409` with the current picnic
  - wrong-name unclaim returning `409`
  - `/p/:id` serving the picnic page
  - `/api/health` unchanged
  - `.env` and repository files never being served

## Tobias — pages and UX (M1.5)

On `m1.5-ui`: build `public/index.html`, `public/picnic.html`, `create.js`, `picnic.js` and `style.css` as described in the contract.

- Design for the phone first. The key screen is "what's still missing", with a count like "4 of 9 covered".
- Until M1.4 merges, develop against Eduardo's branch, or a throwaway mock that you don't commit.
- The empty, conflict (`409`) and not-found states must be visible and friendly.
- Record browser evidence at phone and desktop widths.

## Together

- **Before coding:** all three read the contract and agree on it, or change it now. Open decisions: can guests add items, do items have quantities, who can unclaim. The defaults in IDEA.md apply unless you change them.
- **M1.6:** wire `openStore` into `server.mjs`, deploy, and run the whole journey on two phones.
- **M1.7:** watch an outsider use it, then fix what you see.
- Each person runs their own step through coder → reviewer → committer. Swap reviewing: Thilo reviews Eduardo, Eduardo reviews Tobias, Tobias reviews Thilo, each with a fresh agent session.
