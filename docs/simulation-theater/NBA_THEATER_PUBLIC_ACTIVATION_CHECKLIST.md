# NBA Simulation Theater — public activation checklist

**Status (2026-10-20): NOT ACTIVATED. Every gate below is closed.** The NBA Theater, including its three-layer projected box score, exists only on the dev route `/dev/simulation-theater/nba/[eventId]`. That route builds only with `GTP_DEV_ROUTES=1`, and `scripts/prune-internal-routes.mjs` deletes it from every production export. `NBA_THEATER_PUBLIC_ENABLED` is `false` in `app/src/lib/simulation-theater/nba/feature-manifest.mjs`.

This file lists **every** condition that must hold before any public NBA Theater surface turns on. All of them are required; none substitutes for another. Treat an unchecked box as a blocker. Commands run from `app/` unless stated otherwise.

Turning the feature on takes two separate, reviewed acts:

1. a commit that flips `NBA_THEATER_PUBLIC_ENABLED` to `true` and cites the approval file in §2;
2. a Production build that sets `GTP_NBA_THEATER_PUBLIC=1` exactly (`nbaTheaterPublicEnabled()`).

A session that is not the release owner never performs either act.

---

## 1. Governance: preregistration V18 §13

- [ ] **The preregistration permits it.** `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` §13, the experimental public lane amendment of 2026-10-20, lists *"The animated NBA Simulation Theater"* under **What is withheld**. It stays private *"until its own activation, alignment and privacy gates pass"*. Activation therefore needs one of two things:
  - an amendment to §13, recorded the way §13 itself was (a founder decision, dated, in the preregistration file), that moves the Theater out of the withheld table and states its scope; or
  - a §7–§8 promotion of the NBA markets the Theater displays.

  Note that §13 is **not** a §7–§8 promotion. Theater output must never be counted as validation, as forward-shadow data, or as a product record.
- [ ] **Scope matches §13.** The surfaces and figures must be ones §13 (as amended) allows. Today §13 allows only the `/nba` hub, the Elo favoured side, and v0.1 player medians plus expected minutes. Win probabilities, projected team scores, player ranges, odds, lines, edges, picks and rankings are withheld. Any NBA Theater surface must withhold the same items. The box score already prints "Withheld" for the official team score and the win probability (`projected-box.mjs officialGameLine`).
- [ ] **The registry still forbids products.** `canEnterPredictionProducts("nba")` must stay `false`: the registry is `HISTORICAL_ONLY`. The Theater must never feed Bank Builder, Moonshot, Parlay Lab or Smart Betslip.

  Check: `npx tsx --test src/lib/sports/nba/experimental-public-lane.test.mjs`

## 2. Founder approval file

- [ ] **The approval file exists:** `docs/launch/approvals/NBA_THEATER_PUBLIC_<YYYY-MM-DD>.md`, modelled on `P242_NFL_THEATER_PUBLIC_BETA_2026-10-19.md`. It records:
  - the founder's decision, dated and quoted, with where it was given;
  - the exact scope: which page, which games, and which layers of the box score (official projection, simulated game, estimated role);
  - the on-screen disclosure labels;
  - the flag name, its values, and how OFF is enforced at compile time;
  - every gate in this checklist, with the exact head SHA each one passed on;
  - the rollback rule.
- [ ] **The manifest is updated in the same reviewed commit:** `NBA_THEATER_PUBLIC_GATE.decisionRecorded` becomes `true` and cites the approval file.

  Check: `npx tsx --test src/lib/simulation-theater/nba/feature-manifest.test.mjs`
- [ ] **The methodology constants are approved.** Every non-model constant shown or used for gating has a source and founder approval. That includes the anchor tolerance (`NBA_SIM_ANCHOR_TOLERANCE`, currently `approved: false`), the representative tolerance (0.5), and the estimated-role rule (`ROLE_METHOD`: starterRate ≥ 0.5, top 5).

## 3. `theaterActivationGate` is open, including the NBA anchor check

`theaterActivationGate("NBA", eventId)` (`app/src/lib/consistency/audit.mjs`) must return `open: true` for **every** event to be shown. It blocks on:

