# Deployment freshness — what is measured, what is not, and the one founder decision

Sprint 032, Phase 1.

## The problem

The site is `output: "export"`. Every server-rendered "today", every date-gated section, and
every kickoff-vs-now filter resolves **once, at build time**, then freezes. The client
`<FreshnessBadge>` re-derives *labels* against the real wall clock, so a stale slate never
reads as "live" — but the underlying HTML only changes when a new build happens.

That tradeoff was already known and documented. Sprint 032 found the part that was not:

> **Nothing recorded when the deployed build was made.**

So "is production's clock current?" was unanswerable. It could only be reconstructed by
archaeology across the commit log, and the reconstruction was ambiguous. Concretely, on
2026-07-27 production served data generated at 16:36 UTC — which is equally explained by:

- the automated data commit at 16:36 UTC triggering a deploy, **or**
- the human push at 21:53 UTC carrying that data forward.

Those two have very different implications, because **every automated data commit ends in
`[skip ci]`**:

```
auto: mlb daily production slate 2026-07-27 [skip ci]
auto: mlb pregame archive metadata (76 files) [skip ci]
```

Whether the host honours that token is not observable from the public site. So the honest
answer was "unknown" — and shipping a freshness claim on top of an unknown is exactly what
this codebase refuses to do.

**Partially resolved 2026-07-28.** A normal (non-`[skip ci]`) push to `main` DID trigger a Vercel
deploy — confirmed by the marker landing within minutes. What remains unmeasured is whether a
`[skip ci]` bot commit does the same. That is now **testable rather than speculative**: the marker is
live, so if tomorrow's automated data commits advance `Build clock` without any human push, Vercel
ignores the token; if the clock stalls on a bot-only day, it honours it. Either way the answer will
come from `npm run verify:deployment`, not from reasoning.

## What Sprint 032 changed

It did not guess. It made the question **measurable**.

Every build now stamps a marker (`scripts/build-info.mjs`), published to
`/data/build-info.json`:

```json
{
  "schema": 1,
  "builtAt": "2026-07-28T02:34:37.718Z",
  "buildEtDate": "2026-07-27",
  "commit": { "sha": "…", "shortSha": "b894b1db", "message": "…", "committedAt": "…" },
  "environment": "vercel"
}
```

`buildEtDate` is the frozen clock: the exact date every server-rendered "today" in that build
resolved to.

### Reading it

```bash
npm run verify:deployment
```

Reports the deployed commit, the deployed build's frozen clock, its age, and whether it
matches local HEAD. Every line is read off the response — nothing is inferred.

```bash
npm run verify:deployment -- --strict   # CI gate: non-zero unless the clock is measurably today
npm run verify:deployment -- --json     # machine-readable
npm run verify:deployment -- --url https://staging.example.com
```

`--strict` fails on **unknown** as well as on stale. Unverified is not the same as fine, and a
gate that passes on "we could not tell" is not a gate.

### Fail-closed behaviour

| Situation | Reported | Plain exit | `--strict` exit |
|---|---|---|---|
| Clock measured, == today ET | `OK` | 0 | 0 |
| Clock measured, behind | `BEHIND` + days | 0 | 1 |
| Marker 404 (build predates Sprint 032) | `UNKNOWN` | 0 | 1 |
| Unreachable / malformed | `UNKNOWN` | 0 | 1 |

A missing marker never reads as healthy. `classifyBuildClock()` applies the same rule in-app:
every degenerate input returns `"unknown"`, and `ok` is true **only** for a positively
measured same-day clock. Pinned by `src/lib/build-clock.test.mjs`.

> **RESOLVED 2026-07-28 (Sprint 037B).** The marker reached production on the first push of the
> Sprint 032–037 work. `verify:deployment` now reports:
>
> ```
> Deployment status: OK
> Build clock     2026-07-28        (today)
> Built at        2026-07-28T14:01:57Z  (0.3h ago)
> Deployed commit 647e92b0 [vercel]
> Local HEAD      647e92b0
> ```
>
> Production observability works. It took six sprints to get an answer because the tool could not
> report on builds that predated it — which was the honest behaviour, not a bug.

## The founder decision — `VERCEL_DEPLOY_HOOK_URL`

`.github/workflows/daily-rebuild.yml` exists to force one build per day so the clock cannot
freeze. It is **dormant**: without the secret it logs a notice and exits 0.

Git integration alone is **not** sufficient, for two independent reasons:

1. **`[skip ci]`.** Every automated data commit carries it. If the host honours it, none of
   those commits deploy.
2. **Silent days.** On a day with no data change there is no commit at all — so there is
   nothing for Git integration to react to, regardless of point 1.

Point 2 holds *even if* point 1 turns out to be false. The daily rebuild is the only mechanism
that guarantees a current clock.

### To activate (one-time, repo owner only — requires account access I do not have)

1. Vercel → Project → Settings → Git → Deploy Hooks → create a hook for branch `main`
2. Copy the URL
3. GitHub → repo Settings → Secrets and variables → Actions → New repository secret
4. Name: `VERCEL_DEPLOY_HOOK_URL`, value: the hook URL

The workflow then runs daily at 09:20 UTC (~05:20 ET), after the morning data refresh lands.
It triggers a deploy of current `main` only — no code or data mutation, no API credits, no
settlement, no money path.

### Confirming it worked

After the next scheduled run:

```bash
npm run verify:deployment
```

`Build clock` should equal today's ET date and `Built at` should be within a few hours. If it
still reports UNKNOWN, the deploy did not carry the marker; if it reports BEHIND, the hook did
not fire.

## Scope

The marker describes the **build**, never the data. A fresh build over stale data is still
stale data — slate freshness is reported separately by `freshness.ts`, `FreshnessBadge`, and
the product-status surfaces. Do not conflate the two.
