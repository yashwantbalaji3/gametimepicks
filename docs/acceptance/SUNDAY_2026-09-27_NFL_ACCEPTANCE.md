# Sunday NFL Acceptance — 2026-09-27

**Live document.** Updated as the slate progresses. Every number here was read from the live
repo, GitHub, or Production at the stated time — not carried forward from a prior handoff.

---

## Phase A — pre-acceptance baseline verification

Run at **2026-09-27 ~08:05Z**, before the first live-props cron (13:00Z).

| # | Check | Result |
|---|-------|--------|
| 1 | `origin/main` | `a8fb69b040fff6876b72bcdf3067ec9d7a0b6304` |
| 2 | Production SHA | `a8fb69b0` — **identical to main**; `builtAt 2026-09-27T05:14:44.991Z` |
| 3 | #721 merged + ancestry | `mergedAt 2026-09-27T05:13:38Z`, commit `a8fb69b040ff`, confirmed ancestor of `origin/main` |
| 4 | #716 still a draft | `state=OPEN draft=true mergeState=CLEAN` — held, as required |
| 5 | Frozen 14-game baseline | 14 boards · **ONE** `generatedAt` = `2026-09-26T23:23:23Z` · 5 families · last board commit `0f9881527e` at `2026-09-26T23:24:00Z` · **0 modified tracked files**, so byte-identical to `origin/main` |
| 6 | Canonical lifecycle trace | `IN_FLIGHT — 14 game(s): 0 clean, 14 in flight, 0 needing attention` |
| 7 | Untracked live-props artifacts | **none** — 10 untracked files, all local strategy docs (`vp/`, loose handoffs). `git pull` cannot abort on them |
| 8 | Live scheduler armed | `nfl-live-props` **state=active**; cron `*/15 13-23 * * 0` on main at `fb56df5c08`; **no** workflow disabled anywhere (37 checked) |
| 9 | Odds ledger / Phase H | ceiling 1,160 · **spent 478** across 291 requests · **682 remaining**. Phase H **0 / 90**. In-play authorized for h2h/spreads/totals; **player props NOT authorized** |
| 10 | Handoff accurate | ❌ **stale** — said main `a158e58739`, missing #721 and #722. Repaired in this pass |

Published families on the frozen boards: `anytime_td`, `player_pass_yds`, `player_reception_yds`,
`player_receptions`, `player_rush_yds`.

> The founder checkpoint said the ledger stood at 475/1,160. Live it reads **478** — three credits
> spent since, consistent with a normal capture. Recorded rather than smoothed over.

### ⚠ A verification method changed mid-session

**Production now answers `curl` with HTTP 403 and a "Vercel Security Checkpoint" page.** It is
Vercel's JavaScript challenge, not an outage:

- bare `curl` → 403; `curl` with a real browser User-Agent → **also 403**, so it is not UA sniffing;
- a **real browser** (the in-app pane) loads the site normally and returns the expected content.

So **real users are unaffected**, and I did not report an outage. I had been curling Production
successfully all night — most recently around 07:00Z — so the challenge engaged within the hour,
most plausibly tripped by my own automated request volume.

**Consequence for the rest of this acceptance: every Production check must go through the browser
pane, not `curl`.** A `curl` 403 from here on is evidence about the challenge, never about the site.
Earlier `curl`-based verifications in this session were taken before the challenge engaged and
returned real payloads.

---

## Phase B — today's first nightly-settle run

**Pending.** Watched by a live monitor. Expected ~09:30Z given the measured ~4h dispatch lateness
against the 05:17Z cron.

The measured chronic pattern (recorded on #716):

    first daily run  → succeeds, commits, publishes
    runs 2-4         → write-once Results projection refusal → red → NO commit

    2026-09-26   09:51 success · 11:49 FAIL · 13:00 FAIL · 13:51 FAIL
    2026-09-25   10:10 success · 12:16 FAIL · 13:41 FAIL · 14:43 FAIL

**A first-run failure would be a NEW incident** and would trigger the §2.7 reassessment. A
failure in runs 2-4 is the known chronic condition and changes nothing.

---

## Phase C — slate lifecycle (14 expected games)

**Not started.** First cron 13:00Z.

| Stage | Count |
|---|---|
| expected games | 14 |
| PRE | 14 (all, at 08:05Z) |
| LIVE observed | — |
| FINAL_PROVISIONAL / AWAITING_SETTLEMENT | — |
| FINAL_CANONICAL | — |
| CLEAN | 0 |
| needing attention | 0 |

---

## Phase D — Phase H

**Untouched: 0 / 90.** Not to be forced. Only if a genuinely live NFL game makes the
already-authorised TEAM-market condition testable. No live player-prop sportsbook pricing.

---

## Defects encountered / fixes merged during acceptance

*(none yet)*
