# Admin Dashboard Spec — GameTime Picks

*The internal ops view. A read-only v1 ships now at `/ops`; write actions (approve a card, trigger a
refresh, deploy) are future work behind protection. This spec is the contract.*

## Principles
- **Read-only first.** v1 shows state; it never mutates money, data, or deploys. Every write action waits
  until there is real access protection.
- **Only canonical, already-public data.** The dashboard aggregates figures that are ALREADY visible on the
  public pages (money, slate, active cards). It exposes no secrets, no API keys, no internal-only numbers —
  so a read-only v1 is not a data-exposure risk. It is kept out of the public nav and marked `noindex`.
- **Derived, never a second source of truth.** Everything renders from `app/public/data/admin/status.json`,
  which `build-admin-status.mjs` derives from canonical artifacts (and md5-guards portfolio.json).

## `admin/status.json` contract (v1 — shipped)
```jsonc
{
  "generatedAt": "ISO",
  "canonical": { "record": "17-14", "bankroll": 19065.4, "crown": 20465.4, "drawdown": 1400, "profit": 18965.4, "roiMultiple": 189.65, "portfolioMd5": "…" },
  "moneyGate": { "crownMinusDrawdownEqualsBankroll": true, "dailyTracksCanonical": true, "pass": true },
  "slate": { "date": "2026-07-06", "activeBankroll": 19065.4, "openExposure": 125, "worldCupGames": 5, "mlbGames": 8, "mlbSlate": "2026-07-06" },
  "products": {
    "bankBuilder": { "activeLanes": 1, "lanes": [ { "lane": "A", "status": "active", "step": 1, "legs": 2, "combinedOdds": -135, "stake": 100, "potentialReturn": 174.23, "selections": ["Spain or Draw", "Belgium or Draw"] } ] },
    "moonshot":    { "activeLanes": 1, "lanes": [ … ] }
  },
  "lastSettlement": { "date": "2026-07-05", "matches": 0 },
  "nextAction": "…derived one-liner…",
  "gates": { "note": "authoritative gates listed" }
}
```
Regenerate: `cd app && npx tsx scripts/build-admin-status.mjs [--now <ISO>]`. Pinned by
`src/lib/admin-status.test.mjs` (money matches canonical; invariants hold; generator is money-safe).

## `/ops` page — v1 (read-only, shipped)
Sections, all from `status.json`:
1. **Canonical money** — record · bankroll · crown · drawdown · ROI · portfolio md5, with the money-gate
   badge (green when `moneyGate.pass`).
2. **Today's slate** — date · WC games · MLB games · active bankroll · open exposure.
3. **Active products** — Bank Builder + Moonshot lanes (status, legs, odds, stake→return, selections).
4. **Last settlement** + **Next action** (the derived one-liner).
5. **The gates** — the exact commands (copy-paste), so the operator can run the authoritative checks.
Kept out of nav; `robots: noindex`. Purely presentational; no buttons that write.

## Roadmap — v2+ (future, needs protection)
| Feature | Needs |
|---|---|
| Workflow status (failed jobs) | `gh run list` piped into a small `admin/workflows.json` generator |
| Approve BB / Moonshot card from the UI | **auth** + a server action or a gated CI dispatch (no client-side money writes) |
| Trigger a refresh / roll-forward | **auth** + `workflow_dispatch` via a token, never client-side |
| Deploy status + release notes | Vercel deploy hook + `admin/deploys.json` |
| Custom change request inbox | `admin/change-requests/*.json` + the [CUSTOM_CHANGE_WORKFLOW](CUSTOM_CHANGE_WORKFLOW.md) |
| Model review summary | surface the latest `MODEL_REVIEW_*.md` headline |

**Protection options for v2 writes** (pick before shipping any write action): a Vercel middleware basic-auth
on `/ops`, a separate non-exported admin app, or keep writes entirely in CI (`workflow_dispatch`) so the site
stays static and the browser never holds a credential. Until then, `/ops` stays read-only.
