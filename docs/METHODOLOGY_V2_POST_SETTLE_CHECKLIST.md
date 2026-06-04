# Methodology v2 — Post-Settle Operator Checklist

> **Docs-only. No product behavior.** A short, repeatable checklist to run after
> each `nightly-settle`. It changes nothing live — it only refreshes the
> **shadow** evidence and keeps live v2 **blocked** until the sample threshold is
> met. Full context: `METHODOLOGY_V2_SHADOW_TRACKING_RUNBOOK.md`; decision
> matrix + approval gates: `METHODOLOGY_V2_IMPLEMENTATION_DECISION_2026-06-02.md`.

**Standing rule:** v2 stays **shadow-only**. Do not wire live v2, change risk
sections / daily targets / Bank Builder rules, change workflow schedules, or
settle a slate manually. Never use May 25/26 rates; never use pending outcomes.

---

## Run this after each nightly settle

### 1. Verify a new graded slate exists
The slate is settled **only** when its graded file exists. Do not settle
manually; do not dispatch workflows — just check.

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git fetch -q origin && git pull --ff-only        # FF only
ls -1 app/public/data/parlays/optimizer-graded/ | tail -5
```
- **New `optimizer-graded/<date>.json` present** (a date later than last run, in the public era ≥ `2026-05-27`)? → continue.
- **No new graded file?** → **STOP.** The slate is still pending. Wait for the next `nightly-settle` (≈ 07:00 UTC / 3 AM ET). Counting a pending slate is not allowed.

### 2. Run the v2 shadow report
The script auto-discovers settled slates (banned **May 25/26** excluded; a slate
counts only once it has a graded file), so no code edit is ever needed.

```bash
cd app
npx tsx scripts/shadow-parlay-methodology-v2.mjs --write-report
```
- Writes/overwrites `docs/audits/methodology-v2-shadow-latest.md` (deterministic).
- Confirm the run's **Coverage** lines list the new slate under *included* and still list `2026-05-25, 2026-05-26` under *excluded*.

### 3. Inspect L5 5/5 and Low sample sizes
Open `docs/audits/methodology-v2-shadow-latest.md` → **"Sample sizes"** table.
Record the two gated buckets:
- **L5 5/5** decided N — `≥40 met?`
- **Low-eligible** decided N — `≥40 met?`

(Also note the hit rates, but the **sample size is the gate**, not the rate. The
script prints a `SAMPLE-SIZE WARNING` while either bucket is < 40.)

### 4. Update the report PR if it changed
Only when the report file actually changed (a legitimately-settled new slate).

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git diff --stat -- docs/audits/methodology-v2-shadow-latest.md
```
- **Changed?** → open a tiny **docs-only** PR (title: `Update methodology v2 shadow report after <date> settlement`) with just the refreshed report (+ a one-line index/memo note if useful). Merge **only** on `Vercel – gametimepicks` green + `mergeStateStatus = CLEAN` (if the duplicate `gametime-picks` project is rate-limited, report transparently before deciding). Sync main.
- **Unchanged?** → no PR.

### 5. Keep live v2 blocked until the evidence threshold is met
- **Threshold:** ≥ **40 decided legs** in **both** L5 5/5 and Low-eligible.
- While either is below 40 → **v2 stays shadow-only.** Do not wire any live
  increment (including a hard Bank Builder L10 gate — it starves, `#249`).
- When **both** reach ≥ 40 → do **not** auto-wire. Hand back to the operator to
  pick from the decision matrix (continue shadow / Low-only v2 / full v2), make
  the `#241` cap-vs-target call, and clear all 14 approval gates. Even then: no
  padding, no win-rate claim, single-sport official, Bank Builder paper-only,
  no `edgePct`/`confidence`.

---

## Current status (as of 2026-06-02)
- Settled public-era slates: `2026-05-27 … 2026-06-01` (5). June-2 **pending**
  (no graded file).
- **L5 5/5 N=17, Low N=14** — both **< 40** → **v2 shadow-only; live wiring
  blocked.**

*This checklist is operational guidance only. It never changes the live
product.*
