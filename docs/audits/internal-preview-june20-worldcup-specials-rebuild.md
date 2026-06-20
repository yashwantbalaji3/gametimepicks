# Internal preview — June 20 World Cup Specials rebuild (role-quality gates)

_Branch `internal-preview-june20-worldcup-specials-rebuild` off main `1442dd92`. Audit at 2026-06-20 04:15 UTC (00:15 ET). **PREVIEW ONLY — must NOT merge / deploy to production until the user approves.**_

## Why this rebuild
The June 19 World Cup Specials (PR #541) let any in-odds-range player prop into a card — including deep-squad / rotation-risk shots-on-target props (e.g. "Louicius Don Deedson", "Duckens Nazon", "Igor Thiago"). The user wants a stronger June 20 build that screens player legs by **starter / role quality** and excludes bench/rotation-risk players, shown first as an **internal Vercel preview** for review.

## June 20 data — real, pulled live (paper-only, no fabrication)
Ran the documented WC pipeline (keys in `.env`, credit-guarded; ~30 credits, balance 18557→~18530):
- `build_odds_only_projections --date 2026-06-20` → team markets
- `build_player_props --date 2026-06-20` → player props (Odds API price + API-Football identity/position)

| game | kickoff (UTC) | team markets | player props | in-range team legs (−250..+200) | in-range GS/SOT player props |
|---|---|---|---|---|---|
| Netherlands vs Sweden | 17:00Z | ML/DC/totals/BTTS/DNB | GS/SOT/assists/shots | ML −139, Over 2.5 −165, BTTS Yes −175 | NED 10, SWE 7 |
| Germany vs Ivory Coast | 20:00Z | ML/DC/totals/BTTS/DNB | GS/SOT/assists/shots | ML −220, Under 3.5 −182, BTTS Yes −150 | GER 11, CIV 6 |
| Ecuador vs Curaçao | 00:00Z (+1, = June 20 ET) | ML/DC/totals/BTTS/DNB | GS/SOT/assists/shots | BTTS No −240 | ECU 10, CUR 5 |

- Tunisia vs Japan (4th June 20 fixture) has **no odds posted yet** → excluded honestly.
- `lineupsPosted: false` → **no confirmed starters available**; player roles are **projected / market-implied** (`lineup_pending_projected_role`).
- 144 props total · 139 matched to API-Football identity (position + photo) · 5 unmatched.

## Production isolation (critical)
The pull writes `world-cup/{projections,player-projections,parlays}/latest.json`. To keep the **live June 19 state byte-identical**, I restored those `latest.json` files and removed the dated `2026-06-20.json` files; the real June 20 data lives **only** under `app/public/data/previews/june20/`. `git status` over `app/public/data/world-cup/` is clean.

## Audit
| area | current state | issue | preview fix | production impact |
|---|---|---|---|---|
| June 19 settlement | Lane A/B + Moonshot Step 1 pending; not settled | results not final | **leave pending**; no fake P/L; settle nothing | none |
| June 20 WC slate | no June 20 artifacts existed | needed for preview | pulled real odds + props → `previews/june20/` | none (isolated namespace) |
| World Cup Specials | June 19 generator (`world-cup-specials.ts`) accepts any in-range prop | bench/rotation players entered cards | add a **role-quality gate**; June 20 generator reads role-screened pool | none until merged |
| player-prop source | `previews/june20/player-projections.json` | role unknown per leg | new `player-role-quality.ts` classifies role tier + evidence | none |
| starter/role data | API-Football position + market prominence; lineups NOT posted | no confirmed starters | projected_starter / key_attacker only; label limited-data | none |
| Bank Builder active | Lane A Gonzales / Lane B Hoskins | must not change | **untouched** | none |
| Moonshot active | Step 1 +808 | must not change | **untouched** | none |
| Mr. Dub exposure | $297.88 / $322.88 | must not change | **untouched** | none |
| homepage `/today` | June 19 production | must not change | **NOT touched** (route-only preview) | none |
| world-cup / picks / parlays | June 19 production | must not change | not touched | none |
| Vercel preview | n/a | needed for review | unmerged PR → Vercel preview URL + `/preview/june20` route | none |

## Preview strategy (Phase 1)
| preview strategy | files touched | how user reviews | production risk | rollback |
|---|---|---|---|---|
| **Dedicated `/preview/june20` route** (chosen — Phase 7 "preferred" when homepage date mechanics are risky) | new route + new components + new generator/role lib + `previews/june20/` data | open the Vercel preview URL `/preview/june20` | **none** — production homepage/world-cup/parlays untouched; PR stays unmerged | delete branch |

The route shows a clear **Internal June 20 Preview** banner + "Not production" + "June 19 settlement not finalized in this build". The production homepage is never modified, so even an accidental merge would only add a non-linked `/preview/june20` route, not change live surfaces.

## Role-quality gate (Phase 3-4) — eligibility
A player leg may enter a Special only if its role tier is `confirmed_starter` (unavailable today), `projected_starter`, or `key_attacker`. Excluded: `regular_rotation`, `bench_risk`, `unknown`. Evidence is market-implied prominence (top goalscorer/SOT props per team), position (Attacker/attacking-Mid favoured; GK + most Defenders excluded for attacking props), and per-team caps (max ~5). Exclusion reasons: `bench_role_risk`, `lineup_not_confirmed`, `player_not_projected_starter`, `low_usage_player`, `unsupported_role_source`, `market_exists_but_role_unclear`, `leg_odds_out_of_specials_range`, `combined_odds_out_of_specials_range`.

## Guards
Real odds/markets/identity only — no fabricated odds/props/roles/lineups/photos/scores/settlement. Pre-event only. Strict per-leg −250..+200 + combined +700..+3000. Canonical/allowed copy only. No mutation of active BB/Moonshot/Mr.Dub or protected history. **No merge / no production deploy without explicit approval.**
