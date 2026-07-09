# Soccer / World Cup Simulate Coverage Audit (2026-07-09)

Phase 1 of the soccer full-market build. Money untouched (`affe6b21…`, 19-14).

## What "simulate" means for soccer today

| Area | Exists? | Artifact-backed? | Visible? | Gated behind Generate? | Gap |
|---|---:|---:|---:|---:|---|
| WC game-detail route | ✅ | ✅ | ✅ | ❌ | renders the report immediately |
| WC Game Lab report (market signals) | ✅ | ✅ | ✅ | ❌ | signal rows, not a Game Center |
| de-vigged 3-way / total / DC / BTTS / DNB probs | ✅ | ✅ | 🟡 (inside report) | — | not surfaced as a Game Center |
| Soccer **Game Center** | ❌ | — | ❌ | — | **build it** |
| Soccer **Generate → reveal** flow | ❌ | — | ❌ | ❌ | **build it (market-implied)** |
| Soccer animation | ❌ (baseball only) | — | ❌ | — | soccer reveal |
| `world-cup/game-simulations` artifact | ❌ | — | — | — | none — soccer is market-implied, NOT a sampled sim |
| flags/logos | 🟡 | ✅ (homeCode/awayCode) | ✅ | — | logos null; flags via code |

## Answers to the audit questions

1. **Remaining WC games have routes?** Yes — `/games/world-cup/<slug>` per fixture on the slate. (Future TBD games appear only when the schedule/odds exist — never faked.)
2. **On /simulate?** World Cup is a sport tab; games surface via the games experience.
3. **Flags/logos?** `homeCode`/`awayCode` (FR/MA) drive flags; provider logos are often null (flag fallback).
4. **Can a user Generate per WC game?** **No** — the WC detail shows the report directly (no gating).
5. **10-second Generate→Reveal like MLB?** **No.**
6. **Soccer Game Center?** **No** — only the market-signal report.
7. **Markets artifact-backed now?** `moneyline_90` (3-way home/draw/away), `match_total_goals`, `double_chance`, `btts`, `draw_no_bet` — all **de-vigged** (`outcomes[].marketProbability` sums to 1.0 in the WC projection).
8. **Not supported?** shots, shots-on-target, assists, corners, cards, xG, first/anytime scorer, exact score, Asian handicap, team totals — **honest unavailable, never fabricated**.

## Data source (verified)

`public/data/world-cup/projections/<date>.json` → `matches[]` is a flat list of **market
projections** per fixture. Each carries `matchId`, `homeTeam`/`awayTeam`, `homeCode`/`awayCode`,
`kickoffUtc`, `stage`, `knockout`, `regulationOnly`, `market`, and `outcomes[]` with de-vigged
`marketProbability` per side. Grouping by `matchId` yields everything the Game Center needs.

## Build plan (this session)

1. **`lib/wc-game-center.ts`** — group the projection by matchId; derive a market-implied Game
   Center (match result 3-way, double chance, draw-no-bet, match total + O/U lean, BTTS). DIRECT
   read of the de-vigged probs; unsupported modules declared unavailable. **No 10,000-run claim.**
2. **`components/game/wc-game-center.tsx`** — Match Result Center + DC/DNB + Total/BTTS +
   Unavailable + Recap; labelled "Market-implied · de-vigged", "not betting advice".
3. **Gate the WC game-detail** — reuse the sim runner in a market-implied mode (no runCount claim
   → the reveal reads "market dashboard", never "10,000-run"); Game Center + report in postReveal.
4. **Regulation-time caveat** stays explicit (90-minute markets; ET/penalties excluded).
5. Tests + gates + deploy; money md5 unchanged.
