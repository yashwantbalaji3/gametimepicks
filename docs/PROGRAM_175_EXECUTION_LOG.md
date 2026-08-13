# Program 175 — MLB/NFL product parity

**Window** 2026-08-13 16:38 → 17:35 ET (20:38 → 21:35 UTC) · **Start anchor** `747f2faa6`
(CURRENT) · **Final HEAD** `0b2d59ae9` · **Kickoff at close** T‑1.5h · **Credits** 15/3,000
(unchanged) · **Protected money** byte-identical · **Gate** 4,297 / 0

## Corrected classification, as the program demanded

Program 174 was material progress, not completion — its own report listed B, D, F, H1, I, J as
unbuilt. Program 175 closed **two** of those (A: role evidence; C-partial: parity ledger + shared
owners) and produced the ledger that makes the rest countable. **It did not close them all.**

| Release | State at close |
|---|---|
| A · role evidence | **SHIPPED** |
| B · player publication | NOT_APPLICABLE today (evidenced) / simulation depth OPEN |
| C · MLB parity | **LEDGER SHIPPED**, 12 of 21 rows still OPEN |
| D · Bank Builder/Moonshot adapters | OPEN |
| E · settlement | **REALITY_GATED** (kickoff T‑1.5h) |
| F · NFL console | OPEN |
| G · automation | runner-proven for the current chain; next-window verifier OPEN |
| H · three-engine assurance | OPEN |

Per the program's own stop rule, **Program 175 is not complete**: A shipped, C partially, and D,
F, H remain engineering-owned. I am reporting that rather than relabelling it.

## What shipped

**Release A — the role refusal is now evidenced, not asserted.** For three programs every player
family was withheld with the same sentence. Now every rostered player across all 9 events carries
one state from a closed set plus the evidence that produced it (CIN: 86 NOT_YET_PUBLISHED, 2 OUT,
1 QUESTIONABLE of 89; population reconciles exactly). The source contract commits what each source
**cannot** establish — rosters cannot establish playing time, injury silence is not a clean bill,
the official inactive list is UNSUPPORTED because no authorized source carries it. So
ACTIVE_EXPECTED is unreachable by construction, and a guard proves it. Today's refusal is
explicitly *not* caused by our own staleness: both feeds are FRESH.

**Parity ledger — 21 rows, zero unexplained gaps.** Every row names an MLB owner, an NFL owner or
gap, and a shared-vs-adapter decision. Two NOT_APPLICABLE rows each carry a football-specific
reason and a named replacement.

**Real shared-owner adoption**, not cosmetic copying: NFL joined `sport-methodology-panel` and
`market-coverage`/`SimulationCoverageMatrix` as additive registry entries, with MLB's own copy and
entries byte-identical. NFL's six market rows carry honest statuses — `experimental` for the model
markets, `settlement_blocked` for touchdowns, `provider_needed` for player props.

## The most useful finding

`/nfl` is a **900px document**; `/mlb` is a **1440px application shell** with ~20 shared
components. Of those, **8 need no change at all** to serve NFL and 4 need only an additive union
or registry entry. The cheapest parity path is adopting owners that already exist — not forking
the `/mlb` page tree. The ledger records this so a future author doesn't build a parallel tree.

## Defects caught by this program's own tooling

1. **My hand-written ledger summary over-claimed** — 4 shipped / 10 open against an actual 3 / 12.
   The guard caught it; the summary is now derived from the rows and carries a note so the same
   flattering arithmetic cannot recur.
2. **An existing guard fired on my copy** — "makes no claim to beat the market" tripped a
   substring scan that doesn't allow denials. I reworded rather than widening someone else's guard.

## Next five

1. Settle the 9 forecasts when finals land (armed; fires ~14:30Z).
2. Adopt `vault-page-shell` + `SportShell` on `/nfl` — the single largest visual gap.
3. `NFL_MARKET_CONFIG` + thread `sport` through the 4 Market Center call sites (loader is already seamed).
4. NFL event control table on the protected console.
5. Bank Builder / Moonshot NFL adapters (experimental forecasts must not auto-qualify).
