# NCAAF → master roadmap sync note (for the main engineering owner)

Branch `dp/ncaaf-v1` (local; **not pushed**). Base main `92dce6f0d4` (2026-10-09). Detailed ledger:
`docs/ncaaf/PROGRESS.md`; per-phase reports `docs/ncaaf/NCAAF-00{2,3,4}_REPORT.md`. Please batch any status
change into `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` yourself; this lane does not edit it.

## Verified status

| ID | Status | Evidence |
|---|---|---|
| NCAAF-001 | DONE (research) | corpus v1 14,988 games 2016–25, byte-reproducible; capability matrix |
| NCAAF-002 | DONE (research), **Gate 002 FAIL on calibration** | preregistered; Elo beats home-field-only by 0.113 nats on 2024–25, ECE 0.040 > 0.03 |
| NCAAF-003 | DONE (research), structural gate PASS | coherent worlds; totals good; key margins 3/7 + OT under-produced, so no spread pricing |
| NCAAF-004 | DONE (research) | E26 2026 backtest; no incumbent replaced; challengers held for forward comparison |
| NCAAF-005 | IN_PROGRESS · FORWARD_EVALUATING | 51 week-6 shadow receipts frozen before kickoff |
| NCAAF-006 | IN_PROGRESS | grader + ledger adapter proposal built and tested; first grading after week-6 finals |
| NCAAF-007 | IN_PROGRESS | family matrix; **no family eligible** |
| NCAAF-008 | IN_PROGRESS | internal preview in the shared sport-hub shell; no public route |
| NCAAF-009 | IN_PROGRESS (docs) | manual runbook; automation is a proposal |
| NCAAF-010 | PLANNED | founder gate |

## Shared changes requested (none applied)

1. **ESPN transport:** `docs/ncaaf/proposals/espn-season-week-transport.patch`. Until it lands,
   `espn-scoreboard-callers.test.mjs` test 4 fails on this branch (the only CI failure the branch introduces).
2. **Forecast ledger:** `"NCAAF"` in `SPORTS` + adapter import (`LEDGER_ADAPTER_PROPOSAL.md`), only after a
   founder decision to publish a family.
3. **Capability registry:** an `ncaaf` row at `RESEARCH_ONLY` with evidence paths. Not needed while everything
   is internal.
4. **Source registry:** an `espn_cfb` row (`PRIVATE_RESEARCH`). The CollegeFootballData row waits for DP's key.
5. **Sport catalog / switcher / nav / routes:** `/ncaaf` public hub. Founder product gate.
6. **Sport owners + workflow:** `NCAAF-009_RUNBOOK.md` proposal.

## Blocked / decisions

- Founder: first push of `dp/ncaaf-v1` (setup's branch-integration safety check). It would also give forward
  receipts third-party timestamps.
- Founder: Odds API historical NCAAF (~3,000 credits for 2021–25), Open-Meteo commercial licence, ESPN-relayed
  odds display rights.
- DP: free CollegeFootballData key in `.env` (transfers, recruiting, returning production, coaching).
- Repo hygiene noticed (not NCAAF's to fix): `run-suite.mjs` and `build/run-phase.mjs` spawn `npx` without a
  shell, so they fail on Windows. Several guards compare `\` paths or CRLF bytes on Windows. All are fine on
  Linux CI.
