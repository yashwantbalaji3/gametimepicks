# V17 — Vercel Production deploy-trigger audit (2026-09-22)

Scope: why bot commits build despite `[skip ci]`, why some builds run ~46 min and fail, whether
data-only commits need a rebuild, and whether the trigger policy needs repair.
Window: the last 7 days of `main` (pushes 2026-09-15T14:53Z → 2026-09-22T14:22Z).
Branch/head at audit time: `origin/main` = `f2c613dab`.

Evidence sources (no Vercel token exists; nothing here comes from Vercel logs):
- GitHub push activity on `main`: `gh api "repos/yashwantbalaji3/gametimepicks/activity?ref=refs/heads/main&activity_type=push&time_period=week"` → **503 push events, 502 distinct heads** (one head, `e545b33fb`, was pushed twice), plus 1 `pr_merge` (#627, `441fefa4b`).
- GitHub deployment records (`environment=Production`) and their statuses. Vercel creates the GitHub record **at completion** (`created_at` == final status time), so a deployment's duration is measured as *record time − push time*.
- `git diff --name-only <base> <head>` for every push, against (a) its own `before` and (b) the last *successful* deployment before it (the base Vercel uses).
- Local cold-cache build timing (`scratchpad/build-timing.log`), the local `next build` log, the pruned export in `app/out`, and `app/public`.
- Production: `https://gametimepicks.yashwantbalaji.com/data/build-info.json` (served `20a19a672`, built 2026-09-22T14:22:12Z, 94 s after its push at 14:20:38Z).

Working files for the tables below (regenerable): `scratchpad/audit/pushes-joined.tsv`, `data-pushes-keepset.tsv`.

---

## 1. Why `[skip ci]` bot commits still build — and the 7-day table

`[skip ci]` is a GitHub Actions convention. Vercel never reads the commit message. The only
deploy decision is `app/vercel.json` → `ignoreCommand: bash scripts/vercel-ignore-build.sh`, which
(before this audit) ran `git diff --quiet $VERCEL_GIT_PREVIOUS_SHA HEAD -- ':(top)app/'` and
skipped only when that diff was empty. Every bot that writes `app/public/data/**` therefore builds —
**correctly**, because 337 server modules read `app/public/data` with `fs` at build time and bake it
into the HTML (`lib/data.ts`, `data-mlb.ts`, `settlement-data.ts`, `game-detail.ts`, `my/read-model.ts`, …).

Classification of each push's **own** diff (`before..after`): CODE = touches `app/` outside
`app/public/data`; DATA = `app/public/data` only; SKIP = nothing under `app/`.
"Vercel span" = diff from the last successful deployment to the push head (what the script sees).

| day (UTC) | pushes | CODE | DATA | SKIP (own) | deployments | no record | failures | median min | p90 min | max min | span-empty (skipped) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 09-15 (from 14:53) | 46 | 7 | 29 | 10 | 40 | 6 | 0 | 11.6 | 11.8 | 11.9 | 6 |
| 09-16 | 78 | 13 | 48 | 17 | 67 | 11 | 0 | 11.7 | 12.1 | 12.9 | 10 |
| 09-17 | 75 | 9 | 50 | 16 | 65 | 10 | 0 | 8.7 | 11.8 | 12.1 | 10 |
| 09-18 | 88 | 23 | 52 | 13 | 82 | 6 | 2 | 6.8 | 10.3 | 58.3 | 4 |
| 09-19 | 65 | 0 | 56 | 9 | 56 | 9 | 2 | 6.7 | 7.4 | 46.3 | 6 |
| 09-20 | 64 | 0 | 55 | 9 | 58 | 6 | 4 | 6.8 | 8.0 | 46.3 | 4 |
| 09-21 | 56 | 0 | 48 | 8 | 50 | 6 | 3 | 6.4 | 7.7 | 46.3 | 5 |
| 09-22 (to 14:22) | 31 | 1 | 23 | 7 | 27 | 4 | 3 | 6.7 | 46.3 | 46.4 | 3 |
| **total** | **503** | **53** | **361** | **89** | **445** | **58** | **14** | **6.8** | **11.8** | **58.3** | **48** |

(The 09-22 row counts the twice-pushed `e545b33fb` once in failures; the pushes column counts both events. The PR merge `441fefa4b` is a deployment record without a push event: 37.0 min, success.)

Rule-fidelity check (does the script do what it says?):

| Vercel span class | deployed | no record |
|---|---|---|
| CODE | 84 | 0 |
| DATA | 361 | 10 |
| SKIP (empty) | 0 | 48 |

- **0** builds happened on an empty span; **0** non-empty spans went un-built except the 10 below. The script is doing exactly what it is written to do.
- 7 of the 10 "DATA span, no record" rows are an artifact of my base approximation (concurrent builds complete out of order, so the newest *successful* deployment by completion is not the newest by commit); against the newer sibling their span is empty and Vercel skipped them — consistent with the rule.
- 2 are real anomalies: **`89a9743d7`** (auto-refresh props-only, 09-19 00:14:45Z, sibling push 6 s later) and **`f5fdc0743`** (mlb lineup refresh, 09-19 19:27:02Z, nothing for the next 89 min) have **no deployment in any environment** — Vercel never created one. The lineup refresh was stale on production until `705e7fd87` at 20:56Z (an 89-minute window). Rate: 2 of 361 DATA pushes (0.6%).
- 1 was in flight during the audit and was watched to its end: **`f2c613dab`** (daily products, pushed 14:22:36Z) failed at 15:08:48Z — **46.2 min**, the ceiling class observed live (`dpl_2s9WhpBJdgtguTzwoQZgmHuouAj2`). Production still serves `20a19a672`; the 2026-09-22 daily products stay stale until the next `main` push builds (§2 semantics). Counting it, the window holds **15 failures / 446 deployments**.

Duration histogram (445 deployments, push → completion): <3 min 0 · 3–6 min 103 · 6–10 min 231 · 10–15 min 89 · 15–20 min 3 · 20–30 min 1 · 40–50 min **16** · ≥50 min 2.
Successful build medians by class: CODE 9.0 min (n=52) · DATA 6.8 (n=344) · SKIP-own 6.9 (n=34). Before 2026-09-17T15:00Z every build took 11.3–12.5 min; after it 5–7 min. **No build-affecting commit landed at that hour** (the only push was a docs-only one), so Vercel's build fleet or project configuration changed at least once inside the window without a commit — relevant to §3.

## 2. What the ignore step considers deploy-worthy (exact rule)

Before this audit:

```
skip  ⇔  VERCEL_PROJECT_PRODUCTION_URL is the duplicate slug (gametimepicks[-*].vercel.app)
      ∨  ( VERCEL_FORCE_BUILD ≠ "1"
         ∧ VERCEL_GIT_PREVIOUS_SHA is set and present in the clone
         ∧ git diff --quiet $VERCEL_GIT_PREVIOUS_SHA HEAD -- ':(top)app/' is empty )
build otherwise (missing/unknown SHA, shallow gap, any error → build)
```

**`VERCEL_GIT_PREVIOUS_SHA` after a FAILED deploy.** Vercel sets it to the last *successful*
deployment. After a failure the next push's diff spans the failed commit as well, so the failed
commit's data is delivered by the next build. Measured consequence (§3 table): the 14 failures were
each "healed" by the next successful deployment 6–98 min after the failed push (median 13 min);
production never lost a data commit, it waited for the next push. Because a full `next build` is
performed regardless of diff size, a two-commit span costs nothing extra. The behaviour test
"after a FAILED deploy…" pins both the healing case and the counterfactual (a base *at* the failed
commit would skip and strand the data — which is why the script must never invent a `HEAD^` base).

**Latent hole found and closed (fails toward BUILDING).** `npm run build` also reads files
*outside* `app/`, which the old pathspec could not see:

| repo-root input | read by |
|---|---|
| `data/research-projection/v1/` | `/teams`, `/players` (projection-store.ts), search index, Ask projections |
| `data/compare-projection/v1/` | `scripts/compare/emit-compare-assets.mjs` → `/compare/*`, `/matchups` |
| `data/lab-projection/v1/` | `scripts/lab/emit-lab-assets.mjs` → `/research/lab` |
| `data/ask-projection/v1/` | `scripts/ask/emit-ask-assets.mjs` → `/data/ask/v1/*` (Ask endpoint assets) |
| `data/internal/mlb/model-learning/calibrator-manifest.json` | `/markets` (disagreement-explorer-loader.ts) |
| `data/internal/nfl/forecast-receipts/` | `/nfl/game/[eventId]`, `/results/nfl`, `/my` (archived-forecast.ts) |
| `data/internal/mlb/prediction-snapshots/` | `/today` (command-center/changes.ts) |

Nothing else under `data/internal` (85,487 tracked files) is read by a public route at build:
`row-lineage-loader.ts` has no public importer, `launch/page.tsx` and `ops/` are pruned internal
routes, and the `sport-capability-registry.ts` mentions are evidence strings, not reads.

In the 7-day window **every** push that changed one of these inputs also changed `app/` (5 CODE
pushes), so no stale event occurred and the extension adds **0** builds/week at today's cadence.
The 19 `mlb pregame archive metadata` pushes (300+ files each) and the `epl settle` receipts touch
only unread `data/internal` paths and remain skip-able (pinned by a test).

The script now diffs the eight pathspecs (`app/` + the seven above). Tests added to
`app/src/lib/vercel-ignore-build.behavior.test.mjs`: `[skip ci]` never skips (and the script reads no
commit message); each of the seven inputs → BUILD (mutation-checked: collapsing the list back to
`app/` turns the test red); unread `data/internal` churn → SKIP; failed-deploy base semantics.

## 3. Why some builds run ~46 min and fail — hypothesis table

Facts: 14 failures, all after **2026-09-18T20:04Z** (0 of 240 deployments before, 14 of 205 after = 6.8%).
13 are DATA pushes at **46.0–46.4 min** from push; the 14th (`273343798`, CODE, the v1.6.1 Gemini
adapter) ran 43.3 min and ended **"Aliasing has failed"** (not a build timeout — the only failure
whose status text differs). Two DATA builds at 20:54Z on 09-18 *succeeded* after 57–58 min, and the
v1.7 merge took 37 min: the long tail is not only failures.

Build start is ≈ push + 90 s (build-info `builtAt` vs push time), so 46.0–46.4 min from push is the
**45-minute maximum build duration** that Vercel applies to Hobby and Pro alike (Enterprise is
configurable). The repo's own docs do not know the plan: `docs/CURRENT_COST_BASELINE.md`,
`RESOURCE_EFFICIENCY_SCORECARD.md`, `PLATFORM_VENDOR_AND_API_INVENTORY.md` all say "Hobby $0 or Pro
$20 — unverified". The observed **8 concurrent in-flight builds** (max overlap; 1 slot on Hobby) is
the strongest indirect evidence for Pro. Founder: confirm from the dashboard.

| # | hypothesis | test against the data | verdict |
|---|---|---|---|
| H1 | The failures are the 45-min build ceiling, not build errors | 13/13 DATA failures land in a 0.4-min band at 46.0–46.4 min = ceiling + ~1 min start latency; status text is the generic "Deployment has failed" | **SUPPORTED** (what stalls inside the 45 min needs the log) |
| H2 | A build step is genuinely slow | Local cold cache: build-info 0 s, emit-compare 0 s, emit-lab 1 s, build-ask-projections 1 s, emit-ask 1 s, search index 0 s, `next build` **117 s**, prune 3 s, publish 0 s → ~2 min total; healthy Vercel builds finish in 5–7 min end-to-end | **REFUTED** as cause of a 45-min run (a 20× slowdown of a 2-min build is a stall, not slowness) |
| H3 | Static generation explodes | 2,474 pages: `/players/*` 1,771, `/matchups` 126, `/mlb/board/[date]` 128, `/results/date` 105, `/epl/match` 57, `/games` 41, `/nfl/game` 37, `/simulate/d` 29 — generated in 4 worker batches in the 117 s | **REFUTED** as a hang; but see H6 |
| H4 | A route or build script reaches the network at build | No server-side `fetch(` in `app/src/app`; the six build scripts import only `node:fs/path/crypto/zlib`; `build-info.mjs` runs `git rev-parse` / `git log -1` only | **REFUTED** |
| H5 | Super-linear walkers (P262 class) | `prune-internal-routes.mjs` walks `out/` once, regex-scans each html/js/txt (linear), then walks `out/data` once; 3 s on 6,667 files | **REFUTED** |
| H6 | The export is heavy to upload | `app/out` = **1.4 GB / 6,667 files** (2,458 html + 2,457 RSC .txt + 1,625 json): `/mlb` 628 MB (128 board pages of ~6.4 MB each), `/players` 342 MB, `/results` 271 MB, `/games` 59 MB; `out/data` only 47 MB. The upload phase is the largest phase we cannot time locally | **NEEDS THE LOG** — the prime candidate for a Vercel-side stall; the 57-min *successes* fit an upload/finalize wait better than a compile |
| H7 | `output: "export"` copies all of `public/` before prune | `app/public` = **991 MB / 4,747 files** (4,744 under `public/data`); the export copies it into `out/`, then prune deletes **944 MB / 3,118 files** and keeps 1,626 (47 MB). That is ~1 GB of write-then-delete per build, inside the 117 s locally | **REFUTED** as the cause (seconds, not 40 min) — but it is avoidable waste and inflates upload risk if prune ever runs late |
| H8 | Bursts / concurrency starve builds | 7 of 14 failed pushes had **0** other builds in flight; the in-flight histogram of failures matches successes (84/205 successes also at 0). Max overlap before 09-18 20:00Z was 5 with zero failures | **NOT SUPPORTED** |
| H9 | Post-failure builds are bigger and fail again | 15 deployments directly followed a failure; 0 of them failed (the twice-pushed `e545b33fb` is its own twin). Diff size does not change a full export | **REFUTED** |
| H10 | Specific bot kinds | Failures by kind since onset: nightly settle 3/17, auto-refresh 3/27, mlb daily slate 2/22, daily products 2/21, epl matchweek 2/18, lineup refresh 1/30, nfl event window 1/14 — proportional to volume; every failure is a single-commit push | **NOT SUPPORTED** (random 7% hazard, not a kind) |
| H11 | Onset coincides with a code change | First long build `273343798` (Ask/Gemini adapter, touches `app/api/ask.mjs` + `src/lib/ask`) at 20:04Z; v1.6 added `app/api/*.mjs` serverless functions and two Ask build steps on 09-18 03:24Z, 17 h before the first failure. Every later failure is a data push with identical code | **CORRELATION ONLY** — needs the log (function bundling/tracing time would show there) |
| H12 | Vercel-side change | Build time halved at 09-17 15:00Z with no build-affecting commit; failures began 29 h later | **PLAUSIBLE, UNTESTABLE HERE** |
| H13 | Repo clone size | `git count-objects`: 256k objects, **1.17 GiB** packs, 33 packs. Vercel shallow-clones; the ignore step's `git cat-file -e $BASE` fails open when the base is outside the window — 55 skips prove the base was reachable in practice | not a hang cause; clone cost is inside the healthy 5–7 min |

Staleness cost of each failure (time from the failed push until the next successful deployment carried its data):

| failed push | kind | healed by | window |
|---|---|---|---|
| 273343798 09-18 20:04 | v1.6.1 CODE (aliasing failed) | fad8d97a5 | 18.0 min |
| a32a750a2 09-18 23:02 | nfl event window | e4675d1d4 | 6.9 |
| e52de7e77 09-19 13:33 | daily products | c421b61be | 33.0 |
| af180ac76 09-19 23:19 | mlb lineup refresh | 400dd5679 | 59.6 |
| 9b59b2999 09-20 13:04 | nightly settle | 8b42ff474 | 14.2 |
| 6a2641ed6 09-20 13:13 | daily products | d0c9f8422 | 26.2 |
| 3157fe714 09-20 16:25 | epl matchweek | 2f2578ece | 27.5 |
| f0490f089 09-20 18:49 | auto-refresh | b567c04dc | 12.6 |
| 412aff557 09-21 17:11 | mlb daily slate | e73218b7d | 10.3 |
| 0ee463e39 09-21 22:08 | epl matchweek | db5872f73 | 6.8 |
| c09dd2a18 09-21 23:19 | auto-refresh | 299ebe660 | 6.1 |
| 932b8d832 09-22 04:21 | auto-refresh | 04020f8ea | **98.3** |
| 1b72585a1 09-22 12:12 | mlb daily slate | 4c47773c9 | 9.3 |
| e545b33fb 09-22 13:26 | nightly settle | 9df3d42e2 | 13.0 |
| f2c613dab 09-22 14:22 | daily products (failed 15:08:48Z, watched live) | — not yet at 15:10Z | open |

## 4. Is a route or worker hanging? (local evidence)

- `next build` (Next 14.2.15, cold `.next`): compile → "Generating static pages (0/2474)" → four progress ticks → "Collecting build traces" — **117 s**, exit 0. No route stalls locally.
- Route families by count: players 1,771 · mlb 128 · matchups 126 · results 119 · teams 82 · epl 57 · games 41 · nfl 37 · simulate 29 · ufc 12 · compare 7.
- No `generateStaticParams` reads the network; no server `fetch(`; `robots.ts`/`sitemap.ts` are the only `dynamic`-marked files besides static pages.
- `scripts/build-info.mjs` shells out to `git rev-parse HEAD` / `git log -1` only (and prefers `VERCEL_GIT_COMMIT_SHA`).
- `prune-internal-routes.mjs` is linear (one `walkFiles` of `out/`, one of `out/data`); the emit scripts read their projection dirs once. No O(n²) scan exists in the current tree.
- The one thing that is genuinely unusual is the **output size** (H6/H7): 1.4 GB of HTML/RSC because the MLB board pages serialise ~6.4 MB each. That is also the P5O finding ("/mlb is 84% RSC client payload"). Reducing it is a product/perf task outside this audit's files; it would shrink the upload phase that we suspect but cannot see.

## 5. Do data-only commits truly require a rebuild? — measurement

Keep-set (raw `/data/` files the last local build retained): 1,626 files in `app/out/data`.
For each of the 361 DATA pushes, its changed `app/public/data` paths were intersected with that set
(plus the three runtime-assembled prefixes `compare/v1/`, `lab/v1/`, `ask/v1/`):

| kind | pushes | touches a keep-set file | touches none | avg files changed |
|---|---|---|---|---|
| mlb lineup refresh | 61 | 0 | 61 | 4.9 |
| mlb daily production slate | 42 | 0 | 42 | 10.7 |
| daily products | 40 | 0 | 40 | 4.1 |
| nfl event window | 30 | 0 | 30 | 32.0 |
| nfl settlement receipts | 30 | 0 | 30 | 2.1 |
| nightly settle | 29 | **29** | 0 | 250.1 (78 served: `*/graded-picks.json`, `mlb/results/model-rows/*`) |
| auto-refresh (props-only / zero credits) | 54 | 0 | 54 | 2.5 |
| epl matchweek refresh | 19 | 0 | 19 | 19.4 |
| cron-slot coverage | 16 | 0 | 16 | 4.0 |
| pregame weather / morning projections / UFC grading / schedule capture / fight-week | 33 | 0 | 33 | 1–15 |
| **total** | **361** | **29** | **332** | |

**The keep-set is the wrong yardstick.** It lists only files served at raw `/data/` URLs. The
332 "no keep-set file" pushes change `nfl/player-board` (394 files), `parlays/tier-grid` (284),
`mlb/full-game-simulations` (103), `mlb/predictions` (103), `nfl/forecasts` (90),
`nfl/weekly-boards` (60), `mlb/homer-nukes` (42), … — every one of which is read at build time by
a page (`my/read-model.ts`, `parlays/risk-ladder.ts`, `game-detail.ts`, `top-reads.ts`,
`nfl/week/[key]/page.tsx`). Their bytes reach the visitor **inside the HTML/RSC**, never as a
`/data/` URL. Under the keep-set definition they read as UNNECESSARY; in reality skipping them
would have served stale lineups, boards and forecasts 332 times this week.

Honest classification against the real build-input set (keep-set ∪ 337 fs readers):
**NECESSARY 361 / UNNECESSARY 0** measured by prefix. (A file-exact answer needs the fs-read
manifest proposed in §7; a prefix that any page reads is treated as necessary.)

Failures did not favour either class (11 of the 332, 3 of the 29 — proportional).

## 6. Duplicate / superseded builds

- **238 of 445 deployments (53%)** were superseded — a newer `main` push arrived before they
  completed — and **all 238 ran to completion and recorded success**. 314 of 503 pushes had another
  push within ±5 min (bots land in pairs: `nfl event window` + `nfl settlement receipts` 3–4 s apart,
  `auto-refresh props-only` + `zero credits` 5–6 s apart, `nightly settle` → `mlb daily slate` →
  `daily products` inside 10 min).
- Vercel cancels only *queued* deployments when a newer one arrives ("skip superseded" behaviour);
  it never cancels a build that has started. With ≥8 concurrent slots nothing queued, so the
  setting could not engage — the evidence says superseded-build cancellation is **effectively off**
  for this project and 53% of build minutes produce an artifact that is replaced within minutes.
- The lever is upstream, not in Vercel: coalescing sibling bot commits into one push (one workflow
  writing both receipts) would halve deployments without any staleness change.

## 7. Which classes can be skipped safely — policy and proposal

Policy (implemented where it can be proven, proposed where it cannot):

| class | example | served bytes change? | decision |
|---|---|---|---|
| docs / vp / .github / repo-root scripts only | handoffs, workflow edits | no — not read by `npm run build` | **skip** (unchanged) |
| `data/internal` paths no public route reads | pregame archive metadata (19/wk, 300+ files each), epl settle receipts | no | **skip** (unchanged, now pinned by a test) |
| repo-root inputs the build reads | `data/*-projection/`, calibrator manifest, NFL forecast receipts, MLB prediction snapshots | yes | **build** (**new** — closes a latent hole; 0 extra builds this week) |
| `app/public/data` only | every bot slate/settle/refresh | yes — baked into HTML via fs at build | **build** (unchanged) |
| `app/` code | | yes | **build** (unchanged) |

### Proposal: a build-input-aware skip (NOT implemented — see why)

The orchestrator's sketch (publish the prune keep-set as `out/data/keep-set.json`; skip a
DATA-only diff whose files are all absent from it) **cannot be made safe** because the keep-set
excludes the fs-read inputs (§5). Publishing it and skipping on it would have skipped 332/361 DATA
pushes this week and served stale pages. A safe version needs a **build-input manifest** =
keep-set ∪ every `public/data` path any build process read:

1. **Capture reads.** `NODE_OPTIONS="--require ./scripts/trace-public-reads.cjs" next build`
   (the preload runs in every static-generation worker, which is why an in-process shim is not
   enough): patch `fs.readFileSync/readdirSync/existsSync/statSync` and `fs.promises.*` to append
   any path under `<cwd>/public/data` to `.build-reads.log` (append-only, `O_APPEND`, one path per
   line; failures to log must throw — a lost read must fail the build, never the manifest).
2. **Emit.** `prune-internal-routes.mjs`, after computing `kept`, writes
   `out/data/build-inputs.json`: `{ schema: 1, sha: <VERCEL_GIT_COMMIT_SHA|git HEAD>, builtAt,
   inputs: sorted(unique(kept ∪ ALWAYS_PUBLIC_DATA ∪ dirs ∪ reads-from-.build-reads.log)) }`
   and refuses (exit 1) if `.build-reads.log` is missing or empty — an empty trace means the shim
   did not load, and a manifest built without it would be a lie. This is more than the ≤15-line
   additive change allowed for Lane P3, which is the second reason it is not implemented here.
3. **Decide** (ignore step, all failures → BUILD):
   ```
   span_files = git diff --name-only $BASE HEAD -- <the eight pathspecs>
   if any span_file is not under app/public/data/            → BUILD
   manifest = fetch(GTP_BUILD_INPUTS_URL ?? https://gametimepicks.yashwantbalaji.com/data/build-inputs.json, timeout 10s)
   if fetch failed / not JSON / schema ≠ 1 / inputs empty      → BUILD
   if manifest.sha ≠ $BASE                                      → BUILD   # the live manifest must describe the base we diff against
   if any span_file (relative to app/public/data) ∈ inputs     → BUILD
   if any span_file starts with compare/v1|lab/v1|ask/v1        → BUILD   # runtime-assembled prefixes
   otherwise                                                    → SKIP (log every skipped path)
   ```
   `GTP_BUILD_INPUTS_URL` may be a `file://` path so the behaviour test can supply a fake.