| Blocker | Meaning |
|---|---|
| `NO_OFFICIAL_SNAPSHOT` | No v0.1 official snapshot for the event, or it was refused (receipt integrity, no Elo head, …) |
| `NO_SUPPORTING_SIMULATION` | No verified pre-tip v1 game to replay |
| `SIM_NOT_ANCHORED` | `nbaSimAnchorCheck` failed. Its terms are: the v1 simulation's side must equal the Elo side; \|v1 pHome − Elo pHome\| must be ≤ the pHome tolerance; and the per-player z of the v1 unconditional mean against the v0.1 mean must be ≤ playerZ |
| `ANCHOR_TOLERANCE_UNAPPROVED` | `NBA_SIM_ANCHOR_TOLERANCE.approved` is `false`. **True today**, so the gate is closed even if every term passes |
| `PROJECTION_MISMATCH` on `simulation-theater.*` | The default run is not the official representative of the official snapshot |
| `SCENARIO_LEAK` | A what-if number is printed as official, or official numbers move with the run |
| `BOX_SCORE_INCONSISTENT` | A box score breaks its invariants |
| `MODEL_VERSION_MIX` | Model versions are mixed across surfaces |

- [ ] **The gate is open for each event:**
  ```sh
  npx tsx scripts/consistency/audit-prediction-consistency.mjs --gate NBA:<eventId> --nba-date <YYYY-MM-DD>
  ```
  The expected output is `open: true` with zero blockers. Record the output in the approval file.
- [ ] **The representative distance is within tolerance, or disclosed as outside it.** On 2026-10-20, the official representative distances are 1.32–1.53 against a 0.5 tolerance (`withinTolerance: false`). The box score says: *"Closest stored run, still far from the official projection"*. Public activation needs either that disclosure approved verbatim, or runs within tolerance.

## 4. Box-score and what-if invariants (unit, no build)

- [ ] **The targeted suites pass:**
  ```sh
  npx tsx --test src/lib/simulation-theater/nba/box-score.test.mjs \
    src/lib/simulation-theater/nba/projected-box.test.mjs \
    src/components/simulation-theater/nba/nba-theater.test.mjs \
    src/lib/simulation-theater/nba/nba-adapter.test.mjs \
    src/lib/simulation-theater/nba/loader-receipt.test.mjs \
    src/lib/simulation-theater/official-representative.test.mjs \
    src/lib/consistency/official-snapshot.test.mjs \
    src/lib/consistency/representative.test.mjs \
    src/lib/consistency/audit.test.mjs
  ```
  These cover:
  - **Run arithmetic:** player pts = team pts = Σ periods; 2·2PM + 3·3PM + FTM = PTS; 3PM ≤ 3PA; FGM = 2PM + 3PM = the team block; minutes = 240 + 25·OT exactly, including a synthetic 2OT; DNP shown as DNP, never 0.
  - **Columns:** FGA, FTA, STL, BLK and TO always read "not modelled".
  - **What-if rule:** the official layer and the official card are byte-identical for every stored run, and the manifest is never mutated.
  - **Withheld items:** the official team score and the win probability show "Withheld" with no number.

## 5. Export boundary scan

- [ ] **The default (flag-OFF) build ships nothing of the NBA Theater.** After a production build (`npm run build`, outside any protected window, holding the shared build lock), run:
  ```sh
  npx tsx --test src/lib/simulation-theater/nba/export-boundary.test.mjs
  ```
  Its markers are: the engine id, the private data paths, `experimental-v1`, the dev-copy and receipt shas, `nba-box-score@`, `nba-projected-box@`, `data-nba-boxscore`, `data-nba-px-`, `PRIVATE CANDIDATE MODEL`, and any theater pack with sport `nba`. The result must be zero leaks and no `out/dev/`.
- [ ] **Marker coverage holds.** The markers include the V2 schema and attributes, and the NBA stylesheet carries no marker (the test above checks both).

## 6. Flag-OFF export verification

- [ ] **The flag is OFF and nothing mounts.** With `NBA_THEATER_PUBLIC_ENABLED = false` or `GTP_NBA_THEATER_PUBLIC` unset, `nbaTheaterPublicEnabled()` is `false`, no public page imports the NBA Theater, and the built export contains no NBA Theater chunk, CSS-bound attribute or pack.
  ```sh
  npx tsx --test src/lib/simulation-theater/nba/feature-manifest.test.mjs src/lib/simulation-theater/nba/nba-dev-route.test.mjs
  npx tsx --test src/lib/internal-route-exclusion.test.mjs   # post-build: /dev/** pruned
  ```
- [ ] **The flag-ON build is scanned before the flip.** Once a public route exists, add a flag-ON build scan modelled on `public-theater-export.test.mjs`. It must prove the ON build carries the disclosure labels and the official / simulated / estimated layer labels, and still none of the §5 private markers apart from those the approval file explicitly permits.

## 7. End-to-end at 320 / 390 / 768 / 1440 px

