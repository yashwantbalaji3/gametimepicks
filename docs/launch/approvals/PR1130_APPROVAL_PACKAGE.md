# PR #1130: eligible-operator allowlist (founder approval package)

- **Candidate head (local, not pushed):** `3f778eac4552ff20c48ff88174543c5aa311d408` on local branch `claude/eligible-operators-ext`.
  - It is one commit (O-6/O-7) on top of a clean merge of `origin/main` `72128bfcd0` into the earlier candidate `b4aa6c61`.
  - `origin/main` was still `72128bfcd0` when this was written.
- **Original PR head:** `126196a7`. The PR is still a draft and is not merged.
- **Prepared:** 2026-10-18. Nothing was pushed, no data was written, and no paid API was called.

## Scope: 27 files, +804 −34 against main, all code and tests
- **M-1 / M-2 (unchanged from `b4aa6c61`):** MLB withholds and counts ineligible offers at render; MLB ingest and the NFL prop ladder pick only among eligible books; the NFL market cell shows "Price not shown".
- **O-6 / O-7 (new):** one loader-boundary sanitiser, `lib/sports/odds/public-offer-sanitizer.mjs`, plus an export-time copy step (details below).
- **Allowlist:** `eligible-operators@1`, 9 keys (8 operators), each on Pennsylvania's licensed list. It is fail-closed, so an unknown key is not eligible.
- **Out of scope:** M-3/M-4 (consensus inputs), state gating, Smart Betslip, and rewriting historical artifacts.

## O-6: embedded page data and public JSON (resolved)
- **Loader boundary:**
  - The sanitiser runs before any component receives the data, so before serialisation.
  - It turns an ineligible offer into `{ sportsbook: null, bookWithheld: "ineligible-operator" }` and drops the book, line, odds and `capturedAt`.
  - Applied at `/nfl/game/[eventId]` (player board), `forecast-view-load.mjs` (every `PlayerRow`), `/nfl` and `/endzone-vault` (Vault), `nfl-hub-data.ts` (/live roster: boards and live-props), and `use-live-props.ts` (in-browser backstop on each fetch).
  - A clean artifact is returned by reference, so it serialises byte-identically.
- **Presentation:**
  - The new `INELIGIBLE_BOOK` market state comes from `marketFromCapturedOffer`, used by the weekly-board, Vault and game-report rows.
  - It renders "Price not shown" and is never a false "not probed".
- **Public JSON (`/data/nfl/live-props/*.json`):**
  - (a) **Is it fetched at runtime?** Yes, by the /live hub (`use-live-props.ts`, one request per live game per tick). Game pages don't fetch it; they use the gateway.
  - (b) **Implemented: sweep 4 in `prune-internal-routes.mjs`.**
    - It rewrites only the **exported copy** in `out/data/nfl/live-props/`.
    - Only files that carry an ineligible offer are rewritten, in the producer's own format.
    - `public/data` is never written.
  - Result: 1 of 74 files was rewritten (`401872960.json`, 1 withheld). The other 73 are byte-identical to the repo.
  - **Why this is safe:**
    - The client only reads `frozen.market` for the line and book, and both are already nullable.
    - Settlement scripts and the live capture kit read the repo or git, never `out/`.
    - The committed record stays the historical evidence.

## O-7: PlayerRow and Vault `marketPrice` (resolved, same policy)
- **`PlayerRow`:**
  - `forecast-view.mjs` `capturedMarket` passes each slot through `sanitizeOffer`.
  - `PlayerRow` renders "Sportsbook · Price not shown" (`data-market-withheld`) for a withheld slot, and fails closed on any ineligible key even if a caller skipped the loader.
- **Vault:**
  - `sanitizeVaultArtifact` handles the Vault's `marketPrice`.
  - `presentVaultCandidate` turns a withheld price into `INELIGIBLE_BOOK`.
  - The committed `end-zone-vault/2026-09-25.json` (Dallas Goedert, betonlineag) is covered by a test. It is not the current `latest`.

## Jurisdiction handling
- **The limitation:** "Eligible" means licensed in at least one US jurisdiction, not available to this visitor. GTP has no geo gating.
- **New note:** `BOOK_AVAILABILITY_NOTE`, which reads "Sportsbook availability varies by state.", has one owner, `eligible-operators.mjs`. It renders only where a book is named:
  - under the NFL `PredictionBoard`;
  - under each NFL family list (`FamilyTabs`);
  - in the MLB props board's count line.
- **Build result:**
  - 49 exported pages carry the note.
  - `/nfl` carries none today, because no named price is shown there now.
- **Not touched:** Terms, privacy, the top banner (it has a word budget), and legal routes.

## Scan results (local build of the candidate, default `npm run build`)

