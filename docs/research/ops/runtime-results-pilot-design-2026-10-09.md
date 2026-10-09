# Runtime Results pilot — NFL World Model V2 grades on Vercel Blob (design, 2026-10-09)

**Status:** DESIGN. It is not implemented and not in Production.
- **Approval so far:** the founder approved the direction on 2026-10-09 (decision 4). A Production pilot needs a focused PR and separate approval.
- **Tasks:** LEDGER-001, RESULTS-001, OPS-001, COST-001 (Stage B).
- **Builds on:** `zero-build-settlement-assessment-2026-10-09.md`.

## Hosting under `output: "export"`: verified, not assumed (founder decision 4)
The Next app is a static export (`app/next.config.mjs`: `output: "export"`), so a Next.js API route (`src/app/api/...`) **would not work** and is not proposed.
- **What is proposed:** `app/api/results.mjs` is a **project-root Vercel Function**. Vercel deploys `/api/*.mjs` at the project root independently of the Next build: the Next app lives under `src/`, so this directory belongs to Vercel.
- **The same mechanism already runs in Production:**
  - `/api/live` (the live gateway);
  - `/api/collect` (analytics, which already writes to Blob with `BLOB_READ_WRITE_TOKEN`);
  - two Vercel crons in `app/vercel.json` (`/api/analytics-retention/`, `/api/morning-trigger/`).
- **Evidence:**
  - `app/api/live.mjs`'s header records the Production check of 2026-09-15: `/api/collect/` → 204 while `/api/zzz-not-real/` → 404.
  - Re-checked 2026-10-09: `HEAD /api/live/?sport=nfl` → **405** from the function (`server: Vercel`, `x-vercel-cache: MISS`), not a static 200/404.
- **What adding it costs:** one Production deploy, to add the function file. After that, writes (from GitHub Actions) and reads (through the function) need no deploys.
- **Write permission:** the read-write token lives today only in the Vercel Production environment. **The pilot needs the founder to add `BLOB_READ_WRITE_TOKEN` as a GitHub Actions secret**, or a separate narrowly-scoped store and token. The function reads with the server-side token; the browser never sees a token, and the store stays private.

- **SDK:** `@vercel/blob` 2.8.0, already a dependency and already in Production through `api/collect.mjs`. It writes with `access: "private"` and `BLOB_READ_WRITE_TOKEN`.
- **Store features:**
  - **Write-once by default:** `put` throws if the pathname exists unless `allowOverwrite`. Immutability is enforced by the store itself, not by convention.
  - **`ifMatch: <etag>`:** compare-and-swap. Updates to the "current" pointer are atomic and safe under concurrent writers.
  - **`cacheControlMaxAge`:** per-object CDN lifetime.
- **Serving:** root-level `app/api/*.mjs` functions deploy alongside the static export (as `/api/live` does), with `s-maxage` + `stale-while-revalidate` headers.
- **No collision with analytics:** `api/analytics-retention.mjs` lists and deletes only under its analytics prefix, so a `results/` prefix in the same store is never touched by it.

## Objects
```
results/v1/nfl/wm2-grades/<providerEventId>/<contentSha256[0:16]>.json   ← immutable version (put, no overwrite)
results/v1/nfl/wm2-grades/manifest.json                                  ← current pointer (put with ifMatch)
```

**Version object:** the public-safe projection of one game's grade rows:
- the run identity: `simulationId`, `modelVersion`, `generatedAt`, kickoff;
- each player-family row's state (GRADED / PENDING / NO_LINE), median, 80% interval, actual and error;
- `finality` (FINAL_PROVISIONAL or FINAL_CANONICAL), `officialStatsAsOf`, `gradedAt`, `supersedes` (the previous key, or null) and `contentSha256`.

Built by an allow-list projection. Private research fields and internal paths never enter it.

**Manifest:** `{ schemaVersion, updatedAt, events: { <id>: { current: <key>, finality, gradedAt, versions: [<key>, …] } } }`.