4. **Mutation tests it would need** (each must fail toward BUILD): fetch 404 / timeout / HTML body /
   `sha` mismatch / `inputs: []` / schema 2 → BUILD; a DATA diff whose file is in `inputs` → BUILD;
   a DATA diff under `ask/v1/` → BUILD; a DATA diff whose file is absent → SKIP **and** a positive
   control that adding that file to the fake manifest flips it to BUILD; a mixed diff (one absent
   data file + one docs file) → SKIP, plus one absent data file + one `app/src` file → BUILD; the
   trace shim: a build with the shim disabled must make the prune step exit non-zero.
5. **Expected value.** Small: by prefix, 0 of this week's DATA pushes were outside the read set.
   The gain would come only from bots that write files no page reads — which is a pipeline
   hygiene question, not a deploy one. Recommendation: do not build this until a measured week
   shows ≥10% of DATA pushes outside the manifest.

## 8. Does the trigger policy need repair? — conclusion

- **The `app/`-diff policy is correct and was never the cause of a failure.** Every failure is a
  45-minute ceiling on a build whose inputs legitimately changed; every skipped push was
  byte-identical on the served surface. Do **not** add a `[skip ci]` rule or a keep-set skip.
- **One repair made:** the seven repo-root inputs `npm run build` reads are now deploy-worthy
  (fail-toward-build; zero cost this week; tests + mutation check). `app/vercel.json` unchanged.
