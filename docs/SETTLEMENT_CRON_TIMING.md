# Settlement Cron Timing

> **Scope:** scheduling/documentation only. This change touches the
> `nightly-settle` workflow's cron schedule and this doc. It does **not**
> change any model, projection, optimizer, grading, or settlement *logic*,
> and it does **not** add any paid-API call. Settlement remains free (MLB
> Stats API + ESPN/nba_api only, 0 odds credits).

## 1. Old schedule

`.github/workflows/nightly-settle.yml`

```yaml
schedule:
  - cron: "0 7 * * *"   # 07:00 UTC
```

- Single pass at **07:00 UTC = 3:00 AM EDT / 2:00 AM EST**.
- Chosen historically for a comfortable margin past the latest West-Coast
  MLB games, at the cost of results landing ~3 hours after the East-Coast
  slate finished.

## 2. New schedule

```yaml
schedule:
  - cron: "30 5 * * *"   # 05:30 UTC — early "first results" pass
  - cron: "30 7 * * *"   # 07:30 UTC — completeness / repair pass
```

Two passes per night in the **same** workflow (GitHub Actions supports
multiple `cron:` entries). Both runs target "yesterday in America/New_York"
and run the identical, idempotent `scripts/automation_settle.sh`.

## 3. ET conversion

Cron is always interpreted in **UTC**; the wall-clock ET time shifts by an
hour at the DST boundary.

| UTC      | Eastern (EDT, ~Mar–Nov) | Eastern (EST, ~Nov–Mar) |
|----------|-------------------------|-------------------------|
| 05:30    | **1:30 AM EDT**         | 12:30 AM EST            |
| 07:30    | **3:30 AM EDT**         | 2:30 AM EST             |

The operator target was **"around 1:00 AM Eastern."** In June (EDT) the
first pass lands at **1:30 AM ET** — the closest *safe* time to that target
(see §5 for why a literal 05:00 UTC / 1:00 AM EDT was rejected).

## 4. Why chosen

- **Freshness:** the early 05:30 UTC pass delivers the bulk of the previous
  night's settled results ~1.5 hours earlier than the old single 07:00 run,
  so `/results` and the homepage reflect last night's slate by ~1:30 AM ET
  instead of ~3 AM ET.
- **Completeness:** the 07:30 UTC repair pass is **30 minutes later** than
  the old single run, giving *more* finality margin than before for the
  longest West-Coast / extra-inning / rain-delayed games. Because settlement
  is idempotent and re-targets the same date, the repair pass finalizes
  anything the early pass left pending.
- **Self-limiting deploys:** the workflow's commit step only commits when the
  data actually changed, so the repair pass produces a *second* commit/deploy
  **only on nights where late games were still in progress at 05:30**. On a
  clean night there is no second deploy.
- **No literal 05:00 UTC:** 1:00 AM EDT is genuinely too early for MLB
  West-Coast finality (see §5), so 05:30 UTC was chosen as the earliest pass
  that keeps NBA fully final and most of MLB final, with the repair pass as
  the safety net.

## 5. Finality risks (audited)

**NBA — negligible risk at 05:30 UTC.** In June the NBA slate is the Finals:
a single prime-time game (~8:30 PM ET tip) that ends ~11:15–11:30 PM ET.
Even a hypothetical late West-Coast playoff game is final well before
1:30 AM ET. NBA settlement additionally refuses in-progress games at the
ESPN source layer (`competition.status.type.completed` must be true).

**MLB — real but contained risk at 05:30 UTC.** West-Coast first pitches are
~9:40–10:10 PM ET (6:40–7:10 PM PT). A typical 3-hour game ends ~12:40–1:10
AM ET — usually final by 1:30 AM ET. But long games, extra innings, and rain
delays can push finality to ~1:45–2:30+ AM ET. So at 05:30 UTC a *minority*
of MLB games on a busy summer night may still be in progress.

How that is handled safely:
- `pipeline.mlb.settle_mlb_results` returns `partial: true` and **excludes**
  any still-in-progress game from W/L — it is **never counted as a loss**.
- The early pass settles everything that is final; the unresolved games stay
  honestly **pending** in the public UI.
- The 07:30 UTC repair pass (idempotent, same date) finalizes them.

**Why not the literal 05:00 UTC (1:00 AM EDT):** it moves the early pass
into the window where a meaningful fraction of West-Coast MLB games are still
live, maximizing transient-pending churn for only 30 minutes of extra
freshness. 05:30 UTC is the better freshness/finality trade. 06:00 UTC
(2:00 AM EDT) is an even safer single-pass alternative if the operator
prefers to drop the early pass entirely (see §6).

