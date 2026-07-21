# July 21 Public Launch Readiness Audit

Money locked `affe6b21`, record 19-14, exposure $0 — unchanged throughout. Public-ready = current + honest +
usable + safe, never forced picks.

## Verdict
**The site is public-safe and current for July 21, MLB-first, World Cup archived, products honest No Play.**
Not product-active (no eligible edge legs today) — which is honest, not broken.

## Precheck / drift
- Started HEAD `b9955330` (July-15 work). `origin/main` had drifted to `e217d79f` — **10 nightly-settle commits**
  (Jul 16–20), linear, money md5 `affe6b21` unchanged. Rebased the July-15 moonshot-cleanup commit on top,
  aligned both refs. Forensic PERFECT.

## Sports calendar (real, as of July 20 night → July 21)
| sport | status | treatment |
|---|---|---|
| **MLB** | **ACTIVE** — regular season resumed post-All-Star; **15 games July 21** (3 with posted odds + 10k sims so far) | **Primary active sport.** Home / Simulate / MLB hub lead with it. |
| World Cup | **COMPLETE** (tournament over; 0 upcoming fixtures) | **Archive.** Not "today"; round-of-32 shows a "completed" page; hub shows finals/archive, no "Live today". |
| NBA | offseason | future — not today's product |
| NFL | future/preseason | not today's product |
| NHL | offseason | not today's product |
| UFC | no supported current data | experimental/archive only, product-ineligible |

## July 21 refresh + a real bug fixed
`refresh_daily_products.sh --date 2026-07-21` ran (money md5-verified unchanged). It surfaced **a bug**: the
MLB empty-slate guard filtered on `x.home`/`x.away`, but the board schema uses `homeTeamName`/`awayTeamName` — so
a real 15-game slate was wrongly counted as **0 games ("All-Star break")** and team markets + sims were skipped.
**Fixed** the guard (now checks `homeTeamName`/`homeTeamId`/…); re-ran team markets (3/3 priced games) + generated
the 10k player-prop sims (3 games, 5 picks). It's July-20 night, so only early-July-21 games have odds yet; more
populate as books post.

## World Cup completion → build break, fixed
The empty WC broke the export build: `/world-cup/round-of-32/[slug]` `generateStaticParams()` returned 0 params
(no board games), which `output: export` rejects. **Fixed:** it now emits a single `completed` archive page
("The World Cup is complete") when the board is empty, rendered honestly (no fabrication, no 404).

## Route audit (built `out/`, July 21)
| route | builds | current? | notes |
|---|---|---|---|
| `/` | ✓ | ✓ MLB-first | features July-21 MLB (Braves/Dodgers/Padres/Phillies), "Simulate today"; **no stale WC hero** |
| `/simulate` | ✓ | ✓ | MLB games featured; no England-vs-Argentina card |
| `/mlb` | ✓ | ✓ | 15-game July-21 slate; liveness banner honest ("next up" — see below) |
| `/world-cup` | ✓ | ✓ archive | finals/archive, **no "Live today"** |
| `/world-cup/round-of-32/completed` | ✓ | ✓ | honest "tournament complete" archive page |
| `/games/mlb/<game>-2026-07-21` | ✓ | ✓ | V2 report: player-prop sim + market snapshot + "full-game model validating" (no internal numbers) |
| `/bank-builder` `/moonshot` `/today` `/results` `/methodology` | ✓ | ✓ | products honest No Play (below) |

## Data freshness
- daily-portfolio.date = **2026-07-21**; open exposure **$0**; bankroll $19,065.40, crown $20,465.40 untouched.
- MLB: schedule 15 games, 753 props, 3 games with team markets + sims.
- WC: `projections/latest.json` empty (07-21, 0 matches) — completed; 07-15/07-14/07-11 archives retained.
- player-team-map: empty (WC done → no active fixtures → resolver returns null, fail-safe).
- Money md5 `affe6b21` verified before + after.

## Known residuals (for the founder)
1. **July-20-night "prepared-for-tomorrow" state:** the July-21 slate is loaded, but the real ET clock is July 20,
   so `/mlb`'s liveness banner reads "No games today · next up July 21". This is honest + resolves automatically at
   midnight when the real clock hits July 21. Not a bug.
2. **Only 3 of 15 MLB games have odds/sims yet** (books post July-21 lines through the day). More populate as the
   day progresses; re-run the MLB team-markets + sims closer to game time for full coverage.
3. **Top 10 "team" tab is sourced only from the WC knockout board** → empty now that the WC is over, even though
   MLB has team markets. A product gap (`src/lib/top10/top10-picks.ts`), not a test issue — flagged for follow-up.
4. **World Cup settlement (France vs Spain, later rounds) remains PENDING** — still no trusted 90'-separated
   official score source (The Odds API gives finals only; API-Football free has no 2026). Not fabricated.

## Gates
tsc clean · suite **2276/2276** · build exit 0 · forensic PERFECT · health HEALTHY · money `affe6b21`.
