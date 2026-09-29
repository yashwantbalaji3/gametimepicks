# Public prediction map: 2026-09-29

This is a read-only audit of what the public product publishes, per prediction family, across the four sports. It was taken from main at `ccb851fec1` and Production the same day. **It changes nothing and promotes nothing.** It is the baseline that product sprint P2 works from. Founder approval is required for any promotion.

**Classes:**
- **PUBLIC:** rendered to readers as a model forecast.
- **RESEARCH:** computed or evaluated, but shown only as market context or research.
- **HOLD:** deliberately withheld (paused, estimate-only, rejected, or STOP).
- **UNSUPPORTED:** not modelled, or no data.

**Status owners.** There are five, and they don't always agree (see "Contradictions"):
- `app/public/data/nfl/model-status.json` (built by `scripts/nfl/build-nfl-public-status.mjs`);
- the NFL per-game boards, `nfl/player-board/*.json` → `families[k].state`;
- `admin/model-health.json` (the live-record scorecard; pauses MLB game calls through `lib/ops/live-record-gate.mjs`);
- `lib/mlb/model-calibration-status.ts` (the MLB audit, as of 2026-07-21);
- `lib/command-center/model-status.ts` (the public status chips).

## NFL (Week 4)
| Family | Class | Status | Evidence | Rendering |
|---|---|---|---|---|
| Game winner | PUBLIC (experimental) | `PUBLIC_EXPERIMENTAL`; not `VALIDATED_PICK` | Elo-MOV held out 2006–21, n=4,281: log loss 0.629 (previous 0.642, market 0.610). 2026 walk-forward n=47 < 64 required | "Experimental", paper-only |
| Margin / score range | PUBLIC (experimental) | same | 80% range: 75.0% regular season (n=32); 65.9% preseason (n=41) | p10–p90 ranges |
| Game total | PUBLIC | `IN_USE` (matchup-totals-v3) | MAE 10.87 vs market close 10.67, n=5,878 | Totals, with the book miss beside them |
| Spread / cover | UNSUPPORTED | no cover head | – | – |
| Receiving yards | PUBLIC | published on 16/16 boards | props-v1 bars pass (n=3,575). Share-level forward n=200/300. Scorecard HOLDING | Boards, game pages, /live |
| Receptions | PUBLIC | published on 16/16 boards | v1 passed after an amendment. **Scorecard BREACHED: 90.3% inside the "80%" range, z=5.8, n=507** | as above |
| Rushing yards | HOLD (estimate this week) | ESTIMATE (v1 fallback) | Share-level eligible 09-14; forward n=111/300 | Labelled as an estimate |
| Passing yards | HOLD | ESTIMATE; P318 STOP | v1 fails all bars; v2 STOP (ECE 0.0516 > 0.05) | Labelled as an estimate |
| Anytime TD | **PUBLIC on boards / "held" per model-status** | boards PUBLISHED (anytime-td-v1); model-status `ROLE_UNCERTAIN` | v1 2025 held out n=3,965, ECE 0.039. Forward n=267/1000 | /nfl "Top 5 · Anytime touchdown" with probabilities |
| INT / first, last, 2+ TD | UNSUPPORTED / HOLD | withheld | – | – |
| Live featured forecasts | PUBLIC (measurement) | allowlist PUBLISHED / VALIDATED_PICK / ADOPTED | manual cadence; paid feed disabled | /live, frozen |

