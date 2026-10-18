# Smart Betslip / Parlay Lab V2: technical feasibility (2026-10-18)

**Type:** read-only research. No code, roadmap, config or data changed. No builds, no paid calls, no sign-ups.
**Repo basis:** `origin/main` @ `6de21842dd` (fetched 2026-10-17). Paths are repo-relative; `path:line` refers to that commit.
**Web basis:** public pages accessed 2026-10-17.

**Evidence labels:**
- **[code]** = read in GTP source/artifacts.
- **[doc-V]** = verified on a public page by fetching it.
  - A *book's* own documentation is called out explicitly as such.
  - Otherwise the source is an aggregator/vendor page.
- **[3P]** = third-party claim only.
- **[inference]** = reasoning, not observed.
- **UNVERIFIED** = could not confirm; the reason is given.

Effort and cost figures marked *est.* are estimates.

---

## 1. Executive summary

1. **No sportsbook publicly documents a betslip URL format.**
   - Every known "add to betslip" link comes from aggregator docs, not from the books themselves.
   - The only concrete pattern is FanDuel `addToBetslip?marketId=&selectionId=`, shown in The Odds API's own example.
   - Every format needs book-specific market and selection IDs. [doc-V: the-odds-api.com/releases/deep-links.html]
2. **No source documents a working multi-leg prefill link.**
   - OpticOdds' parlay endpoint has a `deep_link_urls` field, but it is `null` in every example.
   - SportsGameOdds says per-leg links are not guaranteed to prefill a multi-leg slip.
   - Unabated/Gambly *claims* parlay/SGP deeplinks but publishes no book list.
   - A prefilled GTP parlay at a book is therefore **not established**. [doc-V / 3P, §2]
3. **GTP stores no book-side identity.**
   - Capture scripts never request `includeLinks`/`includeSids`. Public market artifacts carry book key, line and price only.
   - Published ladder legs drop the bookmaker. [code: `app/scripts/parlays/build-risk-ladder.mjs:344-350`]
   - The reader's slip identity is name-based, with no event or book. [code: `app/src/lib/slip/leg-identity.ts:10,22-43`]
4. **GTP prices are point-in-time captures, hours or days old by design.**
   - MLB props are captured once each morning.
   - NFL has 2 daily passes plus weekend prop sweeps.
   - Paper cards stay publishable on prices up to **3 days** old. [code: `app/src/lib/parlays/card-leg-eligibility.mjs:21`]
   - The provider refreshes every 40–60 s. [doc-V]
   - So "compare odds" can only ever honestly mean "price at HH:MM, at book X".
5. **Current GTP positions contradict L1+ outright.** Four places say so:
   - The Terms draft says the Site does not "link to or partner with any sportsbook". [code: `app/src/lib/legal/texts.mjs:61`]
   - `/responsible-use` says there are no affiliate links and that commercial messaging means compromise. [code: `app/src/app/responsible-use/page.tsx:58`]
   - Ask refuses sportsbook links. [code: `app/src/lib/ask/contract.mjs:380`]
   - The counsel brief's premise is "no sportsbook links". [code: `docs/legal/COUNSEL_REVIEW_BRIEF.md:9`]
6. **A founder decision already says the displayed price is "NOT LINE SHOPPING".** It was made 2026-09-24. A multi-book "compare/best odds" view would reverse it, so it needs a founder decision. [code: `app/src/lib/sports/odds/prop-display-selection.mjs:23-42`]
7. **Same-game parlays are already excluded from official cards.**
   - Founder decision D5 allows at most one leg per event, "until a real sportsbook SGP receipt or a separately validated joint-pricing model exists". [code: `app/src/lib/parlays/card-events.mjs:1-15`]
   - So L4 has no GTP product to serve today.
8. **The provider's `us` region includes offshore, unlicensed books.** The public NFL artifact contains `bovada`, `betonlineag`, `mybookieag`, `betus` and `lowvig`. [code: `app/public/data/nfl/markets/latest.json`] Any compare or link surface **must** use an allowlist of licensed books.
9. **Affiliate pay models trigger state licensing**:
   - NJ: vendor registration vs ancillary CSIE.
   - PA: registered vs certified.
   - MI: vendor vs supplier.
   - MA and NY: revenue share banned.
   - These are **counsel items**; this doc gives no legal opinion. [§2.4]
10. **Feasibility verdicts:**

| Level | Verdict | Why |
|---|---|---|
| **L0** compare-only, stored prices + timestamp | **FEASIBLE now**, no partner, no paid feed | Data exists [code]. Needs a book allowlist, an age stamp, single-book combined prices, and a founder call on item 6 |
| **L1** open book event page | **Technically feasible, policy-BLOCKED** | Homepage/event links are trivial; The Odds API returns event links "where available" [doc-V]. Blocked by item 5 until founder + counsel act |
| **L2** prefill single leg | **PLAUSIBLE for some books, UNVERIFIED per book** | Odds API `includeLinks`/`includeSids` [doc-V]; per-book coverage unpublished; needs one founder-authorized probe + legal |
| **L3** prefill multi-leg | **NOT SUPPORTED on public evidence** | Only closed/partner products claim it (UNVERIFIED); would need a commercial partner |
| **L4** prefill SGP with live pricing | **NOT FEASIBLE under current policy** | Blocked by D5, request-time paid pricing (OpticOdds, contact sales), and the cost policy |

