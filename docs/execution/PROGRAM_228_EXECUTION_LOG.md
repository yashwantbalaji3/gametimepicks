# Program 228 — product completion and public polish

Session 2026-09-01, 13:55 → 14:40 ET (17:55 → 18:40 UTC). Entry `f8a2d6c6d` → close `508c179c1`.
Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both pre-existing stashes and `vp/`
untouched; **no paid calls**.

---

## Phase 0 — the chain proved itself on live data

Today's MLB slate landed while Phase 0 ran (`adc74108e`, `8823c1b13`). Recomputing the offered
window moved MLB from **15 `NOT_YET_CAPTURED` → 15 `PUBLISHED`** — free StatsAPI population, paid
board capture, simulations, predictions and publication all reconciled by `gamePk`, with conservation
exact. That is E0/E1 working end to end on real data rather than on fixtures.

## Release F0 — which products actually have a lifecycle

A closed daily state machine has existed since P211, naming exactly two products. Every other
registered signature product runs its own bespoke path, and the answer to "which products are
governed?" lived in one hardcoded array inside a watchdog function.

The inventory is **evidence, not status**: six dimensions per product, each derived from the
repository itself — a path that exists, a workflow that names a script, a product the state machine
lists. A product whose producer is deleted shows up as ungoverned the same day.

| product | verdict | | |
|---|---|---|---|
| bank-builder | GOVERNED | 6/6 | |
| moonshot | PAUSED_FOUNDER | 4/6 | `MOONSHOT_REPAIR_PAUSE_OR_RETIRE` |
| homer-nukes | PARTIAL | 5/6 | missing: lifecycle |
| end-zone-vault | PARTIAL | 5/6 | missing: lifecycle |
| ufc-cards | PARTIAL | 5/6 | missing: lifecycle |
| epl-cards | PARTIAL | 5/6 | missing: lifecycle |

Four products have producers, routes, automation, ledgers **and** settlement, and lack only the
shared contract. That is the precise, actionable gap.

**Publishes-without-settling is singled out** rather than counted as one gap among six, because it is
the shape that produces a public record nobody can ever check — exactly what Moonshot did with two
cards for fifteen days. Currently: `moonshot`.

**A founder gate is not a coverage failure.** Counting it as one makes the gap list unreadable and
pressures someone into "fixing" a product paused on purpose.

The four PARTIAL products are deliberately **not** added to `GOVERNED_PRODUCTS` yet: listing a product
that emits no receipts would make the watchdog cry `MISSING_DAILY_EVALUATION` daily for something
nobody has wired. The gap is stated once, in the coverage artifact, where it can be closed one product
at a time.

Also fixed: a real staleness the P224 index guard caught live — `sport-schedules` captured a second
NFL game at 17:03Z while the index was still from 05:38Z reporting one.

---

## INCIDENT — open, and not from this release

`/build/custom` is **1497 KB against a 1400 KB budget**, first breached when today's 15-game slate
landed (`adc74108e`, already on origin before this session's work). The page serializes ~618 legs ×
~30 fields so the builder can filter client-side.

There is no surgical fix: the payload is broadly distributed, the largest single field is `photoUrl`
at 48 KB of 989 KB, and removing every image URL still leaves it over. Capping the pool would hide
records, which that guard explicitly forbids. **The budget was not raised** — raising it is the same
act as hiding records, one level up.

The fix is structural — server-side filtering or progressive loading — and belongs to Release I/J. It
recurs on any large slate.

---

## Remainder

`F1–F3` (extend governance product by product) · `G` Top Picks and tiers · `K1` command-centre
completion · `I` public IA · `J` visual/interaction · `L` governance · `M` convergence — all
ENGINEERING_OPEN.

**INCIDENT:** `/build/custom` page weight (above).
**FOUNDER_GATED:** NFL odds renewal (P171 receipt expired by its own terms); Moonshot
(`MOONSHOT_REPAIR_PAUSE_OR_RETIRE`).

Next, dependency-ordered: fix the `/build/custom` payload at the render owner → close the four
lifecycle gaps one product at a time → G.
