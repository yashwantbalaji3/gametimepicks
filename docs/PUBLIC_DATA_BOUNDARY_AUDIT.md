# Public Data Boundary Audit

**Program:** 073–075 · **Date:** 2026-07-30 · **Scope:** everything under `app/public/data/` and what the production export actually serves.

---

## The finding that matters

**Production is serving `data/admin/status.json` today (HTTP 200), and it contains the protected money hash `affe6b21…` plus money-gate, product-readiness and workflow-health internals.** It is written daily by the nightly bot and its only reader is the `/ops` page — which is itself pruned from the export. The payload ships publicly with no consumer.

It is not a credential (the md5 is an integrity fingerprint of a paper-money artifact), so this is an exposure of *internal operational detail*, not of money. But the program's boundary rule is explicit — protected-state details do not ship — and the same gap ships five other internal roots (below).

**Why it happens:** the deployed prune script removes only data files carrying an explicit `public: false` marker — an allowlist-by-annotation that rots the moment a writer forgets the flag (the bot-written `admin/status.json` has no flag at all). **The fix is already on this branch:** the interrupted Program 069 lane rewrote `prune-internal-routes.mjs` to **deny-by-default** — the keep-set is derived from what the shipped HTML/JS/RSC actually references, an unresolvable `/data/` reference refuses the build rather than guessing, and `public-route-inventory.test.mjs` (7/7) guards it. The exposure closes when this branch deploys.

## Inventory and classification

27 data roots + 8 legacy root-level JSON files. Consumer counts are `grep` over `src/**` (imports *and* fetch paths — zero means nothing shipped can reference it).

### INTERNAL — no public consumer; deny-by-default prune removes them from the export

| Root | Last write | Written by | Contents |
|---|---|---|---|
| `admin/` | 2026-07-30 (daily) | build-admin-status bot | ops dashboard payload incl. money hash — **the headline finding** |
| `ops/` | 2026-07-30 (daily) | heartbeat workflow | run reports, heartbeat |
| `automation/` | 2026-06-23 (dormant) | WC lineup refresh | lineup-refresh status |
| `learning/` | 2026-07-28 | selection-policy exporter | 35 dated selection-policy files |
| `curated/` | 2026-07-29 | curation job | graded/snapshot working set |
| `daily/` | 2026-06-17 (stale) | legacy daily cards | dead product artifact |
| `product-ledger/` | 2026-07-08 | retired products | moonshot / wc-specials ledgers |

These stay in the repo (bots keep writing them; `/ops` reads `admin/` at build time) — they simply stop being mirrored into `out/`. No workflow edit required, which is why this is safe now rather than FUTURE WORK.

### PUBLIC_REQUIRED — served, consumed, kept

`mlb/` (142M — boards, results, simulations, predictions; 16 consumers) · `research/` (row-lineage sidecar, terminal contract) · `results/` · `mr-dub/` (money display artifacts — md5-pinned, never touched) · `bank-builder/` · `boards/` (NBA legacy display) · `methodology/` · `meta.json`/`build-info.json` (deploy verification fetches it from production by design).

### HISTORICAL_ARCHIVE — kept while their archive surfaces survive adjudication

`world-cup/` (188 files — closed destination; settlement receipts are accountability records) · `ufc/` (the settled UFC 250 card + rematch-safe regrade artifacts) · `nba/`, `nhl/`, `ipl/`, `cricket/`, `soccer/` (scaffold-sport display data — whether their *routes* survive is Lane B's adjudication; the deny-by-default sweep automatically drops whichever data loses its last consumer).

### STALE — superseded, no consumer, candidates for repo deletion (deferred)

Root-level `board.json`, `hit_rates.json`, `odds_props.json`, `slate.json`, `trends.json`, `players.json`, `schedule.json` (legacy NBA-era flat files; `meta.json` stays), `previews/`, `game-outlook/`, `model/`, `moonshot-lane/`. Deletion from the *repo* is deferred — some are written by dormant workflows, and deleting a bot's write target creates push failures; the export sweep already keeps them out of public reach, which is the boundary that matters. Marked FUTURE WORK with the owning workflow named per file.

## Evidence labels

- **MEASURED** — production serves `data/admin/status.json` with the money hash today; verified by direct request, not inference.
- **PROVEN** — the branch's deny-by-default sweep keeps only build-referenced data; refuses on unresolvable references; guarded by `public-route-inventory.test.mjs` (7/7) and the export-strings guard (which caught real "Sprint 035" leakage on `/picks` and `/market-guide` on its first run).
- **NAMED LIMITATION** — internal roots remain in the *repository* by design; the boundary enforced is the shipped export, not the git tree.
- **FUTURE WORK** — repo-level deletion of the STALE set, coordinated with the dormant workflows that write them; moving `admin/status.json` generation to `data/internal/` so the repo tree itself stops carrying the hash outside `data/internal/`.
- **REJECTED** — hand-maintained data allowlists (the `public:false` marker system this replaces rotted exactly as predicted); deleting bot write-targets mid-program.
