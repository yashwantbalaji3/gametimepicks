# Model Review — 2026-07-06 (World Cup / soccer)

*From: Soccer AI Employee → To: (future) Sports Operations Lead. Settled-only postmortem. Every score is
the official API-Football FT (90-minute) result. No estimated scores, no hindsight rewrites, no weight
changes — this is analysis, and any tuning is a separate, approved decision.*

## Official results (90')
| Game | FT | Read |
|---|---|---|
| Portugal vs Spain | **0–1** | Spain win · 1 goal · one-sided/low-scoring |
| USA vs Belgium | **1–4** | Belgium win · 5 goals · both scored, open game |

## Settled products
### Bank Builder — Lane A · Step 1 · **WON** (record 17-14 → 18-14; rolls $100 → $174.23, bankroll/crown unchanged)
| Leg | Market | Odds | Official 90' | Grade | Reason held up? |
|---|---|---|---|---|---|
| Spain or Draw | Double chance | −435 | Portugal 0–1 Spain | **WON** | Yes — Spain (heavy favourite) won outright; draw-protected anyway. |
| Belgium or Draw | Double chance | −240 | USA 1–4 Belgium | **WON** | Yes — Belgium (favourite) won comfortably. |

The survival lane did exactly its job: two draw-protected favourites from **different games**, built to clear
a rung, not to swing. Both landed. **The reasoning held up fully.**

### Moonshot — Lane B · **LOST** (separate high-variance lane; 0-1, −$25 paper, not in the core bankroll)
| Leg | Market | Odds | Official 90' | Grade |
|---|---|---|---|---|
| Spain (DNB) | Draw-no-bet | −275 | Portugal 0–1 Spain | **WON** |
| Over 2.5 | Totals | −121 | Portugal 0–1 Spain (1 goal) | **LOST** |
| BTTS Yes | Both teams to score | −143 | Portugal 0–1 Spain (only Spain scored) | **LOST** |
| Belgium (DNB) | Draw-no-bet | −130 | USA 1–4 Belgium | **WON** |
| Over 2.5 | Totals | −137 | USA 1–4 Belgium (5 goals) | **WON** |
| BTTS Yes | Both teams to score | −186 | USA 1–4 Belgium (both scored) | **WON** |

Four of six legs won; the two that failed were **both on Portugal–Spain**, a one-sided 0–1 game where the
favourite won without an open scoreline. The USA–Belgium half of the card was perfect. A 6-leg longshot dies
on its weakest game — here, a low-scoring favourite hold.

## Learning signals — proven / directional / insufficient
1. **Double chance on clear favourites is the anchor — PROVEN.** Spain-or-Draw + Belgium-or-Draw both won;
   the DC family's settled record is now ~11–1 (its only loss an outright upset). The survival lane's
   discipline (two draw-protected favourites from different games) is the single most repeatable edge.
   **No change — keep it as the Lane A default.**
2. **The Lane B no-play call was VINDICATED — directional.** July-6 Lane B was skipped because the only
   value-band legs were negative-to-fair BTTS. Had we stacked BTTS, the Portugal–Spain leg (0–1, only one
   team scored) would have **lost** the lane. Skipping the weak card avoided a loss. This reinforces the
   no-forced-card rule — the most valuable operational habit we have.
3. **Totals / BTTS are game-state dependent and fail on one-sided games — directional (already encoded).**
   Both Moonshot failures were Over 2.5 + BTTS on a favourite's low-scoring win. This matches the known
   totals 10–6 / BTTS-weak record: goal markets need an open game, and a favourite can win 1–0. **No new
   penalty** — the Moonshot is high-variance by design and the weighting already down-ranks these markets;
   one more data point doesn't justify a constant change.
4. **Moonshot structure is inherently fragile — insufficient sample to act.** Stacking 6 goal/DNB legs
   across two games means the weakest game ends the card. That's the product's accepted trade for +1892
   upside; it is a longshot, labelled as such. No structural change recommended on n=1.

## Bottom line
A **clean, disciplined day**: the survival Bank Builder card won (record 18-14; the DC-favourite anchor
held), the Lane B no-play avoided a real loss, and the high-variance Moonshot died honestly on a one-sided
game. **No model weight changes are justified** — the settled evidence confirms the existing approach
rather than challenging it. Canonical money moved only through this official settlement; the Moonshot loss
is a separate paper lane and does not touch the core bankroll.