- [ ] **The opt-in Playwright spec passes against a `GTP_DEV_ROUTES=1` dev server.** Run it now against the dev route, and against the public route once one exists:
  ```sh
  GTP_DEV_ROUTES=1 npx next dev -p 4182            # never on 4179 / 4181
  GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts e2e/nba-theater.spec.ts
  ```
  At all four widths it covers:
  - **Layout:** no page-level horizontal overflow; the tables scroll inside their own region with a sticky player column; tabular numerals; 44 px sort and radio targets.
  - **Dialog and focus:** dialog focus is trapped, Escape returns focus, and the layer-view radios work from the keyboard.
  - **Reduced motion:** `prefers-reduced-motion` gives zero transition durations.
  - **Content:** three layer headers on both tables; official team score and win probability "Withheld"; the run-distance note; what-ifs labelled, and choosing one leaves `data-nba-official-key` and the official card unchanged.

## 8. Privacy scan

- [ ] **No private data reaches the export.** After the build, no private path, internal artifact name or provenance key is in the export:
  ```sh
  npx tsx --test src/lib/data-platform/export-leak.test.mjs src/lib/simulation-theater/nba/export-boundary.test.mjs src/lib/internal-route-exclusion.test.mjs
  ```
- [ ] **No personal data, and every player figure is approved.** The Theater pack carries no personal data beyond public player names, and no injury detail beyond the public injury-report status already shown on `/nba`. Each player figure the public Theater prints is one §13 already publishes, or one the approval file adds explicitly.

## 9. Consistency audit clean

- [ ] **The full audit shows no new fingerprint:**
  ```sh
  npx tsx scripts/consistency/audit-prediction-consistency.mjs --nba-date <YYYY-MM-DD>
  npx tsx --test src/lib/consistency/audit.test.mjs
  ```
  No NEW fingerprint against `app/src/lib/consistency/known-discrepancies.json`, and no NBA Theater entry left in the pinned set (each must be fixed, not re-pinned). One official forecast across the site (founder, 2026-10-20): the Theater's official layer must equal what `/nba` prints for the same receipt.

## 10. Handoff and rollback

- [ ] **The release owner flips it, after the evidence is recorded.** Only the release-owning session flips the flag, in its own change, after §1–§9 are recorded in the approval file with SHAs. Builds respect the shared build lock and the protected capture windows.
- [ ] **The rollback is known.** Set `NBA_THEATER_PUBLIC_ENABLED = false`, or unset `GTP_NBA_THEATER_PUBLIC`, and rebuild. Roll back on any of these:
  - a printed number that differs from its receipt;
  - a withheld item that becomes visible;
  - a what-if shown as official;
  - an export-boundary leak;
  - wrong game identity.

## 11. Possession-level public candidate (`/nba/simulation/[eventId]`, Lane C 2026-10-21)

The candidate route plays one stored run of the possession research engine (`nba-possession-sim-v0`) from its event
log, beside the official projection panel. It is OFF: it renders only when `NBA_THEATER_PUBLIC_ENABLED === true` AND the
build sets `GTP_NBA_THEATER_PUBLIC=1` (`next.config.mjs` defines it as a compile-time `"1"` / `"0"`). The activation
change must also:

- [ ] **Reclassify the route public** in `app/src/lib/audits/route-inventory.mjs` (today `internal`, zero exported
  pages) and regenerate `data/internal/audits/route-inventory-v1.json` from a real build (`--out out`).
- [ ] **Add the artifact as a build input:** `':(top)data/internal/research/nba/theater-possession/'` in
  `BUILD_INPUTS` of `app/scripts/vercel-ignore-build.sh` (`build-input-coverage.test.mjs` enforces the pairing).
- [ ] **Regenerate the runs if the official forecast changed:** `nice -n 19 npx tsx scripts/nba/research/build-theater-possession-runs.mjs --date <YYYY-MM-DD> --write`
  (the full loader refuses `OFFICIAL_CHANGED` / `OFFICIAL_PANEL_DRIFT` until it is re-run).
- [ ] **Unit:** `npx tsx --test src/lib/simulation-theater/nba/possession/*.test.mjs src/components/simulation-theater/nba/possession/*.test.mjs`
- [ ] **Flag-ON export scan:** `scanExportForNbaPrivate(out, { publicTheaterOn: true })` — only the allowlisted engine id,
  payload schema and `data-nbp-` attributes, and only under `nba/simulation/` and `_next/static/`.
- [ ] **E2E (dev route, same island):** `GTP_THEATER_E2E=1 npx playwright test -c playwright.theater.config.ts e2e/possession-nba-theater.spec.ts`