| Candidate | ET (EDT)  | NBA final? | MLB final? | Partial risk | Notes |
|-----------|-----------|------------|------------|--------------|-------|
| 05:00 UTC | 1:00 AM   | yes        | many no    | high         | too early for West-Coast MLB |
| **05:30 UTC** | **1:30 AM** | **yes** | **most yes** | **moderate** | **chosen early pass** (paired with repair) |
| 06:00 UTC | 2:00 AM   | yes        | nearly all | low          | good single-pass alternative |
| **07:30 UTC** | **3:30 AM** | **yes** | **yes**  | **negligible** | **chosen repair pass** |
| 07:00 UTC | 3:00 AM   | yes        | yes        | negligible   | previous single run |

## 5b. GitHub Actions scheduling reality (important)

GitHub Actions **scheduled** workflows are best-effort and are frequently
**delayed** during queue congestion — the cron time is an *earliest* bound,
not a guarantee. Observed actual `nightly-settle` fire times vs the 07:00 UTC
schedule:

| Date (UTC) | Scheduled | Actually fired | Delay   |
|------------|-----------|----------------|---------|
| 2026-06-03 | 07:00     | 11:48          | +4h48m  |
| 2026-06-02 | 07:00     | 11:10          | +4h10m  |
| 2026-06-01 | 07:00     | 12:26          | +5h26m  |
| 2026-05-31 | 07:00     | 09:39          | +2h39m  |

Consequences for this design:
- Moving the schedule to **05:30 UTC sets an earlier floor**, but real
  settlement freshness is ultimately bounded by GitHub's queue. Expect actual
  fires to still drift later than 1:30 AM ET on busy mornings.
- The delay *reduces* partial-settlement risk in practice (by the time a
  delayed 05:30 run actually fires, MLB games are even more likely final) —
  but we do **not** rely on that; the idempotent partial-safe settlement +
  repair pass is the real safety net.
- Top-of-hour (`:00`) slots are the most congested. The new schedule
  deliberately uses **`:30`** offsets to dodge the worst congestion.
- For a hard latency guarantee, only a self-hosted runner or an external
  scheduler (out of scope here) would help. No such change is made.

## 6. Fallback / repair guidance

- **Built-in repair:** the 07:30 UTC pass is the automatic repair. Both
  passes resolve to the same "yesterday in ET" date because 05:30 and 07:30
  UTC are both still the previous ET calendar day (before ~04:00 ET).
- **Concurrency:** the workflow uses `concurrency.group: nightly-settle` with
  `cancel-in-progress: false`, so the two passes queue rather than collide if
  one runs long.
- **Manual catch-up:** if a game is *still* in progress at 07:30 UTC (rare —
  a suspended/long-delayed game), re-run settlement for that specific date
  via **Actions → nightly-settle → Run workflow** with
  `settle_date = YYYY-MM-DD`. The run is idempotent and free.
- **If the operator prefers a single pass:** replace both cron lines with a
  single `- cron: "0 6 * * *"` (06:00 UTC = 2:00 AM EDT) — one deploy/night,
  very low partial risk, still an hour earlier than the old 07:00 run.
- **Deploy-cost note:** the unresolved duplicate Vercel project means each
  push currently triggers two deploys. The repair pass only deploys on
  late-game nights, but until the duplicate project is disconnected, plan for
  up to two settle commits × two Vercel deploys on those nights. See
  `docs/VERCEL_DUPLICATE_PROJECT_CLEANUP_STEPS.md`.

## 7. No paid API use

Settlement uses **free public APIs only** — MLB Stats API for MLB, ESPN
summary + `nba_api` for NBA. `scripts/automation_settle.sh` makes **0 odds
credits / 0 paid calls**. This timing change adds no API call of any kind.
Projection generation (the paid `morning-projections` Odds-API flow) is a
**separate** workflow and is untouched.

## 8. No model behavior change

No change to projections, optimizer scoring, parlay ranking, grading logic,
or any model weights. Settlement still:
- refuses in-progress games at the source layer,
- excludes pushes from the hit-rate denominator,
- never counts a pending game as a loss,
- regrades all optimizer snapshots from the freshly-settled `settled_leans`
  (idempotent; final grades unchanged).

Only the **trigger times** changed.
