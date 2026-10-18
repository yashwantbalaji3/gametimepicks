# Smart Betslip prep: offshore-operator exposure, eligible-operator policy, SB-01 → SB-02 tasks (2026-10-18)

**Type:** read-only research plus this one document. No code, data, roadmap or config was changed. No builds or tests were run, no paid or metered API calls were made, and nothing was signed up for.
**Builds on:** `docs/research/SMART_BETSLIP_FEASIBILITY_2026-10-18.md` (cited as **SB**) and `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` `BETSLIP-001` (SB-01…SB-06, founder direction 2026-10-18). Material already in SB is referenced, not repeated.
**Repo basis:** `origin/main` @ `05c9deea4f` (fetched 2026-10-18). It moved from `5fbf5889ec` during this research, but the diff touches no `app/public/data` file and only cosmetic classes in `props-board.tsx`.
**Live basis:** curl of `https://gametimepicks.yashwantbalaji.com/` on 2026-10-18. Pages scanned: 384, all HTTP 200. That is every non-player sitemap URL, every `/nfl/game/<id>/` with a committed player board, and a 1-in-15/16/20 sample of player pages.
**Web basis:** public pages accessed 2026-10-18. Several regulator pages (tn.gov, michigan.gov) return 403 to automated fetch. Where that happened, the facts come from the search index and are marked *(search-indexed)*.

**Evidence labels (same as SB):**
- **[code]** = read in GTP source or artifacts.
- **[live]** = seen in Production HTML.
- **[doc-V]** = verified by fetching a public page.
- **[3P]** = third-party claim only.
- **[inference]** = reasoning, not observed.
- **UNVERIFIED** = could not confirm.

Estimates are marked *est.* This is not a legal opinion: every jurisdiction statement is a **counsel item**.

---

## 0. Verdict

1. **Urgent, but it is not only raw data.**
   - Offshore operators' names and prices are **rendered on Production today** on `/mlb` [live].
   - That price is picked by a **"best price for the bettor" rule across every book in the `us` region**, offshore books included [code].
   - The same feed's offshore prices are **inputs to published computations**: the NFL and EPL no-vig consensus, the NFL "Us versus the sportsbooks" panel, and the NFL forecast-ledger market benchmark [code].
2. **Immediate low-risk mitigation:**
   - Add a render-time eligible-operator filter on the two display paths.
   - Add a forward-only selection fix in the two capture normalisers.
   - Leave every historical artifact byte-identical.
   - Both changes alter a public page, so both need **founder approval**.
   - Changing the consensus inputs alters published outputs, so it is a **separate founder decision** (§1.5).
3. **The allowlist** covers 8 operator keys that GTP sees or could see at no extra credit. All 8 appear on the Pennsylvania regulator's list of licensed online sportsbooks.
   - From the `us` region: `draftkings`, `fanduel`, `betmgm`, `williamhill_us`, `betrivers`, `fanatics`.
   - From the `us2` region: `espnbet` (shown as theScore Bet) and `betparx`.
   - The 5 offshore keys are excluded.
   - `hardrockbet*`, `ballybet`, `fliff`, `rebet`, `betanysports` and `courtside` are UNKNOWN or offshore pending sources (§2.2).
4. **Deep links (DraftKings, FanDuel, BetMGM):** no book publishes its own format, so no cell is VERIFIED by a book.
   - Single-selection prefill is documented only by aggregators for all three books.
   - Multi-leg prefill is **NOT SUPPORTED** on public evidence for any of the three (§3.6).

---

## Part 1: Offshore sportsbook exposure

### 1.1 Exposure inventory [code]

**Method:**
- `git grep -l -w` over `origin/main:app/public/data` for the five keys (`bovada`, `mybookieag`, `betus`, `lowvig`, `betonlineag`).
- A second grep for their **display names** (`BetOnline.ag`, `Bovada`, `MyBookie.ag`, `BetUS`, `LowVig.ag`), because MLB stores the provider *title*, not the key.
- Each JSON file parsed, counting fields whose value is an offshore key or title.

| Area (`app/public/data/…`) | Files with offshore refs / files in dir | Records attributed to an offshore book | Field | Nature |
|---|---|---|---|---|
| `nfl/markets/` (captures + `latest.json`) | 89 / 91 | **12,151 of 23,612** per-book team-market rows (51%). Plus **168 of 20,539** displayed prop-price rows, all `betonlineag`: 144 `anytime_td`, 13 receptions, 9 receiving yards, 2 rushing yards, across 35 files | `rows[].books[].book`; `propPrices.rows[].sportsbook` | Per-book prices **and** the chosen display row |
| `nfl/markets/latest.json` alone | 1 | 307 per-book rows (bovada 70, mybookieag 71, betus 64, lowvig 57, betonlineag 29 of 548 total). 7 displayed prop rows (`betonlineag`, anytime TD, 2026-10-11T11:41Z) | as above | Latest NFL capture on main is **7 days old** |
| `mlb/player-props/` | 93 / 94 | **11,666 of 100,809** props (11.6%): BetOnline.ag 10,185, Bovada 1,416, MyBookie.ag 65. Latest (2026-10-17): 30 of 128 | `props[].provider` (title) | **The displayed row** (one price per prop) |
| `soccer/epl/odds/` | 24 / 24 | 1,344 refs (mybookieag 410, bovada 359, betus 235, lowvig 170, betonlineag 170) | `bookmaker` | Per-book rows behind the consensus |
| `ufc/odds-snapshots/` | 2 / 2 | 20 (`betonlineag`) | `bookmaker` | Per-book snapshot |
| `world-cup/` (market-outlook ×9, expanded-markets ×4, player-projections ×5, projections ×1) | 19 | 154 | `bookmaker`/`sportsbook`/`provider` | Historical (June–July 2026) |
| `methodology/launch/dual-bank-builder-*.json` | 2 | 5 **published Bank Builder legs** (betonlineag 4, mybookieag 1; World Cup totals; settled) | `provider` | Historical published card |
| `mlb/diamond-specials/2026-06-23.json` | 1 | 2 **published card legs** (BetOnline.ag; `combinedOdds: 121`) | `provider` | Historical published card |
| `nfl/player-board/401872960.json`, `nfl/live-props/401872960.json`, `nfl/end-zone-vault/2026-09-25.json` | 3 | 1 each (`betonlineag`, anytime TD) | `market.sportsbook` / `marketPrice.sportsbook` | Display rows |
| `previews/june20/player-projections.json` | 1 | 11 (`bovada`) | | Historical preview |
| `mlb/team-markets`, `mlb/home-run-props`, `mlb/homer-nukes`, `parlays/**`, `bank-builder`, `moonshot`, `results` | 0 | 0 | | Clean |

