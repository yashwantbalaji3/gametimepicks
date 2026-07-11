# Live Metrics Snapshot — Template

**Maintained by:** Claude (VP). Copy this into `ops/snapshots/YYYY-MM-DD.md` (weekly, or day-of-launch and after). Pull values from `/ops` (`admin/status.json`), `portfolio.json`, the latest `MODEL_REVIEW_*`, and Vercel/analytics. **Every number must be real or marked `n/a` — never estimated (no-fabrication rule).**

The four north-star metrics (ADR-0003) are starred ⭐.

---

## Snapshot — YYYY-MM-DD

### ⭐ Product freshness (is the product current?)
| Metric | Value | Target |
|---|---|---|
| Consecutive days of fresh, gate-green slates | ____ | streak ↑ |
| Last successful nightly settle | ____ | prior day |
| Last successful deploy / rebuild | ____ | today |
| Active slate date vs today | ____ | current |
| Automation status (secrets set? loop hands-free?) | ____ | yes |

### ⭐ User trust (are we being believed?)
| Metric | Value | Notes |
|---|---|---|
| Losing records shown plainly? | ✅/❌ | Moonshot, WC Specials visible |
| Any fabrication / gate bypass incidents | ____ | must be 0 |
| Responsible-Use + disclaimer present all pages | ✅/❌ | |
| Qualitative feedback highlights | ____ | first-user reactions |

### ⭐ Daily active usage (is anyone using it?)
| Metric | Value | Notes |
|---|---|---|
| Unique visitors (day / 7-day) | ____ | source: ____ |
| DAU / returning | ____ | instrument if missing |
| Top routes | ____ | |
| Referral sources | ____ | |
> If analytics aren't instrumented yet, mark `n/a` and flag — instrumentation is a P2 doc/task.

### ⭐ Settled pick performance (is the model honest & okay?)
| Metric | Value |
|---|---|
| Canonical record (W–L) | ____ |
| Bankroll / crown | ____ |
| By market: DC / DNB / ML / Totals / BTTS / props | ____ |
| n (settled decisions) — tuning frozen until ≥10/cell | ____ |
| Latest model review link | `docs/MODEL_REVIEW_____.md` |

### Ops health
| Metric | Value |
|---|---|
| Odds API credits remaining | ____ (alarm < 5,000) |
| Gates last run (all green?) | ____ |
| Open incidents | ____ |
| Active BB lanes / next action | ____ |

### VP notes
- What changed since last snapshot: ____
- Top risk right now: ____
- The one thing to do next: ____
