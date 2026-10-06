# Accounts — architecture (2026-09-22 design, reconciled with the built schema 2026-10-05)

**Status (corrected 2026-10-05):** BUILT AND OFF. The schema in `db/accounts-schema.sql` is written, its RLS is
proven by an executed two-account battery on local Postgres (`app/scripts/accounts/rls-live.mjs`, 9 injected defects
caught), and the client surfaces exist (`/account`, `/feedback`, follow + saved sync). **No hosted Supabase project
exists yet**; the friends beta (founder-approved 2026-10-05) is switched on by `docs/beta/HOSTED_BETA_RUNBOOK.md`.
This page was written on 2026-09-22 as a design; sections 1, 3, 7 and 8 still hold. Where the design and the built
schema differ, **the schema wins**:

| Design (2026-09-22) | Built (`db/accounts-schema.sql`) |
|---|---|
| `follows(user_id, entity_id, followed_at)` | `user_follows(id, user_id, kind ∈ sport/team/player/game, entity_id, label, followed_at)` |
| `saved_items(kind ∈ forecast/game/card/report, ref, payload)` | `saved_items(kind ∈ game/official_forecast/official_card, ref, snapshot)` |
| `profiles.prefs jsonb` | a separate `user_preferences` table (no screen writes it yet) |
| `profiles.age_attested_at`, `device_migrated_at` | not built |
| writes open to any signed-in user | every write, including slip-image uploads, also requires `public.is_beta_member()` (invite list `beta_access`) |
| one-screen "Bring these to your account?" migration | automatic union sync on `/account` (`lib/accounts/account-sync.mjs`; nothing is deleted on first sign-in) |
| export + ordered delete endpoints (§6) | not built: no `/api/account-export`, no in-site delete; deletion is by the founder in the dashboard |

## 1. The one rule that shapes everything

**Supabase never becomes the canonical owner of forecasts, live state, finals, model status, product
selection or the protected record.** Those owners are the committed artifacts and their settlement
scripts (`PRE-GAME FORECAST` model-owned · `LIVE EVENT STATE` provider-owned · `FINAL RESULT`
settlement-owned). An account row may *reference* a forecast id, a gamePk, a settled receipt path; it
may never *restate* a probability, a result, or a record. A user's "record" is computed at read time by
joining the user's own rows to the canonical settlement owners, never stored as a number that could
drift from them.

Corollary: every account table is **user-owned** (has `user_id`, RLS own-row on all four verbs). There
are no shared or global tables in the accounts schema. Anything global lives in the repo.

## 2. Anonymous-first, then account

