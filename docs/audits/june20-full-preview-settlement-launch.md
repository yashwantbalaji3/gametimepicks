# June 20 full internal preview → June 19 settlement → approved live launch

_Branch `internal-preview-june20-worldcup-specials-rebuild` (PR #542 draft) at `8f0d58c3`. Audit started 2026-06-20 04:55 UTC. Two-stage: (1) internal preview now, unmerged; (2) settle June 19 from official sources after finals, then launch June 20 live._

## Official June 19 results (gathered live — official sources only)
**MLB Stats API** (statsapi.mlb.com, both Final):
- Nick Gonzales (PIT@COL): PA 4 · H 1 · R 0 · RBI 1 → **HRR 2** → HRR Under 2.5 (≤2) = **WIN**
- Rhys Hoskins (CLE@HOU): PA 4 · H 1 · R 1 · RBI 2 → **HRR 4** → HRR Under 1.5 (≤1) = **LOSS**

**API-Football** (v3.football.api-sports.io, league 1 / season 2026):
- USA 2-0 Australia [FT] → USA ML = **WIN**
- Scotland 0-1 Morocco [FT] → Morocco ML = **WIN**; goal: **Ismael Saibari 2′** → Saibari anytime GS = **WIN**
- Brazil 3-0 Haiti [FT] → goals M. Cunha 23′, 36′, **Vinícius Júnior 45′** → Vinícius anytime GS = **WIN**
- Türkiye 0-1 Paraguay [**2H, 90′+ — NOT FINAL**] → Turkey or Draw = **PENDING** (Turkey trailing; could equalize in stoppage)

## Card outcomes (decided vs pending)
| card | legs | status |
|---|---|---|
| **Core Lane A** Step 2 ($197.88, +204) | USA ML ✅ + Gonzales HRR U2.5 ✅ | **WINS** → bankroll advances, return $601.56 |
| **Core Lane B** Step 1 ($100, +111) | Turkey-or-Draw ⏳ + Hoskins HRR U1.5 ❌ | **LOSES** — Hoskins lost (parlay dead regardless of Turkey) |
| **Moonshot** Step 1 ($25, +808) | Morocco ML ✅ + Vinícius GS ✅ + Saibari GS ✅ + Turkey-or-Draw ⏳ | **PENDING** — 3/4 won; outcome hinges on Turkey/Paraguay FT |

Settlement is **blocked on Turkey/Paraguay's official final**. Lane A + Lane B are mathematically decided but will be written together with Moonshot once Turkey is FT, to keep a single consistent settlement pass. **No card is settled in the preview stage.**

## Audit
| area | current state | source | issue | required action | launch condition |
|---|---|---|---|---|---|
| PR #542 | draft, `8f0d58c3`, CLEAN to merge | gh | review-only June 20 specials preview | expand to full-site preview; keep unmerged | user/settlement gate |
| June 20 preview data | `previews/june20/{projections,player-projections,parlays}.json` (real, pulled) | Odds API + API-Football | present; revalidate pre-event | confirm 3 games still pre-event | all pre-event |
| June 20 WC Specials | 5 role-screened cards in `previews/june20/world-cup-specials.json` | role gate | harden: ≥1 key attacker OR ≥2 projected; ≤6 legs | verify/rebuild if needed | passes tighter gate |
| June 20 projections | `previews/june20/projections.json` (3 games, 14 markets) | Odds API | preview only | surface in preview | live at launch |
| June 20 suggested parlays | `previews/june20/parlays.json` (engine cards) | engine | summarize in preview | coverage summary | live at launch |
| June 20 Bank Builder | pending — June 19 not settled | — | no advance pre-settlement | show pending; candidate-only labels | settled first |
| June 20 Moonshot | Step 1 pending | — | no advance pre-settlement | show pending; Step-2 candidate-only | settled first |
| June 19 active BB | Lane A WINS / Lane B LOSES (decided, not written) | official | settle after Turkey FT | write after FT | official final |
| June 19 active Moonshot | PENDING (Turkey) | official | settle after Turkey FT | write after FT | official final |
| Mr. Dub exposure | $297.88 core / $322.88 total (pending) | artifact | update after settlement | recompute post-settle | settled |
| Results page | June 18 latest | artifact | add June 19 rows after settle | append official rows | settled |
| production homepage | June 19 (auto-hidden Specials — stale slate) | — | roll to June 20 at launch | promote June 20 data | gates pass |
| Vercel preview | PR #542 preview URL live | Vercel | extend to full preview | redeploy on push | n/a |
| production launch gate | not met (June 19 pending) | — | settle + QA first | all gates green | all true |

## Guards
Official sources only — no fabricated scores/goals/HRR/settlement/P&L. Pre-event only for June 20 cards. Strict odds bands (leg −250..+200, combined +700..+3000). Role gate (projected_starter / key_attacker only). No mutation of protected crown history. **No merge/deploy until: preview verified + June 19 officially final + settled from official sources + all QA/audit gates pass.** Canonical/allowed copy only.
