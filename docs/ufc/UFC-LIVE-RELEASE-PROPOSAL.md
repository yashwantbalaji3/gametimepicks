# UFC live tab: minimum safe public release (proposal)

**Status:** PROPOSAL. Nothing in this document has been done. As of 2026-10-11:
- no flag has been changed, nothing has been deployed, and there is no PR or merge;
- the code lives only on branch `claude/ufc-001-live-hub`, default closed.

**Decision owner:** the founder. Each step below needs an explicit approval.

## What would ship

- The `/live` **UFC tab**: today's card, grouped as Live now / Upcoming / Awaiting official result / Final.
- Each bout shows:
  - both fighters, with portraits and records;
  - the frozen pregame pick and its win chance, read from `card-latest.json` and never recomputed;
  - round and clock only as ESPN states them. The clock is shown as time remaining in a round; between rounds there is no clock;
  - ESPN's reported winner, labelled as awaiting the official result;
  - a provider-reported draw, but only when two independent signals agree;
  - the pick graded HIT / MISS / VOID **only** once the graded ledger has a row for it.
- The gateway makes **one** dated ESPN MMA scoreboard call, served through the existing CDN cache.
- There is no method of victory, no finish time except `5:00`, no in-fight probability and no sportsbook data.
- The evidence for every rule is in `UFC-LIVE-PROVIDER-AUDIT.md` (the whole real card of 2026-10-10, 170 snapshots).

## The exact flags

| Variable | Where | Today (Production, per `rollout.test.mjs` / `docs/GAMETIME_LIVE.md`; re-check in the dashboard first) | Proposed | Takes effect |
|---|---|---|---|---|
| `LIVE_GATEWAY_ENABLED` | server (function) | `1` (MLB and NFL live) | unchanged | next invocation |
| `LIVE_PUBLIC_SPORTS` | server (function) | `mlb,nfl` | `mlb,nfl,ufc` | next invocation |
| `NEXT_PUBLIC_LIVE_ENABLED` | build (inlined) | `1` | unchanged | next **build** |
| `NEXT_PUBLIC_LIVE_SPORTS` | build (inlined) | `mlb,nfl` | `mlb,nfl,ufc` | next **build** |

- **Both halves are required.** The server half answers `/api/live?sport=ufc`. The build half builds the roster and shows the tab.
- **Order:** set the server half first, then the build half. Then the tab never appears in front of a gateway that refuses it.
- **Force a fresh build.** Vercel binds `NEXT_PUBLIC_*` at build time, and `vercel-ignore-build.sh` skips builds with no `app/` change. The flip therefore needs a forced build (`VERCEL_FORCE_BUILD=1`), as `docs/GAMETIME_LIVE.md` §6 records for MLB.
- **Check the deployed chunk.** It must no longer contain the literal name `NEXT_PUBLIC_LIVE_SPORTS`.

## Preview plan on a real future card: Oct 17, UFC Fight Night: Buckley vs. Malott

Preview only, and only after the founder approves the merge of this branch into a Preview-deployable ref.

1. **Before the card:**
   - Merge to a Preview-deployable ref only after the founder approves the head SHA.
   - Set the four variables above **in the Preview environment only**.
   - Confirm Production still reads `mlb,nfl`.
2. **Build on the card's ET date** (Oct 17, after 00:00 ET). The roster includes a card only when `card-latest.json`'s `slateDate` is the build's ET date, so a build from the day before shows **no tab** (by design).
3. **Watch the Preview at 375 px and 1440 px** at the same moments as the local replay:
   - pre-card;
   - first walkouts;
   - a bout in R2;
   - an end of round;
   - the first final;
   - the main event;
   - card complete.
4. **Keep the read-only recorder running beside it** (same request shape as tonight). Compare the Preview against the recording after the card, and turn new provider shapes into fixtures.

## Acceptance checks (all must pass on the real Oct 17 card)

1. **Tab gating.** No UFC tab while the build half is off, or when the build's ET date is not the card's date. Production stays unchanged throughout.
2. **States.** Pre-fight, walkouts and intros show as **Upcoming** with no round. A bout in a round shows "R*n* · m:ss remaining", and the clock falls between polls. End of round shows "End of R*n*" with no clock. End of fight shows "Fight over · result coming".
3. **Finality.** No bout is ever shown as "Final" with a winner unless ESPN flagged one. No "Pick correct / missed / void" appears before the ledger. A FINAL with no winner reads "Final — no winner reported; awaiting official result" unless both draw signals are present.
4. **Finish times.** No mid-round finish time is shown. `5:00` appears only as "unofficial time".
5. **Identity.** Every roster bout joins by bout id **and** both athlete ids. Any pairing change reads "Not in the live feed" or "Live feed lists different fighters", never someone else's result.
6. **Freshness.** "Live feed updated N sec ago · source ESPN" is shown while bouts are moving. After 120 s without a successful read it reads "delayed / last confirmed". An outage reads "unavailable"; it never blanks the card and never moves a live bout back to scheduled.
7. **Frozen picks.** Every pick and win chance equals the pre-card snapshot of record (by bout id) at every moment.
8. **Request rate** (from the Vercel function logs and the CDN):
   - upstream calls are at most one per cache window per date URL per edge region (25 s while live, 60 s pre-card near the start, ≤ 300 s otherwise), whatever the number of readers;
   - no request goes to `summary`, no sportsbook host is called, and no request leaves without `dates=`.