## Write path (inside the existing `nfl-event-window` settle step; no new workflow)
1. `grade-nfl-world-model-v2.mjs` computes the grades exactly as today. Its selection rule is unchanged: the last run strictly before kickoff.
2. For each game whose public projection changed: `put(versionKey, body, { allowOverwrite: false })`.
   - The key is derived from the content, so a re-run with the same content hits "already exists". That is treated as success: **idempotent**.
3. Read the manifest and its ETag, add or move the event's `current` and append to `versions`, then `put(manifest, …, { ifMatch: etag })`.
   - On an ETag conflict: re-read and retry, up to 3 times. **Atomic publication**: readers see either the old or the new pointer, never a half-written version, because versions exist before the pointer moves.
4. **Corrections:** a corrected box score is new content, so a new key with `supersedes` set to the previous one. The old version stays readable. **Rollback** is a manifest update pointing `current` back at an earlier key; nothing is deleted.
5. The git commit of `data/internal/nfl/world-model-v2/grades/` continues as the audit ledger. That path is not a build input. **Zero new deployment attempts:** a Blob write is not a git push.

## Read path
- **`app/api/results.mjs?sport=nfl&family=wm2-grades&event=<id>`** reads the manifest and the current version with the server token.
  - It returns the version plus `{ servedAt, manifestUpdatedAt }`.
  - Headers: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=120`.
  - It returns 404 for unknown keys and never lists the store.
- **Page:** the `/results/nfl` World Model V2 section (and later the game page's results panel) renders the **build-time snapshot first**, then fetches the API.
  - It replaces the snapshot only when `gradedAt` is newer.
  - It always prints the finality and "graded <time> ET · model <version> · run <simulationId>".
- **Stale safety:** if the fetch fails or the payload is older than the snapshot, the snapshot stays, with its own as-of stamp. Nothing presents a cached record as fresh without its timestamps.

## Security
- **Write token:** only in GitHub Actions secrets and the server function's environment. It never reaches the client bundle; a guard test, like the existing Ask "no server-only variable in the client" test, will pin this.
- **Store access:** the store stays private. The function serves only allow-listed `results/v1/**` keys.
- **Content:** the version body is built by projection from public-safe fields. A test rejects any field that isn't on the allow-list (no `data/internal` paths, no research-only fields, no tokens).

## Local validation plan (before any PR asks for Production)
A filesystem adapter with the same semantics (write-once `put`, ETag `ifMatch`, `get`) runs the real write and read code in tests:
- re-running the same settlement creates no new version;
- a correction makes a new version with `supersedes`, and the old one stays readable;
- two concurrent writers: one wins and the other retries on the new ETag, with no lost update;
- a manifest write failing after the version write leaves `current` unchanged (atomicity);
- rollback by pointer;
- the projection exposes no private fields;
- the API sets the cache headers and returns 404 on unknown keys;
- the page falls back to the snapshot when the API fails.

Then one end-to-end replay: TB @ DAL's grades from a scratch copy of main, written to the adapter, read back by the API handler.

## Cost estimate (to be MEASURED before any claim)
Based on Vercel's published Blob unit prices as last known (storage about $0.023/GB-month, simple operations about $0.40 per million, advanced operations such as `put`/`list` about $5 per million, and data transfer by GB). **The founder should confirm these against the account's own plan and the dashboard.**

| Item | Pilot volume (NFL World Model V2 grades) | Order of cost |
|---|---|---|
| Storage | 16 games/week × a few versions × ~20 KB | well under 1 GB → cents |
| Writes (`put`, manifest CAS) | ~2–6 per graded game per window → ~100–300/week | ≪ $0.01 |
| Reads | CDN-cached for 60 s, so origin reads ≈ 1 per key per minute while viewed | well under $1/month at current traffic |
| Function invocations | the same as origin reads, already within plan allowances | measure |
| **Vercel builds saved** | the settlement and grading share of builds: the NFL receipts commit's build inputs today, then other families as each is migrated | the real saving; measured with the build-replay method |

**Acceptance for a Production pilot (founder decision 4, items 1–15):** each item maps to a test above or to a measurement after the pilot: Blob storage, operations and transfer from the dashboard, plus builds per settled game, which must be 0.
