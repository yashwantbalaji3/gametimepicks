# D1: daily content queue and freeze-time verifier

**Status:** built locally on 2026-10-28 (US Eastern).
- Nothing was pushed, deployed, published or bought.
- Approving the calendar authorizes no post. Every post has its own decision, and you post it yourself.

## 1. What it does

Ask in the console: **"Team, prepare today's content queue from the approved calendar."** (or "tomorrow's", or "…for 2026-10-30").

1. **Builds the queue** (`orchestrator/queue-flow.mjs`, deterministic):
   - reads the latest **approved** calendar from the ledger and re-computes its approval digest; it refuses if the calendar was altered or none is approved;
   - reads the data at one pinned commit (`origin/main` by default; `GTP_CC_DATA_REPO` / `GTP_CC_DATA_REF` on the hosted worker);
   - turns each of the day's **chosen** slots into post packages, one package per proposed post.
2. **One decision per post** (Queue tab):
   - approve exactly one caption, or reject, ask for a revision (with a note), or defer;
   - the approval binds the digest of that caption's publish bundle: the caption text, graphic sha256, evidence, verification and data commit.
3. **You post it on X by hand**, then record the link: **Record X link** is the publishing receipt. Optionally use **Mark scheduled** first, and later **Engagement** numbers copied from X analytics.
   - Lifecycle: drafted → approved → scheduled → published, or rejected / revise / deferred. When a later queue proposes the same post again, the older proposal shows as superseded.

### Package types