| Layer | Today (device) | With an account |
|---|---|---|
| Following | `gtp.follow.v2` (localStorage; ids `mlb-team-*`, `nfl-team-*` ESPN numeric, `nfl-athlete-*`) | `follows(user_id, entity_id, followed_at)` |
| Saved | `gtp.saved.v1` (forecast/game refs + lean SaveCard payload) | `saved_items(user_id, kind, ref, saved_at, payload_jsonb)` — payload is the same lean card the device stores; the settlement is *resolved at read time* from `my/saved-settlements.json`, never stored |
| My GameTime | derived view over Following + Saved + observation | same derivation, server rows instead of device rows |
| Since-your-last-visit | `gtp.observation.v1` — **stays on the device**; it is evidence of what *this device* showed, not sports truth; a second device has its own | not migrated (by design; document in the UI as "on this device") |
| Preferences | `gtp.prefs.v1` | `profiles.prefs_jsonb` (theme, default sport, units) |
| Parlay Center risk/bankroll/unit | `gtp.slip.v1` + `profiles` columns already in the schema | `profiles` (exists) |
| Slips | `bet_slips` (exists) | unchanged |
| Bank Builder / Moonshot user state | none today — the ladders are the site's paper ladders, not the user's | **NOT an account feature in v2.0.** A user-owned ladder would be a staking product (charter 4.2 #12 · founder gate). At most: `saved_items(kind='ladder_step', ref=<published card id>)`, which is "I saved this card", not "I staked this card" |

The anonymous experience must not degrade: every reader keeps the device stores; sign-in is additive.
The nav offers **Your bets** / **Account** only when `NEXT_PUBLIC_SUPABASE_URL` is present at build
(already true for /account).

## 3. Auth

- **Email magic link** first (exists in the scaffold): no password stored, no password to leak.
- **Google** via Supabase OAuth as the second method. Same `auth.users` row; no separate identity
  table. Redirect allow-list = the production origin + `/account/` only (ACCOUNTS_SETUP §2b).
- No 21+ self-attestation is stored until counsel's review of the legal pages (G1) says what the
  wording must be; the column can exist (`profiles.age_attested_at timestamptz null`) but nothing
  writes it until then.

## 4. Schema additions (2026-09-22 proposal — superseded by the built schema; see the table at the top)

```sql
-- all: user-owned, RLS own-row select/insert/update/delete, cascade on auth.users delete
follows      (user_id uuid, entity_id text, followed_at timestamptz, primary key (user_id, entity_id))
saved_items  (id uuid pk, user_id uuid, kind text check (kind in ('forecast','game','card','report')),
              ref text, payload jsonb, saved_at timestamptz, unique (user_id, kind, ref))
profiles     + prefs jsonb default '{}', + age_attested_at timestamptz null,
             + device_migrated_at timestamptz null
```

`schema-contract.test.mjs` already asserts every `create table` has `enable row level security` and
four own-row policies; the new tables inherit that guard for free. The service-role key stays
server-only (the existing browser-code guard).

## 5. Device → account migration

1. On first sign-in, the client reads the three device stores (`follow`, `saved`, `prefs`) and shows a
   one-screen **"Bring these to your account?"** with counts. Nothing uploads without the tap.
2. Upload is idempotent (`on conflict do nothing` on the unique keys); the device stores are kept, not
   cleared, and `profiles.device_migrated_at` is set so the prompt never repeats on that account.
3. After sign-in the account rows are the read source; the device stores become a write-through cache
   so the anonymous surfaces keep working offline and after sign-out.
4. Rollback: sign-out returns the reader to the device stores untouched. Deleting the account deletes
   the rows (cascade) and never touches the device.

## 6. Deletion and export (design — not built yet)

- **Export**: one endpoint (`/api/account-export`, server, own-`uid` only) returns `profiles`,
  `follows`, `saved_items`, `bet_slips` rows and signed URLs for the user's `slips/` objects as one JSON.
  No forecast or result content is exported — only refs, so the export can never be a "record" leak.
- **Delete**: application deletes `slips/<uid>/*` first (storage has no cascade), then
  `auth.admin.deleteUser(uid)` cascades every row. A guard test asserts the order.

## 7. Threat model — one user reading or writing another's rows

| Threat | Control | Proof |
|---|---|---|
| Anonymous or signed-in read of another user's rows | RLS own-row on every table; `anon` role has no bypass | `verify-setup.mjs` asks as a stranger and STOPs on any row |
| A future table added without policies | `schema-contract.test.mjs` fails CI | exists |
| Service-role key reaching the browser | source-scan guard on `SUPABASE_SERVICE_ROLE_KEY` in browser code | exists |
| Client sets `user_id` to someone else on insert | `with check (auth.uid() = user_id)` | schema |
| Storage object listing across folders | bucket private; policies scope to `storage.foldername(name)[1] = auth.uid()::text` | schema §slips |
| Slip image URL guessing | no public URLs; signed URLs only, short TTL | endpoint design |
| Account row restating a forecast/result (integrity, not privacy) | schema has no probability/result columns; read-time join only | this document + a schema-contract assertion to add: no column named `probability`, `result`, `record`, `won`, `lost` in accounts tables |

## 8. What this design refuses

- No user-staked Bank Builder / Moonshot state (staking policy = founder gate).
- No sportsbook credential linking (paid provider + ToS breach risk; founder gate #8).
- No storing of forecasts, finals, live state or the protected record in Supabase.
- No production connection, key, or auth switch-on from an autonomous session.

## 9. Order of work when the founder opens the program (2026-09-22 plan; steps 2–3 are done in a different shape, 4–6 are open)

1. Founder runs `docs/ACCOUNTS_SETUP.md` steps 1–4 (keys are theirs; ~20 min).
2. Add `follows` / `saved_items` to `db/accounts-schema.sql` + the column-name integrity assertion.
3. Client: read-through/write-through adapters beside `follow-store.ts` and `saved-store.ts`
   (feature-flagged on the config contract; anonymous path byte-identical).
4. Migration prompt + idempotent upload.
5. Export + ordered delete endpoints with tests.
6. Google OAuth after magic-link is proven in production.