| Scope | Files scanned | Offshore key or title mentions |
|---|---|---|
| Exported HTML (`**/index.html`, excl. `_next`) | 2,869 | **0** (was 2 routes: `/mlb`, `/nfl/game/401872960`) |
| RSC payloads (`**/*.txt`, excl. `_next`) | 2,868 | **0** |
| `out/data/**` (1,774 JSON + CSV/JSONL; 1,800 files) | 1,800 | **0** (was 1: `nfl/live-props/401872960.json`) |
| Post-build guard (HTML + RSC + data JSON) | 7,511 | **0**; the documented-exceptions list is empty |
| `_next/static` JS (O-8, code, out of scope) | 3 chunks | `9304-*.js` 6, `app/nfl/game/[eventId]/page-*.js` 10, `app/mlb/page-*.js` 6 (allowlist key list and `bookmakerLabel` map) |

- **Pattern:** `betonlineag|bovada|mybookieag|betus|lowvig|betanysports|betonline|mybookie|bet ?any ?sports`, case-insensitive.
- **Built page `/nfl/game/401872960`:**
  - The payload now carries `"anytime_td":{"probability":0.3874,"market":{"sportsbook":null,"bookWithheld":"ineligible-operator"}}`.
  - The projection is unchanged.

## Regression guards (new)
- **`public-offer-sanitizer.test.mjs` (unit, 10 tests):**
  - **Sanitiser rules:** eligible offers pass unchanged by reference; offshore, unknown, empty and null books are withheld; the input is never mutated.
  - **The 401872960 board and live-props record:** every non-offer field is deep-equal, including `settlement`, `live`, projections and `frozenIdentity`.
  - **Live-props text:** clean records come back byte-identical (73 clean, 1 sanitised).
  - **Vault and presentation:** the Vault is covered; presentation returns `INELIGIBLE_BOOK`.
  - **`PlayerRow` path:** covered.
  - **Rendered output** (`PredictionBoard` and `PlayerRow`):
    - a withheld or offshore offer renders "Price not shown", with no book and no price;
    - the note appears only beside a named book.
  - **Export step:** a scratch export run proves `public/data/nfl/live-props/*` is byte-identical afterwards.
- **`public-offer-export.test.mjs` (post-build, 4 tests):**
  - the full-export scan;
  - the 401872960 payload;
  - the exported live-props copy is sanitised while the committed record isn't, with settlement, live facts and projections equal.

## Gate (on candidate `3f778eac`)
- **Targeted tests:** 148 / 148 pass across 15 files, 0 fail.
- **`npx tsc --noEmit -p .`:** clean.
- **Unit phase:** 1,184 files → **pass**.
  - 9,522 tests: 9,517 pass, 0 fail, 5 skipped.
  - The render test was added to the sanitiser file afterwards and passes in the targeted run.
- **Build:** `npm run build` (default) → ok. `next-build` took 143.1 s.
  - Prune log: `ineligible-operator offers withheld in out/data: nfl/live-props/401872960.json (1 withheld)`.
- **Post-build phase:** 125 rendered-guard files → **pass**.
  - 714 tests: 711 pass, 0 fail, 3 skipped (archive-integration skips).
- **Data hygiene:**
  - The build dirtied `data/ask-projection/v1/recent/*` (known). It was restored with `git checkout -- data/ app/public/data/`.
  - `git diff --name-only origin/main...3f778eac -- data app/public/data` → **0 files**.

## Remaining limitations and open founder or counsel questions
- **O-1 Jurisdiction:** the note is a disclosure, not gating. State-aware eligibility is still a counsel item (SB-01).
  - **24 exported pages** name a licensed book without the note:
    - `/results/date/*` ×16;
    - `/simulate/d/*` ×4;
    - `/today`, `/sports`, `/results`, `/results/parlays`.
  - These are historical results and simulations outside the allowlist display paths.
  - Founder decision: extend the note to those pages, or accept.
- **O-2 Age wording:** a counsel decision. Not touched.
- **O-3:** should MLB adopt the NFL DK → FD → coverage ladder?
- **O-4 Consensus:** offshore books still feed the no-vig consensus. They are never named.
- **O-5:** confirm the "unsupported sportsbook offers not shown" and "Sportsbook availability varies by state." copy.
- **O-6 residuals:**
  - The repo file `app/public/data/nfl/live-props/401872960.json` still contains the key, by design (committed history).
  - Production serves the old copy until the next deploy.
  - `settlement.line` is never altered. On the one withheld row (an anytime-TD market) it is `null`.
- **O-8 JS chunks:** the allowlist's offshore key list and the `bookmakerLabel` map are compiled code, not page content.
- **Other readers not sanitised:**
  - `lib/live/preview-data.ts` (`/preview`, pruned from the export).
  - Products/engine-v2 leg pricing (Smart Betslip scope).
  - Neither reaches an exported page: the scan found 0.

## Cost, rollback, approval
- **Cost:** one Production build on merge. No new workflows, no paid API calls, no data regeneration.
- **Rollback:** `git revert -m 1 <merge commit>` plus one build. No data cleanup is needed.

> Approve #1130 at exact head 3f778eac4552ff20c48ff88174543c5aa311d408

(If the coordinator re-merges main before pushing, the head changes and this line must be updated to the pushed SHA.)