| Kind | Built from | Graphic | READY when |
|---|---|---|---|
| `nfl-recap` (one per game) | Forecast Ledger + the receipt of record | `nfl-recap@1` card | The integrity gate passes (else listed as skipped with the gate's reasons) |
| `results-recap` NBA | Write-once finals record (results only: the ledger has no NBA rows) | `results-card@1`, 6 games per card | Always, from finals |
| `results-recap` EPL | Results file + the published, settled `epl_1x2` Official Forecast | `results-card@1`, 4 matches per card | The forecast row passes the gate rules; otherwise the match is shown as a result only and listed |
| `pregame-forecast` NFL | The freeze-time verifier (§3) | — (text) | The verifier says READY. It is re-checked at approval, at publication and after kickoff |
| `explainer` | The public registry's `method` and Model Performance sentences, verbatim | — | The sport's forecast publishes (FULL_MODEL / EXPERIMENTAL_PUBLIC) |
| `engagement` | The day's schedule capture | — | The capture is from the post's own date (sport-schedules runs at 05:07 ET) |
| `x-reply` | ChatGPT's calendar draft + Grok's cited posts | — | Never on its own: approving needs your recorded confirmation that you opened the cited posts |

**Captions.** Every package gets deterministic template captions built only from its evidence. Where the calendar slot has ChatGPT's draft, it rides along as caption C, labelled "ChatGPT's wording". All captions pass the same checks:
- every number is in the evidence;
- no forbidden or betting words (the "Not betting advice" disclaimer itself is allowed);
- no links;
- 280 characters or fewer;
- no retired public phrase;
- a missed forecast is stated as a miss;
- a post with no forecast in its evidence can't state a forecast value.

A failing caption stays visible but can't be approved.

**Not queued, with the reason shown:**
- MLB recaps: no MLB results pathway (optional, season ending);
- EPL and MLB pregame posts: no freeze-time source yet;
- live updates: no publishing path;
- unchosen slots.

## 2. "Official Forecast" vs EXPERIMENTAL_PUBLIC: resolved from the registry

The authoritative product registry is `app/src/lib/public-registry.ts` (founder directive 2026-10-23). It reads its gate from `sport-capability-registry.ts`.

- **NFL is an Official Forecast.** Its family `nfl_team` publishes as `OFFICIAL_FORECAST`, and the public term is "Official Forecast".
- **EXPERIMENTAL_PUBLIC is the capability, not a label.** It means "published and graded, not product-eligible" (`canEnterPredictionProducts` = FULL_MODEL only).
- **The disclosure appears once per sport.** The registry carries "how far to trust it" as the sport's single Model Performance sentence. It retired per-item "experimental" hedges (`RETIRED_PUBLIC_PHRASES`).

**So the NFL card keeps "Official Forecast vs Final".** Its footer now carries the registry's sentence: "Model Performance: Tested on past seasons; not yet shown to out-predict the sportsbook market." The old "Experimental model" line is gone. Specifically:
- `recap/public-registry.mjs` reads the registry (fail-closed); no graphic renders without a registry label;
- captions refuse retired phrases;
- the calendar's draft check no longer demands the word "experimental";
- "pick" and "bet" stay forbidden (EXPERIMENTAL_PUBLIC is not product-eligible).

If you'd rather show a visible "experimental" marker, that is a product-registry change, not a Command Center one.

**Found while resolving it (for CP3, not changed):**
- The public registry lists UFC and NBA Official Forecasts, while the capability registry says SCAFFOLD_ONLY / HISTORICAL_ONLY.
- The queue therefore holds UFC/NBA explainers at NEEDS_VERIFICATION instead of choosing wording.

## 3. Freeze-time verifier (`recap/freeze-verifier.mjs`)

The site's rule (`forecast-of-record.mjs` §2) is that the forecast of record is the **last version published before kickoff**. NFL versions re-freeze until kickoff:
- daily receipts, plus same-day `-rev-HHMMZ` kickoff refreshes;
- SF @ ATL had 37 versions, the last frozen 90 seconds before kickoff;
- CAR @ GB moved 63.7% → 63.8% between Oct 26 and Oct 27 ET.

Before kickoff, nobody can know the record, so the verifier checks in two phases.

**Before kickoff: READY only if all of these hold:**
- a version is frozen;
- the site's public forecast file shows that same version;
- every number in the post equals it;
- the data commit is at most 60 minutes old (`GTP_CC_MAX_DATA_AGE_MIN`);
- kickoff hasn't passed.

The other outcomes:
- a changed number → BLOCKED (redraft);
- anything it can't confirm → NEEDS_VERIFICATION, with the reason;
- the caption states the version it quotes ("frozen Oct 27, 8:16 PM ET").

The check re-runs at approval (refused if anything changed) and when you record the link, where it warns if the version moved or the post went out after kickoff.

**After kickoff:** the next queue build re-checks every published pregame post against the record. The record is the ledger row's receipt, or, until that row enters, the last version frozen before kickoff. It records CONFIRMED, or SUPERSEDED with both numbers so you can decide on a correction.

## 4. What was verified

- **Tests:** full suite normal and network-blocked (see the commit message for counts). D1 tests:
  - `tests/queue.test.mjs`: registry labels, verifier branches on synthetic and real data, NBA/EPL bundles, card determinism, every decision and receipt refusal, supersession, and pregame approval → schedule → publish → after-kickoff CONFIRMED;
  - `tests/queue-console.test.mjs`: desktop 1440 and iPhone 390/430. Approve a caption, record the X link, save engagement, refuse an unconfirmed X reply; no sideways scroll, touch targets of 40 px or more.
- **Real data (copy of the console ledger, `origin/main` @ fe6b9212b879):**
  - today's queue: 25 packages: 13 NFL recap cards, 5 NBA and 2 EPL result cards, 2 explainers, 2 X replies, 1 engagement post. That dry run raised 24 decisions because one X reply was wrongly BLOCKED by an over-strict check, fixed before commit. The first real run (`cmd-6cc2f9d69867`, data `6e8b6d41be`) has 25 packages and 25 decisions;
  - tomorrow's: CAR @ GB pregame READY at 63.8%.
- **Found and fixed while building it:**
  - the verifier initially missed same-day revisions;
  - the calendar's EPL count missed "AFC Bournemouth" vs "Bournemouth";
  - superseded posts were detected by timestamp (now ledger order).
- **Independent review (a separate agent, read-only), nine findings, all fixed with regression tests:**
  1. A game with no published side crashed its slot, taking the rest of the day's pregame posts with it. Every game, card and event is now built in isolation.
  2. Game-day recap slots were never built. They now go into the next morning's queue, and an empty result set is listed rather than vanishing.
  3. The data-age check failed open on a working-tree source. Unknown freshness is now NEEDS_VERIFICATION.
  4. EPL club matching accepted any shared word ("United"). One name must now contain the other.
  5. The console's step-up mirror lacked the X-link receipt, so it would 403 in hosted mode.
  6. An X reply with no specific cited post could be "confirmed". It is now BLOCKED.
  7. A published post could claim a second link. That is refused.
  8. Sub-display probability changes (63.66% → 63.68%) raised false redraft and correction alerts. Comparisons now use the stated one-decimal figure.
  9. Two queues racing could give one post two approvals. There is now an atomic one-approval-per-post claim, and duplicate requests show as superseded.

## 5. Limits

- **The receipt is your attestation.** The Command Center checks the link's format, the account handle (set `GTP_CC_X_HANDLE`) and that the link isn't reused. It does not fetch X.
- **Engagement numbers are yours** and labelled as such.
- **Approvals are demo-grade** on the loopback console until hosting adds passkeys (H1). Hosted, the approval and the X-link receipt require Face ID / Touch ID step-up.
- **Data freshness:** data is only as fresh as the last `git fetch`. A stale commit holds pregame and engagement posts at NEEDS_VERIFICATION.