**Role certainty:** there is no starter or depth field. `ACTIVE_PROJECTED` only means "on the roster, no blocking injury". The Engine V2A QB-starter rule is shadow-only (#765, awaiting a founder decision; no preregistration exists).

## MLB
| Family | Class | Status | Evidence | Rendering |
|---|---|---|---|---|
| Moneyline | PUBLIC | scorecard WATCH | n=786: log loss +0.0067 vs coin (CI crosses 0); model minus market +0.032 | Strength labels |
| Game total | HOLD (paused) | BREACHED → PAUSED | n=747: worse than a coin | Pick removed, reason shown |
| Run line | PUBLIC | HOLDING vs coin | n=786; **never paired with the market** | Strength labels |
| Team totals / F5 | UNSUPPORTED | settlement blocked / coming soon | – | Coverage table |
| Strikeouts, hits, H+R+RBI | RESEARCH | `DEMOTE_TO_MARKET_CONTEXT` | loses to the market on Brier and log loss (n=18,659 leans) | /mlb carries the disclosure. **/mlb/board shows them as "Stronger signals · clean edge"** |
| Total bases | HOLD | `DISABLE_PREDICTION` | hit-rate CI 42.3–45.3% | **still listed as leans on /mlb/board** |
| Pitcher outs | RESEARCH | market context only | Brier 0.2625 vs market 0.2470, n=255 | Not modelled publicly |
| HR (Homer Nukes) | PUBLIC (experimental) | `PUBLIC_EXPERIMENTAL`; **no preregistered bar** | record: 30 homers vs 43.0 expected, n=176 (overconfident) | /homer-nukes, Home top reads |

## Premier League and other soccer
| Family | Class | Status | Evidence | Rendering |
|---|---|---|---|---|
| EPL 1X2 | PUBLIC | `VALIDATED_OUT_OF_SAMPLE_HISTORY` | held out 2013–22, n=3,420: 0.9735 vs previous 0.9938. Forward n=10/60. Live vs market n=46 | "Distributions, not picks"; model-only until odds arrive |
| EPL totals (O2.5) | PUBLIC (league rate) | club totals REJECTED | Brier ≈0.250 | the same rate for every match, stated |
| BTTS, clean sheet, double chance, scorelines | PUBLIC (derived) | no separate bar | – | Distributions |
| Anytime goalscorer | PUBLIC | `VALIDATED_OUT_OF_SAMPLE` | n=11,567: 0.2506 vs 0.2604, ECE 0.0068 | "P(scores given he starts)" |
| Shots on goal o0.5 | PUBLIC | ACCEPTED | n=11,492, ECE 0.0143 | SOG % |
| Shots, assists, cards | HOLD | REJECTED | failed bars | Absent |
| Corners, correct score | UNSUPPORTED | provider needed | – | – |
| Ligue 1 1X2 | PUBLIC (model-only) | `ACCEPTED_FOR_MODEL_ONLY_FORECASTS` | holdout 306: 1.0127 vs 1.0652 | /soccer/ligue-1 (0 rows since 09-15) |

## UFC
| Family | Class | Status | Evidence | Rendering |
|---|---|---|---|---|
| Winner | PUBLIC (experimental) | verdict PASS; chip "Tested on past seasons" | held out n=3,557: 0.6615 vs coin 0.6931. **Live n=49/60: 0.6708 vs market 0.6513 (behind)** | "Predictions · experimental" |
| Method | PUBLIC (experimental) | PASS | 0.9692 vs base 1.0255 | same |
| Round / distance | PUBLIC (experimental) | PASS | 0.9148 vs 0.9549 | same |

## Contradictions (status vs rendering) found
1. **/mlb/board** presents `DEMOTE_TO_MARKET_CONTEXT` markets as "Stronger signals · clean edge ≥ 5 pp", with confidence chips, and still lists `DISABLE_PREDICTION` total-bases leans. There is no calibration disclosure. *(verified on Production)*
2. **/nfl** status table: "no scorer is published" for anytime TD, while the same page renders "Top 5 · Anytime touchdown" with model probabilities. *(verified on Production)*
3. **NFL model-status** reads receiving yards and receptions as `MIXED` ("publication differs across games") when all 16 boards publish. The v1-fallback rows carry no model id.
4. **NFL Week 4 boards fell back to the v1 engine.** No share-level forward receipt was produced for week 4. Model Lab copy still says the share rule "was replaced" and TD was "rebuilt from opportunity shares".
5. **The MLB game-total pause fails open** if the scorecard is more than 72h old (`live-record-gate.mjs`).
6. Low-severity copy drift:
   - "experimental preseason beta" in regular-season coverage copy;
   - the Ligue 1 model description names the wrong engine;
   - the EPL "no injury feed" sentence is stale;
   - an NFL "checkable" log loss doesn't match its prose;
   - the market-coverage registry labels MLB game calls "market_anchored".

## Near-promotion (evidence only; no family meets its bar with enough sample today)
- NFL winner, margin and total, 2026 walk-forward: n=47 < 64.
- NFL share-level forward families: rushing n=111/300 (beats both baselines); receptions and receiving yards n=200/300 (currently behind share×volume); TD n=267/1000.
- EPL live vs market: n=46/60. EPL forward: n=10/60.
- UFC live: n=49/60, and behind the market.
- MLB run line: its bar requires the market, which has never been measured.

## Founder decisions this map surfaces (not taken here)
- Homer Nukes: publishing with no preregistered bar and an overconfident record. Keep as experimental, set a bar, or hold?
- NFL receptions: the "80%" ranges are too wide (BREACHED). Keep, widen, or hold?
- Engine V2A QB-starter publication rule (#765): needs a preregistration before any decision.
- Week 4 engine: publish the v1 fallback as is (labelled honestly), or hold those families until the share-level forward receipt exists?
