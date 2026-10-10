# UFC-001 · UFC hub and bout-page experience: plan (2026-10-10)

**Source of authority:** `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` → `UFC-001` (IN_PROGRESS). This document only plans UX Phases A–E and does not replace the roadmap. Every phase needs its own exact-head founder approval.

## Current architecture (main, 2026-10-10)

- `/ufc` (`app/src/app/ufc/page.tsx`), top to bottom:
  - `SportSwitcher` → `HubTitle` → `SportHubNav`;
  - `HubHeader` (the shared bout grid: monogram discs, card ordered prelims first);
  - the overview with its Explain;
  - `SimulationStorySection`;
  - `UfcCard` (full per-bout sections: winner, method and round distributions, fighter profiles);
  - then the paper ladder, graded record, archive, model status and top reads.
- **`/ufc/bout/[boutId]`:** hero, story, winner / method / round sections, fighter profiles, "Where these numbers come from", sibling bouts.
- **One data source:** `app/public/data/ufc/card-latest.json`, read through `loadUfcCard` / `findUfcBout`. It is built by `app/scripts/ufc/build-ufc-card.mjs`.
- **Reusable pieces:**
  - `PlayerAvatar` (ESPN headshot URL probed at build; monogram fallback, no broken image);
  - `HeadToHead`, `ProbabilityBar` / `Histogram`, `SectionHeader`, `Explain`;
  - the vault tokens (`--vault-panel`, `--vault-rule`, `--sport-ufc`) and `boutPositionLabel`.

## Phase A (this PR): the prediction board

- **What it shows:** `UfcPredictionBoard` replaces the shared bout grid in `#ufc-games` when a card exists. Every bout appears once, main event first, with:
  - position and segment;
  - both fighters with portraits, and the pick marked in words;
  - weight class and rounds;
  - the published winner probability;
  - the experimental method lean;
  - a link to the existing bout page.
- **Layout:** a table at `xl`+; cards below (two per row on tablets, one on phones).
- **Data:** rows come from `buildPredictionBoard(card)` and nothing else.

## What the data honestly supports (research 2026-10-10, read-only)

| Need | Available now | Source / definition | Limits |
|---|---|---|---|
| Height, reach, stance, age at the event | Yes, for all 24 of tonight's fighters | `data/internal/research/ufc/raw/stats/ufc_fighter_tott.json` (ESPN core MMA; DOB → age at the event) | Self-reported and static (generated 2026-08-18) |
| Pro record | Yes | ESPN `record` on the card | Snapshot at card build |
| UFC record, finish rate, finished-in-losses, distance rate, last 5 | Yes | Corpus outcomes (`ufc_fight_results.csv` + events), point in time as of 2026-08-08 | Corpus ends 2026-08-08; 4 fighters have only 1 tracked bout; Kamaka III is split from "Kai Kamaka" |
| SLpM / SApM / striking accuracy and defense / TD avg, acc and def / sub avg | **No** (honestly) | Not in the local corpus. `fighters-latest.json` is stale (data ends 2026-05-16), "per round" not per minute, `subAttempts` broken, no SApM or defense, 3 of tonight's fighters missing | Needs a free ingest of `ufc_fight_stats.csv` (same source) to derive point-in-time per-minute stats. ESPN's athlete stats are a current snapshot with unclear terms. ufc.com / ufcstats.com must not be scraped |
| Winner as "fighter wins by KO" | **No** | No joint model exists | The method head is fight-level: P(method \| bout ends with a winner) |

## Phase B: bout pages (existing reliable data only)

1. **Hero:** both fighters (portrait, ESPN pro record, age, height, reach, stance), the card position, and the weight class and rounds.
2. **Forecast:** the pick and its probability; the method lean labelled fight-level and experimental; the model id and `generatedAt`; the D2 disclosure.
3. **Comparison table:** height, reach, age, stance, UFC record (n), finish rate, finished-in-losses, distance rate and last 5. Each row has a source and an "as of" date; missing values show as "—" with the reason.
4. **Defects to fix in the producer** (`profileFor`):
   - "Too few tracked losses" appears for fighters with 13–14 losses (it should read "no rule triggered (n = X)");
   - the "Durable" wording (it only means "often goes the distance");
   - "mostly by submission" when the KO share is 40–60%;
   - a `basisNote` that says "no UFC history" for fighters with 1 bout.

## Phase C: strengths and weaknesses (evidence rules, with counts shown)

- **Strengths:**
  - finisher: wins ≥ 3 and finish rate ≥ 60%, split stated as KO/SUB counts;
  - KO wins ≥ 3, or SUB wins ≥ 3;
  - win rate ≥ 70% with n ≥ 5;
  - height or reach edge from the tale of the tape.
- **Risks:**
  - finished in ≥ 60% of losses, with losses ≥ 2;
  - win rate ≤ 45% with n ≥ 5;
  - rarely finishes: finish rate ≤ 20% with wins ≥ 3;
  - thin sample: n < 3, stated as such.
- **Never:** health, personality or "proven weakness" claims from a single result. Every claim carries its source, measurement and period. Striking and grappling claims wait for the point-in-time per-minute ingest (founder decision; free source).

## Phase D: "Why GameTimePicks favors X" (truthful)

- **The winner head is a logistic regression with Platt calibration.** Calibration is affine in logit space, so per-feature contributions `a·wᵢ·xᵢ` are **exact** on the calibrated log-odds. The research reproduced published probabilities to 4 decimals.
- **The section would show:**
  - **Model explanation:** the top contributions in plain words. The four correlated record features are grouped into one "record" item; the intercept and corner terms are shown separately; magnitudes are given in log-odds or "points of probability".
  - **Matchup context:** Phase C facts, clearly labelled as not model inputs.
  - **Uncertainty:** the D2 text.
- **Requires** `build-ufc-card.mjs` to emit the coefficients and per-bout contributions. Today they are computed but not persisted. This is a producer change, and it gets its own PR and test: the contributions must sum to the published logit.
- **The current `reason` sentence is not an attribution.** Its comment says it uses "features that moved the prediction", but it uses raw-rate thresholds and ignores the tale of the tape. For example, Camilo's 74% is driven mostly by age (about −1.03 logit for Herbert) while the sentence cites win rate. Phase D replaces it. Until then, Phase B labels it "summary of tracked records", not "why".

## Phase E: UFC live tracking

Separate from the visual work. The plan is recorded under `UFC-001` in the roadmap: enable `ufc` in the existing live gateway with the existing `espn-mma.mjs` / `ufc-tracked.mjs` adapters, default closed, and use the shared Live shell.

## Validation gates (every phase)

- Every bout exactly once; forecasts equal the artifact; unmodelled bouts stay unavailable; routes are correct.
- No invented statistics; a source on every factual claim.
- Claims guard and rendered guards pass; mobile, tablet and desktop checked; no horizontal overflow or console errors.
- No change to forecasts, receipts, denominators, odds, workflows or eligibility.
