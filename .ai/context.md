# Current focus

Picnic Planner, M1, deployed at `https://team-07.intra.land`. The create → share → claim → unclaim journey works, now with real claim authorization (M1.8): a per-claim secret token in `localStorage`, not the typed name, decides who can unclaim.

- M1.3/M1.4/M1.5/M1.6/M1.8 were all built by Tobias's session directly (Thilo/Eduardo unavailable), skipping the normal independent-reviewer/committer split — see the process note in `PLAN.md`. Needs a real review pass later.
- M1.5 (UI) still has no browser-based visual verification — only HTTP/curl-level checks and code review.
- M1.8 fixed a real gap found right after the first deploy: anyone who knew/guessed a claimer's typed name (including the claimer forwarding their own link) could unclaim their item. Fixed by decoupling display name from a server-issued claim token.

Next: redeploy with the M1.8 fix and verify live; get Thilo/Eduardo to review the unreviewed steps when available; then M1.7 (watch an outsider use it) if not already effectively covered by this session's own manual testing.
