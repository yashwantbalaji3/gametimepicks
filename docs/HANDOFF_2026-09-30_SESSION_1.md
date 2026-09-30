# Handoff: 2026-09-30, Session 1 (reliability + visible UX)

This is a point-in-time snapshot. For current truth, read the repo, `/data/build-info.json` and `gh pr list`.

## 1. Settlement reliability

### Nightly-settle: the projection write-once refusal (PR #854, merged `b4e8391`)

**Symptom.** Since 2026-09-25, the first nightly-settle slot each day succeeds and every later slot (3 per day) fails:

> REFUSED: `<date>.json` exists and DIFFERS

The later slots are the repair passes for late finals. A refusal skips the health gate and the commit, so nothing they compute is published.

**Reproduction.** The builder is byte-deterministic: the same owners with the same `--now` produce the same SHA. I diffed the committed `2026-09-30.json` (11:12Z) against a rebuild from 14:55Z owners. Every difference was an owner that changed between the runs, in three classes:

| Class | Cause | Status |
|---|---|---|
| Stamps compared as history | Every cell embeds `owner.generatedAt`, and model-health, graded-picks and lab-ledger restamp on every run. Contract §5 says stamps are not history; `historyOf` compared them anyway. | **Fixed** |
| Ordering | The model-health scorecard ran *after* the projection that cites it, so each day's first dated file pinned yesterday's scorecard (16 cells). | **Fixed**: the step now runs before the projection |
| Cross-workflow advancement | daily-products rebuilds the risk-ladder record (5 cells) and the lab-ledger stream state (1 cell) between settle slots. | **Still refused, by design.** Founder decision F1 below |

The write-once guard is unchanged: counts, windows, `n`, owner states and semantics are still history.

**What to expect tomorrow.** A second slot that runs *before* daily-products now passes. A slot that runs *after* daily-products still refuses on the six risk-ladder and lab cells until F1 is decided. #716 (the publication boundary after a refusal) is untouched.

### Doubleheader settlement identity (PR #855, merged `540961d`)

**Symptom.** The TOR @ BAL Moonshot leg from 09-23 (A, "Over 7") never settled.
- `findLinescore` joins on teams + `officialDate`, finds two rows (gamePk 824785 and 824784), and correctly refuses.
- The leg itself carries no gamePk; its only identity is the odds event id inside `id`.
- The Rule S fold has been halted at 09-23 ever since (`protectedFold.foldedThrough = 2026-09-22`).

**Fix (implementation-only; HIT/MISS/VOID unchanged).**
- `resolveLegGameIdentity` pairs the slate's committed odds schedule with the board's StatsAPI games. It does this through the generator's existing, doubleheader-safe `resolveGamePks`; there is no second resolver.
- With a proven gamePk, the join uses only that game.
- An unproven doubleheader stays PENDING.
- Single-game joins are byte-identical to before.
- Replaying all 210 receipt team legs: 206 identical, and 4 changed, all of them previously pending doubleheader legs.

**It does not settle 09-23 by itself.** The catch-up window is TARGET−2. That backfill is founder decision F2.

## 2. Visible UX (PR #856)

Fresh Production audit, before screenshots at 390 and 1280: all 18 routes returned 200, with no horizontal overflow and no console errors. No P0s. The P1s, ranked, were all shipped:

1. **Sport-hub event card** (/nfl /mlb /epl /ufc).
   - The sides face off with 56px crests, and names wrap instead of truncating.
   - The model's favourite gets the bright side and a ring.
   - The owner's own probabilities draw as a split bar; nothing is derived.
2. **Homepage compact cards** truncated names ("Pittsbu…"). They now show the team code with the crest.
3. **/today** led with the scorecard change log and the coverage provenance. Both now follow the slate.
4. **/bank-builder and /moonshot** led with a full eligibility table. It is now one line plus the caveat, with the per-sport detail on demand.
5. **Hero actions** were 12px mono caps. They now use the display face.

**Backlog (P2), not done:**
- Pages are very long on mobile (/results 33k px, /ufc 25k, /nfl 22k).
- The mobile bottom bar highlights MENU on /today and /live.
- The home "How Sunday, Sep 27 went" recap sits beside a "Settled · Sep 29" chip.
- Mono caps remain in many secondary labels.

## 3. Founder decisions required

