# Aug 4 Autonomous Morning Preflight (Program 108-111 Lane I)

## The one command

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks && git pull --ff-only && cd app && node scripts/public-beta-observe.mjs
```

Reports ET date, latest board / settled / corpus dates, deployment SHA **with bot-challenge
classification**, freshness SLO state, alert wiring, analytics config, and protected hashes.

## Preflight status (verified 2026-08-03)

| Check | State |
|---|---|
| Aug 4 schedule source | MLB StatsAPI reachable and authoritative (used for today's 8-game slate) |
| Provider credits | 19,455 remaining after today's 20-credit base board; floor 2,000; ~5× headroom |
| Concurrency locks | none stuck — `gtp-generated-artifacts` queue drained; today's runs serialized cleanly |
| morning-projections schedule | 13:30 UTC = 09:30 ET |
| Watchdog | 14:30 UTC = 10:30 ET, dispatches only on a genuinely missing board |
| Generate-phase health | tolerates a stale downstream contract; money/reconciliation/hygiene still hard-abort |
| Canonical Vercel | `gametime-picks`, single `Production` environment |

## Known gap this preflight is honest about

**The 09:30 ET cron did not fire today** (GitHub best-effort scheduling) and the watchdog
correctly did **not** dispatch, because its contract is to recover a *missing* board and a
current board already existed. Net effect: no coverage refresh for the day, and the LAD @ CHC
gap persisted.

That is a real, still-open reliability gap: **the watchdog recovers a missing board, but nothing
recovers a missed coverage refresh when the board merely exists.** It is not a data-integrity
problem (the board is current, honest, and complete for 7 of 8 games) and it does not warrant a
rushed unattended change today. It is the top candidate for the next cycle, alongside the
official-addition writer — the two are the same underlying need.

## Failure-mode table (as-built)

| Failure tomorrow | Automatic response | Verified |
|---|---|---|
| Morning cron missed **and no board** | watchdog dispatches once after grace | ✅ tested (6 proofs) |
| Morning cron missed **but board exists** | no dispatch — **coverage refresh is skipped** | ⚠️ known gap, above |
| Contract stale before generation | generate phase warns; board proceeds | ✅ proven live 2026-08-03 |
| Critical accounting failure | generation aborts + ops alert | ✅ unchanged |
| Provider posts no markets | honest partial coverage, no fabrication | ✅ today: 7/8 |
| Boardless historical date at settle | NOT_MEASURABLE skip, run continues | ✅ proven live |
| Generated commit not deployed | freshness SLO escalates FAIL past 14:00 ET | ✅ tested |
| Vercel bot challenge | classified `BOT_CHALLENGE`, not an outage | ✅ 9 proofs |
| Board absent past SLO | FAIL + ops alert | ✅ tested |

## Aug 4 acceptance assertions (for the settlement that runs overnight)

```
settled_official_rows + unresolved_policy_rows == frozen_official_population (211 for Aug 3)
decisive == W + L; void/push/unavailable/no-play excluded from the denominator
research contract asOfSettledDate == ledger newest settled date
research/*.json present in the automated nightly commit  ← second independent proof
public Results date == newest legitimate settled date
base board sha256 d2e81ca3…bebf41 UNCHANGED
```
