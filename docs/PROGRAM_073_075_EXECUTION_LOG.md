# Program 073–075 — Execution Log

**Started:** 2026-07-30 16:37 ET · **Operator:** Claude (autonomous session)
**Mission:** finish the preserved cleanup by per-assertion adjudication; verify the real static export; integrate and deploy a truthful, minimal public site.

## Phase 0 — fresh-session recovery (16:37 ET)

| Check | Result |
|---|---|
| origin/main | `d60cd7b1` (== deployed production, verified earlier this day) |
| Cleanup branch | `program-069-public-cleanup` @ `8fbcf577`, exists locally + on origin, clean tree |
| Money / lock md5 | `affe6b21…` / `cb80473f…` ✅ |
| July 30 slate | **2/10 final** at 16:38 ET → Lane E remains WALL_CLOCK_OPEN; nightly-settle grades it |
| Failure reproduction | **52 failures reproduced exactly**: 49 named assertions + 3 file-level import failures |

**Complete failing-file map (verified by direct runs, superseding the prior 8-file estimate):**
`ufc-public-ready` · `ufc-model-gate` · `ufc-stale-card-gate` · `home/ufc-prediction-preview` (file-level) · `june16-count-and-run3` · `world-cup/wc-player-props` · `world-cup/round-of-32-static-params` (file-level) · `components/june21-premium-ui` (file-level) · `specials-tracker` · `cross-lane-correlation` (1 of 13) · `methodology/methodology-content` · `ladder-visibility` · `home-simulate-flows` · `home/spotlight-event` · `product-reset-phase-a` · `slate-liveness` · `workflow-failure-visibility` (2 — already fixed on main in `d60cd7b1`; resolves at integration).

## Adjudication (Lane A) — three clusters, in flight

Cluster agents own disjoint test files + subject surfaces: **UFC** (scaffold-only policy vs an elaborate live-looking hub), **World Cup + Specials** (closed destination; archive guarantees must survive, live-era chrome must not), **Methodology + homepage + sport chrome** (rewritten research-terminal page; guarantees rewritten to current policy, accountability records migrated, not erased). Every decision lands as a matrix row; assembled into `PUBLIC_CLEANUP_TEST_ADJUDICATION.md` at integration.

## Banked while adjudication runs

- **`478203ce`** — export-strings guard + fix. Calibrated against the real export first: `/picks` and `/market-guide` were shipping "As of Sprint 035…" engineering notes publicly, from one glossary string. Scanner proven on synthetic positives/negatives every run; sweeps `out/` when a build exists.
- **`df7b9db2`** — public data boundary audit. **Measured: production serves `data/admin/status.json` (200) carrying the money hash + workflow internals, daily, with zero public consumers.** Root cause: the deployed prune is an annotation allowlist (`public:false`) that rots; the branch's deny-by-default rewrite (from the interrupted 069 lane, guarded 7/7) closes it on deploy. Full 27-root classification in the doc.