---

## 2. External findings

### 2.1 Sportsbook capability matrix

Legend:
- **V-agg** = verified in an aggregator's or vendor's public docs (URL given).
- **V-book** = verified in the book's own docs. **No cell reached V-book.**
- **3P** = third-party claim.
- **U** = unverified.
- **NS** = not supported per available docs.

Sources:
- OA = https://the-odds-api.com/releases/deep-links.html and https://the-odds-api.com/liveapi/guides/v4/
- OO = https://developer.opticodds.com/reference/get_fixtures-odds
- SA = https://docs.sharpapi.io/api-reference/deeplinks (table "measured 2026-08-25")
- AN = Action Network Playbook/QuickSlip pages (3P product claims; no URL format published)

| Book | 1. Link/prefill format | 2. Multi-leg | 3. SGP | 4. Book IDs needed / how obtained | 5. Affiliate needed | 6. Geo / state |
|---|---|---|---|---|---|---|
| DraftKings | Single-outcome preselect: **V-agg** (SA "preselect: yes"). `…/event/{id}?outcomes={id}` only as an SA placeholder (U). Not book-documented | 3P (AN Playbook loads parlays) | U | Yes, outcome ID. Via aggregator (SA, OO `dksb://` scheme) | U. Affiliate programs exist (3P directories); aggregator links need only a data plan | SA: not state-specific (V-agg) |
| FanDuel | `sportsbook.fanduel.com/addToBetslip?marketId=42.x&selectionId=n`: **V-agg** (OA example; outcome `sid` = selectionId) | U for URLs. 3P (AN QuickSlip 2023 claims parlays) | 3P (QuickSlip claim) | Yes, marketId + selectionId. OA `includeSids` | U | SA: not state-specific (V-agg) |
| BetMGM | Preselect **V-agg** (SA). `?options=` pattern U | U | U | Yes (inference) | U (BetMGM Partners exists, 3P) | SA: state-specific (V-agg); `sports.{st}.betmgm.com` hostnames (3P) |
| Caesars (`williamhill_us`) | `sportsbook.caesars.com/addToBetslip?marketId=&selectionId=` **V-agg** as an OO example; may be illustrative (shares FanDuel's `42.x` ID shape) | U | U | Yes, OO `deep_link` (permission-gated) | U | SA: state-specific (V-agg) |
| ESPN BET → **theScore Bet** | SA: **NS** (no deep link) | U | U | n/a | U | Rebranded 2025-12-01 (cdcgaming.com; ingame.com). OA key `espnbet` relabelled |
| Fanatics | SA and OO: **NS** (no deep link) | U | U | n/a | U | OA: `fanatics` paid plans only |
| bet365 (US) | `/dl/sportsbookredirect?bs=` **U** (no source found). Not in SA table. No OA US key | 3P (AN Playbook) | U | U | bet365 Partners exists; no public deep-link docs | AN: slip won't load if location ineligible (3P) |
| BetRivers (Kambi) | Preselect **V-agg** (SA). Kambi `coupon=` U | U | U | U | U (RSI program, 3P) | SA: state-specific (V-agg) |
| Hard Rock Bet | Preselect **V-agg** (SA) | U | U | U | U | OA keys `hardrockbet`, `_az`, `_fl`, `_oh` (V-agg); SA: not state-specific |

**Book-side sharing features:**
- bet365 "Bet Share" (help.bet365.com/s/en-us/sports/bet-share) shares a *placed* bet. This is verified only via a search snippet; the page returned 403.
- FanDuel's Community Feed lets in-app users re-add a shared bet, but there is no public URL. [doc-V: fanduel.com/community-feed]
- None of these is a third-party prefill API.

### 2.2 Aggregators and odds providers

| Provider | Betslip links | Multi-leg / SGP | Published price | Licensing / display | Freshness |
|---|---|---|---|---|---|
| **The Odds API** (current GTP provider) | `includeLinks=true`: event, market and outcome links "where available". `includeSids=true`: book source IDs. Released 2024-09-22. **Per-book coverage and plan gating: UNVERIFIED** (not listed) | No parlay links; no SGP pricing [doc-V] | Free 500 credits; $30/20K; $59/100K; $119/5M; $249/15M [doc-V: the-odds-api.com/#get-access] | Public website display allowed when the data isn't the product sold. No raw redistribution or resale. Book marks only for factual comparison [doc-V: /terms-and-conditions.html] | Featured markets 60 s pre-match / 40 s in-play; props 60 s [doc-V: /sports-odds-data/update-intervals.html] |
| **OpticOdds** (OddsJam API redirects here) | Per-odd `deep_link` {ios, android, desktop}, only with the "Deep Link Information" key permission [doc-V: OO] | `POST /parlay/odds`: per-book correlated SGP prices; `deep_link_urls` null in all examples. SGP books: BetMGM, BetRivers, Caesars, DraftKings, Fanatics, others; **FanDuel not listed** [doc-V] | Contact sales. ~$5K/mo/sport per a competitor (**UNVERIFIED**) | ToS bars revenue-generating use without a separate agreement (partial, doc-V) | "Sub-second" (vendor claim, UNVERIFIED) |
| **SportsGameOdds** | Per-book `deeplink` on odds plus event `links.bookmakers`; not guaranteed [doc-V FAQ] | Per-leg link "isn't guaranteed to prefill a full multi-leg slip"; no SGP pricing; book quote is authoritative [doc-V: /use-cases/parlay-builder-api] | Free (10-min); $99 (3-min); $299 (sub-minute) [doc-V: /pricing] | No resale or feeds; app use allowed; public-site display not explicit [doc-V: /terms] | 10 min / 3 min / sub-minute by plan |
| **SharpAPI** | `GET /api/v1/deeplink/{id}` 302 redirect, `state=` (default `pa`). 26/35 books resolve, 12 preselect [doc-V: SA] | Single selection only | Free (60 s delay, 2 books); $79; $229; $399 [doc-V: sharpapi.io/pricing] | Terms not on the pricing page (UNVERIFIED) | Free tier 60 s delay |
| **Unabated** | Free tier **requires surfacing Gambly deeplinks** to public audiences; claims straights, parlays and SGPs, "varies by operator" [doc-V: unabated.com/odds-api/free] | Claimed, no per-book list (UNVERIFIED) | Free; $799; $2,999 (UNVERIFIED, snippets) | The free tier is itself a commercial funnel condition | 15–30 s free-tier delay (UNVERIFIED) |
| **OddsBlaze** | Betslip links claimed | "BlazeBuilder" SGP pricing claimed | ~$299/mo (UNVERIFIED, 3P directories) | UNVERIFIED | UNVERIFIED |

UNVERIFIED (docs silent): whether `includeLinks`/`includeSids` add Odds API credit cost. The documented cost model is markets × regions only.

### 2.3 SGP pricing is not leg multiplication

- **Books reprice correlated legs.**
  - OpticOdds returns SGP prices "with correlation adjustments" per book. [doc-V: developer.opticodds.com/docs/same-game-parlay-sgp-pricer-bet-builder]
  - SportsGameOdds says the book's final SGP quote is the source of truth. [doc-V]
  - Academic support: Davis, Dawson & Krieger, *J. Prediction Markets* 12(2), 2018, on correlated parlays and book restrictions. [doc-V: ircommons.uwf.edu]
- **GTP already encodes this in three places:**
  - The slip reader treats an SGP ticket price that differs from its multiplied legs as normal. [code: `app/src/lib/accounts/slip-reading.mjs:13-14,113-122`]
  - The correlation module states that the product of marginals is not a joint probability. [code: `app/src/lib/products/correlation.mjs:11-24`]
  - The roadmap requires joint probability from coherent shared worlds. [code: `GAMETIMEPICKS_MASTER_ROADMAP_V2.md:1249-1254`]
- **Consequence:** any third-party "SGP odds comparison" must display each book's *own* SGP quote. That requires a paid SGP pricer or the book itself. GTP must never present a multiplied price as a book's SGP price.

### 2.4 US regulatory and affiliate facts (counsel items, no legal opinion)

| Jurisdiction | Fact | Status |
|---|---|---|
| NJ DGE | Flat-fee/CPA affiliates: vendor registration (no fee). Revenue-share/hybrid: ancillary CSIE license (min $2,000 application) | UNVERIFIED (nj.gov PDFs unparsed; snippets of official docs) |
| PA PGCB | Flat-fee affiliates *registered*; revenue-share affiliates *certified* gaming service providers (58 Pa. Code §807a.1). Ads must carry the gambling-assistance message (Guidance 2024-06) | UNVERIFIED (law-firm summary, snippet) |
| MI MGCB | R 432.729: affiliates not paid a share of receipts register as vendors and certify they don't market illegal sites; ≤$100K/yr exemption. Revenue share → supplier license (R 432.722) | R 432.729 VERIFIED (law.cornell.edu); R 432.722 UNVERIFIED |
| OH OCCC | OAC 3775-16-08: affiliates need no supplier license for affiliate work alone, but the advertising rule applies. Ads must include an approved helpline, identify the operator, avoid under-21 depiction/targeting and college campuses. Commission can force contract termination | VERIFIED (law.cornell.edu) |
| MA | 205 CMR 256: operators responsible for affiliate ads; 21+ statement; revenue-share affiliate deals banned (~2023) | UNVERIFIED (snippets, trade press) |
| NY | 2023 rules: revenue-share affiliate pay banned, CPA allowed after a May 2023 softening; final text unconfirmed | UNVERIFIED |
| AGA Responsible Marketing Code (2023) | 73.6% of audience 21+; no college partnerships; no "free"/"risk-free"; members flow it down to affiliates | Main points VERIFIED (AP via whyy.org); flow-down UNVERIFIED |

**Age:** GTP's draft minimum age is **18**, flagged by counsel question 7 since most states use 21. [code: `app/src/lib/legal/texts.mjs:42`] Any book-facing surface makes 21+ a gating question.

**Counsel questions this initiative adds:**
- Does an *unpaid* outbound link (L1/L2) make GTP "marketing" for an operator in any state?
- Does linking change the analysis in the existing counsel question 6 (`docs/legal/COUNSEL_REVIEW_BRIEF.md:31`)?
- Which states require registration before *any* compensation, including flat CPA?
- What disclosures are required on a link-out page?

### 2.5 Freshness: how stale is misleading

- **Books and providers:**
  - The provider updates every 40–60 s. [doc-V]
  - Suspended markets stop updating and drop out after about 15 min. [doc-V]
  - Books reject or re-prompt changed odds at the slip. [UNVERIFIED: Sportradar MTS snippet]
- **[inference]** A screen that says "compare" or "best" implies a current price. Any capture older than one provider interval can be wrong at the book. So no GTP static capture can support "best price now".
- **What GTP can honestly say:** "Book X posted −110 at 10:47 ET (3 h ago); the book's current price may differ."
- **Proposed display bands** (founder to set; *est.*):
  - **≤15 min:** show with time.
  - **15 min–6 h:** show with explicit age.
  - **>6 h, or event started:** hide the compare and links.
  - `PRICE_MAX_AGE_DAYS = 3` is a *paper-card publishability* rule and must not be reused as a compare-freshness rule.

---

## 3. GTP reuse inventory (code-verified)

| Path | Provides | Gap for Smart Betslip |
|---|---|---|
| `app/src/lib/parlays/risk-odds-bands.mjs:16-21,63-70` | The four public tiers by combined American price (Low −200..+100, Medium ≤+300, High ≤+600, Longshot >+600) | The tier comes from GTP's combined price. A book's price for the same legs can fall in a **different band** |
| `app/scripts/parlays/build-risk-ladder.mjs:73-84` | `combinedDecimal` = product of leg prices | Valid only because legs are distinct events (D5) from one book. Never valid for SGPs |
| `app/scripts/parlays/build-risk-ladder.mjs:305,315,344-350` | Card legs: player, playerId, gameId (Odds API event id), gamePk, market, side, line, odds | **Bookmaker dropped**; no capturedAt per leg; dedup key is player *name* (`:305`) |
| `app/public/data/parlays/optimizer/<date>.json` | Slip legs carry `bookmaker`, `oddsForSide`, `gameId`, `playerId`, `commenceTime`, `sameGame` flag | No sid/link; `leanId` is name-based (`Ezequiel_Tovar-batter_hits-0.5`) |
| `app/public/data/parlays/risk-ladder/latest.json` | Daily tiered cards; "no play" via `skipped[]` with reasons | 0 MLB cards every day since 2026-09-30 (offseason) [code: dated files]. NFL ladder last written 2026-08-24, `NOT_PLAYING_TODAY` |
| `app/src/lib/parlays/card-events.mjs:1-15` | D5 one-leg-per-event, fail-closed | Excludes SGPs from official cards; L4 has no source product |
| `app/scripts/parlays/lab-eligibility.mjs:35-46,256-278` | Sport publishability: prices + settlement + ≥4 priced games; emits `priceAgeDays` | Freshness is in days; no per-book freshness |
| `app/src/lib/parlays/card-leg-eligibility.mjs:21` | `PRICE_MAX_AGE_DAYS = 3` | Too loose for any price-comparison claim |
| `app/src/lib/sportsbook-comparison.ts:7-13,49-59,81-119` | Per-book breakdown for one leg, "best" = max American; "No affiliate links" | Labels lack `williamhill_us` (Caesars), `betrivers`, theScore. No licensed-book allowlist; no timestamp; "best" conflicts with the 09-24 policy |
| `app/src/lib/sports/odds/prop-display-selection.mjs:23-42` | One named reference book (DK → FD → coverage), never chosen by price | Founder policy: **not line shopping** |
| `app/scripts/nfl/capture-nfl-odds.mjs:12-16,56,71-73` | Receipt-gated, ledgered capture; bulk team markets (3 credits); per-event props; 45-min duplicate refusal | No `includeLinks`/`includeSids`; raw snapshot private, public rows derived |
| `app/public/data/nfl/markets/latest.json:7,11,13` | Per-event, per-book moneyline/spread/total; `capturedAt`; licence note; "no wager is suggested" disclaimer | 11 book keys incl. 5 offshore; prop rows carry one book plus `booksAvailable`; latest capture on main is 2026-10-11T11:41Z |
| `pipeline/config.py:184,188-191` | MLB/NBA pipeline requests `regions=us`, books `draftkings,fanduel` | Only two books for props, so a multi-book prop compare needs a capture change. Credits are per market × region, so more books in `us` costs no more credits [doc-V cost model; inference] |
| `app/src/lib/sports/odds/event-join.mjs:1-17` | Provider event → canonical event join; quarantines ambiguous/unmatched; orientation reported | Reusable as-is for book-event matching |
| `app/src/lib/sports/nfl/player-identity.mjs:1-14,150` | Durable NFL athlete IDs; unresolved names quarantine | MLB legs rely on name-built `leanId`; no equivalent registry cited for MLB props |
| `app/src/lib/sports/odds/live-market-contract.mjs` (header) | Refuses "live" values identical to pregame (stale-feed detection) | Pattern reusable for a stale-quote check |
| `app/src/lib/slip/leg-identity.ts:10,22-43`; `slip-store.ts:29` | Reader's browser-local slip (`gtp.slip.v1`), key `sport\|player\|marketLabel\|side\|line` | No event ID, no book, no capturedAt. **Cannot drive a deep link** |
| `app/src/components/slip/slip-drawer.tsx:8-19` | Singles vs one-parlay return math; "nothing placed, transmitted, or recorded" | Natural home for an L0 "price at book" panel |
| `app/src/components/accounts/*`, `app/src/lib/accounts/slip-reading.mjs` | "Your record" (P266): upload a placed slip, vision read, user confirms; SGP repricing disclosed | Reusable for post-hoc "what the book actually priced", with no link-out |
| `app/api/_live-core.mjs:7-41` | Function pattern: kill switch default OFF, sport allowlist, validated upstream URL, CDN TTL | Template if a request-time quote is ever justified |
| `app/src/lib/live/freshness.mjs:20-23,48-82` | FRESH ≤45 s / DELAYED ≤120 s / STALE bands | Reusable vocabulary for quote freshness |
| `app/src/lib/legal/texts.mjs:42,61,68,71`; `app/src/app/responsible-use/page.tsx:8,58,65,93-94`; `app/src/components/footer.tsx:167-174` | Paper-only, educational, 1-800-GAMBLER, "odds change constantly", not affiliated with any sportsbook | All must change before L1+ |
| `app/src/lib/ask/contract.mjs:376-384`; `app/scripts/ask/golden.mjs:379,514` | Ask link registry refuses sportsbook/affiliate links, with golden tests | Must stay refused in Ask even if the site links (separate decision) |
| `app/public/data/parlays/lab-ledger.json` (`moneyClass: PAPER_ONLY`); `risk-ladder` (`PAPER_TRACKED_NOT_BANKROLL`) | Paper record separation | Any link/compare artifact must be a **separate** file and never touch these |

---

## 4. Market matching design (GTP leg → book selection)

### 4.1 Identity tuple

- **GTP side:** `(sport, canonicalEventId, gtpPlayerId | teamSide, marketFamily, side, line, displayedPrice, displayedBook, capturedAt)`.
- **Book side**, from the *same* Odds API response: `(oddsEventId, bookKey, marketKey, outcome.name, outcome.description, outcome.point, outcome.price, outcome.sid, outcome.link, market.last_update)`.
  - `oddsEventId` = the 32-hex `gameId` already on legs.
  - `outcome.sid` and `outcome.link` come only with `includeSids`/`includeLinks`.

### 4.2 Join steps (all must pass; else no quote, no link)

1. **Event:**
   - Use `event-join.mjs` (both participants plus start-time tolerance).
   - Quarantine on `AMBIGUOUS`/`UNMATCHED`.
   - Refuse on `orientation: SWAPPED` for side-sensitive markets.
2. **Participant:**
   - Resolve the outcome's `description` through the sport's identity registry (NFL `resolvePlayerRef`).
   - MLB needs an equivalent ID-keyed registry before L2 (*est.* 2–4 days). Name-only matching is **not** accepted.
3. **Market:**
   - Use an explicit allowlist map `marketFamily → provider main-market key`.
   - `*_alternate` keys are never matched to a main-line leg.
4. **Line:** exact equality of `point` to the displayed `line`. No rounding, no "nearest".
5. **Side:** an explicit map (Over/Under/Yes/home/away). Unknown sides are refused.
6. **Price:** the quote shown is that outcome's own `price` at that capture. It is never recomputed.
7. **Book:**
   - The book must be in the **licensed-book allowlist**.
   - Offshore keys are dropped at ingest for any public compare.
   - `espnbet` displays as theScore Bet.

### 4.3 Confidence

| Level | Condition | Allowed use |
|---|---|---|
| EXACT | All 7 steps pass, same capture, `last_update` ≤ freshness band | L0 quote. L2 link if `link`/`sid` present |
| PARTIAL | Event + participant pass, line differs (alt line) or market absent | Show "not offered at this line at Book X". **No link, no price** |
| NONE | Any join fails | Omit the book silently from that leg |

### 4.4 Failure modes and fail-closed rules

- **Alt lines:**
  - If the book's main line ≠ GTP's line, the book is "not offered at this line".
  - Never link to the main-line outcome.
  - Never substitute an alternate outcome unless the alt market was captured and matched exactly.
- **Name mismatch** (suffixes, accents, nicknames, traded players): resolve by registry ID only; unresolved = NONE.
- **Suspended/removed market:** absent in the newest capture = no quote and no link. Older captures are never carried forward for compare. Carry-forward exists for display in `capture-merge.mjs`; it must not feed L0/L2.
- **Price drift:** the book shows its own current price after click-through. GTP must say so and must not imply the captured price will be honoured.
- **Tier drift:**
  - The GTP card keeps its GTP tier label.
  - A per-book combined price is shown only when **one book prices every leg** (EXACT).
  - Its band is labelled neutrally ("at Book X: +240").
  - **Never cross-book**: no combined price from legs at different books. This matches `prop-display-selection.mjs:37-41`.
- **Hard rule:** never send, prefill or display a line, side or price different from what the user saw. A link exists only for EXACT legs, and is built from the provider's own `link`/`sid` for that outcome. GTP never constructs book URLs from guessed patterns.
- **Partial parlays:** if any leg is not EXACT at a book, that book gets no parlay link (L3) and no combined price.

---

## 5. Phased milestones

Effort figures are *est.* dev-days for one engineer, excluding review/release windows.

### M0: Decisions and counsel packet (no code)
- **Scope:** founder answers §10. Add Smart Betslip questions to the counsel brief.
- **Files:** none in this phase. A later docs PR would touch `docs/legal/COUNSEL_REVIEW_BRIEF.md`.
- **Effort:** 0.5–1 d. **Dependencies:** founder.
- **Exit gate:** written founder decision on "link at all", line-shopping policy, budget.
- **Does NOT:** change any page, data or capture.

### M1 (MVP): L0 "Book quote at capture time", compare-only
- **Scope:**
  - Per leg: the licensed-allowlist books' captured price for the *exact* line, with "captured HH:MM ET (age)".
  - Per card: a single-book combined price only where one book has every leg EXACT.
  - A freshness band hides stale quotes.
  - No "best" badge unless the founder reverses the 09-24 policy. No links.
- **Producer:** a **new** artifact `app/public/data/books/quotes-<date>.json`, written in the *same commit* as existing captures, so there are no extra builds. The ladder and lab-ledger stay byte-identical.
- **Likely files:**
  - new `app/src/lib/books/licensed-books.mjs` (allowlist and labels; fold in `sportsbook-comparison.ts` labels)
  - new `app/src/lib/books/quote-join.mjs` (§4 joins)
  - `app/scripts/nfl/capture-nfl-odds.mjs` and the MLB morning generation (emit quotes)
  - `app/src/components/slip/slip-drawer.tsx`, `parlay-ticket-card.tsx` (display)
  - tests beside each
- **Effort:** 4–7 d. NFL team markets work first (multi-book already captured). MLB/NFL props need multi-book retention from the same responses (+2–3 d).
- **Dependencies:** founder line-shopping decision. No partner, no new paid feed, no extra credits. *(inference: credits are per market × region, and the pipeline already queries `regions=us`.)*
- **Exit gate:** tests prove all of:
  - an offshore key never renders;
  - no cross-book combined price;
  - a quote past the band or after start is hidden;
  - PARTIAL never shows a price;
  - ladder and lab-ledger hashes are unchanged.
- **Does NOT:** link anywhere, claim "best"/"current", touch forecasts or records, add request-time calls.

### M2: L1 event-page links (only if the founder says "link")
- **Scope:**
  - Per book, a link to the event page using the provider's event-level `link` (or the book homepage), via a GTP interstitial.
  - The interstitial carries 21+, 1-800-GAMBLER plus a state helpline note, "prices may differ", "GTP is not affiliated", and no affiliate tag.
- **Likely files:**
  - `licensed-books.mjs` (link policy)
  - new `app/src/app/out/page.tsx` (static interstitial)
  - `lib/legal/texts.mjs`, `responsible-use/page.tsx`, `footer.tsx` (copy changes after counsel)
  - Ask stays refused (`contract.mjs:380`)
- **Effort:** 3–5 d after counsel.
- **Dependencies:** GTP-01 counsel sign-off, minimum-age decision, Terms rewrite. A one-time ≤5-credit authorized probe to confirm which books return event links.
- **Exit gate:** counsel receipt recorded. No link on any page lacking the interstitial. Links absent after event start.
- **Does NOT:** prefill selections, use affiliate IDs, track clicks into any record.

### M3: L2 single-leg prefill
- **Scope:**
  - Add `includeLinks=true&includeSids=true` to existing capture calls.
  - Store `link`/`sid` only for EXACT outcomes.
  - Show "Open this leg at Book X" per leg. One leg at a time; the parlay is assembled by the user at the book.
- **Likely files:** the capture scripts, `quote-join.mjs`, the M1 artifact schema, the MLB identity registry (new).
- **Effort:** 5–10 d.
- **Dependencies:**
  - M2 gates.
  - A founder-authorized probe to measure per-book link coverage and confirm credit cost.
  - Odds API terms re-read for link use.
- **Exit gate:**
  - Coverage measured per book.
  - Every rendered link maps to an EXACT outcome in the same capture.
  - A manual check on ≥1 book confirms the right selection appears in the slip, *without placing a bet*, by a human in a legal state.
- **Does NOT:** build URLs from guessed patterns, prefill multiple legs, link offshore books.

### M4: L3 multi-leg prefill (research spike; likely needs a partner)
- **Scope:** evaluate a contracted partner (Unabated/Gambly, OpticOdds deep-link permission, SharpAPI, or a book affiliate program) for documented multi-leg links.
- **Effort:** 2–4 d spike, then contract-dependent.
- **Dependencies:** commercial relationship, so licensing (§2.4), budget and counsel.
- **Exit gate:** written partner documentation that the multi-leg link works per named book, and contract terms that permit display.
- **Does NOT:** ship anything without that documentation.

### L4: SGP live pricing (not planned)
- Blocked by D5, by the absence of a validated joint model (PARLAY-001), and by request-time paid pricing.
- Revisit only under LIVE-005 / PARLAY-001 joint-world validation.

---

## 6. Costs

| Item | One-time | Recurring | Basis |
|---|---|---|---|
| L0 (M1) | eng 4–10 d *est.* | $0 incremental | Rides existing captures; Odds API spend today ≈ $30/mo on the 20K tier (`docs/CURRENT_COST_BASELINE.md:25`; `docs/API_USAGE_AND_CREDIT_AUDIT.md:17`) |
| L1/L2 probe | ≤5–20 credits *est.* | — | Credit cost of `includeLinks` UNVERIFIED |
| L2 steady state | eng 5–10 d *est.* | $0–29/mo *est.* | Only if added prop captures force 20K → 100K ($59) [doc-V pricing] |
| Counsel review | UNVERIFIED | UNVERIFIED | No quote obtained |
| State affiliate registration | NJ vendor reg: no fee; CSIE ≥$2,000 if revenue share | Renewals UNVERIFIED | UNVERIFIED (§2.4); only if compensated |
| SharpAPI (link redirect) | — | $79–399/mo | doc-V |
| SportsGameOdds | — | $99–299/mo | doc-V |
| Unabated | — | Free (must surface Gambly links) / $799 / $2,999 | Paid tiers UNVERIFIED |
| OpticOdds (deep links, SGP pricer) | — | Contact sales; ~$5K/mo/sport (3P) | UNVERIFIED |
| Vercel | — | Each extra price commit = 1 Production build. Current cycle ≈ $315–340 with Build CPU 99.9% of usage (`GAMETIMEPICKS_MASTER_ROADMAP_V2.md:207`) | code / roadmap |

No revenue projections are made.

---

## 7. Vercel cost controls

**Facts:**
- Any commit touching `app/public/data/**` builds Production. [code: `app/scripts/vercel-ignore-build.sh:90`]
- Data commits were 34 of 39 Production deploys in one measured window. [code: roadmap `:268-276`]
- COST-001 task 7 already names "founder data-freshness SLO → publisher cadence or runtime data delivery" as a deferred decision. [code: roadmap `:345`]

| Option | Freshness | Build impact | Secrets | Verdict |
|---|---|---|---|---|
| **A. Static, ride existing capture commits** | Capture cadence (MLB ~daily; NFL 2×/day + sweeps) | **Zero** added builds | Key stays in GitHub Actions | **Recommended for M1–M3** |
| B. More frequent price commits | Better | +1 Production build per commit; directly against COST-001 | Same | Reject |
| C. Browser calls the provider directly | 60 s | None | **Exposes the paid key**: anyone can drain credits; likely breaches the no-redistribution terms [inference] | Reject |
| D. Tiny function (`app/api/_live-core.mjs` pattern: kill switch OFF, allowlist, validated URL, CDN `s-maxage`) | ≈ cache TTL | None (runtime) | Key server-side only | Credits per cache miss = markets × regions per event. At 60 s TTL, one 5-market event costs ~7,200 credits/day if continuously requested (*est.*), which exceeds the 20K tier in ~3 days. **Only with a founder budget and a hard daily credit cap** |
| E. Runtime store (Action writes JSON to Blob/KV, no git commit) | Capture cadence, decoupled from builds | None | Server-side | **Recommended later** if the freshness SLO needs more captures. Aligns with COST-001 task 7 / OPS-001 zero-build data |

**Recommendation:**
- Option A for L0–L2.
- Treat any freshness improvement as a COST-001 task-7 decision (Option E), never Option B or C.
- Option D only for a founder-budgeted, capped pilot.

---

## 8. Risks

- **Legal/compliance:**
  - Linking reverses the paper-only, "no sportsbook links" posture in the Terms draft, `/responsible-use` and the counsel brief.
  - Any compensation creates state registration or licensing exposure (§2.4).
  - Ads/links may need state-specific helplines and 21+ (Ohio, Pennsylvania).
  - Mitigation: M0 counsel gate; no compensation in M1–M3.
- **User harm / responsible gambling:**
  - Converting "educational paper cards" into one-tap bet funnels increases impulsive wagering risk, especially for Longshot cards (>+600).
  - Proposed rule: Longshot cards never get link-outs; reflective interstitial; no "bet now" language; no links on live/in-play surfaces.
- **Accuracy:**
  - Stale captured prices, alt-line mismatch, tier drift, offshore books in `us`.
  - Mitigation: §4 fail-closed rules, freshness bands, allowlist.
- **Trust and record integrity:**
  - The forecast record (lab-ledger, risk-ladder, Results) must stay separate from any commercial funnel.
  - Proposed rules:
    - quotes and links live in separate artifacts;
    - no click data ever feeds selection or ranking;
    - card selection must be byte-identical with and without the books layer (test);
    - Ask keeps refusing sportsbook links.
  - GTP's own lab gate states that no current model is required to beat the market and none does (`app/scripts/parlays/lab-eligibility.mjs:23-25`). Smart Betslip copy must not imply otherwise.
- **Vendor:**
  - Aggregator deep links are "where available" and may break silently.
  - Book formats are undocumented.
  - ESPN BET's rebrand shows book keys change; labels must follow provider metadata.

---

## 9. Roadmap placement (draft text only; roadmap not edited)

**Existing items affected:**
- `PARLAY-001` (`:1249`): Smart Betslip sits under it. L0 is display-only; L3/L4 depend on its joint-world rule.
- `GTP-01` (`:1620`): M2+ is gated on counsel and the Terms/Privacy publication decision, including age 18 vs 21 (`:2614`, `:2731`).
- `COST-001` task 7 (`:345`): any freshness improvement beyond capture cadence.
- `PRODUCT-001` (`:1226`): the candidate universe should carry `marketSnapshot` identity (event, book, capturedAt).
- `LIVE-005` (`:1809`): L4 belongs here, not in PARLAY-001.
- Principles `:78` ("Market price is not a GTP forecast probability") and `:84` (traceability) apply.

**Draft item (proposed for §14, after `PRODUCT-003`):**

> ## `BETSLIP-001` — Book quotes and sportsbook hand-off (Smart Betslip)
> **Priority:** P2 · **Status:** NOT_STARTED · **Research:** `docs/research/SMART_BETSLIP_FEASIBILITY_2026-10-18.md`
> - **M0** Founder decisions (link at all; line-shopping policy; compensation; budget; freshness SLO; age) + counsel questions appended to GTP-01. *Gate for everything below.*
> - **M1 (L0)** Licensed-book quotes at capture time, exact-line only, single-book combined price only, age-stamped, stale-hidden; separate artifact; zero extra builds; ledgers byte-identical.
> - **M2 (L1)** Event-page links via interstitial (21+, helpline, not affiliated, no affiliate tag). Requires GTP-01 counsel receipt and Terms/responsible-use rewrite. Ask stays link-free.
> - **M3 (L2)** Single-leg prefill from provider `link`/`sid` for EXACT matches only; per-book coverage measured by an authorized probe.
> - **M4 (L3)** Partner spike only; nothing ships without documented multi-leg support and contract.
> - **Not in scope:** SGP pricing (→ `LIVE-005`/`PARLAY-001`), affiliate revenue, request-time price APIs without a COST-001 decision.

**Draft sub-bullet for `PARLAY-001`:**

> - Book hand-off (BETSLIP-001) never alters card selection or the paper record; a card's tier label stays GTP's, and a book's price is shown only as that book's own single-book quote.

**Draft row for the GTP-01 counsel list:**

> - Smart Betslip: does an unpaid outbound link or prefill constitute operator marketing in any target state; registration triggers for flat-fee vs revenue-share; required link-out disclosures; minimum age for book-facing surfaces.

---

## 10. Founder decisions needed

1. **Should GTP ever link to a sportsbook (L1+)?** A "no" makes M1 (L0) the end state.
2. **Line shopping:** may GTP show several books' prices side by side, and may it mark one as "best"? Either reverses the 2026-09-24 reference-book policy.
3. **Commercial relationship:** none, flat-fee, or revenue-share/affiliate? This determines state licensing exposure. The recommended default is none.
4. **Budget:** an Odds API tier change (20K → 100K, +$29/mo) and whether any paid deep-link/SGP feed is ever in scope.
5. **Freshness SLO for quotes:** the display bands in §2.5, and whether runtime data delivery (COST-001 task 7) is approved.
6. **Audience gate for book-facing surfaces:** 21+ vs the current 18+, and whether links are suppressed outside states with legal online betting. GTP has no geo detection today [code: no geolocation code found in `app/src`].
