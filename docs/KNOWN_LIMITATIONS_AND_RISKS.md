# Known Limitations & Risks

Honest risk register. Nothing here is hidden; the product and these docs are
built on transparency.

## Model / performance

- **Poor public-era hit rate.** Public-era (from `2026-05-27`) slip results
  are weak; June-1 was **1W/47L**. Lifetime public slip hit rate is in the
  low teens. This is tracked openly on `/results`, never hidden.
- **Model edge is not predictive.** Per the 2026-06-02 calibration audit
  (`MODEL_CALIBRATION_2026-06-02.md`), `edgePct` is **anti-predictive** and
  `confidence` is **non-predictive** (it's binned edge). The model is
  overconfident and adds slightly **negative** value over the market.
- **Only market-implied probability separates winners** — i.e. the model's
  own signals don't beat the odds. A real fix requires
  projection→probability recalibration, not shipped.
- **Thin calibration sample.** ~217 settled legs over 5 days; per-day cells
  are noisy. Conclusions are directional and will sharpen with more data.
- **Volume discipline (#241) is not a performance fix** — it reduces
  overpublishing/repetition and makes empty states honest; it makes **no**
  hit-rate claim.

## Coverage / data

- **Only NBA + MLB are modeled.** All other leagues are schedule-only or
  coming soon; no model exists for them.
- **Schedule snapshots are point-in-time** (baked, attributed) and will age
  until refreshed; no automated refresher for `event-schedules.ts` yet.
- **Clock-gating:** today's projections don't exist until the 9:30 AM ET
  run; this is correct behavior, but means the product can show an honest
  empty/latest-available state for hours.
- **Paid dependency:** projections require The Odds API key (credit-guarded).
  Settlement is free (public APIs).

## Operational / workflow

- **No model feedback loop:** settlement results never adjust the model
  today; learning (`audit/policy.json`) is observational and unconsumed.
- **Scheduled GitHub Actions can be delayed/skipped**; runs may need manual
  dispatch. Static export means stale data persists until the next
  commit+deploy.
- **Two Vercel projects** (`gametimepicks` gate + `gametime-picks` legacy)
  can disagree transiently; only the `gametimepicks` check is authoritative.

## Compliance / copy

- Strict **no guaranteed/target hit-rate** and **banned betting copy** rules
  must be upheld in any new copy. Bank Builder must stay **paper-only**.
  Unsupported sports must never get picks.

## Diligence caveats (what is NOT validated)

- No validated predictive edge over the market.
- No long-horizon (multi-month) results history in the public era.
- No real-money operation, payment processing, or user accounts.
- No independent third-party audit of the model.
- Acquisition claims must be evidence-backed; **no performance overstatement.**

See [`ACQUISITION_DILIGENCE_BRIEF.md`](./ACQUISITION_DILIGENCE_BRIEF.md) for
what *is* validated.
