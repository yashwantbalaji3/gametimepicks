# Model Feature Availability Matrix (2026-06-06)

> Maps the user's target factor roadmap to what EXISTS in the current code/data.
> Honest: features not present are marked blocked, not implemented. Field sources
> verified against `app/public/data/mlb/boards/<date>.json` + `boards/<date>.json`
> lean shapes and the pipeline. No fabrication.

Legend: ✅ implemented · 🟡 partial · ⚠️ available-but-stale/risky · ❌ missing source · 💳 needs paid provider · 🧱 needs new schema · 🚫 leakage-unsafe · — not relevant

## MLB
| feature group | status | source / blocker |
|---------------|--------|------------------|
| game context (home/away, venue) | ✅ | lean `homeTeamAbbr/awayTeamAbbr/venue/commenceTime` |
| park factors | ❌ | only venue NAME; no park-factor source |
| weather | ❌ | no weather source |
| umpire | ❌ | no umpire source |
| team offense | 🟡 | implied in odds/projection; no explicit team-offense feature |
| starter quality / confirmation | 🟡 | `playerRole` only; no confirmed-starter feed |
| pitch mix | ❌ | no pitch-type source |
| hitter skills | 🟡 | `projection`, `recentSeries`, `sigma`, `samples` |
| hitter-vs-pitcher | ❌ | no matchup history source |
| pitch-type matchup | ❌ | needs pitch-mix + handedness |
| handedness / platoon | ❌ | no handedness field on leans |
| bullpen | ❌ | no bullpen-usage source |
| recent form (L5/L10) | ⚠️ | `recentSeries` values present, but **no dated `recentGames`** → staleness uncheckable; Low Risk defers to series |
| market price / implied / model prob | ✅ | `oddsOver/Under`, `impliedOver/Under`, `modelProbOver/Under`, `edgePct` |

## NBA
| feature group | status | source / blocker |
|---------------|--------|------------------|
| game context (home/away, tipoff) | ✅ | lean `homeAway`, `tipoff`, `opponent` |
| recent form (playoff-aware) | 🟡 | `recentGames` (dated) + `recent10`; **#282 provider fix now includes playoffs** — refreshed players show 2026-06-03 form; some leans still stale until refetched |
| projected minutes | ❌ | no minutes field |
| usage / vacated usage | ❌ | no usage field |
| injuries / rotations | 🟡 | `newsSignals`/`newsAction` only; no structured injury/minutes feed |
| pace / spread / total | ❌ | no team game-environment fields on leans |
| matchup / defense-by-role | ❌ | no opponent-defense-by-position source |
| market price / implied / model prob | ✅ | `oddsOver/Under`, `impliedProbability`, `modelProbability`, `edge` |
| source reliability | ✅ | `sourceReliability`/`sourceReliabilityScore` |

## Soccer / World Cup
| feature group | status | source / blocker |
|---------------|--------|------------------|
| app support | 🟡 | schedule/board pages exist; **no projection/odds/grading pipeline** |
| match context / team strength / tactics | ❌ | no model |
| starting XI / player role | ❌ | no lineup feed |
| referee | ❌ | no source |
| markets supported | ❌ | none modeled/graded |
| grading contract | 🧱 | needs new schema |

## Headline
- **Implemented & trustworthy now:** market price/implied/model-prob (both sports), game context, NBA source-reliability, MLB recentSeries form, NBA playoff-aware form (post-#282, on refresh).
- **Biggest honest gaps:** MLB handedness/pitch-mix/park/weather/bullpen; NBA minutes/usage/pace/defense; MLB dated form provenance; all of World Cup. All **need data providers or new schema** — none are fakeable.

*Read-only matrix. No fabrication; sources/blockers are exact.*
