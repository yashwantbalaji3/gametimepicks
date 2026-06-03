# Methodology v2 — Shadow Tracking Runbook

> **Tracking only. No live behavior.** This runbook explains how to keep
> measuring Suggested Parlay Methodology v2 evidence as new slates settle,
> without changing the product. v2 **remains shadow-only**; nothing here wires
> live behavior, changes risk sections / daily targets / Bank Builder rules, or
> touches workflow schedules. It pairs with
> `SUGGESTED_PARLAY_METHODOLOGY_V2_2026-06-02.md` (spec) and
> `METHODOLOGY_V2_IMPLEMENTATION_DECISION_2026-06-02.md` (decision matrix).

---

## 1. Purpose

Gather more settled public-era evidence for the v2 rules (L5 5/5, Low = 5/5 &
odds ≤ −150, Bank L10 ≥ 8/10) until the small-sample buckets reach a usable size,
so the operator can make the live-vs-shadow decision on solid data — **without
any product change in the meantime**. The tool is read-only by default and
sources **true** L5/L10 from the board full season series (never the persisted
field), so it is correct regardless of any remaining stale artifacts.

---

## 2. Command to run after each nightly settle

```bash
cd app
# read-only console view:
npx tsx scripts/shadow-parlay-methodology-v2.mjs
# also persist the deterministic snapshot (overwrites the same file):
npx tsx scripts/shadow-parlay-methodology-v2.mjs --write-report
```

- **Auto-discovery:** the script finds every settled slate automatically (any
  date with a `parlays/optimizer-graded/<date>.json` file, in the public era,
  excluding banned May 25/26). **No code edit is needed when a new slate
  settles** — just re-run it.
- `--write-report` writes `docs/audits/methodology-v2-shadow-latest.md`
  (deterministic — same data ⇒ byte-identical file; no wall-clock stamp). Commit
  that file periodically to keep a tracked evidence trail.
- Best run **after `nightly-settle`** has produced the latest graded file (it
  settles the prior slate). Do **not** manually dispatch workflows to force it.

---

## 3. How to interpret sample sizes

The report's "Sample sizes (decided MLB legs)" table is the headline. Decided =
wins + losses (pushes and pending excluded). Watch these two gated buckets grow:

- **L5 5/5** — legs that hit all of their last 5 games (the Low/strong signal).
- **Low-eligible** — L5 5/5 **and** odds ≤ −150 (the strictest, smallest bucket).

A per-slate table shows the contribution of each settled slate, so you can see
the samples accumulate over time.

---

## 4. Minimum suggested evidence threshold

**≥ 40 decided legs** in each gated bucket (L5 5/5 and Low-eligible) before the
signal is treated as usable. As of the latest snapshot: **L5 5/5 N=17, Low N=14**
— both below 40. The script prints a `SAMPLE-SIZE WARNING` and the report marks
`≥40 met? NO` until the threshold is reached. **Even once met, make no public
win-rate claim** — see §5 and the spec §18.

---

## 5. No-live-wiring rule

This runbook and the script **never** change the live product. Do not wire any
v2 behavior from tracking output alone. A future live increment requires the
operator approval gates in
`METHODOLOGY_V2_IMPLEMENTATION_DECISION_2026-06-02.md §6`, and even then: no
padding, no fake cards, honest empty states, targets-as-targets, single-sport
official, Bank Builder paper-only, no `edgePct`/`confidence`, no win-rate claim.

---

## 6. When to reconsider Low-Risk-only v2

Reconsider the **Low-only v2 display filter** (decision-memo Option C) **only**
when **both**: (a) the **Low-eligible** bucket reaches **≥ 40 decided legs**, and
(b) its hit rate holds a clear margin over the model-selected baseline
(currently 79% vs 52%, but at N=14). If approved, it is a Low-section display
filter (all legs L5 5/5 + odds ≤ −150) with honest "target vs qualified" copy and
fewer cards on thin days — **Medium/High/Longshot and Results history
unchanged**. Shadow-audit + browser-verify first; pause before merge.

---

## 7. When to reconsider Bank Builder hard L10

**Default to NOT adding a hard L10 gate.** Bank Builder already matches the
desired direction — **$100 paper-only, L10 ≥ 8/10 as a soft "ideally"
preference, no forced card**. The `#249` shadow audit showed a **hard ≥70–80%
all-legs L10 gate starves candidates** (8/10 = 80% is in that range). Only
reconsider a hard gate if a future audit shows the candidate pool stays healthy
across many slates (a qualifying card on most slates) **and** the L10 ≥ 8/10
bucket shows durable lift (currently 63% at N=64). Never force a card; show the
honest empty reason instead.

---

## 8. When to reconsider full v2

Reconsider **full v2** (all four sections gated on L5 + the ~15-card target)
**only after all** of: (a) L5 5/5 and Low buckets ≥ 40 decided legs with durable
lift; (b) the L5 **4/5+** rule shows real lift (today it is 52% = baseline — no
edge, so Medium/High/Longshot would gate on a non-signal); and (c) the operator
has made the **#241 cap-vs-target decision** (raise caps vs accept fewer cards),
accepting the market/player/game concentration trade-off (only ~4 MLB markets).
Until then, full v2 is **not recommended**.

---

## 9. How to avoid May 25/26 leakage

The script hard-excludes **2026-05-25 / 2026-05-26** (`EXCLUDED_DATES`) and only
counts dates **≥ 2026-05-27** (`PUBLIC_ERA_START`). The report lists what it
included **and** what it excluded so the boundary is auditable every run. Do not
add those dates to any rate. Do not use `results/settled_leans.jsonl` for rates
(it includes 25/26 and is missing public-era dates) — the script uses the graded
optimizer files + board full series instead.

---

## 10. What to do if June 2 (or a future slate) is pending

- A slate is "settled" **only** when its `optimizer-graded/<date>.json` exists.
  Pending slates are **never** counted (no pending-as-loss, no premature
  settlement). The active (latest optimizer) slate is shown for **availability /
  feasibility only**, with outcomes used **only if** it has a graded file.
- If a freshly-settled slate's optimizer artifact predates the recentSeries fix
  (`#257`), its **persisted** field may be stale — but the script reads the
  **board full series**, so tracking is unaffected. (A live consumer would need
  that slate regenerated first; see `DATA_PIPELINES.md §2.1`.)

---

## 11. Expected operator decision points

1. **Each settle:** re-run the script; (optionally) commit the refreshed report.
2. **When L5 5/5 and Low reach ≥ 40 decided legs:** revisit the decision matrix —
   pick continue-shadow, Low-only v2 (Option C), or full v2 (only if §8 holds).
3. **Before any live wiring:** make the **#241 cap-vs-target** decision and clear
   all 14 approval gates (`METHODOLOGY_V2_IMPLEMENTATION_DECISION_2026-06-02.md`).
4. **Always:** June-1 stays historical; June-2 labeled v2 only if live v2 is
   approved; no padding; no win-rate claim.

*Artifacts: script `app/scripts/shadow-parlay-methodology-v2.mjs`; latest
snapshot `docs/audits/methodology-v2-shadow-latest.md` (auto-generated, do not
hand-edit).*