**Parlay Lab is clean.**
- Parlay artifacts carry `bookmaker: draftkings` 165,857 times and `fanduel` 3,044 times, and nothing else [code].
- Their source is the pipeline's `ODDS_BOOKMAKERS = draftkings,fanduel` (`pipeline/config.py:188-191`).

### 1.2 What users see: rendered vs downloadable vs computed

| Surface | Class | Evidence |
|---|---|---|
| **`/mlb` Props Board** (batters/pitchers) | **RENDERED** | **[live]** 5 `BetOnline.ag` badges in the server-rendered default view, beside "Elite"/"Playable" confidence chips and an implied-%. The hydration payload holds 252 props: Bovada 32, BetOnline.ag 26, i.e. 23% offshore, which render when the reader filters or expands. **[code]** `app/src/components/mlb/props-board.tsx:195,220` prints `p.provider`. The confidence tier is computed from that price (`:28-33`). `app/src/lib/mlb/mlb-props.ts:85-120` loads it. The page caption reads "confidence is a market read, not a model claim" |
| **How that price was chosen** | **COMPUTED: best price** | `app/src/lib/mlb/ingest-normalize.ts:75-102`: "Pick the best (most favorable to the bettor…) price … across books", with `o.price > existing.americanOdds` and `provider: bk.title`. This is line shopping across all `us` books, offshore included. It is the exact policy that `prop-display-selection.mjs:33` (NFL, founder 2026-09-24) forbids. The best-price rule biases toward the most generous book and therefore lowers the shown implied % [inference] |
| `/mlb` and `/build` swap bench | **COMPUTED** (dormant) | `app/src/app/build/page.tsx:70-72` and `app/src/app/mlb/page.tsx:545` hand MLB board rows to `toSwapCandidate` (`mlb-props.ts:16-28`). That drops `provider` and keeps `americanOdds`. `app/src/lib/parlays/leg-swap.ts:65-69` then recomputes a combined price. Result: a **cross-book, unattributed** combined price that can include an offshore leg. Dormant today because the risk ladder has 0 cards (`parlays/risk-ladder/latest.json`, 2026-10-17) |
| NFL game page player board, anytime-TD cell | **RENDERED on interaction** | `app/src/components/prediction/prediction-board.tsx:125-142` maps `betonlineag → "BetOnline"` (also bovada, lowvig, mybookieag). `:176` prints it first in the market cell. **[live]** `/nfl/game/401872960/` payload carries `"sportsbook":"betonlineag"`. The default server-rendered tab shows DraftKings (15×), so the BetOnline cell appears only after the reader switches family/row (UNVERIFIED which interaction). No other scanned game page carries one |
| NFL prop display choice | **COMPUTED** | `app/src/lib/sports/odds/prop-display-selection.mjs:62`: DraftKings → FanDuel → `ranked[0]`. Ranking is by coverage, then key ascending. Step 3 has **no licensed-book filter**, so `betonlineag` (sorts before `betrivers`, `betus`, `bovada`) can win |
| NFL "Us versus the sportsbooks" | **COMPUTED → RENDERED (no names)** | `app/src/app/nfl/game/[eventId]/page.tsx:665-672` shows "read from N sportsbooks' odds with their built-in margin removed". `app/scripts/nfl/capture-nfl-odds.mjs:562` calls `twoWayConsensus(books)` (`app/src/lib/sports/odds/consensus.mjs:34-64`, median across **all** books). Offshore are 5 of up to 11 books |
| NFL forecast ledger / settlement benchmark | **COMPUTED → RECORD** | `app/src/lib/forecast-ledger/adapters/nfl.mjs:82,118,147` records `consensus of N books` as the market block. `app/scripts/nfl/settle-nfl-experimental.mjs:180-184` scores the market benchmark (Brier/log loss) from it |
| EPL legs / board | **COMPUTED** | `app/scripts/epl/capture-epl-odds.mjs:299-322` takes the median per outcome across books (11 books, 5 offshore, in `latest.json` 2026-10-17T22:49Z). `app/src/lib/products/eligible-leg/normalize-epl.mjs:25` prices legs as `consensus(N books)`. UFC uses the same pattern (`normalize-ufc.mjs:28`). [live] `/epl` and `/ufc` show no offshore names |
| `/markets`, `/build`, `/`, `/nfl`, `/live`, `/today`, `/results`, `/bank-builder`, `/moonshot`, `/methodology`, `/world-cup` | Not rendered | [live] 0 occurrences of any offshore name or key (2026-10-18) |
| All `app/public/data/**` files above | **DOWNLOADABLE** | Public static JSON. Anyone can fetch them |

