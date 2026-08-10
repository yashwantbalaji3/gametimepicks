# EPL source decision — Release C (Program 148, 2026-08-09)

Verdicts from the time-boxed provider verification the release mandated. Nothing was assumed from
the registry; every claim below was mechanically probed on 2026-08-09 evening ET. No money spent,
no credentials created, no paid calls made.

## Verdicts

| Source | Verdict | Mechanical receipt |
|---|---|---|
| **api-football** (existing founder key) | Historical corpus source (seasons 2022–2024). **BLOCKED for 2026-27** | `/status`: founder account, plan **Free**, 100 req/day. Season-2026 probe refused: `"Free plans do not have access to this season, try from 2022 to 2024"`. 5 requests spent of 100/day (2 verification + 3 season fetches) |
| **openfootball** (public domain, no key) | Results-history + schedule-candidate. **Display capture QUARANTINED** | england repo 2025-26: **380/380 with FT+HT scores**. football.json mirror 2025-26: 353/380 (27 missing — caught by the corpus builder's exactly-380 refusal). 2026-27 file exists but names **Coventry City FC + Hull City AFC**, outside the committed club table |
| **football-data.org** | Not evaluated beyond terms | Requires creating a new credential — founder-gated by the release's "no new credentials" rule |
| **The Odds API** (existing paid plan) | EPL odds when settlement pipeline lands | Key is CI-only (local 401s by design); no calls made; credit-guarded |

## Decisions taken

1. **Research corpus** (private, `data/internal/research/epl/`): 4 complete seasons, 1,520 matches,
   0 quarantined — api-football 2022-23/2023-24/2024-25 + openfootball england-repo 2025-26.
   Rights recorded per file in `raw/CAPTURE_MANIFEST.json`.
2. **Current-season fixture capture: NOT ingested.** The only available 2026-27 source
   (openfootball, community-maintained) lists two clubs outside the committed membership table.
   The identity system's own law — unknown aliases quarantine, never auto-mint — applies to club
   membership exactly as to spellings. Publishing a partial matchday would look complete and lie
   by omission; publishing community-asserted membership without verification would guess.
   **Unblock path:** verify 2026-27 membership against an authoritative source (paid api-football
   tier, or an official/second independent source), then extend `EPL_CLUB_ALIASES` deliberately
   and run the capture. Founder decision only if it costs money; otherwise engineering.
3. **No-vig market comparison: absent, and says so.** No authorized odds capture exists for the
   corpus seasons. The baseline report states the absence rather than implying the comparison ran.

## What the corpus already proved (baseline-evaluation-v1)

1,140 chronologically clean predictions (2023-24 → 2025-26; 2022-23 warm-up), leakage rule
mechanical (fit strictly on earlier-dated matches):

| model | log loss | Brier | accuracy |
|---|---|---|---|
| uniform (sanity anchor = ln 3) | 1.0986 | 0.6667 | 0.432 |
| empirical H/D/A | 1.0750 | 0.6509 | 0.432 |
| **Elo (+60 home, K=20)** | **0.9991** | **0.5962** | **0.525** |
| independent Poisson | 1.0017 | 0.5968 | 0.516 |

These are BASELINES — the bar any future EPL model must beat before the sport-gate model stage can
even be argued, per the MLB stopping rule. Nothing here is a pick, a public surface, or a claim of
market superiority.
