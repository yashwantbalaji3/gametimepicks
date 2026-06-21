# June 21 Live Data Refresh — Audit

**Date/time:** Sunday June 21 2026, ~8:00 AM ET (12:00 UTC)
**Branch:** `june21-live-data-refresh-bankbuilder-moonshot` (off `main` @ `39c48f33`)
**Trigger:** User said API keys were already configured; the prior run had wrongly concluded "no local
keys." Verify correctly, and if keys exist, pull real June 21 data and generate the public site.

## Key verification (the prior run's mistake)

The prior run's check used a zsh glob (`app/.env*`) that errors and aborts in zsh, and only inspected
the empty shell env. A correct `node fs` check of explicit paths found the keys:

| environment | ODDS_API_KEY | API_FOOTBALL_KEY | suffix | usable by local run? |
|---|---|---|---|---|
| root `.env` (gitignored) | ✅ | ✅ | ··2a97 / ··c7fa | ✅ (pipeline `config.py` auto-loads via `load_dotenv`) |
| shell env | unset | unset | — | n/a (loaded from `.env`) |

Connectivity (low-cost): Odds API `/v4/sports` (free) → **18,375 credits**, `soccer_fifa_world_cup`
ACTIVE, `baseball_mlb` ACTIVE. API-Football `/status` → Pro plan, 7500/day, 0 used.

## June 21 World Cup data (real, odds-backed)

Tunisia/Japan (04:00Z) had already kicked off by the 8 AM ET pull, so the odds-backed slate is the
four remaining pre-event games:

| game | kickoff (ET) | team odds | player props | included |
|---|---|---|---|---|
| Spain vs Saudi Arabia | 12:00 | ✅ (Spain −1000) | ✅ | ✅ |
| Belgium vs Iran | 15:00 | ✅ (Belgium −240) | ✅ | ✅ |
| Uruguay vs Cape Verde | 18:00 | ✅ (Uruguay −220) | ✅ | ✅ |
| New Zealand vs Egypt | 21:00 | ✅ (Egypt −175) | ✅ | ✅ |

Generated: 19 market projections, 189 player props (166 matched to API-Football identities), 5 World
Cup Specials, 50 WC single-game + 20 WC multi-game cards. Lineups not posted at 8 AM → projected /
key-attacker role gate (no bench/unknown). The Specials generator was made **date-parameterized**
(reads `world-cup/projections/<date>.json` for any non-June-20 date) so it is daily-repeatable.

## June 21 MLB + coverage matrix

MLB board: 15 games, 619 leans (60 credits). Coverage matrix (live): WC 50 single + 20 multi, MLB 15,
Mixed 15, Bank Builder 1 = **grand total 101**; rows + risk totals reconcile.

## World Cup Specials (5 cards)

| card | combined | $10 → | legs | roles |
|---|---|---|---|---|
| 1 | +1039 | ~$114 | 4 / multi-game | key_attacker / team totals |
| 2 | +1444 | ~$154 | 4 | projected_starter / team |
| 3 | +1494 | ~$159 | 4 | projected_starter / team |
| 4 | +1912 | ~$201 | 4 | projected_starter / team |
| 5 | +2419 | ~$252 | 4 | projected_starter / team |

All combined +700..+3000, every leg −250..+200, ≥2 games, role-screened (no bench/unknown), settlement-supported.

## Bank Builder / Moonshot — candidate / awaiting (not auto-placed)

The June 21 World Cup slate is **favorite-heavy** (Spain −1000, Belgium −240, Uruguay −220, Egypt
−175); **every team market is `bankBuilderEligible=false`**, and the engine left Lane A/B awaiting. Per
the system's own design (Bank Builder / Moonshot are never auto-placed — candidate-only), and to
avoid committing unreviewed exposure on a favorite-heavy slate while the operator is away:

- **Lane A** — advanced, Step 3 **awaiting a qualified June 21 card** (data-backed favorite-heavy
  reason). $601.56 rides, **no exposure**.
- **Lane B** — stopped, awaiting a qualified June 21 restart (candidate-only, no exposure).
- **Moonshot** — concrete candidate surfaced (e.g. Under 2.5 NZ/Egypt, Under 2.75 Belgium/Iran,
  Ayman Yahya shots, Jovane Cabral SOT ≈ +1496, $25 → ≈ $399), held until lineups confirm.
  Candidate-only, **no exposure**.

Mr. Dub unchanged from the reconciled source of truth: **bankroll $10,176.17, open exposure $0,
record 8-2**, crown $10,376.17 protected.

## Status-bar fix

The global chip read "Slate settled" off the stale June 18 optimizer snapshot. Now it derives from the
**current slate date vs the last graded date** → a freshly-pulled pregame slate reads **"Today · Jun
21 · Pregame slate"** honestly.

## Verification
- **1201/1201 tests pass** (5 slate-pinned specs rolled June 20 → June 21; added `june21-live-slate`
  guard). `tsc` clean · `next build` clean.
- Audits: no banned copy; **`.env` gitignored and never staged, no key values in the diff**; extreme
  odds (−1000/−10000) exist only in the raw market feed, **zero in any surfaced card** (all cards
  respect the bands); protected crown + results untouched.
- Browser QA desktop + mobile: header "Today · Jun 21 · Pregame slate"; 5 Specials; Parlay Lab cards
  match the matrix; Bank Builder awaiting (favorite-heavy) + Moonshot candidate; Mr. Dub $10,176.17;
  no console errors; no mobile overflow.

## Honest limitation
The favorite-heavy June 21 WC slate yields no qualified low-volatility Bank Builder card, so Lane A/B
remain awaiting (candidate-only) by design rather than placing a low-edge favorite card. The 5
Specials + 90 suggested parlays + 15 MLB cards are live and actionable.