**Sensitivity check [inference; my recomputation, not GTP code].**
- Recomputing the `latest.json` NFL consensus without the 5 offshore books moves the no-vig home-win probability by a median of **0.17 pp** (p90 0.55 pp, max 1.11 pp) across 77 events.
- It moves the median total line on 20 of 77 events, by at most 0.5.
- **The direction of any effect on GTP's scoring claims is unknown.** No claim is made that either consensus is better.

### 1.3 Where the keys come from [code]

Every live capture uses `regions=us`. No capture requests `us2` (`.env.example:122` and `pipeline/config.py:182` only warn that it doubles cost). The `us` region is defined by the provider and contains exactly the 11 keys GTP sees:
- 6 licensed: `draftkings`, `fanduel`, `betmgm`, `williamhill_us`, `betrivers`, `fanatics`;
- 5 offshore: `betonlineag`, `betus`, `bovada`, `lowvig`, `mybookieag`.

Source: the-odds-api.com/sports-odds-data/bookmaker-apis.html [doc-V], which makes no licensing statement.

| Script | Request | Bookmaker filter |
|---|---|---|
| `app/scripts/nfl/capture-nfl-odds.mjs:72,228,306` | bulk team markets + per-event props, `regions=us` | **None.** All books kept; display ladder as §1.2 |
| `app/scripts/nfl/capture-nfl-live-odds.mjs:179`, `probe-nfl-live-odds.mjs:185` | live `regions=us` | None |
| `app/scripts/ingest-mlb-slate.mjs:98` (→ `ingest-normalize.ts:77`) | per-event props `regions=us` | **None; best price wins** |
| `app/scripts/ingest-mlb-team-markets.mjs:27,91,126,188` | `regions=us` | Prefers `draftkings`, else **first book returned**. The artifact-level `bookmaker` is then stamped `draftkings` regardless (`:188`), a latent mislabel. 0 offshore rows found today |
| `app/scripts/epl/capture-epl-odds.mjs:58,170`; `app/scripts/ufc/capture-ufc-odds.mjs:58,139` | `regions=us` | None; median consensus |
| `capture-mlb-pregame-markets.mjs:38`, `capture-mlb-pregame-player-props.mjs:47` (internal archive), `ingest-wc-expanded-markets.mjs:72`, `fetch-mlb-closing-odds.mjs`, `ops/odds-canary.mjs:99` | `regions=us` | None |
| `pipeline/config.py:184-191` (MLB/NBA leans → Parlay Lab) | `regions=us` | **`bookmakers=draftkings,fanduel`** |
| `app/scripts/fetch-alternate-lines-shadow.mjs:39-40` | `regions=us` | `bookmakers=draftkings,fanduel` |

**Cost of a provider-side filter [doc-V]** (the-odds-api.com/liveapi/guides/v4/):
- `bookmakers=` takes priority over `regions`.
- "every group of 10 bookmakers is the equivalent of 1 region."
- So up to 10 allowlisted keys, mixing `us` and `us2`, cost the **same credits** as `regions=us` today.

### 1.4 Jurisdiction context (counsel items, no legal opinion)

| Key / brand | Public regulator facts | Source (accessed 2026-10-18) |
|---|---|---|
| `bovada` | MGCB cease-and-desist to operator Harp Media B.V., 2024-05-30, describing "illegal online gaming sites" | michigan.gov/mgcb/news/2024/05/30/mgcb-issues-cease-and-desist-letter-to-bovada *(search-indexed; fetch 403)* |
| | Tennessee SWC fined it $50,000 (Oct 2024); it left TN | legalsportsreport.com/233906 *(search-indexed)* |
| | Florida Gaming Control Commission cease-and-desist (Feb 2025) | legalsportsreport.com/223576 *(search-indexed; fetch 403)* |
| | Connecticut DCP cease-and-desist (2024) | [3P] via search |
| `betonlineag` | TN SWC cease-and-desist 2025-05-20 | tn.gov/swac/…/2025/5/20/swc-sends-cease-and-desist-letter-to-illegal-sportsbook-betonline.html *(search-indexed; fetch 403)* |
| | Later TN $50,000 fine | sbcamericas.com/2025/07/15/tennessee-fines-5-offshore-sportsbooks/ *(search-indexed)* |
| `mybookieag`, `betus` | TN SWC fined each $50,000, 2025-04-17 | tn.gov/swac/…/2025/4/17/swc-issues--100-000-in-fines-to-two-illegal-offshore-sportsbooks.html *(search-indexed)* |
| | Florida cease-and-desist (Feb 2025) | as above |
| `lowvig` | TN SWC fined it $50,000, 2025-06-18, as an "illegal offshore" operator | tn.gov/swac/…/2025/6/18/illegal-offshore-sportsbooks-lowvig--sportsbetting-ag-fined--50-000-each-by-the-swc.html *(search-indexed)* |
| All five | **Absent** from PGCB's list of 11 licensed online sportsbooks | gamingcontrolboard.pa.gov/online-sports-wagering-licensed-operators [doc-V] |
| | PGCB warns bettors against illegal offshore sites (2025-09-03; names none) | gamingcontrolboard.pa.gov/news-and-transparency/press-release/pa-gaming-control-board-warns-bettors-against-playing-illegal [doc-V] |
| | AGA's 2022 letter asked DOJ to investigate Bovada, MyBookie and BetOnline | cnbc.com/2022/07/07/… *(search-indexed; fetch 403)* |