- **Crons do not deploy.** `/api/morning-trigger/` (09:20 UTC) and `/api/analytics-retention/`
  (07:17 UTC) are Serverless Function invocations of `app/api/*.mjs` on the current deployment.
  Morning-trigger starts a GitHub Actions workflow through the GitHub API; the *commits that
  workflow pushes* create deployments through the normal push path. No cron creates a build.
- **What remains open needs the Vercel log** — where the 45 minutes go (upload of the 1.4 GB
  export, function bundling since v1.6, or a platform stall). The founder can close the gap:

```
npx vercel inspect dpl_EZTuQRrkwAxrNjSv38ub5nXGkSfy --logs   # a32a750a2  09-18 23:02Z  nfl event window
npx vercel inspect dpl_7JeoiB2C31zPr6DTjVXtdakMMxnV --logs   # e52de7e77  09-19 13:33Z  daily products
npx vercel inspect dpl_6rhxW4DHfENnMea9DfPLVk4q7Q27 --logs   # af180ac76  09-19 23:19Z  mlb lineup refresh
npx vercel inspect dpl_8PyLvShsTYq5gyEvBP4B7pgvfDJ3 --logs   # 9b59b2999  09-20 13:04Z  nightly settle
npx vercel inspect dpl_76s6C7ep3tYsSPJMUQP4PJoNfZC2 --logs   # 6a2641ed6  09-20 13:13Z  daily products
npx vercel inspect dpl_5HNrWKdXHUpKZSyvE8EFrL8WQdqS --logs   # 3157fe714  09-20 16:25Z  epl matchweek refresh
npx vercel inspect dpl_GcfejB5hykNfj9RRzA5QUhWcGfZD --logs   # f0490f089  09-20 18:49Z  auto-refresh
npx vercel inspect dpl_5Nf1JabpN8KZ9muqRKRt64weC17u --logs   # 412aff557  09-21 17:11Z  mlb daily slate
npx vercel inspect dpl_Ahp98x8yRzWvHSF5Y3qCrG9vFf2v --logs   # 0ee463e39  09-21 22:08Z  epl matchweek refresh
npx vercel inspect dpl_4ZsgztcnL3WgeikvDBD4F9xVt2ys --logs   # c09dd2a18  09-21 23:19Z  auto-refresh
npx vercel inspect dpl_EemWe3jsfjwiyrwGiessAxDcG1Zf --logs   # 932b8d832  09-22 04:21Z  auto-refresh
npx vercel inspect dpl_GvugNcRFNRB5sdinKD3BbjDaJWsu --logs   # 1b72585a1  09-22 12:12Z  mlb daily slate
npx vercel inspect dpl_6RvVdMtDxN2ouhekUm8iYCVHM13a --logs   # e545b33fb  09-22 13:26Z  nightly settle
npx vercel inspect dpl_2s9WhpBJdgtguTzwoQZgmHuouAj2 --logs   # f2c613dab  09-22 14:22Z  daily products (failed live during this audit, 46.2 min)
```
`273343798` (09-18 20:48Z, "Aliasing has failed") carries no `dpl_` id in its GitHub status; find it
in the dashboard by commit. Also worth one look each: the two 57-min *successes* (`69a0a0469`,
`c87048560`, 09-18 20:54Z) and the missing deployments for `89a9743d7` / `f5fdc0743` (09-19).