9. **NFL and MLB unchanged.** Their tabs, requests and copy are identical to Production on the same day.
10. **Accessibility.** There is no `aria-live`, and every card's state is in its accessible sentence. Touch targets are ≥ 44 px, and there is no horizontal scroll at 375 px.

## Rollback

| Situation | Action | Effect |
|---|---|---|
| Wrong or misleading UFC state | remove `ufc` from `LIVE_PUBLIC_SPORTS` (server) | Next invocation: `/api/live?sport=ufc` answers `UNSUPPORTED_SPORT` and ESPN is not called. The tab, if visible, says "Live data is unavailable right now"; frozen picks are untouched |
| The tab must disappear | remove `ufc` from `NEXT_PUBLIC_LIVE_SPORTS` and force a rebuild | No roster is built, no tab, no request |
| All live surfaces wrong | unset `LIVE_GATEWAY_ENABLED` | Every sport answers `FEATURE_DISABLED` (existing kill switch) |
| Code defect | revert the merge; no model artifact, ledger or card is touched by this feature | — |

The feature writes nothing (tested), so no rollback ever needs a data repair.

## Cost and request rate

- **Upstream (ESPN).** One dated scoreboard URL per card, 30–40 KB per response. The Vercel CDN caches the response by URL, so the reader count does not matter; the function's 20 s memo also dedupes requests within a warm instance. The ceilings per cache window per edge region are:
  - live: 25 s, at most ~144 calls/hour;
  - pre-card: ≤ 60 s near the start, ≤ 300 s when distant;
  - all-final today: capped at 300 s.

  A 6.5-hour card is therefore **≤ ~900 calls (~30 MB) per active region**. Test REAL 20 shows twenty readers inside one window cost **one** upstream call.
- **Function invocations.** About one per cache miss (the same ceilings). CDN hits cost no function time.
- **Readers.**
  - One slate poll every 30 s while the tab is visible (120 s when hidden, 60 s while waiting for the feed).
  - Polling **stops** once every roster bout is final.
  - One gap: if a bout vanished from the feed, the hub keeps a 60 s poll until midnight ET (one CDN-cached request per minute).
- **No monthly cost is claimed.** It should be measured on the Oct 17 Preview, as was done for MLB.

## Remaining founder decisions

1. **Approve the head SHA** of `claude/ufc-001-live-hub` for a Preview-deployable merge.
2. **Approve the flags**: Preview first (Oct 17), and Production only after a passed Preview.
3. **ESPN usage posture for the MMA scoreboard.** This is the same question the NFL enablement answered for football: a keyless public endpoint, one cached call per window.
4. **The provider-reported draw label.** It needs two signals: per-judge cards that compute to a draw, and both records +1 draw. The alternative is to always show "Final — no winner reported; awaiting official result".
5. **The withheld finish time.** On 2026-10-10, ESPN's first FINAL time was the time *remaining* in 6 of 8 mid-round finishes, and in a 7th (the main event) it flipped to the remaining time after a correct first value. The alternative is to show it as "unofficial" anyway, which this proposal advises against.
6. **The unofficial play-by-play method** ("Unofficial Winner Kotko / Submission / Decision"). Today it is not shown. Showing it would need a label such as "provider play-by-play, unofficial".
7. **Copy.** The `/live` metadata and quiet-day text name only NFL and MLB. Once UFC is public they should name UFC on fight days.
8. **The U4 / D3 withdrawn-pairing rule.** It decides what a bout that vanishes from the feed eventually becomes in the record.
9. **When "official" arrives.** FINAL_CANONICAL appears only after the graded ledger (next morning) **and** a rebuild, so bouts sit in "Awaiting official result" overnight. Either accept this, or schedule a rebuild after grading.
10. **Dormant code in the default bundle.** The default build already ships the UFC board's code in the `/live` page chunk, verified in `out/` on 2026-10-11. It carries no roster data and no provider host, and it renders nothing unless enabled. For a zero-footprint default, load the hub with `next/dynamic`.

---

## Release assessment, 2026-10-13: for the founder's decision before the Oct 17 card