**Counsel questions:**
- **C1.** Does *displaying* (not linking) an unlicensed operator's name and price on a US-audience site create exposure in any target state, including under advertising rules such as Ohio OAC 3775-16-08 (SB §2.4)?
- **C2.** Do the historical published cards that name an offshore book need a label? *Labelling only; no data change is proposed.*
- **C3.** Does using offshore prices only inside an unnamed consensus raise any issue?

### 1.5 Urgency assessment and mitigation

**Assessment.**
- This goes beyond a JSON-only concern. A reader of `/mlb` sees an unlicensed operator named beside a price that GTP chose *because it was the most favourable*, plus a confidence chip derived from it.
- That price is in effect a recommendation of that operator's line. It contradicts the repo's own 2026-09-24 "NOT LINE SHOPPING" rule [code + live].
- Legal significance is a counsel question (C1). The trust risk is immediate either way [inference].

**Mitigations, lowest risk first.** None is authorized by this doc.

| # | Change | Files | Output effect | Approval |
|---|---|---|---|---|
| M-1 | **Render-time filter:** drop rows whose book is not `eligible` from public price displays. MLB board rows simply disappear; nothing is re-priced. Also filter the swap pool | `app/src/lib/mlb/mlb-props.ts` (`loadMlbPropsBoard`, `toSwapCandidate`); `app/src/components/prediction/prediction-board.tsx` (refuse an ineligible `sportsbook` and show the "not shown" state); new `app/src/lib/books/eligible-operators.mjs` | Fewer MLB board rows (~23% of today's payload). Confidence chips are unchanged for the rows that remain. **No forecast, card or record changes** | **Founder** (public page change). 1 code-merge build, 0 data builds |
| M-2 | **Forward-only selection fix:** MLB props use the NFL ladder (DK → FD → most-coverage) restricted to `eligible`, replacing best price. NFL `selectPropPrices` step 3 is restricted to `eligible` | `app/src/lib/mlb/ingest-normalize.ts:75-111`; `app/src/lib/sports/odds/prop-display-selection.mjs:62` | Future MLB board prices become reference-book prices, so implied % and tiers shift. Future NFL display rows change book. Only for captures after merge | **Founder** (changes future published values) |
| M-3 | **Consensus inputs:** licensed-only median for NFL, EPL and UFC | `capture-nfl-odds.mjs:562`, `consensus.mjs`, `capture-epl-odds.mjs:299-322`, `capture-ufc-odds.mjs` | Changes "Us versus the sportsbooks", EPL/UFC leg prices and the NFL forecast-ledger market benchmark, forward only (§1.2 sensitivity) | **Founder decision** (changes outputs and benchmarks). Shadow both versions first (task SB01-T5) |
| M-4 | Provider-side `bookmakers=` allowlist on captures | the capture scripts in §1.3 | Offshore books never acquired. Same credits (§1.3). Changes consensus like M-3 | **Founder**, and only after M-3 is decided |

**Historical data stays unchanged.**
- All 140 key-matched and 94 title-matched public files, every capture, ledger, published card and record stay **byte-identical**.
- Nothing is deleted, rewritten, re-derived or re-stamped.
- M-1 is a render-time filter, and M-2 to M-4 are forward-only.
- Any historical label (C2) would be added at display time only, after counsel.
- Tests must assert that ledger, risk-ladder, Results and `lab-ledger.json` hashes are unchanged (SB M1 exit gate).

---

## Part 2: Eligible-operator allowlist policy (draft)

### 2.1 Criteria

An operator key is **`eligible`** only if all four hold:
1. It holds an online sports-wagering licence in **at least one** US regulated jurisdiction, evidenced by a regulator's own list or press release, cited with its access date.
2. It is not the subject of a US regulator cease-and-desist or fine for *unlicensed* wagering.
3. It is a sportsbook. DFS (`us_dfs`) and exchange or prediction-market keys (`us_ex`: kalshi, polymarket, novig, prophetx and others) are **out of scope** and need a separate founder decision.
4. Its display name follows provider metadata, e.g. `espnbet` → "theScore Bet".

**Also required:**
- **States stay data, not code.** Each entry carries `licensedIn: [{state, source, accessed}]`. The state list (legal online states, minimum age) is a separate data table.
- **Review cadence:**
  - Monthly.
  - At each sport's season start.
  - On any provider bookmaker-list change: a new key seen in a capture fails CI until classified (task SB01-T2).
- **Default:** an unknown key is **`unknown`, which is treated as ineligible** (fail-closed).

### 2.2 Initial candidate list (keys GTP sees or could request at the same credit cost)

| Key | Brand | Region | Class | Evidence |
|---|---|---|---|---|
| `draftkings` | DraftKings | us | **licensed-US** | PGCB list [doc-V] |
| `fanduel` | FanDuel | us | **licensed-US** | PGCB list [doc-V] |
| `betmgm` | BetMGM | us | **licensed-US** | PGCB list [doc-V] |
| `williamhill_us` | Caesars | us (paid plans) | **licensed-US** | PGCB "Caesars Sportsbook" [doc-V] |
| `betrivers` | BetRivers | us | **licensed-US** | PGCB list [doc-V] |
| `fanatics` | Fanatics | us (paid plans) | **licensed-US** | PGCB list [doc-V] |
| `espnbet` | theScore Bet | us2 | **licensed-US** (not captured today) | PGCB "theScore Bet" [doc-V]; relabel per Odds API [doc-V] |
| `betparx` | betPARX | us2 | **licensed-US** (not captured today) | PGCB "BetParx" [doc-V] |
| `hardrockbet`, `_az`, `_fl`, `_oh` | Hard Rock Bet | us2 | **unknown** | Not on PGCB list. Licences elsewhere are UNVERIFIED (no regulator page fetched) |
| `ballybet` | Bally Bet | us2 | **unknown** | Not on PGCB list. UNVERIFIED |
| `fliff`, `rebet`, `courtside` | Fliff / ReBet / Courtside | us2 | **unknown** | Not on PGCB list. Product model (social/sweepstakes?) UNVERIFIED |
| `betanysports` | BetAnything | us2 | **offshore** | TN SWC fine (2025) *(search-indexed)* |
| `bovada`, `betonlineag`, `mybookieag`, `betus`, `lowvig` | — | us | **offshore** | §1.4 |
| `pinnacle`, `pointsbetus`, `bet365`, `hardrockbet`, `ballybet`, `windcreek` (label maps only) | — | — | as above | Appear only in label maps (`parlay-ticket-card.tsx`, `prediction-board.tsx`, `market-coverage-panel.tsx`), not in data. Treat as `unknown` |

### 2.3 How the allowlist applies

- **(a) Display.** Only `eligible` books may be **named or priced** on any public surface. An ineligible book becomes "not shown" and is never relabelled. This is M-1.
- **(b) Smart Betslip comparison (SB-02).**
  - Only `eligible` books get a quote row.
  - A per-book combined price requires every leg EXACT at that one book.
  - `unknown` books never appear.
- **(c) Model and consensus inputs.** These are a **founder decision**, because the choice changes outputs (M-3). Until it is made:
  - inputs stay as they are;
  - any public consensus text should say "N sportsbooks" with N counting what was actually used. It already does.
- **Ask** keeps refusing sportsbook links (`app/src/lib/ask/contract.mjs:376-384`). The allowlist does not unlock links; that is SB-03 and counsel.

### 2.4 Versioning

- **Data:** `app/src/lib/books/eligible-operators.v1.json`, with `{policyVersion, reviewedAt, reviewer, operators:[{key, brand, class, regions, licensedIn[], evidence[], notes}]}`.
- **Loader:** `app/src/lib/books/eligible-operators.mjs`, which exports `isEligible(key)`, `labelFor(key)` and `POLICY_VERSION`. Labels from `sportsbook-comparison.ts:49-59`, `prediction-board.tsx:125-141` and `market-coverage-panel.tsx` are folded in.
- **Tests:** `eligible-operators.test.mjs` must cover:
  - every key seen in committed captures is classified;
  - offshore and unknown keys return false;
  - every eligible entry has ≥1 cited licence;
  - the label map is the single source.
- **Stamping:** artifacts produced under the policy record `operatorPolicyVersion`.
- **Changes:** a key changes class only through a PR that cites a source.

---

## Part 3: Implementation-ready recommendations

### 3.1 Eligibility and jurisdiction gating

- **No IP geolocation.**
  - The site is static, so IP lookup would need middleware or functions (new invocations; COST-001).
  - IP location is not a compliance control.
  - Books run their own geolocation at login and wager time [inference; SB §2.1 notes BetMGM hosts are state-specific].
- **State self-selection.** A reader-chosen state is stored **browser-locally only** (pattern: `app/src/lib/slip/slip-store.ts`). It is never sent to the server and never placed in a URL.
- **Data table** `app/src/lib/books/jurisdictions.v1.json`, one row per state: `{state, onlineSportsLegal, minAge, source, accessed}`. Seed facts and their status:
  - 18+ in NH, KY, WY, RI and DC is [3P]; other legal states are 21+ [3P]; operators may require 21+ where the law says 18 [3P]. All UNVERIFIED until checked against each regulator.
  - About 30–31 states plus DC have online wagering [3P, counts disagree].
- **Gate rule (proposed):**
  - Book-facing surfaces (SB-03+) need a 21+ self-attestation **and** a selected state where online wagering is legal. Otherwise they show comparison text only, with no links.
  - SB-02 (quotes, no links) may render without the gate if counsel agrees (C4).
  - GTP's own draft minimum age is 18 (`app/src/lib/legal/texts.mjs:42`), which is counsel question 7.

### 3.2 Existing odds data and freshness limits [code]

| Sport | Cadence (workflow) | Notes |
|---|---|---|
| NFL team markets and props | `nfl-event-window.yml`: 14:30, 15:00 and 21:00 UTC daily; 13:00 UTC Fri/Sat/Sun full sweep | 45-min duplicate refusal. Receipt-gated. **Latest on main: 2026-10-11T11:41Z** (7 days old on 10-18) |
| NFL live | `nfl-live-props.yml`: every 15 min in game windows | Bounded probe/pilot; refuses without a probe pass |
| MLB props and team markets | `morning-projections.yml` 10:47 UTC → `mlb-daily-production.yml` (backstop 11:17 UTC) | `mlb-afternoon-topup.yml` 19:30 UTC re-dispatches only when coverage is missing. Latest props on main: 2026-10-17T14:04Z |
| EPL | `epl-matchweek.yml`: pre-cluster crons (Thu–Mon) | Latest on main: 2026-10-17T22:49Z |
| UFC | `ufc-fight-week.yml`: Tue/Thu/Sat 11:00 UTC plus 13:00 UTC other days | |

- The provider refreshes every 40–60 s (SB §2.5, doc-V).
- `PRICE_MAX_AGE_DAYS = 3` (`app/src/lib/parlays/card-leg-eligibility.mjs:21`) is a **paper-card publishability** rule and **must not** gate comparison quotes.
- SB-02 uses the SB §2.5 bands (*est.*, founder to set, B5): ≤15 min show with the time; 15 min–6 h show the age; >6 h or after the start, hide.
- With the cadences above, almost every quote falls in the "show age" or "hide" band [inference]. The copy must say "posted at", never "current".

### 3.3 `bookSelection` record (schema draft, `gtp.bookSelection@1`)

```json
{
  "schema": "gtp.bookSelection@1",
  "operatorPolicyVersion": "v1",
  "sport": "nfl",
  "canonicalEventId": "nfl-401872982",
  "providerEventId": "<32-hex Odds API id>",
  "bookKey": "draftkings",
  "market": { "gtpFamily": "anytime_td", "providerMarketKey": "player_anytime_td", "isAlternate": false },
  "participant": { "gtpEntityId": "nfl-athlete-4882093", "providerDescription": "<as returned>", "resolvedBy": "nfl/player-identity@<ver>" },
  "side": "YES", "line": null, "priceAmerican": -105,
  "providerLastUpdate": "<market.last_update>", "capturedAt": "<capture NOW>", "captureReceipt": "<ledger fingerprint>",
  "bookIds": null,
  "links": null,
  "match": { "level": "EXACT", "failed": [] }
}
```

- `bookIds` stays `null` until SB-04 (`includeSids`: `{eventSid, marketSid, outcomeSid}`).
- `links` stays `null` until SB-03/SB-04 (`{event, market, outcome}`, provider-supplied only, never constructed).
- `match.level` is one of `EXACT`, `PARTIAL` or `NONE`. `failed` lists the SB §4.2 step names.

### 3.4 Player and selection mapping (fail-closed)

- **Joins:** the SB §4.2 seven steps, implemented in new `app/src/lib/books/quote-join.mjs`.
- **NFL:** `app/src/lib/sports/nfl/player-identity.mjs` resolves `description` to an athlete ID.
- **MLB:** the props artifact has **no player ID**; it joins identity by `gameId|name` (`mlb-props.ts:31-69`). An ID-keyed registry is required before any MLB quote is EXACT (SB-01, 2–4 d *est.*).
- **Exact line only:** `point === line`, with no rounding and no substitution of a main line by an `*_alternate` key.
- **Single source:** quote and identity must come from the same capture.

### 3.5 Multi-leg compatibility (same-book rule)

- A combined price is shown only when **one eligible book prices every leg EXACT in the same capture**.
- Never cross-book. This rule already exists in `prop-display-selection.mjs:37-41` and is violated today only by the dormant swap path (§1.2).
- D5 keeps a single event per card (`app/src/lib/parlays/card-events.mjs:1-15`), so multiplying legs is valid only across distinct events.
- Never present multiplied legs as a book's same-game price (SB §2.3).

### 3.6 Official deep links: DraftKings, FanDuel, BetMGM

No book publishes a deep-link or betslip format in its own documentation (SB §2.1; re-searched 2026-10-18).

**VERIFIED** would require the book's own docs. "agg-doc" means an aggregator documents it.

| Book | Event-page link | Single-selection prefill | Multi-leg prefill |
|---|---|---|---|
| **DraftKings** | **UNVERIFIED.** The Odds API returns event links "if available" with no per-book list [doc-V: the-odds-api.com/releases/deep-links.html] | **UNVERIFIED (agg-doc).** SharpAPI table: deep link yes, preselect yes, not state-specific, measured 2026-08-25, page updated 2026-10-17 [doc-V: docs.sharpapi.io/api-reference/deeplinks]. Its `…/event/12345?outcomes=abc123` is illustrative only | **NOT SUPPORTED** on public evidence. Action Network Playbook claims parlay loading [3P], with no format |
| **FanDuel** | **UNVERIFIED (agg-doc).** The Odds API shows a FanDuel event URL example [doc-V] | **UNVERIFIED (agg-doc).** Odds API example `sportsbook.fanduel.com/addToBetslip?marketId=42.448600011&selectionId=29165` [doc-V]. SharpAPI: preselect yes [doc-V]. A state host (`nj.sportsbook…`) appears in an aggregator example [3P] | **NOT SUPPORTED** on public evidence. Action Network "loading picks and parlays directly into FanDuel" via QuickSlip, no format given (page updated 2026-01-12) [3P: actionnetwork.com/playbook/news/fanduel] |
| **BetMGM** | **UNVERIFIED** | **UNVERIFIED (agg-doc).** SharpAPI: preselect yes, **state-specific** [doc-V]. The `?options=` pattern is not found in any source | **NOT SUPPORTED** on public evidence |

- **Rule:** GTP never builds a book URL from a pattern. Links come only from provider `link` fields on EXACT outcomes (SB §4.4).
- **First evidence step (SB-04):** a founder-authorized probe of ≤5–20 credits (*est.*) with `includeLinks=true&includeSids=true` to measure per-book coverage.
- **Credit cost** of `includeLinks`/`includeSids`: UNVERIFIED (docs silent, re-checked 2026-10-18).

### 3.7 Integration partners

Prices are from SB §2.2 (doc-V 2026-10-17) unless marked otherwise.

| Provider | Price | Rate / freshness | Links |
|---|---|---|---|
| The Odds API (current) | $30 / 20K credits; $59 / 100K; $119 / 5M; $249 / 15M | Provider updates 40–60 s. Per-second request limit UNVERIFIED | Event/market/outcome "if available". Coverage per book UNVERIFIED |
| SharpAPI | Free (60 s delay, 2 books); $79; $229; $399 | Free-tier delay as stated; others UNVERIFIED | 302 redirect per odd. `state=` routing only, "does not filter odds" [doc-V 10-18] |
| SportsGameOdds | Free (10 min); $99 (3 min); $299 (sub-minute) | As stated | Per-leg links "not guaranteed" to prefill a multi-leg slip |
| OpticOdds | Contact sales; ~$5K/month/sport [3P, UNVERIFIED] | UNVERIFIED | `deep_link` gated by key permission; parlay `deep_link_urls` null in examples |
| Unabated / Gambly | Free tier requires surfacing Gambly links; $799 / $2,999 UNVERIFIED | 15–30 s UNVERIFIED | Claims parlays/SGPs; no book list |
| OddsBlaze | ~$299/month UNVERIFIED | UNVERIFIED | Claimed |

None is recommended for purchase. Any of them is a B4 budget decision plus counsel (B3).

### 3.8 Responsible-gambling safeguards and disclosure drafts

**Safeguards (proposed):**
- No "best", "lock" or "bet now" wording, and no sort or highlight by price. Neutral rows.
- No links on Longshot or Moonshot (SB §8).
- No links on live or in-play surfaces.
- Interstitial before any outbound link (SB-03).
- 21+ self-attestation for book-facing surfaces.
- State-specific helpline text from the jurisdictions table.
- No click data enters selection or ranking.
- Paper-only records stay separate (`lab-ledger.json` `PAPER_ONLY`).

**DRAFTS FOR COUNSEL; NOT FOR PUBLICATION.** No wording below is approved, and none changes any current page.
- **D-1 (quote row):** "Price posted by {Book} at {h:mm} ET ({age} ago). Sportsbooks change prices often; the price at {Book} now may be different. GameTimePicks does not take bets."
- **D-2 (eligibility):** "We show prices only from sportsbooks licensed by at least one U.S. state regulator. Online sports betting is legal only in some states, and you must meet your state's minimum age (21 in most states)."
- **D-3 (offshore exclusion):** "Some odds feeds include sites that no U.S. state regulator has licensed. We leave those out of our price displays."
- **D-4 (relationship):** "GameTimePicks is not affiliated with any sportsbook shown and receives no payment from them." *Only valid if B3 = no compensation.*
- **D-5 (help):** "If gambling is causing problems for you or someone you know, call 1-800-GAMBLER." Add {state helpline} per jurisdiction table.
- **D-6 (model vs market):** "A sportsbook's price is the book's number, not a GameTimePicks forecast, and our models are not shown to beat the betting market."

### 3.9 Vercel and infrastructure cost controls

- **Data:** quotes ride the existing capture commits (SB §7 Option A): **0 added data builds and 0 added credits** [code: `app/scripts/vercel-ignore-build.sh:90`, any `app/public/data` write builds].
- **Code:** M-1, M-2 and the allowlist each ship in a code merge (1 Production build per merge). Batch them into one PR.
- **No new runtime:**
  - no middleware or geolocation;
  - no browser-side provider key;
  - no extra price commits.
  - Faster freshness belongs to COST-001 task 7 (runtime store).
- **Local prototype:** SB-02 is built and reviewed on localhost against committed artifacts. Shadow artifacts stay uncommitted until approved, so they cost no builds.
- **Provider allowlist:** a `bookmakers=` list of ≤10 keys costs the same credits as `regions=us` [doc-V] (M-4, if approved).

### 3.10 SB-01 → SB-02 execution-ready task list

- Estimates are *est.* dev-days for one engineer.
- **NL** = can proceed without legal approval (still needs founder go-ahead to start, per roadmap §23).
- **F** = founder approval required. **C** = counsel required.

| ID | Task | Files | Depends | Acceptance test | Est. | Gate |
|---|---|---|---|---|---|---|
| SB01-T1 | Eligible-operator data + loader | new `app/src/lib/books/eligible-operators.v1.json`, `eligible-operators.mjs`, `.test.mjs` | — | All 11 captured keys classified; 5 offshore → false; each eligible key cites ≥1 licence; unknown → false | 0.5–1 | NL |
| SB01-T2 | Public-data exposure guard (report-only test) | new `app/src/lib/books/public-exposure.test.mjs` | T1 | Reads committed artifacts; fails on any **new** unclassified key; snapshots §1.1 counts; changes no data | 0.5 | NL |
| SB01-T3 | Render-time filter (M-1) | `app/src/lib/mlb/mlb-props.ts`, `app/src/components/prediction/prediction-board.tsx`, `app/src/app/build/page.tsx`, `app/src/app/mlb/page.tsx` | T1 | Rendered `/mlb`, `/build` and NFL game HTML (local build) contain 0 offshore names; ladder, lab-ledger and Results hashes unchanged; forecast values unchanged | 1–1.5 | **F** |
| SB01-T4 | Forward-only selection fix (M-2) | `app/src/lib/mlb/ingest-normalize.ts`, `app/src/lib/sports/odds/prop-display-selection.mjs` (+ tests) | T1 | Constructed evidence: an offshore book with the best price is never chosen; DK → FD → eligible coverage ladder; historical files untouched | 1–2 | **F** |
| SB01-T5 | Consensus shadow (M-3 evidence) | new `app/scripts/books/shadow-licensed-consensus.mjs` (local, writes to scratch, uncommitted) | T1 | Per event: all-book vs eligible-only consensus deltas, reported with no claim of improvement | 0.5–1 | NL (decision **F**) |
| SB01-T6 | MLB ID-keyed player registry | new `app/src/lib/sports/mlb/player-identity.mjs` | — | Unresolved names → quarantine; doubleheader-safe; no name-only EXACT | 2–4 | NL |
| SB01-T7 | Jurisdictions table + gate logic (unpublished) | new `app/src/lib/books/jurisdictions.v1.json`, `eligibility-gate.mjs` | — | Unknown state → no links; age below the state minimum → no links; every row sourced | 1–2 | NL to build; **C** to publish |
| SB01-T8 | Counsel packet addendum (C1–C4, D-1…D-6) | `docs/legal/COUNSEL_REVIEW_BRIEF.md` (docs PR) | — | Questions listed; no copy published | 0.5 | NL (doc) |
| SB01-T9 | Fix the MLB team-market label stamp | `app/scripts/ingest-mlb-team-markets.mjs:126,188` | T1 | Artifact `bookmaker` equals the book actually used; non-eligible fallback refused | 0.5 | **F** (forward output) |
| SB02-T1 | `bookSelection` schema + validator | new `app/src/lib/books/book-selection.mjs` | T1 | Rejects missing `capturedAt`, ineligible `bookKey`, `isAlternate` on a main leg, and non-null `links` before SB-03 | 1 | NL |
| SB02-T2 | Exact-match join | new `app/src/lib/books/quote-join.mjs` | T1, SB02-T1, (T6 for MLB) | The SB §4.2 seven steps each have a failing fixture; PARTIAL never carries a price | 1.5–2 | NL |
| SB02-T3 | Freshness bands | new `app/src/lib/books/quote-freshness.mjs` | — | Bands are data; after-start → hidden; `PRICE_MAX_AGE_DAYS` not imported | 0.5 | NL (band values **F**, B5) |
| SB02-T4 | Local quote artifact producer (NFL team markets first) | new `app/scripts/books/build-book-quotes.mjs` (reads committed captures; local output only) | SB02-T1…T3 | Deterministic; same input gives a byte-identical output; ladder and lab-ledger hashes unchanged | 1 | NL |
| SB02-T5 | **Local-only comparison prototype** | `app/src/components/slip/slip-drawer.tsx`, `app/src/components/parlay-ticket-card.tsx` behind a local flag | SB02-T4 | Localhost only; neutral rows; no "best"; single-book combined only; 320/390/768/1440 px | 1.5–2 | NL (local); public **F** (B2) + copy **C** |
| SB02-T6 | Integrity invariants | `app/src/lib/books/integrity.test.mjs` | SB02-T4 | Card selection byte-identical with and without the books layer; no cross-book combined price | 0.5–1 | NL |
| SB02-T7 | Public release of SB-02 | merge + 1 build | all above | Founder review of the localhost candidate; counsel on copy if positioning changes | — | **F + C** |

**Totals (*est.*):**
- SB-01: 7–13 d.
- SB-02: 6–7.5 d.
- Together they fit inside the roadmap's SB-01/SB-02 envelope once the MLB registry is counted.

**Sequencing:**
1. T1 and T2 come first (no output change).
2. T3 is the near-term trust fix, awaiting the founder.
3. T4 and T5 follow before the next MLB season or NFL prop capture the founder wants corrected.

---

## Founder and counsel items raised here

- **F-1:** approve M-1 (render filter) and its timing relative to the Oct 20 launch.
- **F-2:** approve M-2 (forward selection fix; ends MLB best-price selection).
- **F-3:** decide M-3/M-4 (consensus inputs), after the T5 shadow.
- **F-4:** classification of `unknown` us2 books.
- **F-5:** whether DFS and exchange keys are ever in scope.
- **C1–C3** (§1.4). **C4:** may SB-02 quotes render without the 21+/state gate?

## Sources (accessed 2026-10-18 unless noted)

- the-odds-api.com/sports-odds-data/bookmaker-apis.html; the-odds-api.com/liveapi/guides/v4/; the-odds-api.com/releases/deep-links.html [doc-V]
- docs.sharpapi.io/api-reference/deeplinks [doc-V]; actionnetwork.com/playbook/news/fanduel [3P]
- gamingcontrolboard.pa.gov/online-sports-wagering-licensed-operators; gamingcontrolboard.pa.gov/news-and-transparency/press-release/pa-gaming-control-board-warns-bettors-against-playing-illegal [doc-V]
- michigan.gov/mgcb/news/2024/05/30/mgcb-issues-cease-and-desist-letter-to-bovada; tn.gov/swac newsroom 2025/4/17, 2025/5/20, 2025/6/18; legalsportsreport.com/223576, /233906, /237614; sbcamericas.com/2025/07/15/tennessee-fines-5-offshore-sportsbooks/; cnbc.com/2022/07/07/casino-industry-urges-federal-prosecutors-to-crack-down-on-illegal-operators-.html *(search-indexed; direct fetch returned 403)*
- Age and legal-state counts: kindbridge.com/sports-betting-age-by-state/, igamingbusiness.com/sports-betting/new-hampshire-legal-betting-age-18/, gambling.com/us/sportsbooks/legal [3P, UNVERIFIED]
- SB (2026-10-17 web basis) for partner pricing and the state affiliate rules.
