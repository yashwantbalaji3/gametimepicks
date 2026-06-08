# NBA Finals Context Factor Audit (latest)

> The June-8 Finals game IS projected (board has 99 NBA leans). This audits which
> Finals-specific context is actually available. The series state "Knicks up 2-0"
> is NOT present in the app's data and is therefore NOT used — documented, not
> faked.

## Availability today
| Factor | Available? |
|---|---|
| Recent playoff form (L5/L10 incl. playoff games) | **YES — used** (provider fetches Playoffs first) |
| Historical per-game minutes | YES in game logs; not used as a trend |
| Home/away | derivable from board teams (not yet a factor) |
| Market reliability (PTS/REB allowed; AST disabled) | **YES — used** (#306) |
| Odds band / volatility | YES — used (#307) |
| Playoff-game flag / Finals flag | **NO** — board has teams/tipoff/status only |
| Series game number / series score / leader-trailer | **NO** — not in data |
| Must-win / urgency | **NO** |
| Rest days / travel | **NO** (no schedule-derived rest field) |
| Team implied total / spread / total / blowout risk | **NO** |
| Rotation tightening / starter & bench minutes trend / usage change | **NO** (only raw historical minutes) |
| Injuries / questionable / probable / out / minutes restriction | **NO — missing provider** |
| Primary defender / matchup | **NO** |

## Answers
1. **Available Finals factors today:** recent playoff form, historical minutes,
   market reliability, odds band/volatility, home/away. That's it.
2. **Missing:** series score, playoff/Finals flag, urgency, rest/travel, implied
   total/spread/total, minutes/usage trends, injuries, matchup.
3. **Safely addable before June-8 generation:** none that need new providers.
   Recent playoff form is already captured + used.
4. **Deferred (provider/schema missing):** series state, injuries, projected
   minutes, implied totals — require new ingestion + leakage-safe builders.
5. **How "Knicks up 2-0" affects methodology:** it does NOT — the series state
   is not in the data. We will NOT hardcode a public assumption into predictions.
   When series/injury/minutes context lands, it must be a trusted, leakage-safe
   field with an explicit `unknown` fallback, never a silent confidence boost.

## Net
NBA June-8 Suggested Parlays rely on recent (playoff-inclusive) form + market
reliability + volatility gates — honest given the data. AST stays quarantined;
PTS/REB eligible if they pass the gates. No fabricated Finals context.
