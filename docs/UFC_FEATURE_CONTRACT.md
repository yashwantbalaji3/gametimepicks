# UFC Leakage-Safe Feature Contract

_The feature spec a UFC research engine MUST satisfy before any backtest. UFC is currently SCAFFOLD_ONLY
([status/ufc-graduation-decision.json](../status/ufc-graduation-decision.json)) — no data flows through this yet; this
is the groundwork that fixes the two confirmed leakage bugs (post-fight career stats; date-agnostic rematch joins).
Eligibility is enforced by `app/src/lib/ufc/feature-eligibility.ts` + tests. No modeling._

## The one rule

A UFC feature value is research-eligible only when it was provably known **before the first bell** AND was derived
**only from fights strictly earlier than the bout date**:

```
capturedAt < boutStartTime   AND   every sourceFightDate < boutDate
```

Equality is ineligible. A missing capture/bout time, or an undated source fight, is ineligible. The settlement join
MUST key on `boutJoinKey` (native boutId, else fighters+eventDate) — **never a bare fighter-name key**, so a rematch
can never join a past fight's result.

## Feature contract

| Feature | Source | Timing (publishedAt/availableAt) | capturedAt | Eligibility | Null behavior | Historical availability | Leakage risk |
|---|---|---|---|---|---|---|---|
| age at bout date | fighter DOB (reference DB) | static | build time | always (factual) | null if DOB unknown | full | none |
| height / reach differential | reference DB | static | build time | always | null if missing | full | none |
| stance | reference DB | static (rarely changes) | build time | always | null | full | none |
| scheduled rounds (3 vs 5) | event card | pre-event | pre-bell | capturedAt<bell | null → exclude | full | none if card frozen pre-event |
| weight class | event card | pre-event | pre-bell | capturedAt<bell | null → exclude | full | catch-weight edge cases |
| historical sig-strike pace / absorption | prior bouts only | per prior bout | build time | **sourceFights < boutDate** | null if <N prior | partial | HIGH — must exclude the current fight |
| striking defense | prior bouts only | per prior bout | build time | sourceFights<boutDate | null | partial | HIGH |
| takedown attempts / accuracy / defense | prior bouts only | per prior bout | build time | sourceFights<boutDate | null | partial | HIGH |
| submission attempts | prior bouts only | per prior bout | build time | sourceFights<boutDate | null | partial | HIGH |
| win/loss history, finish rate | prior bouts only | per prior bout | build time | sourceFights<boutDate | null | partial | HIGH |
| opponent-adjusted strength (Elo-style) | prior bouts only, opponent-adjusted | per prior bout | build time | sourceFights<boutDate | null | partial | HIGH |
| layoff length | last bout date vs bout date | last bout | build time | last bout < boutDate | null | full | low |
| short-notice indicator | announcement date vs bout date | announcement | pre-bell | announced<bell | false default | partial | medium (announcement timing) |
| replacement-opponent indicator | card change log | pre-event | pre-bell | change<bell | false default | partial | medium |
| prior 5-round experience | prior bouts only | per prior bout | build time | sourceFights<boutDate | 0 default | partial | HIGH |
| travel/altitude | venue (reference) | pre-event | build time | factual | null | partial (venue) | low — only where reliable |
| weigh-in result (made/missed) | official weigh-in | ~1 day pre-bout | pre-bell | weighIn time < bell | null | partial | **must be timestamp-proven pre-bell** |

## Rules

- **No imputation of private/unavailable information.** A missing feature is `null`, never guessed.
- **Point-in-time only.** Career-stat features are rebuilt from fights strictly earlier than the bout; the current
  fight is never in its own feature set (the confirmed leak).
- **Bout-identity joins.** Use `boutJoinKey`; a rematch is a distinct key from the earlier fight.
- **Weigh-in / short-notice** features count only when their timestamp is proven before the first bell.
- **Same gate everywhere** — capture, snapshot, join, assembly all pass through `ufcFeatureEligible`.