**Status:** assessment only. No flag has been changed, nothing has been deployed, and no Preview has been pushed.
- Branch `claude/ufc-001-live-hub`, with current `main` merged in locally; the merge was clean.
- Live test files: 109/109 pass (`ufc-live-real`, `ufc-live`, `ufc-tracked`, `rollout`, `adapters`).
- **Production right now:** `GET /api/live/?sport=ufc` answers `{"unavailable":true,"reason":"UNSUPPORTED_SPORT"}` (2026-10-13T03:33Z). Main has no UFC capability, so the public path is closed by construction, not only by a flag.

**A defect found and fixed in this pass.** On 2026-10-11, `card-latest.json` rolled to Oct 17.
- After that, **five Oct-10 replay tests passed by returning early** (three `REAL`, `UFC-RO 2`, `UFC-RO 3`), and `UFC-GW 6` / `UFC-RO 1` failed.
- The Oct 10 card of record (committed pregame at `a6c2df119c`) is now a fixture, and the early returns are now assertions.
- New `UFC-RO 1b` checks whichever card is current:
  - athlete ids on every bout;
  - one real `<img>` per fighter who has a portrait, and none for a fighter without one (Oct 17: Mahjoub and Faglier get initials).
- Two mutation probes (a bad portrait URL, a missing athlete id) are both caught.

### 1. What the real-event replay validates

Source: the whole real Oct 10 card, 170 scoreboard snapshots × 12 bouts, pinned by digest (REAL 18).

| State | Real evidence | What the hub shows |
|---|---|---|
| Upcoming: scheduled, pre-fight, walkouts, introductions | REAL 1, 2, 15 | "Upcoming" with the start time. No round, never "live". The event-level status is never read (REAL 17: it flips back to SCHEDULED after the card). |
| In progress (`IN_PROGRESS` and `IN_PROGRESS_2`) | REAL 3, 4, 10, 11 | "R*n* · m:ss remaining". The clock is proven to count down on every bout in every round. |
| End of round | REAL 5, 15 | "End of R*n*", with no clock even when ESPN supplies a number. A mid-round flicker shows no clock and does not break the replay. |
| Fight over (`END_OF_FIGHT`) | REAL 12 | "Fight over · result coming": never live, never final, no winner. |
| Awaiting official, with a provider winner | REAL 7, UFC-ST 4 | FINAL_PROVISIONAL: "winner reported · awaiting official result"; the pick is not graded. `5:00` is shown as an unofficial time. Mid-round finish times are withheld, because ESPN corrects them (2:01 → 2:59 on one bout; 2:46 → 2:14 → 2:46 on the main event, REAL 16). |
| Final with no winner flag | REAL 6 | "Final — no winner reported; awaiting official result". Never a draw, never an outcome. |
| Draw (Gatto–Kareckaite, official majority draw) | REAL 13, 14 | "Draw (provider-reported)" only when **both** signals agree: per-judge cards that compute to a draw (read judge by judge, never from totals) **and** both records +1 draw. Never VOID until a settlement record exists; the U4 rule is undecided, so it stays awaiting official. |
| Final, official | UFC-ST 5, 6 | See §2. |
| Withdrawal / replacement | REAL 19 (**synthetic** on a real snapshot) | The old pairing reads "Not in the live feed". A new pairing is never joined to the old pick, because the join needs the bout id **and** both athlete ids (UFC-RO 3, all 12 real bouts). ⚠ The Oct 10 card had no real withdrawal, so this state is proven on a constructed case only. The real Sep 26 Gall pairing lives in the U4 fixtures, not in this replay. |

### 2. Settlement

- `FINAL_CANONICAL` is set **only** when the caller hands in a settlement row from the public graded record (`ufc/graded-picks.json`, built from the append-only graded ledger); see `ufc-live.mjs` §FINAL_CANONICAL.
- HIT / MISS / VOID comes only from that row.
- UFC-ST 6 is exhaustive: with no settlement, no fixture in any feed state reaches `FINAL_CANONICAL` or an outcome.
- The feature writes nothing.
- **Consequence:** bouts stay "Awaiting official" until the next morning's grading **and** a rebuild (decision 9).

### 3. Honest fallbacks

| Condition | Behaviour | Test |
|---|---|---|
| Stale feed (> 120 s without a successful read) | "Live feed delayed — showing the last confirmed state from N ago". Values stay; nothing moves backwards. | UFC-ST 7, UFC-UI 5 |
| Missing round or clock | No round or clock is printed; the state label alone. | REAL 5, REAL 15 |
| Provider outage or malformed answer | A typed refusal; the card reads "Live data is unavailable right now". It never blanks the card, never returns a live bout to scheduled, and never shows an empty card as a result. | UFC-GW 8, UFC-ST 7 |
| Feed lists different fighters | "Live feed lists different fighters"; no join. | UFC-RO 3, REAL 19 |

