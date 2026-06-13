# Bank Builder Step 5 — Vassell + Buxton (Projection-Board) Replacement Review

**Status: BLOCKED — Buxton cannot be published honestly. No candidate change. No mutation.**

**SHA at review:** dd01e4e · 19:37 ET June 13, 2026.
**State (UNCHANGED):** bankroll $3,623.97 · record 4–0 · Step 5/5 · current published candidate = Vassell REB Over 4.5 + Chapman 1+ hits (pending).

## Request
Replace the official Step 5 candidate with **Devin Vassell Rebounds Over 4.5 + Byron Buxton Hits Over 1.5**, presented as a projection-board / model-reviewed leg (not owner/override). Cited a screenshot of "Buxton Hits Over 1.5 @ −114" in the projections. Publish **only if the board honestly supports Buxton Over 1.5 as a model-backed Over**, else stop and report.

## What the board actually shows (MLB board 2026-06-13, all three Buxton rows)
| Market | Line | Over odds | Model P(Over) | Model P(Under) | `lean` label | Conf | Edge |
|---|---|---|---|---|---|---|---|
| **batter_hits** | 1.5 | **+193** | **0.354** | **0.646** | Over | **Low** | 1.25% |
| batter_hits_runs_rbis | 1.5 | −158 | 0.668 | 0.332 | Over | High | 5.53% |
| **batter_total_bases** | 1.5 | **−114** | **0.654** | 0.346 | Over | High | 12.12% |

## Finding 1 — the "−114" leg is **Total Bases**, not **Hits**
The only Buxton "Over 1.5 @ −114" on the board is **batter_total_bases Over 1.5** (model 0.654, lean Over, High). The **batter_hits** Over 1.5 is a *different* market at **+193**. The screenshot's −114 card is a real model-backed Over — but it is **Total Bases**, not **Hits**. Publishing Total Bases under a "Hits Over 1.5" label would fabricate the market/line. Banned.

## Finding 2 — Buxton **Hits** Over 1.5 is not a model-backed Over for a card that must hit
The `lean` field is labeled "Over," but only because of a razor-thin value edge (model 0.354 vs market-implied 0.341 = +1.25%), at **Low** confidence. The model's probability that the Over **actually occurs is 0.354** — i.e. the model thinks there's a **64.6% chance it does NOT happen**. This is exactly the "raw probability vs. recommendation" distinction the request flagged: an edge-side label is not a prediction the leg hits. Every published Step 5 leg has required **model probability ≥ 0.55** (likely to hit); Hits Over 1.5 at **0.354 fails that gate decisively**. Representing it as a "model-backed Over" suitable for a $3,623.97 → $10,000 leg would be dishonest.

## Finding 3 — the game is already FINAL (independent, decisive blocker)
STL @ MIN commenced **2:11 PM ET** (a day game); at review time (7:37 PM ET) it had been final for ~5.5 hours. **No Buxton leg — Hits or Total Bases — can be a *pending* Step 5 leg**, because the outcome is already determined. Publishing a finished-game leg as "pending" would misrepresent game status. Banned ("do not fabricate game status"; "do not backdate a candidate after final game state").

## Decision
**Do NOT publish Vassell + Buxton.** Two of the three blockers are individually decisive (model 0.354/Low for Hits; game final for any Buxton market). Per the request's own stop-condition:

> "Buxton Over 1.5 exists in the projection board, but the model lean [hit-probability] is not Over; publishing it as a model-backed Over would be dishonest." — and the game is already final, so it cannot be a pending leg regardless.

## State preserved
Vassell Rebounds Over 4.5 (NBA, 8:30 PM ET, model 0.705, market 0.588, edge 15.3%, High) remains valid and upcoming. The current published MLB leg (Chapman 1+ hits, CHC @ SF 10:06 PM ET, model 0.756, High) is still valid and upcoming — **retained as the current card pending the owner's explicit direction, not represented as an approved substitution.** Bankroll $3,623.97 / record 4–0 / Step 5/5 / ledger — UNCHANGED. No settlement.

## Awaiting direction
Buxton's game is final, so no Buxton leg is publishable as pending. The honest options are (a) keep Vassell + Chapman, or (b) swap Chapman for a different **upcoming** model-backed MLB leg. No public owner/override language used anywhere.
