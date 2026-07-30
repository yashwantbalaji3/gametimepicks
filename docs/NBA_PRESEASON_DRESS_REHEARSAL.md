# NBA Preseason Dress Rehearsal

**Purpose:** produce, from a REAL preseason slate, the evidence gates G2/G3/G4 ask for — and a single go/no-go artifact that says which requirement failed when one does.
**When:** NBA preseason, ~Oct 12–23 2026 (readiness plan W5–W6). Season tip-off late Oct.
**Depends on:** docs/NBA_RESEARCH_ADAPTER_IMPLEMENTATION.md (the code this rehearses), docs/MULTISPORT_PROMOTION_GATES.md (the gates), docs/NBA_RESEARCH_ADAPTER_READINESS.md (the plan).

**A GO verdict is evidence, not a promotion.** NBA moves to MARKET_INTELLIGENCE only with founder sign-off recorded in the promoting sprint's program ledger. A NO_GO means the season starts capture-only, at HISTORICAL_ONLY, which is a fine outcome.

---

## The one command

```bash
cd <repo root>
python -m pipeline.nba.rehearsal --date 2026-10-14 --out status/nba-rehearsal-2026-10-14.json
```

Read-only. It runs no ingest, and writes nothing unless `--out` is given. It reads what the capture step produced and grades it stage by stage. Exit 0 on GO, 1 on NO_GO.

Run it against a historical date first to see what a failing rehearsal looks like — `--date 2026-06-13 --skip-identity` reports NO_GO on six stages, which is the correct reading of a corpus captured before any of this existed.

### What has to happen before the command means anything

The rehearsal grades artifacts; it does not create them. Two operator steps come first, on a real preseason date, with the normal credit guards:

1. **Capture the schedule.** The daily board run. Every game row must come out carrying `tipoffIso`, `capturedAt` and a derived `researchEligible` — that is `pipeline/nba/board_schema.py`, and the board refuses to write a tip-off instant onto a pre-epoch date.
2. **Capture the odds.** Moneyline / spread / total into `app/public/data/nba/game-markets/<date>.json`. Capture **more than once** where budget allows — several captures of the same event are the only thing that makes movement describable, and the rehearsal will say so either way.

Timing is the whole point of step 1: capture must run **before** the earliest tip-off, or `researchEligible` is 0 and the rehearsal blocks. That is not a bug to work around.

---

## The stages

| Stage | Asks | Blocking |
|---|---|---|
| `schedule` | Did a board for this date capture at least one game? | yes |
| `tipoff` | Does **every** game row carry an ISO tip-off instant? | yes |
| `eligibility` | Is `researchEligible` derivable from the row's own timestamps, and greater than zero? | yes |
| `identity` | Does every schedule row resolve to exactly one game, or refuse with a reason? | yes |
| `devig` | Do the captured moneylines de-vig to a two-sided probability pair? | yes |
| `movement` | Does any event have more than one capture? | **no** — informational |
| `settlement` | Would the lineage gate accept this date's graded rows? | yes |
| `population` | Do scheduled games and priced games reconcile one-to-one? | yes |

Three properties of that table are deliberate.

**A stage that cannot run reports `UNAVAILABLE`, and the verdict is NO_GO.** A check that did not run is not a check that passed. A rehearsal that reported GO whenever it was unable to look would manufacture exactly the evidence a promotion decision rests on.

**`identity` delegates to the TypeScript implementation** (`npx tsx --test src/lib/nba/historical-boards-scale.test.mjs`) rather than re-deriving team resolution in Python. One identity implementation per sport; a Python copy of the 30-tricode contract would be a second one, and two implementations drift until nobody knows which ran.

**`movement` never blocks.** A preseason slate with one capture per event is a legitimate outcome, and the correct response is to make no movement claim — which is what the stage records. Failing the rehearsal over it would push toward buying captures to pass a test.

---

## Reading the verdict

