# Forecast Record export provenance — audit 2026-10-23, A-T07 (F01, F02)

The independent audit of 2026-10-23 downloaded all 25 Forecast Record CSVs (17,873 rows). Its arithmetic checked out,
but it raised two problems:

- **F01.** Many rows could not name their model, their event start or their publication time.
- **F02.** The multiclass rows had no probability vector, so nobody could reproduce their scores.

This change extends the existing contract: the Universal Forecast Ledger (`data/internal/forecast-ledger/v1`) and
the CSV export built from it. It adds no second ledger. No forecast was regenerated, and no model, grade, probability
or timestamp on a row was changed.

## The contract

Each ledger row now carries a provenance state for three fields: `modelId`, `eventStart` and `publishedAt`.
The states and the resolver live in `app/src/lib/forecast-ledger/provenance.mjs`, which is pure and does no I/O, so pages can import it. The matchers that read committed files live in `provenance-evidence.mjs`, which only the ledger builder calls.

| State | Meaning |
|---|---|
| `RECEIPT` | A committed file in the repository records the value. This is either the owner record the row was read from, or a committed forecast file that matches the row exactly. |
| `GIT_HISTORY` | The value comes from a past revision of the file that published the forecast. The source names the commit. |
| `LEGACY_UNKNOWN` | Nothing committed supports a value, so the value stays empty. |

A row's state is that of its weakest field. A promotion evaluation should leave out the `LEGACY_UNKNOWN` rows. Their
count per family now shows in three places:
- the Forecast Record page (a column, plus a KPI tile);
- each family page;
- the ledger manifest (`sports.<SPORT>.provenance`).

**Recovered values never overwrite the row.** `modelId`, `eventStart` and `publishedAt` are immutable ledger fields.
They still hold exactly what the owner recorded. A value recovered later goes to `provenance.recovered.<field>` as
`{ value, state, source[, committedAt] }`. Once recorded, it is frozen in two ways:
- the builder carries it forward from the committed ledger, even if the source file is later overwritten;
- the append-only guard (`RECOVERED_EVIDENCE_CHANGED`) refuses to let it change or disappear.

The nightly ledger build fills `RECEIPT` evidence from committed files. It never reads git history, because the
nightly checkout has fetch-depth 1. `GIT_HISTORY` evidence comes from
`app/scripts/results/recover-forecast-provenance-git.mjs`, which needs a full clone and refuses to run on a shallow
one. That script writes `data/internal/forecast-ledger/v1/evidence/git-history.json`. The file is keyed by forecastId,
append-only and deterministic.

**What "published" means here.** The publishing file stamped the time, and for git evidence the commit also landed,
before the start. It does **not** show that a READY Production deployment served the forecast: that is the
forecast-of-record policy (Option B, 2026-10-09), and it is a separate check.

**modelVersion.** It stays empty wherever the owner did not record a version separately. Most owners record a single
identity string, such as `nfl-player-share-level-v1` or `ufc-fight-model@e657fc40b64d`. The export does not split
that string.

## How each gap was closed (exact matches only)

