# June 18 — Launch fresh Lane A Step 1 (two brand-new legs: best World Cup + best MLB)

_Branch `june18-launch-lane-a-fresh-step1` off main `04fd9979` (#524). Launch audit at 16:12 ET (20:12 UTC)._

## Mission
Relaunch Lane A as a true fresh Step 1 ($100 → ~$200) with two brand-new pre-event legs — one best World
Cup soccer leg + one best MLB leg. Do not reuse the failed Czech leg or the old Josh Bell leg; do not touch
Lane B; do not mutate protected Bank Builder history.

## Launch-window audit (official, 20:12 UTC)
| category | candidate / event | start (UTC) | status @ 20:12Z | eligible | source |
|---|---|---|---|---|---|
| WC game | Czech Republic vs South Africa | 16:00 | Full Time (1–1) | no (final) | ESPN fifa.world |
| WC game | Switzerland vs Bosnia | 19:00 | in-play (2nd half) | no (started + Lane B) | ESPN fifa.world |
| **WC game** | **Canada vs Qatar** | **22:00** | **Scheduled** | yes (pre-event) | ESPN fifa.world |
| **WC game** | **Mexico vs South Korea** | **01:00 (Jun 19)** | **Scheduled** | **yes (pre-event)** | ESPN fifa.world |
| MLB game | TOR @ BOS | 17:35 | Final | no | MLB Stats API |
| MLB game | CLE @ MIL / MIN @ TEX | 18:10 / 18:35 | Live / In Progress | no (started) | MLB Stats API |
| MLB game | BAL @ SEA | 20:10 | Live / Warmup | no (started) | MLB Stats API |
| **MLB game** | **NYM @ PHI** | **22:40** | **Preview / Pre-Game** | **yes (pre-event)** | MLB Stats API |
| MLB game | CWS @ NYY | 23:05 | Preview | excluded (Goldschmidt = Lane B) | MLB Stats API |
| MLB game | STL @ KC | 23:40 | Preview / Pre-Game | yes (pre-event) | MLB Stats API |
| MLB game | **SF @ ATL** | 23:15 | **Final / POSTPONED (rain, resch. Aug 31)** | **no (postponed)** | MLB Stats API |
| MLB game | LAA @ ATH | 01:40 (Jun 19) | Preview / Scheduled | yes (pre-event) | MLB Stats API |
| exclude | Czech Republic ML (old Lane A) | — | settled loss | excluded | — |
| exclude | Josh Bell HRR (old Lane A) | — | started/settled | excluded | — |
| Lane B | Switzerland ML + Goldschmidt HRR | — | active Step 2 | read-only | — |

**Answers**
- **Which World Cup games are still pre-event?** Canada vs Qatar (22:00Z) and Mexico vs South Korea (01:00Z Jun 19).
- **Which MLB games are still pre-event?** NYM@PHI (22:40Z), CWS@NYY (23:05Z, excluded — Lane B/Goldschmidt), STL@KC (23:40Z), LAA@ATH (01:40Z). **SF@ATL is POSTPONED** (verified official — would have been a stale trap).
- **Is a fresh Lane A Step 1 launch possible?** Yes — a qualified two-leg (WC + MLB) pre-event card exists.
- **Target for $100 → ~$200?** Combined ≈ +100 (decimal ≈ 2.0); preferred return $190–225.

## Candidate search — World Cup leg
| candidate | market | side | odds | model prob | risk | selected? | reason |
|---|---|---|---|---|---|---|---|
| **Mexico** | **draw_no_bet** | **Mexico** | **−240** | **0.6473** | **Low** | **✅** | clean team-side, in the −250/+150 band, draw refunds the leg (loss only if South Korea win), most pre-event runway |
| Canada | moneyline_90 | Canada | −385 | 0.7563 | Low | ❌ | shorter than the −250 band (ultra-short for the band); constrains payout |
| Canada | double_chance | Canada or Draw | −5000 | 0.92 | Low | ❌ | ultra-short — payout far too low |
| Canada / Mexico | draw_no_bet / DC | — | −2500 / −420 | — | Low | ❌ | ultra-short |
| Mexico | moneyline_90 | Mexico | +104 | 0.4675 | Med | ❌ | model below implied, `parlayEligible: false` — not model-supported, too fragile |
| Canada / Mexico | match_total / btts | Over/No | −143 / −136 | — | Med | ❌ | not a clean team market; awkward, no edge |

## Candidate search — MLB leg (eligible pre-event games only; SF@ATL postponed, NYY excluded)
| candidate | game | market | side/line | odds | model prob | edge | conf | selected? | reason |
|---|---|---|---|---|---|---|---|---|---|
| **Juan Soto** | NYM@PHI | Hits | Over 0.5 | **−252** | **~0.79** | **+7.6pp** | **High** | **✅** | elite everyday RF (lowest DNP risk), best edge among in-band shorts; 4 of last 5 games with a hit; lands the card at ≈ +100 |
| Bryson Stott | NYM@PHI | Hits | Over 0.5 | −193 | — | +6.3pp | High | ❌ | pairs to $215 but lower edge, proj only ~1.0 |
| Brandon Marsh | NYM@PHI | Hits | Over 0.5 | −207 | — | +5.1pp | High | ❌ | lower edge |
| Jo Adell | LAA@ATH | HRR | Over 1.5 | −134 | — | +14.7pp | High | ❌ (kept as replacement) | pairs too high (~$247) with Mexico DNB; latest game (01:40Z) |
| Matt Olson / Ha-Seong Kim / Arraez | SF@ATL | — | — | — | — | — | High | ❌ | **game POSTPONED — stale, never used** |
| Goldschmidt | CWS@NYY | HRR | Over 1.5 | — | — | — | — | ❌ | Lane B leg — excluded |

## Selected card — Lane A fresh Step 1
- **World Cup:** Mexico **draw no bet** −240 (Mexico vs South Korea, KO 2026-06-19 01:00 UTC).
- **MLB:** Juan Soto **Hits Over 0.5** −252 (NYM @ PHI, first pitch 2026-06-18 22:40 UTC).
- **Combined:** 1.4167 × 1.3968 = **1.9788 dec → ≈ −102 / +100 → $100 → $197.88 (+$97.88).**
- Both **pre-event** at launch (officially verified). One WC + one MLB. No Czech, no Josh Bell, no Lane B overlap, no cross-leg correlation (a soccer match and a baseball game are independent).

## Lane A final state
- `laneStatus: active`, `publicVisible: true`, fresh **Step 1 pending** ($100 → $197.88), Steps 2–5 coming soon.
- Prior stopped lane (old Step 1 won + Step 2 Czech loss) preserved in `laneA.priorLane` for Mr. Dub only — **not** rendered publicly. The blocked same-step relaunch (`relaunchAudit`) is retained.

## Mr. Dub ledger
- New `lane_step_open` event (`relaunch: true`, lane-a, Step 1, stake $100, projected $197.88, `publicBankBuilderVisible: true`).
- **Open exposure $100 → $200** (Lane B $100 + fresh Lane A $100). **No double-count:** the prior stopped lane's −$100 is realized once (paper bankroll unchanged at **$10,276.17**); crown intact; record **7-1-0-2**.
- Full ledger shows: completed crown (5–0) → old stopped Lane A (won + lost) → blocked same-step relaunch → **fresh Lane A Step 1 open** → Lane B Step 2 open.

## Replacement candidates (internal only)
- **Soccer swap:** 0 qualified — the only other pre-event WC game (Canada vs Qatar) offers an out-of-threshold −385 ML or ultra-short DC/DNB (−2500/−5000); Switzerland is Lane B. Documented; the lane falls back to a $100 restart if the soccer leg fails with no pre-start swap.
- **MLB swap:** 3 generated (keep Mexico DNB, replace Soto) — Jo Adell (LAA), Carter Jensen (KC), JJ Wetherholt (STL) — all not-started, odds-backed, from games not in use, expiring at the relevant leg start. **Postponed SF@ATL legs excluded.**

## Guards
- Protected `public/data/bank-builder/*` untouched. Lane B untouched (read-only). Crown untouched.
- No fabrication — every leg/odds/start time/result from ESPN fifa.world + MLB Stats API. No started/live/postponed/stale legs. No banned public copy.
