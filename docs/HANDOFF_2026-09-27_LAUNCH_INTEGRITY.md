# Handoff — 2026-09-27 · Launch Integrity P0 (overnight)

**Point-in-time snapshot.** The canonical docs and the live repo override this.
`git log origin/main` and `gh pr list` are current truth.

Known main at writing: **`96a5ddecc2`** (PR #714).

---

## 1. What merged

| PR | § | What |
|----|---|------|
| #708 | §22 | the model's probability existed on all 371 legs and was discarded in one line |
| #709 | §19 | QB-starter shadow measurement (shadow-only, no published numbers) |
| #710 | §13 | one canonical payout convention + stake validation |
| #711 | §15 | the eleven-clock freshness contract + read-only surface audit |
| #712 | §11 | keep the legal gap honest while it is open |
| #713 | §14 | a leg replacement must come from the same sport |
| #714 | §12 | the one modal that bypassed the shared dialog primitive |

**Open:** #715 (§8 card lifecycle, gate running).
**Draft, MUST NOT MERGE:** #716 (§18 publication boundary) — see §4 below.

---

## 2. The three findings worth carrying forward

### §13 — the payout loss was the AMERICAN round-trip, not the multiplication

`+133 / -130` on $100 displayed **$412.00** for a slip worth **$412.23**. American format cannot
represent 4.1223; it quantises to +312. Two UI surfaces rebuilt the payout from that rounded display
price **while the exact decimal sat one line above them** (`build-experience.tsx:249`,
`normalize.ts:404`).

`combinedDecimal` is now a REQUIRED prop and card field, so a new producer is a compile error rather
than a silent loss. Verified live on prod `/mlb` — real corrections of −10¢ and +20¢ per $100.

One documented exception, and it is **not** a rounding: where a producer publishes only a combined
American price, that price IS the source. Recomputing it from per-leg prices would silently move a
published payout, which is a product decision.

### §8 — money was standing in for a lifecycle

```js
settlement.status === "none" || settlement.realizedPnl === 0
  ? " · no card settled (no-play day)"
```

`realizedPnl` is `0` on a day whose cards are published and unsettled — `placed-lanes.mjs` emits
`{ status: "pending", realizedPnl: 0 }` *precisely when cards are active*. So `/results` printed
**"no-play day"** over real published exposure.

Money is now **unreachable** from the derivation: `cardLifecycleOf` accepts no P&L parameter at all.
Zero realized money is the honest state of four different lifecycles.

⚠ §8 asks for ONE canonical lifecycle. **There are five**, each with a genuinely different subject,
now a closed registry — which found the fifth on its first run. `CARD` (what happened) and
`CARD_LIFECYCLE` (how far along) are one character-class apart and both carry a `VOID`.

### §19 — the over-allocation was backup contamination, not a mis-scaled model

Applying "only the depth chart's QB1 holds a pass-attempt share" takes the 2026-09-27 slate from
**9 over-allocated pools to 1**. Cleveland's 243% case lands at 0.984.

The finding: survivors fall at **0.947–0.991 without any renormalisation**. §20 keeps rescaling
behind a model-promotion gate, and it is not needed to fix this.

The two pools the rule cannot fix needed separate labels because the remedies differ:
- **WSH** — Jayden Daniels appears on no board in any market (roster/identity gap).
- **MIN** — Kyler Murray IS on the board with no pass-attempt projection, so MIN's published pool is
  Wentz + McCarthy + Brosmer (Σ2.274) and **no starter**. A projection-builder defect.

Publishing remains a founder gate (§2.5, after Sunday acceptance).

---

## 3. ⚠ Six guard-defect classes — all found in guards I wrote this same night

Check for these before trusting any new guard:

1. **A content-addressed filename carries no order.** `2026-a2bc…` (Sep 8) beat `2026-10d6…`
   (Sep 26) lexically, all 26 pools came back STALE, and the report would have blamed the pipeline
   for freshness it actually had. Sort by the artifact's own `acquiredAt`; refuse one without it.
2. **Reading a field the producer never emits.** `conservationForBoard` emitted `largest`, not
   `players`, so every pool reported "starter not on board" — which reads exactly like a real source
   disagreement.
3. **Redundant defences hide from mutation testing.** Two overlapping checks mean removing either
   changes nothing, so both probes pass. That looks like two guards and is none.
4. **A guard keyed on the symptom's PRESENCE is blind to its absence.** The dialog guard enumerated
   files *containing* `role="dialog"`; a modal omitting it was invisible. Search by structure.
5. **Matching the mention, not the thing** — twice in one night. `/continue-on-error/` matched the
   step's own warning text; `exit "$rc"` matched my own comment. **Strip comments before asserting.**
6. **Asserting the outcome, not the reason.** A `NOT_A_CLOCK` test passed with the comment check
   removed, because the line was then excluded for a different reason. Assert `why`.

Also: **`console.log(JSON.stringify(…))` then `process.exit()` truncates at exactly 65536 bytes on a
pipe** and hands its consumer invalid JSON under a *success* exit code. Use `fs.writeSync(1, …)`.
But do **not** assert that `console.log` truncates — that is host-dependent and failed CI. Assert the
positive property: a synchronous write is complete.

---

## 4. #716 — prepared, must not merge

§2.7 is explicit: implement, test, probe and prepare the PR; **do not merge the behavioural
workflow-boundary change before Sunday acceptance** unless a real correctness incident makes the
current state more dangerous. It does not. Opened as a **draft** for that reason.

The defect: a write-once *publication* refusal on the Results projection (`exit 1`) skipped both the
health gate and the commit, so a night of validly computed settlement died with the runner.

The boundary keeps the step exiting 1 (the job still ends red, an operator still decides), lets the
**health gate still run and still decide**, commits only on a passed gate, and reverts the refused
dated projection so write-once integrity holds. Exit 2/3 set no flag — those mean the settlement
itself may be wrong.

---

## 5. Sunday acceptance readiness (verified, not assumed)

- **14 boards, ONE `generatedAt`** — `2026-09-26T23:23:23Z`. Frozen, coherent, untouched by any of
  tonight's merges.
- **Production serves the same baseline** and is current with merged work.
- `nfl-lifecycle-trace.mjs --date 2026-09-27` → `IN_FLIGHT — 14 game(s): 0 clean, 14 in flight,
  0 needing attention`; every board carries 4 published families.
- **No untracked live-props files remain**, so the `git pull` abort hazard reported earlier is gone.
- `nfl-live-props.yml` cron `*/15 13-23 * * 0` fires **for the first time today** from 13:00Z. Its
  one manual dispatch (2026-09-25) succeeded, so the job itself works.

---

## 6. Still open

**Founder gates**
- **§11 legal** — `operator` is a placeholder; `state`, `contact`, `effectiveDate` undecided; no named
  reviewer, approval date, packet version or reviewed content hash. None of it is inventable.
- **§2.5 QB starter publication** — pre-authorised only AFTER Sunday acceptance.
- **#716** — after Sunday acceptance.

**Engineering**
- §14's remaining half: imports must preserve date, provenance, eligibility state and source.
  `SlipLegInput` carries only `sport`. This is a **persisted** browser-local draft schema, so it needs
  a migration, and §14's own long-term answer is ProductEligibleLeg V2 — that work belongs there.
- §16 Simple/Analyst, §17 event-quality panel, §18's diagnostics half, EPL identity/availability.
- Wiring the §15 clock contract into surfaces (deliberately deferred: re-labelling a published
  surface waits for acceptance).
