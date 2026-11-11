# NFL starting-QB fallback — revised challenger, FROZEN specification v1

Frozen 2026-11-11 on founder instruction (PD relay, ~18:30Z): freeze the revised challenger as proposed. From this
point on it is evaluated **forward only**. This file is hashed, and a change to it is a new version, never an edit.

## 1. Method (frozen)
Code: `scripts/research/nfl/evaluate-qb-fallback-challenger.mjs` (`windowPrior` and the tier (d′) / (b′) projections)
on top of `app/src/lib/sports/nfl/qb-starter-projection.mjs`, at the commit that adds this file.

| Element | Rule |
|---|---|
| Categories (pre-kickoff facts) | low history (< 25 prior NFL pass attempts); emergency starter (low history and not a rookie, or a non-QB leading passer); traded (club change, first 8 games); promoted backup (previous starter absent, club share < 0.75, not traded) |
| Rolling prior | completion rate and yards per completion of the **same category's** starts in the previous 5 regular seasons; fewer than 10 starts → the pooled low-history (or traded) prior |
| Volume context | × the category's mean ratio of the club's actual pass attempts to its P300 pass-attempt form, same window |
| Playing time | the category's own mean attempt share, same window — not the universal STARTER_SHARE |
| Opponent | the opponent pass-defence ratio is **kept**, because the pre-registered selection on 2015–2017 kept it (pinball 20.195 with, 20.209 without — a negligible difference, recorded as neutral) |
| Dispersion | tier (d′) uses scale 1.5, strictly wider than tiers (a)/(b) (1.25) |
| Routing | low history and emergency → tier (d′). Traded → tier (b′) with the traded share and volume. **Promoted backups keep the original tier (b)**: the challenger was not better there. |

Unchanged: starter identification (depth chart plus availability; share never decides) and the public label "MODEL
PROJECTION". Tier fields stay in the data and admin views only.

## 2. Exploratory findings (RE-EXAMINED HISTORY, not validation)
Report: `data/internal/research/nfl/reports/qb-fallback-challenger-reexamined.json`, which recomputes byte-for-byte.
The original frozen report (`qb-fallback-categories-exploratory.json`) is unchanged.

Diagnosis of the original tier (d)'s level 0.84 on low-history starts (2018–2025, n = 108):
- clubs throw about 6% less than their form (31.4 vs 33.4 attempts);
- the 2013–2017 prior's yards per completion runs about 7% high (11.38 vs 10.54; era drift);
- completion runs about 2% high;
- attempt share was right.

Re-examined 2018–2025, games already seen (paired pinball difference, 95% cluster-bootstrap CI):

| Category | n | Level (original → challenger) | Bias (original → challenger) | vs frozen original | vs league-average starter |
|---|---|---|---|---|---|
| Low history | 108 | 0.85 → 0.92 | −17.5 → −1.8 | −1.15 (−2.13, −0.17) | −2.45 (−4.38, −0.55) |
| Emergency | 23 | 0.77 → 0.82 | — | CI includes 0 | — |
| Traded | 636 | — | — | −0.04 (−0.09, 0.02) | — |
| Promoted backup | 72 | — | — | +0.07 (−0.73, 0.95) | — |

Promoted backups are therefore not switched.

Hold-out, 2026 weeks 1–9 (not examined before the rule was fixed):
- low history, n = 4: pinball 14.9 vs 21.5 for the original;
- promoted backup, n = 5: worse (+2.67).

Both are too small to read either way and are reported as is.

## 3. What happens next
The forward evaluation follows `NFL_QB_FALLBACK_FORWARD_SPEC_DRAFT.md`. Its bars are for the founder to set. Until a
bar is approved and met, the challenger's numbers display only behind `GTP_NFL_QB_FALLBACK_PUBLIC` (OFF), and nothing is
called "validated".
