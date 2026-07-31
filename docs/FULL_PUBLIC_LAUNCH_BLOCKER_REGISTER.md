# Full Public Launch — Blocker Register (2026-07-31)

| # | Blocker | Owner | Type | Status | Exact next action | Blocks |
|---|---|---|---|---|---|---|
| 1 | External alert delivery | Founder | credential | absent (verified, names only) | set `OPS_WEBHOOK_URL`; safe test in `OPS_WEBHOOK_FOUNDER_SETUP.md` | operational launch |
| 2 | Analytics approval+endpoint | Founder | decision | §7 unsigned; no vars | sign §7; provision; 2 env vars; staging payload proof | measured launch |
| 3 | Seven-day operating evidence | System | wall-clock | day 1 of 7 banked | daily observer + template | operational confidence |
| 4 | July 31 settled PROVEN_STAMPED | Automation | wall-clock | tonight | post-settle: observer, then sidecar `--write` | integrity proof (not beta) |
| 5 | Contract-lag ordering in nightly-settle | Eng | bug | open (workaround: local regen `a26b6b7c`) | trace step order; regression test | reliability |
| 6 | Settle log hit_rate includes voids | Eng | reporting bug | found by this audit | divide W/(W+L) in the log line; test | truth hygiene |
| 7 | Duplicate-ID capture refusal | Eng/data | data quality | fail-closed; recurrence watch | if recurs, pull discarded CI artifact | coverage |
| 8 | Sim-orphan intraday invariant | Eng | test contract | task spawned (task_c23c7538) | credit team-market coverage; keep sourceless hard-fail | reliability |
| 9 | Lifecycle concurrent-tree flake | Eng | test reliability | contained (gate refuses) | isolate; serialize its test step | deploy confidence |
| 10 | GitHub cron best-effort skips | Eng | platform | observed (13:30Z missed) | consider a second staggered cron or dispatch fallback | operations |
| 11 | NBA promotion evidence | Eng+calendar | live evidence | preseason ~Oct | dress-rehearsal on first preseason slate | multi-sport |
| 12 | EPL results provider | Founder/vendor | vendor | package written | choose per decision package | EPL settlement |
| 13 | Commercial/legal/support scope | Founder | business | unscoped | define monetization, ToS, support | commercial |
