# U4 / D3: settling every frozen UFC pairing: decided, official draw, unverified, withdrawn, pending

**Status:** PROPOSAL. Founder decision D3 is still open. Nothing has been applied: no grading was run with `--write`, and no ledger, graded file, summary or public artifact was changed.

**Branch:** `claude/ufc-001-u4-withdrawn-rule`. Proposal code:
- `app/src/lib/sports/ufc/pairing-status.mjs`: a pure classifier. It does no I/O and reads no clock. It exports `classifyPairings` (card level) and `classifyProviderOutcome` (one ESPN competition).
- `app/src/lib/sports/ufc/pairing-status.test.mjs`: 27 deterministic tests, the last of which runs 27 mutation probes.
- `app/src/lib/sports/ufc/fixtures/pairing-status-2026-09-26.json`: a read-only extraction of the committed 09-26 snapshots, results and ledger rows.
- `app/src/lib/sports/ufc/fixtures/espn-competitions-2026-10-10.json`: sanitized ESPN competitions from the fight-night recorder, plus the pregame card records and the final 10-10 snapshot.
- `app/scripts/ufc/report-pairing-status.mjs`: a dry-run report with no write path. It refuses `--write`.

## 1. Two problems with one cause

The grader treats a frozen pairing as "pending" until an official winner appears under its exact key. Two different facts never produce such a winner, so both look like "pending" forever.

1. **A pairing that never fought.**
   - `2026-09-26:mickey gall|sedriques dumas` (providerBoutId 401923433) was frozen in `snapshot-202609221527`, `-231748` and `-241534`.
   - Gall was replaced. The final pre-card snapshot `snapshot-202609261455` holds `luis hernandez|sedriques dumas` (401924683) instead.
   - Today `summary.json` reads 09-26 as frozen 9 = graded 8 + pending 1.
2. **A fight with no winner.**
   - 2026-10-10 Gatto v Kareckaite (401924511) was a majority draw: official UFC scorecards 29-27, 28-28, 28-28.
   - ESPN shows `winner: false` on both sides. The grader computes "void" and never writes it, so the bout stays pending.

**The founder's direction:** a missing winner flag is valid for a draw and must not automatically be treated as missing data. Official draws, truly pending results, withdrawals and decided fights must be told apart on evidence.

## 2. The provider evidence

These facts were observed in 125 recorder scoreboard captures from 2026-10-10 18:40Z to 2026-10-11 01:39Z.

**Winner flags:**
- **A false winner flag proves nothing.** Every state carries `competitors[].winner: false` for both sides: SCHEDULED, PRE_FIGHT, FIGHTERS_WALKING, IN_PROGRESS(_2), END_OF_ROUND, END_OF_FIGHT, and a final draw alike.
- Only `winner: true` is a claim.

**Judge cards:**
- They sit in `competitors[].linescores[0].linescores[]`, one value per judge. They exist for decisions and draws, not for stoppages.
- The top-level `linescores[0].value` is a total (Gatto 83 v Kareckaite 85). It is never used to pick a winner.

