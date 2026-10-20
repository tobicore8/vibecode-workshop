# Project plan

Draft by the project lead. Agree the goal with your team before implementation. Keep assigned IDs permanent.

## Goal

At our team's live URL, an organiser creates a picnic checklist and shares a link, and guests claim what they'll bring, so everyone can see what's covered and what's missing. See IDEA.md for the problem and constraints.

## Working model

Project lead → one milestone lead → one step at a time through coder → independent reviewer → committer. Each milestone has one lead session. Each step names a human owner and the real agent sessions used. The lead records blockers here; it does not invent an approval.

## M1 — Who's bringing what, live

Milestone lead: assign a fresh session. Release: only after the team accepts the journey.

The work is split by layer so three people can build in parallel against [docs/contract.md](docs/contract.md). It covers file ownership, data shape, store interface, HTTP API and pages. M1.3, M1.4 and M1.5 depend only on the contract, not on each other.

| Step | Outcome | Depends on | Human owner | Branch | State / PR |
|---|---|---|---|---|---|
| M1.1 | Our fork runs at the assigned URL and reports its deployed revision | Team access | Thilo | `m1.1-live-page` | draft |
| M1.2 | Shared contract agreed for storage, API and pages | IDEA.md | whole team | main | in main, agree before coding |
| M1.3 | Storage: picnics and claims persist across restart and redeploy; first claim wins | M1.2 | Thilo | `m1.3-store` | merged to main (unreviewed, see note below) |
| M1.4 | API: create, read, claim and unclaim with validation and clear errors | M1.2 | Eduardo | `m1.4-api` | merged to main (unreviewed, see note below) |
| M1.5 | UI: create a picnic, share the link, claim and unclaim on a phone | M1.2 | Tobias | `m1.5-ui` | merged to main; no browser verification yet |
| M1.6 | Integration: real store wired into the server; whole journey works at the live URL | M1.1, M1.3, M1.4, M1.5 | whole team (Thilo deploys) | `m1.6-integration` | merged to main; deploy pending |
| M1.7 | Someone outside the team completes the journey on a phone; observed failures are corrected | M1.6 | whole team | new step IDs per fix | draft |

**Process note (2026-10-20):** Tobias had a single agent session implement M1.3, M1.4 and M1.6 directly (Thilo and Eduardo weren't available), to get a real deploy live on `https://team-07.intra.land` quickly. This skipped the normal independent-reviewer and separate-committer steps in `AGENTS.md` for those three steps — they're tested (see `.ai/work/M1.3`, `.ai/work/M1.4`, `.ai/work/M1.6`) but not reviewed by anyone who didn't write them. Worth a real review pass from Thilo/Eduardo once available, and definitely before trusting this past the workshop demo.

**Merge order:** M1.1 any time. Then M1.3 → M1.4 → M1.5 in whatever order they are approved. Rebase on main before opening your PR. Last comes M1.6, a short wiring step: `server.mjs` creates the real store with `openStore` and passes it to `createApp`. After that, the team runs the journey together.

**Working separately:** each person uses their own clone or worktree and only edits the files they own (see the contract). Everyone still follows coder → independent reviewer → committer for their own step. A teammate's fresh agent session, or a different model, can be the reviewer.

The acceptance cases below are grouped by user outcome. Each layer step covers its part. The UI step proves them in the browser.

### M1.1 — The live starting point

- [ ] Every teammate has access to the same team fork.
- [ ] The assigned SSH connection reaches our team environment.
- [ ] Our page is reachable at the assigned HTTPS URL.
- [ ] `/api/health` reports the revision we intended to deploy.
- [ ] Another teammate opens the page on a phone.

### Create a picnic (M1.4 API, M1.5 UI)

- Normal: the organiser enters a picnic name (required), an optional date/place and at least one item. They get a page for that picnic with a copyable link that is hard to guess.
- Empty: submitting with no name or no items shows a clear message, and no picnic is created.
- Failure: opening a link for a picnic that doesn't exist shows a friendly "picnic not found" page, not a crash or a blank page.
- Limits: very long names or items, and an absurd number of items, are rejected or trimmed so they can't break the page. Text is shown as text, not run as HTML.

### Claim items (M1.3 store, M1.4 API, M1.5 UI)

- Normal: a guest enters their name once and taps an unclaimed item. It then shows "Name is bringing this". The page clearly separates unclaimed and claimed items, and shows a count like "4 of 9 covered".
- Unclaim: the person who claimed an item can release it. Without accounts, "the person" means the same name on the same device. That's good enough for the demo.
- Conflict: if two people claim the same item, the first one wins. The second gets told it's already taken and sees the current list. No silent overwrite.
- Empty: a new picnic with nothing claimed says what to do next, not just "0 of 9".

### Persistence (M1.3 store, proven in M1.6)

- A claim is still visible after a reload, in another browser or device, after `vc-app` restarts and after a fresh `npm run deploy`.
- Data is stored under `~/.local/share/vibecode-workshop/data/`, never inside a release folder or `public/`.
- If the data file is missing on first start, the app starts with no picnics. If it is corrupt, the app logs the problem and doesn't silently wipe it.

### M1.7 — Feedback

Watch someone outside the team use the shared link on their phone. Record one observed problem, the resulting acceptance criterion and the result after correction. Add new scope as a new step instead of hiding it inside a fix.

## M2 — Improve the demonstrated journey

Plan only after M1 gives you evidence. Candidates, none of them agreed: guests add items, quantities, "notes" per item, live refresh, organiser-only editing.
