# Analytics Production Activation (Lane D)

**State: BLOCKED_BY_ONE_ACCOUNT_ACTION — nothing else remains.** Verified tonight: the deployed
production bundle still resolves the client sink to NOOP (observer: `analytics OFF · no
build-time flag`), the collector ships kill-switched, and no store token can exist in the build
(the staging echo mode proves its absence). Per the hard rule, no new design was produced —
the staging-proven implementation from Program 092-095 is the one being activated.

## The exact Vercel UI checklist (canonical project `gametime-picks`, ~5 minutes)

1. **Storage → Create Database → Blob** → name `gtp-analytics` → **Connect to project**
   `gametime-picks` (all environments). This injects `BLOB_READ_WRITE_TOKEN` automatically.
2. **Settings → Environment Variables** (Production scope):
   - `ANALYTICS_COLLECTOR_ENABLED` = `1` (server kill switch)
   - `NEXT_PUBLIC_ANALYTICS_ENABLED` = `1` (client kill switch)
   - `NEXT_PUBLIC_ANALYTICS_ENDPOINT` = `/api/collect/`  ← trailing slash required
3. **Deployments → Redeploy** latest production (build-time vars must bake into the bundle).

## Automatic verification after the redeploy (no founder effort)

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks/app && node scripts/public-beta-observe.mjs
```
Observer flips `analytics` from OFF to configured; then `FIRST_PRODUCTION_ADOPTION_READ.md` gets
its activation timestamp, valid/rejected counts by closed enum, surface reach, trust-loop and
sport-interest counts — states honestly `NOT_YET_MEASURED → NOT_ENOUGH_DATA → MEASURED`, no
backfill, no unique-user/retention claims (the architecture stores no identifier that could
support one). Kill/rollback: unset either flag — each alone fully stops collection.

Production payload spot-check (browser network tab, any public page): only closed-enum,
day-bucketed, PII-free events POST to `/api/collect/`; forbidden-field rejection is
suite-enforced and was black-box-proven on the preview.
