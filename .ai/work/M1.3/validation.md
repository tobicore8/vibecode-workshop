# M1.3 validation — storage

Base SHA: `d47b76e` (main after merging M1.5 UI, contract and gitignore branches)
Coder: this session, acting for the whole team at the human's direction (see note below).

## What I built

`lib/store.mjs` implementing exactly the interface in `docs/contract.md`: `openStore`, `createPicnic`, `getPicnic`, `claimItem`, `unclaimItem`. Single JSON file (`picnics.json`) under the given `dir`, atomic write via temp-file + rename, write queue serializes persistence. In-memory claim/unclaim logic runs synchronously before any `await`, so "first claim wins" holds even for two requests arriving back to back.

## How I tested

`test/store.test.mjs`, 11 cases, all passing (`node --test test/store.test.mjs`): create→get, unknown id, unknown item on a known picnic, claim/re-claim/conflict, two concurrent claims (only one wins), wrong-name unclaim, unclaiming an unclaimed item, returned picnics are copies, reopening the store from the same dir preserves data, missing file means empty storage, corrupt file is logged and left untouched on disk.

## Limitations

No independent reviewer — see the note in `.ai/work/M1.6/validation.md` about the whole M1.3/M1.4/M1.6 batch being built and merged in one session at the human's explicit instruction, without the separate coder/reviewer/committer sessions `AGENTS.md` normally requires.
