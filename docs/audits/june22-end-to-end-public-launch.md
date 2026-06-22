# June 22 — End-to-End Public Launch Refresh

**Date:** Monday June 22 2026. **Branch:** `june22-end-to-end-public-launch`.
**Scope:** Roll the public board to June 22, settle the now-final NZ/Egypt legs, settle the Moonshot LOST (dead-parlay-on-leg-miss), preserve Mr. Dub accounting, add premium per-leg settlement detail, QA all routes desktop + mobile, ship.

## Settlement decisions (official sources only)

**NZ/Egypt — New Zealand 1-3 Egypt, FT** (June 21, ESPN/FIFA + API-Football). Leg outcomes graded from the official 90-minute result:

| card | leg | outcome | basis |
|---|---|---|---|
| Lane A Step 3 | Egypt ML (−175) | **HIT** | Egypt won 3-1 |
| Moonshot Step 1 | NZ/Egypt BTTS No (−148) | **MISS** | both teams scored (1-3) |

**Moonshot dead-parlay rule (documented, not invented silently):** a parlay with any settled-LOST leg can no longer win; its remaining legs are moot. The NZ/Egypt BTTS No leg missed, so the 4-leg Moonshot Step 1 card is settled **LOST now** rather than waiting for the June 22 legs. This is the existing app rule (`moonshotSummary` treats a card LOST when any leg `settlement.result === "lost"`) — applied, not changed. Core Lane A/B cards are NOT settled early: each still has a genuinely-pending June 22 leg, so they stay **pending** until all their legs are final.

Lane A Step 3 (Egypt HIT + Algeria pending) and Lane B Step 1 (Argentina + France/Iraq Under 3.5, both pending) remain **active/pending** — no bankroll change until their open legs are official.

## Mr. Dub accounting (unchanged where it should be)

| metric | value |
|---|---|
| Current bankroll | **$10,176.17** |
| Core open exposure | **$200.00** (Lane A $100 seed + Lane B $100 seed) |
| Moonshot exposure | **$0.00** (settled LOST) |
| Total open exposure | **$200.00** |
| Core record | **8–2–0–2** (8W 2L 0V, 2 pending: Lane A Step 3 + Lane B Step 1) |
| Moonshot record | **0–1** (Step 1 restart card lost), separate from core |
| Protected crown ladder | **$10,376.17** · 5–0 · untouched |

The Moonshot loss is broken out separately and does **not** touch the core 8–2 record or the $200 core exposure. Core bankroll is unchanged because no core card settled.

## Public board rolled to June 22

- **WC projections** `2026-06-22`: 3 pre-event games (France/Iraq, Norway/Senegal, Jordan/Algeria). Argentina/Austria (1 PM ET) excluded from the bettable board — kicked off before build.
- **WC player props** `2026-06-22`: 144 market rows.
- **World Cup Specials** `2026-06-22`: 5 cards, combined +1043 / +1435 / +1490 / +1902 / +2425 (homepage-only box on `/today`).
- **Coverage matrix** `2026-06-22`: grand total 83.
- **MLB board** `2026-06-22`: 13 games.
- **Egypt/NZ same-game ideas**: correctly absent on the June 22 slate (NZ/Egypt is no longer in scope — rolled past, not stale).

## Premium UI added this run

- **Bank Builder leg rows** (`dual-ladder-board.tsx`): each active-card leg now carries a per-leg **HIT ✓ / MISS ✗ / Pending ◷** badge + the official score line when settled. The Egypt leg reads "Official: New Zealand 1-3 Egypt (FT, ESPN/FIFA) · HIT ✓"; the unsettled Algeria / Argentina / France-Iraq legs read "Pending ◷". Card-level status stays "active · pending official settlement" (legs settle before the card does).
- **Mr. Dub Moonshot section** (`mr-dub/page.tsx`): was wrongly reading `activeCard` and falling through to "awaiting a qualified card" for the settled lane. Now status-aware — a stopped lane renders **"Settled · lost · Step 1 restart card · $25 → $312.99 (+1152). Record 0–1"** with the dead-parlay reason.

## Verification

- **Tests:** 1208 / 1208 pass (3 Moonshot tests updated active→settled: coverage row = 0, ladder statuses `[stopped, upcoming, upcoming]`, Step-1 card `result: lost`).
- **tsc:** clean. **`next build`:** clean (exit 0, static export `out/` produced).
- **Audits:**
  - *Banned public copy* (app/src + generated JSON data + pipeline): no positive banned claims. All matches are negated disclaimers ("not a guarantee", "No locks, no guarantees"), engineering terms (safe-area, type-safe, leakage-safe, JSON-safe), or real UFC fighter data ("Lock Jaw").
  - *Secrets:* `.env` is gitignored and NOT staged (only `.env.example` tracked). No API keys in the diff.
  - *Protected:* crown ladder `dual-lanes-latest.json` + `results/` untouched; `crownBankroll` = 10376.17.
  - *Leg completeness:* every active leg carries matchup / market / kickoff ET / odds / settlement source.
  - *Extreme odds:* no active leg shorter than −500.
- **Browser QA (desktop + mobile 375px):** home, `/bank-builder`, `/mr-dub`, `/world-cup`, `/today` — all console-error-clean, zero horizontal overflow. HIT/MISS/Pending badges render with correct colors (HIT green, Pending muted). Moonshot card shows Step 1 STOPPED; crown ladder shows $10,376.17 · 5–0.

## Honest limitations / follow-ups

- The header bank chip shows the **completed crown** ($10,376.17 · Step 5 · 5–0) — the documented public-summary behavior, distinct from Mr. Dub's active $10,176.17. Unchanged this run (not a regression).
- The June 22 active-card legs (Algeria, Argentina, France/Iraq Under 3.5) settle through the evening once each game is official; Lane A/B settle only when all their legs are final.
- Intraday lineup-aware refresh stays dormant until the operator adds `ODDS_API_KEY` + `API_FOOTBALL_KEY` as GitHub repo secrets.