### 4. Request volume and caching

| | Value |
|---|---|
| Upstream calls | One dated URL, `site.api.espn.com/.../mma/ufc/scoreboard?dates=YYYYMMDD&limit=1000`. Never `summary`, never a sportsbook (REAL 20, UFC-GW 5). |
| CDN `s-maxage` | 25 s live · 60 s pre-card near the start · 300 s distant · 3,600 s terminal. Plus `stale-while-revalidate`, and a 20 s in-function memo. |
| Upstream ceiling | ≤ 144 calls/hour per edge region while live. A 6.5 h card is about ≤ 900 calls (~30 MB) per active region, whatever the reader count. REAL 20: 20 readers in one window cost 1 call. |
| Client polling | 30 s while live and visible · 60 s imminent · 300 s distant · stops when every bout is final. One residual: a vanished bout keeps a 60 s CDN-cached poll until midnight ET. |
| Observed latency | NFL on 2026-10-11 ran 30–70 s behind ESPN under the same cache policy. "Updated N s ago" is computed from the gateway's own `fetchedAt`, so it stays honest. |
| Cost | Function invocations ≈ cache misses (the same ceilings). Not measured for UFC; measure it on the Preview. |

### 5. Preview test on the Oct 17 card: what it takes

- **Build rule.** `app/vercel.json` builds only `main` and `preview/**`. A push to `preview/ufc-live-oct17` (this branch merged with the then-current `main`) builds a Preview: the first push always builds (no previous SHA). Measured cost is about 48 CPU-minutes ≈ **$0.17 per build** (COST-001, Enhanced machine), roughly 5 minutes.
- **Founder-only steps.**
  - Approve the head SHA.
  - Set in the **Preview** environment only: `LIVE_GATEWAY_ENABLED=1`, `LIVE_PUBLIC_SPORTS=mlb,nfl,ufc`, `NEXT_PUBLIC_LIVE_ENABLED=1`, `NEXT_PUBLIC_LIVE_SPORTS=mlb,nfl,ufc`.
  - Production stays untouched.
- **Timing constraint.** The roster appears only when `card-latest.json`'s `slateDate` equals the build's ET date. So the Preview must be **built on Oct 17 ET**, after the fight-day freeze has written the final card (≈ 12 h before the first bout, about 09:00 ET).
  - A build from Oct 16 shows no tab, by design.
  - A late card change on `main` (a withdrawal, a replacement) reaches the Preview only through another push: about $0.17 each.
- **Expected builds: 1–3 (≈ $0.17–0.51).** One on the morning of Oct 17, an optional re-push after a late card change, and an optional one the next morning to see `FINAL_CANONICAL` after grading.
- **Access.** Preview URLs may sit behind Vercel deployment protection. Confirm the founder can open them, or test with the founder's own login.
- **Compare against the recorder.** Run the read-only recorder beside it (private, not committed), and check the 10 acceptance items above.

### 6. Public enablement and rollback

- **Prerequisite:** a founder-approved PR that merges this branch into `main`, with green required CI on its exact head. That puts the capability into Production code while the flags stay closed.
- **Enable:**
  1. Set `LIVE_PUBLIC_SPORTS=mlb,nfl,ufc` (server; takes effect at the next invocation).
  2. Then set `NEXT_PUBLIC_LIVE_SPORTS=mlb,nfl,ufc` (build-inlined).
  3. Redeploy with `VERCEL_FORCE_BUILD=1` once, then unset it. One Production build ≈ $0.17.
  4. Verify that `out/` no longer contains the literal `NEXT_PUBLIC_LIVE_SPORTS` and that `/api/live/?sport=ufc` answers with a card.
- **Rollback, fastest first:**
  1. Remove `ufc` from `LIVE_PUBLIC_SPORTS`. The next invocation answers `UNSUPPORTED_SPORT` and ESPN is not called; the tab, if built, says "Live data is unavailable right now". No build needed.
  2. Remove `ufc` from `NEXT_PUBLIC_LIVE_SPORTS` and force-rebuild: the tab disappears.
  3. `LIVE_GATEWAY_ENABLED` unset: every sport answers `FEATURE_DISABLED`.
  4. Revert the merge.
  
  No step needs a data repair, because the feature writes nothing.

### Recommendation

1. Approve a **Preview-only** test on Oct 17: one build on the Oct 17 ET morning, plus at most two re-pushes.
2. Keep Production closed until the Preview passes all 10 acceptance checks on the real card.
3. Decide the open items before Production:
   - the draw label (decision 4);
   - the withheld finish time (5);
   - "Awaiting official" overnight versus a post-grading rebuild (9);
   - U4 (8).
4. The withdrawal state is proven only synthetically. Treat the first real withdrawal as an acceptance item, not an assumption.
