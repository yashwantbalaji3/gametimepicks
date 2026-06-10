# NBA + MLB Prop-Market & Player-Image Coverage Audit — 2026-06-10

_What the production system supports today, and what each gap requires
(provider/pipeline vs UI). No fabrication — honest coverage map._

## Player images (FIXED this PR)
- **Root cause:** NBA now uses `espn_scoreboard`, so lean `playerId` is an **ESPN athlete
  id**. `PlayerAvatar` built NBA URLs from `cdn.nba.com/.../{id}.png`, which returns a
  generic **silhouette at HTTP 200** for ESPN ids → `onError` never fired → no real face.
- **Fix:** NBA headshots now use the **ESPN CDN** `a.espncdn.com/i/headshots/nba/players/full/{id}.png`
  (real photo for valid ESPN ids; clean 404 → initials disc otherwise). Verified: real id
  → 200/263KB, bogus id → 404. One shared component, so it repairs board rows, vault cards,
  and parlay slip cards at once. **MLB already works** (midfield.mlbstatic, 200).

## NBA markets
- **In odds + board today:** Points, Rebounds, Assists (PTS 36 / REB 31 / AST 29).
- **ESPN stats available but NOT yet extracted:** the ESPN gamelog row carries the full box
  (MIN, FG, **3PT**, FT, **REB**, **AST**, **BLK**, **STL**, PF, **TO**, PTS), but the
  `GameLog` dataclass only stores `pts/reb/ast/minutes`. So **3PM / blocks / steals /
  turnovers are present in the source but not parsed/modeled**.
- **To add a market (e.g., 3PM):** (a) OddsAPI must return that market for the slate
  (`basketball_nba` keys `player_threes`/`player_blocks`/`player_steals`/`player_turnovers`
  — needs a credit-bounded probe to confirm availability), (b) extend the ESPN parser +
  `GameLog` to carry the stat, (c) extend `score_model` per market, (d) regenerate in the
  cloud (odds credits). → **pipeline + provider work**, not UI; requires cloud regen +
  leakage tests. Scoped as a follow-up PR (`Expand NBA prop markets`).

## NBA Suggested Parlays (why thin)
- June 10 NBA is a **single-game slate (Finals Game 4)**. The public optimizer enforces a
  **same-game cap of 1 leg** (PR #110 correlation safety), so no diversified multi-leg NBA
  public card can form — by design, not a bug. More markets (3PM/blocks/steals) would add
  legs but they'd still be same-game (capped). The honest fix is **clear messaging** (a
  labeled single-game note) — **not** loosening the cap. UI follow-up.

## MLB
- **Player markets live:** batter hits, total bases, etc. (685 leans, `marketKey`). Preserved.
- **Game-level (moneyline/total):** NBA has `game-markets/` + `team_projections/` dirs and
  MLB odds carry game markets — a **"market outlook"** surface (implied from real odds) is
  feasible to surface (clearly labeled market-implied, not a team model) as a follow-up.

## Blocker classification
| Item | Type | Status |
|---|---|---|
| NBA headshots | UI | **FIXED (this PR)** |
| MLB headshots | UI | already working |
| NBA 3PM/blocks/steals/TO markets | pipeline + provider (odds + parser + model + regen) | follow-up |
| NBA single-game thin parlays | by-design (same-game cap) → UI messaging | follow-up |
| NBA/MLB game outlook (market-implied) | UI surface over existing odds artifacts | follow-up |

## This PR ships
The high-confidence, contained win: **real player headshots** (NBA fix + MLB verified) +
this coverage audit. The market-expansion and game-outlook items are honestly scoped as
follow-ups because they need cloud regeneration, odds credits, and leakage tests — not safe
to rush blind.
