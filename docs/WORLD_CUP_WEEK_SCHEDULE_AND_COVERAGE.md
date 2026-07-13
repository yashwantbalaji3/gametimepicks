# World Cup Week — Schedule Ground Truth + Prediction Coverage (2026-07-13)

Schedule verified from the **live Odds API `/events`** (`soccer_fifa_world_cup`, free metadata call) — not from
the hardcoded expectation. This is the real source the site's WC model uses.

## Verified fixtures (source: Odds API /events)
| fixture | date/time (ET) | stage | teams source | odds | prediction artifact | public page |
|---|---|---|---|---|---|---|
| France vs Spain | Tue Jul 14, 3:00 PM | Semifinal | **confirmed** (API) | ✅ live | `projections/2026-07-14.json` | `/world-cup` board + `/games/world-cup/france-vs-spain-2026-07-14` |
| England vs Argentina | Wed Jul 15, 3:00 PM | Semifinal | **confirmed** (API) | ✅ live | `projections/2026-07-14.json` (window 07-14/15) | `/games/world-cup/england-vs-argentina-2026-07-14` |
| Third-place | Sat Jul 18 | 3rd place | **TBD** (SF losers) | — | none | pending |
| Final | Sun Jul 19 | Final | **TBD** (SF winners) | — | none | pending |

The `/events` probe returned **exactly 2 events** (the two SFs). The final + third-place are **not yet listed**
(teams TBD until the SFs finish), so there is nothing to fetch and nothing was fabricated.

## Prediction coverage (this week)
| date | sport | event | prediction status | artifact | blocker | next action |
|---|---|---|---|---|---|---|
| 07-14 | WC | France vs Spain | ✅ **generated** (5 supported markets, market-implied) | `projections/2026-07-14.json` + game report | — | settle after FT from official score |
| 07-15 | WC | England vs Argentina | ✅ **generated** (5 supported markets) | same window artifact + game report | — | settle after FT |
| 07-13→16 | MLB | All-Star break | ✅ honest no-slate (ASG exhibition, no board) | — | none (break) | resume ~07-17 |
| 07-17 | MLB | regular season resumes | ⏳ pending | — | games/odds post ~07-17 | run refresh + sims |
| 07-18 | WC | third-place | ⏳ **TBD** | — | SF losers unknown | refresh after SFs settle |
| 07-19 | WC | final | ⏳ **TBD** | — | SF winners unknown | refresh after SFs settle |

## Markets covered per semifinal (supported, source-backed only)
`moneyline_90` (match result), `double_chance`, `draw_no_bet`, `match_total_goals`, `btts`. **Player props were
ingested but matched 0** to the SF fixtures (the known WC event-id/matchId join gap) → shown as unavailable, not
faked. No anytime-scorer / shots / corners / cards fabricated.

## Honesty rules applied
- Predictions only where real odds exist (both SFs). Final/3rd-place = TBD placeholder, no fake teams/odds.
- WC labelled **market-implied / model read**, paper-only, educational. No lock/guaranteed/best-bet/EV claims.
- Official money (19-14) untouched; md5 `affe6b21`.
