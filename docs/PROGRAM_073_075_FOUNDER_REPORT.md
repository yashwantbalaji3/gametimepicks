# Program 073–075 — Founder Report

**Date:** 2026-07-30 · **Final deployed SHA:** `fdf51113` (verified serving on production)
**Companions:** `PROGRAM_073_075_EXECUTION_LOG.md` · `PUBLIC_CLEANUP_TEST_ADJUDICATION.md` · `PUBLIC_WEBSITE_PAGE_AUDIT_2026_07_30.md` · `PUBLIC_CONTENT_AND_FRESHNESS_REGISTRY.md` · `PUBLIC_DATA_BOUNDARY_AUDIT.md`

## 1. Refs

Start: `origin/main` = deployed = `d60cd7b1`; cleanup branch recovered at `8fbcf577` exactly as preserved. End: branch adjudicated → merged with `main` → **`fdf51113` pushed fast-forward and verified serving on production**. No force-push; bot history intact; the branch pointer was also pushed for the audit trail.

## 2. The adjudication (the heart of this program)

All **52 failures** ruled individually — none bulk-deleted: **5 RETAIN** (the World Cup Specials accountability ledger was wrongly stubbed; restored as a hardened, dated archive) · **~6 MIGRATE** (UFC truth pins → `ufc-archive.test.mjs`; the Bank Builder completed record → a crown-record guard with a 49-route known-negative) · **~22 REWRITE** (methodology re-pinned to difference-not-edge with an explicit no-"edge" negative; sport-chrome rescoped to the one real sport center; split tests kept their surviving halves) · **~17 REMOVE** (live-tournament chrome and dead-component rendering pins, deleted with their components) · **2 resolved by integrating main**.

**One ruling overrode the original cleanup:** `/ufc` became a dated settled **archive**, not a redirect — the redirect had orphaned the UFC 250 record (6–1, official ESPN settlement), which had zero other public surface. Accountability outranks minimalism.

## 3. What the public site is now

- **69 → 49 source routes; 256 → 175 exported HTML files** (the remainder are overwhelmingly per-game reports, each with a public purpose). Nav/footer expose only intentional destinations; eleven legacy hubs are redirect stubs.
- **The money-hash exposure is closed on production**: `data/admin/status.json` (and five sibling internal roots — 1,039 files, 328 MB) no longer ship, removed by the deny-by-default data sweep. Verified live: 404.
- **Internal routes are true 404s** on production (`/ops`, `/preview/*`) — payload, chunks and data all absent.
- **Internal language is gone and guarded**: the export-strings guard (proven on synthetic positives/negatives every run) caught the real "Sprint 035" leak on `/picks`/`/market-guide` on its first run; mobile QA caught registry vocabulary on the UFC archive banner; both fixed at source. Homepage no longer sells "UFC Simulations" for a scaffold sport.
- Archives are labelled (`UFC · Settled archive`, RETIRED Specials ledger); quarantined (07-28) and never-generated (07-29) remain visibly distinct on `/results`.

## 4. Validation

**3,556 tests · 3,552 pass · 0 fail · 4 skipped** (serial) · typecheck 0 · build 0 · health 18/18 · Python 219 · ops-alert + both pipefail guards green · money `affe6b21…` / lock `cb80473f…` unchanged before and after · `vp/` untouched. Mobile QA: one H1, no overflow, honest copy on every audited route, live-verified on production.

## 5. Open items (unchanged owners)

| Item | Owner | Next action |
|---|---|---|
| July 30 settlement + first clean lineage stamping | passive | 4/10 finals at push time (one delayed start); tonight's `nightly-settle` grades it — then run `npm run ops:public-beta-observe` |
| July 31 native stamping → first `PROVEN_STAMPED` rows | passive | next scheduled `morning-projections` |
| `OPS_WEBHOOK_URL` | **founder** | one GitHub secret; contract + safe test command in `OPS_ALERTING_CONTRACT.md` |
| Analytics endpoint | **founder** | sign §7; everything else is built and dark |
| EPL results vendor | **founder** | `EPL_RESULTS_SOURCE_DECISION.md` |
| morning-projections vs daily-refresh push race | engineering | serialize writers (documented in 066–068 log) |

## 6. Verdict

**Public-beta readiness: READY.** A first-time visitor now browses a coherent research terminal — today's slate, market intelligence, honest results with integrity states, methodology in public language, labelled archives — with no internal notes, no stale sport hubs presenting as live, no contradictory prediction framing, and the protected-state details off the wire. The remaining opens are calendar-bound proofs and three founder credentials, none of which block public use.
