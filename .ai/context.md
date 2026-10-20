# Current focus

Picnic Planner, M1. IDEA.md and PLAN.md are drafted, and the work is split across three people by layer (see [docs/team.md](../docs/team.md)). The parallel steps share [docs/contract.md](../docs/contract.md).

- Thilo: M1.1 live page, then M1.3 storage (`m1.3-store` pushed).
- Eduardo: M1.4 API. Implemented on `m1.4-api`, head `d8aae81`, waiting for Thilo's independent review. Evidence in [`.ai/work/M1.4/validation.md`](work/M1.4/validation.md).
- Tobias: M1.5 UI.

Next: Thilo reviews `d8aae81` in a fresh session, then the committer merges M1.4 through a PR in the team fork. Tobias can build M1.5 against `m1.4-api`. M1.6 wires the real store into `server.mjs`.