```
[PASS         ] schedule    6 game(s) captured
[PASS         ] tipoff      all 6 game(s) carry an ISO tip-off instant
[PASS         ] eligibility 6 of 6 rows captured strictly before tip-off
[PASS         ] identity    every schedule row resolves injectively or refuses explicitly
[PASS         ] devig       6 of 6 game(s) de-vig to a two-sided probability pair
[INFORMATIONAL] movement    2 event(s) have multiple captures — movement is describable for those only
[PASS         ] settlement  41 graded row(s) trace prediction -> event -> market -> official source
[PASS         ] population  6 scheduled game(s) reconcile one-to-one with the market artifact

verdict: GO
```

Each stage carries its own `evidence` object in the JSON artifact — counts, offending ids, violation strings — so a NO_GO names the rows rather than the requirement.

---

## What each gate needs, and what proves it

### G3 — leakage safety

**Needs:** per-row `capturedAt < tipoffIso`, on real rows, from the first artifact.
**Proven by:** `tipoff` PASS and `eligibility` PASS with `eligible > 0`.
**Not proven by:** a backfilled row. `assert_no_historical_backfill` refuses any pre-epoch board carrying an instant, and the 54 historical boards stay permanently ineligible. If a rehearsal ever reports eligible rows for a pre-epoch date, something wrote evidence that was never captured — investigate that before anything else.

### G2 — identity reliability

**Needs:** a live slate where the odds→game join resolves through the tricode + slate-date contract, with refusals counted and explained rather than absent.
**Proven by:** `identity` PASS and `population` PASS together. The first says no row resolved to zero or several games; the second says the two populations reconcile, which is what catches a market attached to a game that is not on the slate.
**Record:** the refusal count and codes. Zero refusals on a live slate is a good result; refusals with reasons are an acceptable one; rows that neither resolve nor refuse are the failure this contract exists to eliminate and cannot occur without a code change.

### G4 — settlement quality

**Needs:** lineage-gated settlement of real finals, plus quarantine exercised on at least one postponed or altered event.
**Proven by:** `settlement` PASS on a date with graded rows, and a separate manual check that a postponed game's legs settled to `quarantined` — never win/loss/push, never pending.
**Also required, and not automatable:** an answer for the two findings the dry run surfaced on the historical corpus — **856** graded rows with no derivable event identity (`team`/`opponent` empty), and **677** duplicated predictions. Preseason rows must not reproduce either. If they do, the forward pipeline inherited the defect and the gate stays FAIL.

### G1 — official results source

**Needs:** a founder ruling on whether ESPN box scores satisfy "official". 94.3% of historical decisive settlements came from ESPN; the source allowlist already names `espn-official-scores` and `nba-stats-boxscore`.
**Proven by:** nothing in this rehearsal. Record the ruling in the promoting sprint's ledger.

---

## Go / no-go review

Run the rehearsal on at least **three** preseason dates, including one with a postponement if the calendar offers one. Then:

**GO requires all of:**

1. Every required stage PASS on every rehearsed date.
2. `researchEligible > 0` on the first date, not only later ones — the capture timing has to be right from the start, not tuned into place.
3. Quarantine exercised, fail-closed, on a real altered event.
4. The 856/677 historical findings understood and bounded, with evidence that forward rows do not reproduce them.
5. G1 ruling recorded.
6. Founder sign-off recorded in the promoting sprint's program ledger.

**Anything short of that is NO_GO**, and NO_GO means the season starts in capture-only mode at HISTORICAL_ONLY. Capture keeps accruing the evidence; nothing is published that the evidence does not support.

**Even on GO, these stay out of scope** (readiness §6): no player-prop model, no probability or lean or pick of any kind, no re-activation of the legacy `sports-coverage.ts` parlay gate, no FULL_MODEL or RESEARCH_MODEL promotion, and no claim of predictive superiority, ROI, or a market-beating result. The product is de-vigged market intelligence on game markets, and the historical model's below-coin-flip record is why.