- **F1: same-day restatement of the dated Results projection.** When the owners legitimately advance between settle slots (daily-products, late finals), should a restatement be recorded?
  - **(a) Recommended.** Append-only revision files (`<date>.r2.json`) with a `restates` pointer and the cell diff. The original is never modified, nothing is silent, and `latest.json` advances. This is the `--restate` option the contract already names (V18 §9.3).
  - **(b)** Only the first slot of the ET day writes the dated file; later slots refresh `latest.json` only when nothing differs.
  - **(c)** Keep as is: later slots stay red daily and their late-final repairs don't publish.
- **F2: backfill 09-23** (`settle-mlb-player-props.mjs --date 2026-09-23 --apply`), which rewrites a protected receipt. Evidence below was simulated in memory only; nothing was applied.

  | | Now | After backfill + fold |
  |---|---|---|
  | Receipt `settled/2026-09-23.json`, Moonshot A | Over 7 pending; lane pending; 0-3, 1 pending | leg LOST (actual 6); lane lost; 0-4 |
  | `protectedFold` | through 09-22, halted | through 09-29 |
  | Bankroll | $15,990.40 | $15,340.40 (−650) |
  | Record | 37-36 | 42-41 |
  | Crown | $20,465.40 | unchanged |

  Only −$25 comes from this leg. The other −$625 is days 09-23 to 09-29 that were already decided but held behind 09-23 (09-23 −250, 09-24/25/26 −125 each, 09-27 −25). `mr-dub/ledger.json` and `daily-summary.json` each gain 7 rows. The Protected-Ledger check passes both before and after. Both official games ended TOR 2 – BAL 4.
- **F3 (policy, no incident today).**
  - Is a leg placed on the original date of a postponed game VOID, or graded on the makeup date?
  - Should receipts store the gamePk? That changes the protected receipt's shape.

## 4. Soccer (read-only prep for Session 3)

The full table is in the session scratch notes; the summary:
- **EPL:** LIVE and validated on history. The forward receipt is at 10/60 and live-vs-market at 46/60. 398 of 500 odds credits remain.
- **Ligue 1:** ACCEPTED_V1. It shows 0 rows because ESPN has no fixtures until 10-09; rows should return around 10-01. It has no odds receipt, and its model copy names the wrong engine.
- **LaLiga, Serie A, Bundesliga:** REJECTED_V1 on draw ECE. The Dixon-Coles v2 shadow runs until its one season-end look (May 2027).
- **MLS and the Champions League:** no history, capture job or preregistration. MLS `/events` shows a stale July snapshot.
- **Unused free baseline:** football-data CSVs carry closing odds for all five leagues, yet the shadow summary reports `marketClose n=0`.

## 5. Ask (read-only findings for the Ask session)

- The plain fallback is `FAILED_DETERMINISTIC_FALLBACK` (`engine.mjs:515`), reached after two writer attempts fail `verifyAnswer`.
- Production logs only `UNSUPPORTED_CLAIM`, so the rule that fired is unknown. Attempt-1 violations are also overwritten by attempt 2.
- The offline eval passes 128/128 because the fake writer echoes the evidence word for word.
- **Most likely cause:** directional verbs ("favors", "expects … to win") became pick claims (481f2544b1) on the same day probability-only NFL/EPL forecasts entered the evidence (1f1d83102b). Every current forecast has no pick, so any paraphrase fails.
- **Fixes that don't weaken the verifier:**
  - A writer rule to restate probabilities verbatim.
  - A retry prompt specific to the rule that failed.
  - Per-rule ids in the audit log.
  - A paraphrasing fake writer in the eval.
  - `NEGATION` to include "nothing" and "none", with mutation probes.

## 6. Results / Suggested Parlays / Bank Builder / Moonshot

- **Results V2:** status only, not rebuilt.
- **Bank Builder / Moonshot:** the record is honest about its fold backlog, but the fold stays halted at 09-23 until F2.
- **Suggested Parlays:** the empty states are honest.

## 7. DP

No tasks assigned; onboarding only.

## 8. Next recommended session

1. Decide F1 and F2, then implement the chosen F1 path and run the F2 backfill.
2. Check the first nightly-settle slots after #854 against §1's expectations.
3. The dedicated Ask session (§5).
4. UX P2 backlog: mobile page length, the bottom-bar active state.