**Records:**
- `competitors[].records[0].summary` is "W-L-D". After a draw both fighters gain a draw (Gatto 9-3-2 → 9-3-3, Kareckaite 6-2-1 → 6-2-2).
- **Records update progressively after STATUS_FINAL.**
  - 21:34:30Z: final, neither record updated.
  - 21:37:31Z: Gatto only.
  - 21:46:35Z: both.
  - Decided bouts update the same way (Frye: winner flag at 22:09Z, Harris's loss at 22:21Z).

**New states:** STATUS_END_OF_FIGHT exists (seen on 401927417) and is not final.

**Consistency check:** decided decisions carry cards that agree with the flag. On 401924510 Godínez won 29/29/29 against 28/28/28.

## 3. The rule: exactly one status per frozen pairing

The inputs are pure data: the snapshots, the official results list, the raw provider competitions, the pregame card records, and `now`.

| Status | Evidence required | Graded? | In a denominator? |
|---|---|---|---|
| `GRADED_WIN` / `GRADED_LOSS` (DECIDED) | STATUS_FINAL, `completed: true`, exactly one `winner: true`. If judge cards exist, there must be three per side and their judge-by-judge majority must equal the flagged winner. | yes | yes |
| `OFFICIAL_DRAW` | STATUS_FINAL, `completed: true`, no `winner: true`, **and both** of: (a) three per-judge cards on which no fighter wins two (unanimous, majority or split draw); (b) both fighters' post-fight records equal the pregame card record with draws +1 and W and L unchanged. Alternatively, an official source says "draw" in its own words (the ufcstats corpus `resultStatus`). The signals are recorded. | no: void for winner grading, never a hit or a miss | no |
| `NO_CONTEST` | Only an official source's explicit "no_contest" (corpus `resultStatus`). ESPN's NC shape has **not been observed**, so it is never inferred from the provider. A no-winner stoppage falls to the next row. | no | no |
| `FINAL_NO_WINNER_UNVERIFIED` | Final and no winner, but less than both draw signals: an early capture before the records update, a winner-only capture row, or a stoppage with no winner (possibly an NC). **Not missing data and not pending.** It awaits verification by a human or an official source. | no | no |
| `RESULT_INCONSISTENT` | The provider contradicts itself: the card majority disagrees with the winner flag, both sides are flagged winner, or a decided bout has partial cards. | no; review | no |
| `WITHDRAWN_BEFORE_START` | **Unchanged** from the first version. (1) The pairing is in an earlier pre-start snapshot. (2) It is not in the final pre-start snapshot, as a row or as a skipped provider id. (3) The card has started. (4) The provider has reported the card. (5) No result exists for the pairing by exact or loose name. | no | no |
| `AWAITING_RESULT` | Not final yet (pre, in progress, END_OF_ROUND, END_OF_FIGHT, `completed` false), or any ambiguous case. | no | no |

**What a withdrawn pairing keeps:**
- the forecast of record, as a frozen deep copy, so the probability and pick never change;
- its evidence: the first, last and final snapshots, how many snapshots held it, and the replacement pairing if one shares a fighter or the provider bout id.

**Joining provider evidence:**
- Provider evidence joins a pairing by provider bout id **and** both fighter names. A competition under the same id that names other fighters is flagged `PROVIDER_PAIRING_MISMATCH` and not used.
- The newest capture known at `now` wins.
- A winner-only result (the existing ESPN capture rows) and a provider record that agree are classified once.

**Definitions:**
- **Pre-start snapshot:** `capturedAt < startUtc` and `capturedAt <= now`.
- **Final pre-start snapshot:** the latest pre-start snapshot. Before the start it is only the latest so far, so nothing can be withdrawn yet.
- **Forecast of record:** the row from the latest pre-start snapshot that held the pairing. This is the same row the grader scores today.

**Never-frozen bouts.** Bouts in the final snapshot that were skipped and never frozen are listed apart as `UNPRICED_EXCLUDED` or `NO_READ_EXCLUDED`. A missing price is never a loss.

## 4. Why it is general

- **No bout is named.** Every decision uses facts every card has: the ordered snapshots, the card start, provider status, flags, judge cards and records, and the pregame records.
- **The withdrawn rule fires once on main** (Gall v Dumas). The draw rule fires once (Gatto v Kareckaite), and only after both signals hold.
- **Each status needs positive evidence.** Anything short of it falls to UNVERIFIED or AWAITING, never to graded or withdrawn.

## 5. Edge cases (each one is pinned by a test)

| Case | Result |
|---|---|
| Real Gall → Hernandez | WITHDRAWN. Evidence: first `…221527`, last `…241534`, final `…261455`. Replacement Hernandez v Dumas (401924683, shares Sedriques Dumas). |
| Real 401924511 final, both records updated | OFFICIAL_DRAW. Cards per judge EVEN / Kareckaite / EVEN. Records draws +1 on both. Not in the denominator. |
| Real 401924511 at STATUS_FINAL before records updated, and with one updated | FINAL_NO_WINNER_UNVERIFIED (one signal). |
| Mutated copies: cards removed; third judge flipped so one fighter wins two cards; a win added with the draw; no pregame card | FINAL_NO_WINNER_UNVERIFIED. |
| Real decision 401924510 (Godínez 29/29/29) | DECIDED. The card majority agrees with the flag. |
| Same with winner flags swapped; synthetic 2-1 cards against the flag; partial cards; two winners | RESULT_INCONSISTENT, never graded, even beside a winner-only row. |
| Real stoppages 401927418 (Frye), 401924512 (Pereira) | DECIDED with no cards. Frye v Harris was never frozen (no model read), so it is NO_READ_EXCLUDED. |
| Split decision 29-28, 28-29, 29-28 | DECIDED for the two-card winner. |
| Split draw 29-28, 28-29, 28-28 with records +1 | OFFICIAL_DRAW. |
| Real IN_PROGRESS and END_OF_FIGHT (both flags false); a final with `completed: false` | AWAITING_RESULT. |
| Capture sequence | At 21:40Z the newest known capture gives UNVERIFIED; after 21:46Z it gives OFFICIAL_DRAW. |
| Provider id reused for other fighters | `PROVIDER_PAIRING_MISMATCH`, so AWAITING. |
| Late replacement after the final snapshot; a bout dropped by the provider after the final snapshot | AWAITING. **Not withdrawn.** |
| Bout cancelled outright | WITHDRAWN, with replacement `null`. |
| Frozen earlier, unpriced at the final freeze | AWAITING with `ON_FINAL_CARD_WITHOUT_FORECAST`. It grades from the earlier row if it fights. |
| Duplicate results | Classified once, with `DUPLICATE_RESULT`. |
| Overturned or contradicting later result | Flagged `RESULT_CHANGED_NOT_APPLIED`. The earliest record stands. |
| Spelling variants (Syguła / Sygula, Jingnan Xiong / Xiong Jingnan); punctuated corpus ids | A loose join, flagged `RESULT_JOINED_BY_LOOSE_NAME`; punctuated ids are re-keyed to the canonical form. |
| Immutability | The inputs are deep-frozen and byte-identical afterwards. The returned forecast is frozen. |

**Mutation probes:** 27 probes, all killed. They include:
- using the top-level card totals;
- calling a draw on one signal;
- ignoring the card majority;
- treating "no cards" as drawn cards;
- accepting a final without `completed`;
- allowing a win change in a draw record;
- ignoring an inconsistency;
- skipping the provider name check;
- letting the oldest capture win;
- all 17 earlier probes (withdrawn, overturn, record-of-forecast, joins).

## 6. Effect on denominators

- **Graded bouts: none.** Every GRADED pairing already in `graded.jsonl` matches it on bout, hit, probability and source snapshot (60 of 60).
- **Withdrawn and official-draw pairings leave "pending"** and enter no hit-rate or log-loss denominator. UNVERIFIED and INCONSISTENT also stay out of every denominator, and they are visibly not "pending".

**Dry-run classification** (`report-pairing-status.mjs --now 2026-10-11T01:38Z --scoreboard-file <recorder>/scoreboard-20261011T013747Z.json`):

| card | frozen | W | L | draw | NC | unverified | inconsistent | withdrawn | pending | today (summary.json) |
|---|---|---|---|---|---|---|---|---|---|---|
| 08-22 | 10 | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | graded 10 |
| 08-29 | 6 | 5 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | graded 6 |
| 09-05 | 8 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | graded 8 |
| 09-12 | 7 | 4 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | graded 7 |
| 09-19 | 10 | 7 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | graded 10 |
| **09-26** | 9 | 7 | 1 | 0 | 0 | 0 | 0 | **1** | **0** | graded 8, **pending 1** |
| 10-03 | 11 | 7 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | graded 11 |
| **10-10** | 11 | 5 | 3 | **1** | 0 | 0 | 0 | 0 | 2 (Herbert v Camilo, Allen v Duncan not yet final) | (not graded yet) |

On 10-10, Gatto v Kareckaite reads OFFICIAL_DRAW. Earlier captures from the same night read FINAL_NO_WINNER_UNVERIFIED at 21:34Z and 21:37Z, then OFFICIAL_DRAW from 21:46Z.

## 7. A future APPLY step (not done; it needs separate founder approval)

An APPLY step would touch exactly these files:

1. **`app/scripts/ufc/capture-ufc-results.mjs`**: keep each competitor's per-judge cards (`linescores[0].linescores[].value`), the `records[]` summary and `status.type.completed` in the committed rows. Today it keeps only the winner flags, so the draw evidence is lost.
2. **`app/src/lib/sports/ufc/official-results.mjs`**: a no-winner ESPN final stops being "void". It is passed to the classifier, which decides OFFICIAL_DRAW or UNVERIFIED.
3. **`app/scripts/ufc/grade-ufc-model-vs-market.mjs`**:
   - `reconcileEvents()` reports `graded`, `officialDraw`, `noContest`, `unverified`, `inconsistent`, `withdrawn` and `pending` with bout ids. The invariant becomes frozen = the sum of all seven.
   - Withdrawn records are appended to a separate `withdrawn.jsonl`.
   - Draw and NC voids are written only if decision 5 below is taken.
   - Nothing non-decided goes into `graded.jsonl`, because `graded-pick-owners.mjs` would list it as a pick, and the ledger adapter's `gradedAt` branch would make it a NO_WINNER VOID.
4. **`data/internal/research/ufc/model-vs-market/summary.json`**: the reconciliation is regenerated. `cumulative` is unchanged by construction.
5. **`app/src/lib/forecast-ledger/adapters/ufc.mjs`**:
   - a WITHDRAWN branch following the NFL top-board precedent: `publicationStatus: "WITHDRAWN"`, a `withdrawal` block, `directionalResult: "WITHDRAWN"`, settlement `NO_MEASUREMENT`;
   - explicit VOID rows for OFFICIAL_DRAW and NO_CONTEST (reason DRAW or NO_CONTEST, with evidence), replacing today's unreachable branch.
6. **`app/scripts/results/build-forecast-ledger.mjs`** reads `withdrawn.jsonl`. **`app/scripts/ufc/build-ufc-lane-status.mjs`** carries the new counts, so `postCardLag` is held open only by `pending` and `unverified`, never by draws or withdrawals.

## 8. Alternatives

- **(a) VOID Gall v Dumas.** Wrong in kind: VOID means "it fought, no winner". It is also a one-fight patch.
- **(b) The general evidence rule (recommended).**
- **(c) Leave both pending.** Honest but permanent. Every replacement and every draw adds a pending pairing that never clears.
- **(d) Treat any no-winner final as a draw.** Rejected. A false flag is present in every state, an NC looks identical without explicit evidence, and the records lag the final by minutes.

## 9. Founder decisions needed to apply

1. **D3:** adopt the rule as specified, covering the five withdrawn conditions, the two draw signals, and the conservative UNVERIFIED and AWAITING fallbacks.
2. **Draw evidence bar:** both signals (recommended), or accept the judge cards alone once STATUS_FINAL and `completed` hold. This matters because records lag by up to about 12 minutes.
3. **Writing voids:** are OFFICIAL_DRAW and NO_CONTEST written (to a void log, or as `void: true` rows) and surfaced as "draw" or "no contest"? If not, they stay in reconciliation only.
4. **UNVERIFIED resolution:** who verifies, and against which source: a human against ufc.com, or the ufcstats corpus once it publishes. Also the time limit before it is escalated.
5. **Storage:** a separate `withdrawn.jsonl` (recommended). The ledger state for withdrawn rows: `NO_MEASUREMENT` (recommended) or `VOID` with reason `WITHDRAWN_BEFORE_START` (the NFL precedent).
6. **Capture change:** keep judge cards, records and `completed` in `capture-ufc-results.mjs` rows. Without this, production cannot reach OFFICIAL_DRAW from ESPN, only from the corpus later.
7. **Historical effects:** regenerate `summary.json` reconciliation, so 09-26 pending 1 becomes withdrawn 1 and 10-10's Gatto pairing becomes an official draw. No graded row changes.
