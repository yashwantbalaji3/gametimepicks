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
