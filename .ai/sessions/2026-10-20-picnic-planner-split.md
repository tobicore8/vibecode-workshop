# Session — 2026-10-20, Picnic Planner plan and team split

## Decisions

- Idea: Picnic Planner, a shared checklist where guests claim what they'll bring. No accounts: a link that's hard to guess plus a typed name.
- Defaults until the team decides otherwise: only the organiser adds items, one person per item, and only the same name can unclaim.
- Work is split by layer (storage / API / UI), not by user feature. That way three people never edit the same file, which is the parallel-work rule in AGENTS.md. The interfaces are fixed in docs/contract.md before anyone codes.

## Handoff

State: planning only. PLAN.md, IDEA.md, docs/contract.md and docs/team.md are on main.
Next step: the team agrees the contract. Thilo starts M1.1, Eduardo M1.4, Tobias M1.5.
Half-done work: none.
Branch / reviewed SHA / PR: main, planning docs only, no implementation.
Checks and limitations: no code changed, so no tests were needed. The open decisions in IDEA.md are still unanswered.
