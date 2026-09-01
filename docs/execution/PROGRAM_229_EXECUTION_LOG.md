# Program 229 — incident recovery

Session 2026-09-01, 14:40 → 15:55 ET (18:40 → 19:55 UTC). Entry `20b27f717` → close **`a44e6e63b`**.
Production `a44e6e63b` — exact. Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both
pre-existing stashes and `vp/` untouched; **no paid calls**. Covering gate `33546157706`: phase 1,
build, phase 2, structural accessibility and the browser matrix all success.

---

## Release 0 — the payload incident, closed

**`/build/custom` 1497 KB → 1071 KB against an unchanged 1400 KB budget.** Main was red on this and
every gate was blocked.

### Root cause, measured rather than guessed

The client payload is one 983 KB RSC flight. **549 KB of it — 65% — was `eligibleLegs`: all 610 legs
serialized in full.** The explorer renders at most 60 legs per sport and otherwise resolves a leg
only when a card references it (79 of them). So **481 of the 610 were shipped complete in order to be
counted and nothing else.**

Three earlier hypotheses were wrong and each was cheap to disprove — inline avatars (no data URIs,
221 `img` tags), the `slipLeg` identity block (65 KB), the 180-leg builder pool (180 KB). Measuring
each contributor rather than reasoning from field counts is what found it; my initial "618 legs × 30
fields" reading came from counting key occurrences across *several* collections at once.

### The fix is a projection, not a cap

A leg that is rendered or referenced keeps its full display object; the rest travel as
`{legId, sport, detailOmitted}`. The page still says **"Legs (610)"**, "+N more" is unchanged, and
every card lookup resolves. Verified live in production: 1070 KB, count 610, 481 omitted rows.

**The budget was not raised.** Raising it is hiding records one level up, which that guard explicitly
forbids. The render cap is now one shared constant rather than two literals that happened to match.

### The chunk architecture was not built, deliberately

The charter proposed detail chunks fetched on demand behind a manifest. The measurement made that
unnecessary: the payload was not large because the page needs a lot of data, it was large because it
shipped objects for rows it never renders. Projecting costs **zero extra requests** — no manifest, no
chunk-failure states, no loading spinner, and none of the corruption cases those would introduce.
Recorded in the test file rather than silently diverging from the charter.

### Two defects of my own, both caught by tooling

1. I put the shared cap and predicate in `ui-loader.ts`, which reads the filesystem. Importing it from
   the **client** component pulled `node:fs` into the browser bundle and webpack refused the build —
   correctly. A contract two runtimes share cannot live in a module only one can load.
2. The guard I wrote for that then matched the words `node:fs` inside the docblock **explaining** the
   defect. **Fifth appearance of this class.** Comments are stripped line-preservingly before scanning.

Also: `isDetailOmitted` typed against `{detailOmitted?: boolean}` was rejected at every call site — a
full display object shares no property with it — so it takes `unknown` and narrows.

---

## Remainder

`F1–F3` · `G` · `K1` · `I` · `J` · `L` · `M` — ENGINEERING_OPEN.

**FOUNDER_GATED:** NFL odds renewal (P171 receipt expired by its own terms; no cron added, no paid
call made); Moonshot (`MOONSHOT_REPAIR_PAUSE_OR_RETIRE`).

Next, dependency-ordered: **F1** — the four PARTIAL products (Homer Nukes, End Zone Vault, UFC cards,
EPL cards) adopt the shared lifecycle one at a time, each entering `GOVERNED_PRODUCTS` only once it
emits daily receipts → **F2/F3** automation and independent ledgers → **G**.
