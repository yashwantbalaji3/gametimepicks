# Dependency audit — app/ (2026-10-27)

Scope: the 13 `npm audit` findings on `main` at `7d7f80ad00` (`app/package-lock.json`): 1 critical, 10 high, 2 moderate.
This note is the exposure assessment, the evidence for the lockfile-only fix in the accompanying PR, and the plan for the
two major upgrades the founder decides on. Nothing here changes Vercel settings.

## 1. How Production runs (what an advisory would have to reach)

| Surface | What it is | Evidence |
|---|---|---|
| Site pages, `/data/*.json`, `_next/static/*` | **Static files.** `next build` with `output: "export"` writes `out/`; Vercel serves the files. No Next.js server, middleware, Image Optimizer, RSC server or Server Actions run in Production. | `app/next.config.mjs` (`output: "export"`, `images.unoptimized: true`, no `rewrites`/`redirects`/`i18n`); no `src/middleware.*`; no `"use server"` anywhere in `src/`; all 7 route handlers are `dynamic = "force-static"` (rendered to files at build time). Production probe 2026-10-27: `GET /_next/image/?url=…` → **404** (static not-found page, `x-vercel-cache: HIT`); `GET /` with `RSC: 1` → the static `text/html` page, not `text/x-component`. |
| `app/api/*.mjs` (6 functions) | **Vercel Node functions** from Vercel's project-root `/api` convention (not Next routes; the files say so). `analytics-retention` and `morning-trigger` are the two crons in `app/vercel.json`. | `GET /api/live/` → `application/json`, `x-vercel-cache: MISS`. Import graph of every function (67 files traced): the **only** npm package any function imports is `@vercel/blob` (`api/collect.mjs` → `put`; `api/analytics-retention.mjs` → `list`, `del`). No function imports `next`, `postcss` or `zod`. `api/live.mjs` and `api/ask.mjs` use the runtime's global `fetch` (Node's built-in undici, versioned with the Vercel Node runtime, not with our lockfile). |
| Vercel build container | `npm ci` + `npm run build` on every Production/preview build. | Build-time tools (postcss, autoprefixer, tailwind, browserslist, minimatch) only read files committed to this repo. |
| Browsers | Client JS from the export (React 18 + the Next 14 client runtime). | No `next/script` / `beforeInteractive`; no CSP nonces; `next/image` used only with `unoptimized`. |
| Developer machines | `next dev` | Local only. |

So an advisory is **reachable** in Production only if it lives in `@vercel/blob`'s runtime path, or in client code with
attacker-controlled input. Everything in a Next.js *server* feature has nothing to run on.

## 2. Exposure per advisory

Legend: **R** reachable in Production · **R-code** the vulnerable code runs in Production but the attacker-controlled
input it needs does not · **N** not reachable · **Dev** developer machines only.

### `next` 14.2.15 (direct; 34 advisories)

| Advisory | Sev | Needs | Verdict |
|---|---|---|---|
| GHSA-2464-fhr4-w9xw, GHSA-2xp9-vwfh-vxw4 (RCE, Image Optimization API, SVG/AVIF) | critical | `/_next/image` server | **N** — optimizer absent (`unoptimized`, static export; Production returns 404) |
| GHSA-p293-qw3h-jr36 (RCE, Windows-hosted server) | critical | Next server on Windows | **N** — no Next server; Vercel builds on Linux |
| GHSA-f82v-jwr5-mffw (middleware authorization bypass) | critical | middleware | **N** — no middleware |
| GHSA-mwv6-3258-q52c, GHSA-5j59-xgg2-r9c4, GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj (RSC DoS) | high | RSC request handling on a server | **N** — RSC payloads are pre-rendered `.txt` files; `RSC: 1` gets static HTML |
| GHSA-7m27-7ghc-44w9, GHSA-m99w-x7hq-7vfj, GHSA-p3m5-59mp-jv5r (Server Actions DoS), GHSA-89xv-2m56-2m9x (Server Actions SSRF, custom server), GHSA-4c39-4ccg-62r3 (Edge Server Action payload), GHSA-955p-x3mx-jcvp (Server Function endpoint disclosure) | high/mod | Server Actions | **N** — no `"use server"`; no server |
| GHSA-4342-x723-ch2f, GHSA-3g8h-86w9-wvmq, GHSA-36qx-fr4f-26g5 (middleware/proxy redirect SSRF, cache poisoning, i18n bypass) | mod/low/high | middleware / i18n | **N** — none configured |
| GHSA-ggv3-7p47-pfv8, GHSA-p9j2-gv94-2wf4 (rewrites smuggling / SSRF) | mod/high | `rewrites` | **N** — none (Vercel-level `headers` only) |
| GHSA-c4j6-fc7j-m34r (WebSocket upgrade SSRF) | high | Next server | **N** |
| GHSA-g5qg-72qw-gw5v, GHSA-xv57-4mr9-wg8v, GHSA-9g9p-9gw9-jx7f, GHSA-3x4c-7xq6-9pq8, GHSA-h64f-5h5j-jqjh (Image Optimization cache key / content injection / DoS / disk growth) | mod | Image Optimizer | **N** |
| GHSA-qpjv-v59x-3qc4, GHSA-wfc6-r584-vfw7, GHSA-vfv6-92ff-j949, GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q (server cache poisoning / confusion) | low/mod | Next server cache | **N** — Vercel's edge cache serves immutable files |
| GHSA-ffhc-5mcf-pf4q (XSS with CSP nonces) | mod | nonce-based CSP | **N** — no nonces (CSP is `Report-Only`, static) |
| GHSA-gx5p-jg67-6x7h (XSS in `beforeInteractive` scripts) | mod | `next/script` with untrusted input | **N** — `next/script` not used |
| GHSA-3h52-269p-cp9r (dev server origin check) | low | `next dev` | **Dev** — a malicious page open while `next dev` runs could read dev assets. Not Production. |

No `next` advisory is reachable in Production. `next@14.2.35` (newest 14.x) still carries 25 of them, including all 3
criticals; the first clean lines are **15.5.28** and **16.4.3** (GitHub advisory API, `affects=next@<v>`, 2026-10-27).

### `postcss` (direct 8.5.13 → **fixed 8.5.32 in this PR**; next's nested 8.4.31 remains)

GHSA-qx2v-qp2m-jg93 (XSS in stringify), GHSA-6g55-p6wh-862q / GHSA-r28c-9q8g-f849 / GHSA-fxqj-rqcc-2cmp
(`sourceMappingURL` file read). **N** — build-time only, and the CSS it processes is this repo's own. Reaching it needs
commit access, which already means code execution in the build. The nested copy inside `next` goes away with the `next`
major (16.x ships 8.5.23) or an `overrides` entry.

### `@vercel/blob` 2.8.0 → `@vercel/oidc` → `@vercel/cli-config` → `zod` 4.1.11 (GHSA-mrhx-c7xc-m3w5, high)

**N (code loads, never runs on attacker input).** `@vercel/blob` *is* used: by `api/collect.mjs` and
`api/analytics-retention.mjs`, so it ships inside two functions (the original listing found only the launch-blockers
text). zod is reached only by `@vercel/cli-config`, which parses the *Vercel CLI's own local config/auth files* in
`@vercel/oidc`'s `refreshToken()`. On Vercel that path never reaches the parser: the OIDC token comes from the request
header / `VERCEL_OIDC_TOKEN`, and without one `findProjectInfo()` throws before any config read (blob catches it and
falls back to `BLOB_READ_WRITE_TOKEN`). Our own request validation (`api/_collect-core.mjs`) is hand-written, not zod.
There is no upstream fix: the newest `@vercel/cli-config` (0.3.4) still pins `zod 4.1.11`. npm's suggested "fix" is a
*downgrade* to `@vercel/blob@2.4.0` (before the OIDC dependency). See §4.

### Transitives fixed in this PR

| Package | Old → new | Advisories | Where it runs | Verdict |
|---|---|---|---|---|
| `undici` | 6.28.1 → **6.29.1** | GHSA-xjj6-f33q-929c (high, excessive content-encodings), GHSA-4qv8-2p9j-2685 (EventSource) | inside `collect` / `analytics-retention` (blob's `fetch`) | **R-code** for xjj6: exploiting it needs a hostile response from Vercel's Blob API. EventSource is unused (**N**). Fixed either way. |
| `nanoid` | 3.3.12 → 3.3.20 | GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8 (loop on size ≤ 0) | postcss at build | **N** |
| `source-map-js` | 1.2.1 → 1.2.2 | GHSA-68fv-2mgg-jv7q (indexed source-map DoS) | build | **N** |
| `browserslist` | 4.28.2 → 4.29.5 | GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g | build (autoprefixer) | **N** |
| `brace-expansion` | 1.1.18 → 1.1.21 | GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p | eslint's minimatch (dev) | **N** |
| `baseline-browser-mapping` | 2.10.24 → 2.11.33 | GHSA-w5vr-8v7q-w6rv | build | **N** |
| `postcss-selector-parser` | 6.1.2 → 6.1.5 | GHSA-w9m9-85wc-3x92, GHSA-rj75-hqrm-r3gf | tailwind at build | **N** |

The fix also moved, inside their existing ranges: `@vercel/oidc` 3.8.7 → 3.8.10, `@vercel/cli-config` 0.2.6 → 0.3.1,
`caniuse-lite`, `electron-to-chromium`, `node-releases`, `update-browserslist-db`. `package.json` is unchanged. Every
bumped package's `engines` admits Node 20.4.0 (the oldest CI pin).

**After this PR: 6 findings (1 critical, 5 high), all `next` or the zod chain, none reachable in Production.**

## 3. Verification of the lockfile-only fix

Local, macOS (8 cores, 16 GB), Node 22, flag-OFF builds (CI's flags), each `npm run build` cold under the shared build
lock, both builds in the **same worktree path** (Next's client-entry module ids hash absolute paths, so a baseline
built elsewhere differs in every page chunk for reasons unrelated to dependencies — the first attempt showed exactly
that and was discarded).

**Export compare, main `7d7f80ad00` vs branch** (8,038 files each, same file list):
- 1,951 files byte-identical as built; 6,082 identical after normalizing build-instant values only: `builtAt` and its
  ET rendering ("last build …"), commit sha/shortSha/message/date, the random Next build id, `serverNowMs` (render
  clock), hashed chunk file names (paired by path stem, contents compared), and webpack's chunk-id *order* in an
  entry's `push([[…]])` (same set; the order also differs between two builds of main).
- 5 remaining files, all build-instant: `data/build-info.json` (commit message), `data/search/index.json`
  (`generatedAt`), `today/index.html` + `today/index.txt` ("status as of" render time), and
  `data/level-a/v1/model.json` (`modelSha256` covers `model.asOf`; substituting main's `asOf` into the branch's model
  reproduces main's sha exactly).
- No JS, CSS, HTML structure or data changed. The `caniuse-lite`/`browserslist` update did not alter any autoprefixed CSS.

**Page weight:** every page is the same byte count (e.g. `/` 218,239 B, `/nba/` 205,862 B, `/today/` 258,903 B);
the only size change in the export is `data/build-info.json` +39 B (longer commit message).

**Build memory/time** (peak summed RSS of the build's process tree, sampled each second; macOS RSS, so compare
relatively, not against Vercel's Linux figure):

| Build | Peak tree RSS | Wall time |
|---|---|---|
| main (separate worktree path) | 3.71 GB | 242 s |
| main (same path as branch) | 3.70 GB | 208 s |
| branch (this PR) | 3.75 GB | 234 s |

Spread ≤ 1.3 %, within run-to-run noise; no build-memory change is expected from tooling-only bumps whose output is
identical. Vercel's Standard peak (~6.9 GB) should be unchanged; confirm on the first Production build log after merge.

**Suites on the branch** (Node 22 locally; CI re-runs on Node 20):
- `npm run suite:built` on the branch export: 766 tests, 761 pass, **0 fail**, 5 skipped.
- `npm run typecheck`: clean.
- `npm run suite` (unit): 10,904 tests, 10,901 pass, **1 fail**: `src/lib/ops/stamp-only-gate.test.mjs` "on the newest
  committed MLB artifacts…". It fails identically on main `7d7f80ad00` with main's dependencies (run alone in both
  trees). Cause: today's committed `app/public/data/mlb/predictions/2026-10-27.json` has one prediction with
  `moneyline: null`, so the test's perturbation is a no-op. This is a slate-dependent test on main, not this change;
  reported to the release owner.

## 4. Plan for the major upgrades (founder decision; nothing merged)

### 4a. `@vercel/blob` / the zod chain — recommended: `overrides`, keep blob

Removing blob is not an option without replacing the analytics collector (it is live: P256 receipts in
`src/lib/launch/shared-blockers.mjs`). Options, cheapest first:

1. **`"overrides": { "zod": "^4.6.6" }` in `app/package.json`** (zod 4.1 → 4.6 is a minor within v4). Clears zod,
   cli-config, oidc and blob from the audit (4 findings). Risk: `@vercel/cli-config` was generated against 4.1
   (`ts-to-zod` schemas); it runs only on the local-CLI refresh path. Test: `npm ci`; `node -e` import of
   `@vercel/cli-config` and a `globalConfigSchema.parse({})` smoke; unit tests for `_collect-core`/`_retention-core`;
   on a `preview/**` deploy, one staging-probe `POST /api/collect/?staging=1` and one `CRON_SECRET` run of
   `/api/analytics-retention/` (lists, deletes nothing older than 90 days that should stay).
2. Pin `@vercel/blob@2.4.0` (npm's `--force` choice): drops `@vercel/oidc` entirely, but is a downgrade of four minors
   (loses OIDC auth and later fixes; we authenticate with `BLOB_READ_WRITE_TOKEN` so we use neither). Same test plan.
   Not recommended: it trades a non-reachable finding for older client code.
3. Wait for Vercel to bump zod in `@vercel/cli-config`. Zero work; finding stays.

### 4b. `next` 14.2.15 → 15.5.28 or 16.4.3

No advisory is reachable today, so this is hygiene and staying on a supported line, not an incident fix. It is the
riskiest change available to this repo because it touches every page and the build-memory budget.

**Target.** 15.5.28 first (clean for `next`; add `"overrides": { "next": { "postcss": "^8.5.23" } }` for the nested
postcss). 16.x as a second step: it defaults `next build` to Turbopack, requires Node ≥ 20.9 (`daily-products.yml` and
`data-contract-check.yml` pin **20.4.0**), and removes `next lint` (used by `npm run lint`). Both lines accept React 18
(`peerDependencies: react ^18.2.0 || ^19`); the App Router already uses Next's vendored React.

**Known risks, in order of cost if missed:**

1. **Build memory on Standard (8 GB, ~6.9 GB peak, ~1.1 GB headroom).** The OOM fix (#1262) depends on
   `node --require scripts/build/intl-formatter-cache-preload.cjs` reaching every static-generation worker *through
   execArgv*. That is unverified for Next 15/16's static-generation workers; if they stop inheriting execArgv the ICU formatter growth returns
   and Standard builds die. Must be proven in the 8 GB Docker container (the 2026-10-27 GO method: 3 runs, 0 kills,
   anon peak and headroom recorded), with `experimental.cpus: 4` confirmed still honoured. Fallback: `NODE_OPTIONS=--require …`.
2. **Async request APIs.** 28 dynamic segments, 27 files destructuring `params`/`searchParams`, 26 `generateMetadata`.
   15.x still allows synchronous access (with warnings); 16.x requires `await params`. Codemod
   `npx @next/codemod@15 next-async-request-api`, then review by hand.
3. **Export byte drift.** Expect bundle hashes and RSC payload format to change on every page, so the byte-compare
   becomes a *semantic* compare: route list identical, visible text identical (rendered-text diff per page), JSON under
   `/data/` byte-identical, flag-OFF guards still delete the Theater routes (`prune-internal-routes`, `public-theater-export.test.mjs`).
4. **Compile-time flags under Turbopack (16.x).** `GTP_NFL_THEATER_PUBLIC` / `GTP_NBA_THEATER_PUBLIC` rely on webpack
   dead-code elimination of `process.env.X === "1"`; a flag-OFF build must still ship none of the Theater code or CSS
  . Stay on `--webpack` for the first 16.x build.
5. **Page weight.** Client runtime size changes; budgets (/nba 250 KiB etc.) must be re-measured with Production's flags.
6. **Caching defaults / `fetch`** — irrelevant to a static export; route handlers already `force-static`.

**Test plan (per step, before any merge):** `npm run typecheck`; full `npm run suite`; flag-OFF and flag-ON builds
under the shared lock; `npm run suite:built` on each; semantic export compare vs main as in (3); page-weight checks
incl. `scripts/ops/check-production-page-weight.mjs` against a `preview/**` deploy; 3 × 8 GB Docker builds (risk 1);
Playwright `e2e:fast` + accessibility on the export; one `preview/**` deploy watched end-to-end (build log machine line,
peak memory, route checks), then the release owner decides. Rollback is reverting one commit (package.json + lock).

**Effort estimate:** 15.5.x ≈ 1 working session plus three Docker build runs; 16.x a further session (Turbopack/webpack
choice, Node pins in workflows, lint migration).