| Source | Rule | Field | State |
|---|---|---|---|
| NFL player board `player-board/<eventId>.json`, frozen prop rows | Same `generatedAt` as the frozen `forecastGeneratedAt`, and same median or probability for the player | `modelId` from `families.<family>.model`, only where the board names one | RECEIPT |
| The same board, Weeks 1–2 reconciliation rows | Board generated before kickoff, family in the same state, and the median and range round exactly to the printed values (the reconciliation's own rounding) | `publishedAt` = the board's `generatedAt`; `modelId` where the board names one | RECEIPT |
| EPL player snapshot named by the grader | Same `generatedAt` and kickoff, and the same probability for the player | `modelId` = `model.id`. Anytime goalscorer only: the shots-on-goal probability comes from a separate fit that the snapshot does not identify | RECEIPT |
| Ligue 1 dated archive `ligue-1/forecasts/<date>.json` | Same event, same `forecastAt`, and the same 1X2 vector | `modelId` | RECEIPT |
| UFC pre-fight snapshot named by the grader | Same capture instant, same bout, and the same model probability | `eventStart` = `event.startUtc`. This is the card's scheduled start, recorded before the card. Every bout starts at or after it, and no bout's own start was ever recorded | RECEIPT |
| MLB predictions file at the `git:<sha>` revision the grade log names | That revision's `generatedAt` equals the graded `forecastGeneratedAt` | `modelId` = `predictions[gamePk].decisionEngineVersion` | GIT_HISTORY |
| Homer Nukes day file `homer-nukes/<date>.json`, all revisions | The revision holds the same pick (player, gamePk, probability) | `eventStart` = the pick's `gameDate`. `publishedAt` = `generatedAt` of the last such revision that was both generated and committed before that start | GIT_HISTORY |

Some row values were read from a git revision by the owner itself: MLB grade logs with `forecastSource: git:<sha>`,
and four EPL derived rows. Those values are labelled `GIT_HISTORY`, not `RECEIPT`.

## Missingness report: before → after

"Before" is the ledger at `main` d2a7af7da2. "After" is the same 17,873 rows, with no row added, removed or changed
outside `provenance`. The before totals match the audit exactly: 12,524 / 17,168 / 1,020 / 380, and among settled
rows 8,368 / 855 / 330.

| Family | Rows | No model id | No publication stamp | No event start | No separate modelVersion | RECEIPT | GIT_HISTORY | LEGACY_UNKNOWN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| EPL · epl_1x2 | 66 | 0 → 0 | 0 → 0 | 0 → 0 | 66 | 66 | 0 | 0 |
| EPL · epl_anytime_goalscorer | 3,335 | 3,335 → 0 | 0 → 0 | 0 → 0 | 3,335 | 3,335 | 0 | 0 |
| EPL · epl_btts | 66 | 0 → 0 | 0 → 0 | 0 → 0 | 66 | 65 | 1 | 0 |
| EPL · epl_clean_sheet | 132 | 0 → 0 | 0 → 0 | 0 → 0 | 132 | 130 | 2 | 0 |
| EPL · epl_over_2_5 | 66 | 0 → 0 | 0 → 0 | 0 → 0 | 66 | 66 | 0 | 0 |
| EPL · epl_scoreline | 66 | 0 → 0 | 0 → 0 | 0 → 0 | 66 | 65 | 1 | 0 |
| EPL · epl_shots_on_goal_over_0_5 | 3,335 | 3,335 → 3,335 | 0 → 0 | 0 → 0 | 3,335 | 0 | 0 | 3,335 |
| LIGUE_1 · ligue1_1x2 | 36 | 36 → 0 | 0 → 0 | 0 → 0 | 36 | 36 | 0 | 0 |
| MLB · mlb_homer_nukes | 300 | 0 → 0 | 300 → 15 | 300 → 0 | 300 | 0 | 285 | 15 |
| MLB · mlb_moneyline | 821 | 351 → 0 | 0 → 0 | 0 → 0 | 821 | 470 | 351 | 0 |
| MLB · mlb_projected_runs | 1,642 | 0 → 0 | 0 → 0 | 0 → 0 | 1,642 | 940 | 702 | 0 |
| MLB · mlb_projected_total | 821 | 0 → 0 | 0 → 0 | 0 → 0 | 821 | 470 | 351 | 0 |
| MLB · mlb_run_line | 810 | 351 → 0 | 0 → 0 | 0 → 0 | 810 | 459 | 351 | 0 |
| MLB · mlb_run_line_posted | 11 | 0 → 0 | 0 → 0 | 0 → 0 | 11 | 11 | 0 | 0 |
| MLB · mlb_total | 816 | 351 → 0 | 0 → 0 | 0 → 0 | 816 | 465 | 351 | 0 |
| NFL · anytime_td | 1,502 | 1,502 → 222 | 236 → 0 | 0 → 0 | 1,502 | 1,280 | 0 | 222 |
| NFL · nfl_game_margin | 141 | 0 → 0 | 0 → 0 | 0 → 0 | 0 | 141 | 0 | 0 |
| NFL · nfl_game_total | 141 | 0 → 0 | 0 → 0 | 0 → 0 | 0 | 141 | 0 | 0 |
| NFL · nfl_game_winner | 141 | 0 → 0 | 0 → 0 | 0 → 0 | 0 | 141 | 0 | 0 |
| NFL · nfl_team_score | 282 | 0 → 0 | 0 → 0 | 0 → 0 | 0 | 282 | 0 | 0 |
| NFL · player_pass_yds | 213 | 213 → 37 | 39 → 0 | 0 → 0 | 213 | 176 | 0 | 37 |
| NFL · player_reception_yds | 1,159 | 1,159 → 726 | 173 → 0 | 0 → 0 | 1,159 | 433 | 0 | 726 |
| NFL · player_receptions | 1,189 | 1,189 → 359 | 173 → 0 | 0 → 0 | 1,189 | 830 | 0 | 359 |
| NFL · player_rush_yds | 702 | 702 → 302 | 99 → 0 | 0 → 0 | 702 | 400 | 0 | 302 |
| UFC · ufc_winner | 80 | 0 → 0 | 0 → 0 | 80 → 0 | 80 | 80 | 0 | 0 |
| **All 25 families** | **17,873** | **12,524 → 4,981** | **1,020 → 15** | **380 → 0** | **17,168** | **10,482** | **2,395** | **4,996** |

Settled rows (13,616):
- no model id: 8,368 → 3,071;
- no publication stamp: 855 → 14;
- no event start: 330 → 0;
- by state: RECEIPT 8,199, GIT_HISTORY 2,332, LEGACY_UNKNOWN 3,085.

### What stays LEGACY_UNKNOWN, and why

These 4,996 rows remain unknown because no committed file names the value, not because the search was cut short.

- **EPL shots on goal (3,335 rows).** The snapshot's `model.id` names the goal model. The shots-on-goal probability
  comes from a separate fit (`sogTarget.locked`), and no file records its identity. Attributing the goal model to
  these rows would be a guess.
- **NFL player props (1,646 rows).** The board revision that was frozen gives no `model` for that family. On
  2026-10-11, for example, receiving yards carries only the basis text "props-v1 evaluation". Weeks 1–2 boards
  carry no family model at all. Their publication stamps were all recovered.
- **Homer Nukes (15 rows), listed below.** The start is known, but no revision carrying the exact graded probability
  was both generated and committed before first pitch.

### Finding: 15 graded Homer Nukes picks with no pre-start publication

For each pick below, every revision of the day file that carries the exact graded probability was generated, or
committed, at or after first pitch. These rows are now `LEGACY_UNKNOWN`. Their grades are untouched: settlement is
outside this task. Results/OPS should review them.

Two of the picks were generated 4 minutes before the start but committed after it: Kyle Schwarber and Matt Olson
on 2026-09-06.

| Slate | Player | gamePk | Probability | First pitch | Settlement | forecastId |
|---|---|---:|---:|---|---|---|
| 2026-08-27 | Hunter Goodman | 822694 | 0.2698 | 2026-08-27T17:05:00Z | SETTLED MISS | `fl1-3ae1e8584dfd764f` |
| 2026-08-27 | Jake Bauers | 823581 | 0.1952 | 2026-08-27T23:10:00Z | SETTLED MISS | `fl1-483843ecc6eed024` |
| 2026-08-27 | Matt Olson | 824879 | 0.1986 | 2026-08-27T23:15:00Z | SETTLED MISS | `fl1-a430b7f62131ede8` |
| 2026-08-27 | Mickey Moniak | 822694 | 0.2143 | 2026-08-27T17:05:00Z | SETTLED MISS | `fl1-acd727d528d52022` |
| 2026-08-27 | Yordan Alvarez | 823503 | 0.2106 | 2026-08-27T23:05:00Z | SETTLED MISS | `fl1-110d2fa655bdf52e` |
| 2026-08-28 | Hunter Goodman | 824877 | 0.2614 | 2026-08-28T23:15:00Z | SETTLED MISS | `fl1-f2b6b0204be9d14c` |
| 2026-08-28 | Matt Olson | 824877 | 0.2877 | 2026-08-28T23:15:00Z | SETTLED MISS | `fl1-4067b11afe1bf26e` |
| 2026-09-03 | Kazuma Okamoto | 824388 | 0.2088 | 2026-09-03T17:10:00Z | SETTLED MISS | `fl1-fa59726e4c43c0af` |
| 2026-09-03 | Rafael Devers | 823337 | 0.2161 | 2026-09-03T16:35:00Z | SETTLED MISS | `fl1-cc2cc155f338c8a0` |
| 2026-09-06 | Kyle Schwarber | 823417 | 0.2325 | 2026-09-06T17:10:00Z | SETTLED HIT | `fl1-0fcbe417d7795d6c` |
| 2026-09-06 | Matt Olson | 823417 | 0.2837 | 2026-09-06T17:10:00Z | SETTLED MISS | `fl1-4cd2a572d1b14cfb` |
| 2026-09-07 | Kyle Schwarber | 823415 | 0.235 | 2026-09-07T17:05:00Z | SETTLED HIT | `fl1-5f701954a37369d6` |
| 2026-09-07 | Pete Crow-Armstrong | 823742 | 0.2213 | 2026-09-07T18:10:00Z | SETTLED HIT | `fl1-2e631fe34fbb19f2` |
| 2026-09-07 | Willson Contreras | 824715 | 0.1978 | 2026-09-07T17:35:00Z | NO_MEASUREMENT | `fl1-5910d09514379130` |
| 2026-09-10 | Kyle Schwarber | 823413 | 0.2567 | 2026-09-10T17:05:00Z | SETTLED MISS | `fl1-801e2c3ce9f1a0a0` |

## F02: multiclass vectors

The ledger already held each multiclass row's full `classProbabilities`, but the CSV never exported it.

The CSV now adds two columns:
- `classProbabilities`: the model's full outcome distribution, as JSON;
- `vectorRule`: the class set, the support or "other" bin, and the scoring rule.

**1X2.** `home / draw / away`, as published.

**Correct score.** Every score in the published top-10 table, plus `OTHER`:
- `OTHER = max(0, 1 − Σ listed)`, rounded to 6 decimals;
- a final score outside the table is the class `OTHER`.

**Scoring.** The vector is scored exactly as exported, with no renormalisation:
- Brier = Σ over classes of (p − y)²;
- log loss = −ln(p_observed), with p clamped to [1e-6, 1 − 1e-6];
- stored scores are rounded to 6 decimals.

The observed class is `finalCategory`. A market vector is never exported in its place.

`app/src/lib/results/v2/forecast-record-export.test.mjs` reads the CSVs back and rescores every settled multiclass
row: EPL 1X2 66, EPL correct score 66, Ligue 1 1X2 36, 168 in total. The test checks that the rescored values
reproduce the stored Brier and log loss within **1e-6**: at most 5e-7 from rounding, plus floating-point noise. A
perturbed vector fails the check (probe). Every multiclass row has a vector, because the contract refuses a multiclass
row without one, so no row needed an "unavailable" mark.

## CSV columns

The first 31 columns are unchanged. The new columns follow them, in this order:

- `provenance`;
- for each of `modelId`, `eventStart` and `publishedAt`: a state column, an evidence column (the value that state
  rests on) and a source column;
- `publishedAtCommittedAt`, filled for git evidence only;
- `classProbabilities`;
- `vectorRule`.

The original `modelId`, `eventStart` and `publishedAt` columns still show the row as recorded. A recovered value
appears only in the evidence columns. No sportsbook price column is exported.

## Determinism and size

- **Ledger.** I deleted every ledger file and the git evidence, then ran build → recover → build. The sha256 of all
  seven files matched the committed ones.

  The order matters. The git recovery reads the committed ledger's row ids, so a from-scratch rebuild has to build
  once before recovering. The nightly never starts from scratch.

  ```
  cdc9a57d…09e4  epl.jsonl          05393724…7724  ligue-1.jsonl     2051b1ee…7e26  mlb.jsonl
  32370ac3…828d  nfl.jsonl          45436bb5…5748  ufc.jsonl         d82dfd1b…1a56  manifest.json
  76e7ace5…64d5  evidence/git-history.json
  ```

- **CSV export.** The test emits twice from the same ledger and gets byte-identical files.
- **Committed bytes in the one data commit.** The ledger grows from 25,896,359 to 27,294,169 bytes (+1,397,810). Most
  of that is `"recovered":{…}` on every row; the manifest is +558 bytes. The git-history evidence is a new
  408,458-byte file.
- **Exported CSVs.** These are build output and are not committed. They grow from 4,858,519 to 9,972,839 bytes. Page
  weight does not change, because the CSVs are downloads.

## Re-running

```bash
node app/scripts/results/recover-forecast-provenance-git.mjs --write   # full clone only; append-only
node app/scripts/results/build-forecast-ledger.mjs --now <ISO> --verify-against HEAD
```

If a nightly `auto: forecast ledger` commit lands on main before this merges, the ledger files will conflict. To
resolve:
1. Take main's ledger files.
2. Re-run the builder with `--now` set to that nightly's run time.

The builder re-attaches the same evidence, since the matchers and the git evidence are inputs. Check the result with
`--check`.

## Follow-ups (owners' writers, not this change)

These would stop new forecasts from arriving as `LEGACY_UNKNOWN`.

- **EPL player projections.** Record the shots-on-goal model's identity in the snapshot.
- **NFL player board.** Write `families.<family>.model` for every published family, including receiving yards since
  2026-10-04.
- **Nightly.** Run the git recovery in a full-depth job, so `GIT_HISTORY` evidence keeps up without a manual run.