In each log, read the timestamps of: "Cloning", "Running build command", the `next build`
banner, "Generating static pages", "Collecting build traces", the prune line, "Uploading build
outputs" / "Deploying outputs", and any "Build exceeded maximum duration". The phase holding the
minutes is the answer this audit could not reach.

Other levers seen along the way (outside this audit's files, not changed):
- Stop mirroring 944 MB of unserved `public/data` into `out/` each build (serve the read-only
  inputs from outside `public/` and emit only the keep-set) — shrinks the write-then-delete and the
  upload surface.
- Shrink the `/mlb/board/[date]` payload (6.4 MB per page × 128 dates = 628 MB, 45% of the export).
- Coalesce sibling bot commits into single pushes (§6) — halves deployments.
- Note: `app/.vercel/project.json` is a local, git-ignored CLI link to a project named `gtp-ops`
  (Node 24.x). It is not a deploy source; the canonical project remains `gametime-picks`.

Files changed by this audit: `app/scripts/vercel-ignore-build.sh` (eight pathspecs + notes),
`app/src/lib/vercel-ignore-build.behavior.test.mjs` (+4 tests, fixture chain), this document.
Tests: `npx tsx --test app/src/lib/vercel-ignore-build.behavior.test.mjs app/src/lib/vercel-canonical-project.test.mjs`
→ 17 pass / 0 fail; `npm run -s lint:scripts` → clean.
