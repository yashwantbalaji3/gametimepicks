# NCAAF-005 — Forward shadow capture protocol (v1)

Registered 2026-10-09 before the first forward capture. PRIVATE_RESEARCH. Code:
`app/src/lib/sports/ncaaf/forward.mjs`, `app/scripts/ncaaf/run-shadow-forecasts.mjs`. Local runs only. **No
workflow, scheduler, deploy or public surface.** Automating this is an NCAAF-009 proposal for the founder.

## What a run does

1. **Provenance gates:** refuses unless the forecasting code is committed and unmodified (HEAD recorded in
   every receipt) and the NCAAF-002/003 freezes are ancestors of HEAD.
2. **Snapshot:** one fresh, bounded ESPN capture (season weeks 1..W × FBS/FCS + membership, cap 40 requests)
   at the **real wall-clock** capture time. Raw bodies go to the gitignored `.cache/`; their sha256 is in
   every receipt.
3. **Targets:** every week-W game with status `STATUS_SCHEDULED`, a known kickoff (`timeValid`), and kickoff
   at least **10 minutes** after capture. Population FBS–FBS (full forecast) and FBS–FCS (winner/score only;
   the NCAAF-002 FBS–FCS cohort was badly calibrated, so these are flagged by `pairing`). Everything else is
   refused with a reason in the run manifest.
4. **As-of:** history = corpus v1 + this season's played finals with **slateDate < the earliest target slate**
   in the run. A same-day result never reaches a forecast. The frozen models are warmed on that history only.
5. **Forecasts:** winner P(home) from **C1** (named as the research champion that failed calibration bar b);
   score distribution from **C2**; worlds from **W1** (`ncaaf-worlds@1`, 10,000 worlds, seeded). Point
   forecasts are means.
6. **Market:** the provider's pregame line on the snapshot (provider, text, spread field, total, moneylines),
   stamped with **our** capture time. `homeSpread` is filled only when the text names one of the two teams and
   agrees with the numeric field; otherwise it is `null` with the reason. No market ⇒ `null`, never −110.
   ESPN-relayed odds have **no public-display authorization**; they stay in private receipts.

## Receipts and history

- Path `data/internal/research/ncaaf/forecasts/<season>/<slateDate>/<eventId>/<capturedAt>.json`, written
  with exclusive create. An existing receipt is never overwritten. A later capture of the same event is a
  new file listing its predecessors.
- **Forecast of record** (`forecastOfRecord`) = the latest receipt captured before both the kickoff it recorded
  and the final provider kickoff. A receipt captured at or after kickoff is never of record, even if the
  provider later moves the kickoff.
- Every receipt says `publicationStatus: SHADOW`, `maturity: RESEARCH_ONLY` and is not a GameTimePicks pick.
- Grading is NCAAF-006, from official finals only, against the forecast of record.

## Known limits

- One capture per run. Kickoff revisions between captures are only seen if another run happens.
- No roster, QB, injury or weather inputs (none have point-in-time sources).
- C1 and W1 give different P(home). Both are recorded, and the winner field names C1 as its source.
