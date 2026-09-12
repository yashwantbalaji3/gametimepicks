-- GameTime Picks — accounts, bet slips and slip images (P263 groundwork).
--
-- Run ONCE in the Supabase SQL editor after creating the project (docs/ACCOUNTS_SETUP.md).
-- Idempotent: every statement is IF NOT EXISTS or CREATE OR REPLACE, so re-running is safe.
--
-- THE RULE THIS SCHEMA EXISTS TO ENFORCE: a row belongs to exactly one person, and nobody else can
-- read it. Every table below has row-level security ENABLED and a policy keyed to auth.uid(); a table
-- without both is a table any signed-in visitor can read. The guard in
-- app/src/lib/accounts/schema-contract.test.mjs fails the build if a table is ever added without them.
--
-- A user's bets are financial behaviour. They are never aggregated into the site's public record,
-- never used to change a published number, and never leave this database except back to the person
-- who uploaded them.

-- ── Profile ────────────────────────────────────────────────────────────────────────────────────────
-- One row per account, created on first sign-in. Deliberately thin: no name is required to use the
-- site, and nothing here is shown to anyone else.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- The reader's stated style, so the Parlay Center matches across their devices. Mirrors the
  -- browser-local preferences exactly (risk level, bankroll, flat unit percentage) and is optional.
  risk         text check (risk in ('low', 'medium', 'high', 'longshot')),
  bankroll     numeric(12, 2) check (bankroll is null or bankroll > 0),
  unit_pct     numeric(4, 1) check (unit_pct is null or (unit_pct >= 1 and unit_pct <= 10)),
  -- Limits the person sets FOR THEMSELVES. All optional and all null by default: the site does not
  -- impose a ceiling on anybody, and an unset limit is never treated as zero. They are checked
  -- against that person's own settled slips and reported to them — nothing here blocks anything,
  -- because this is a paper research product and their money is their own business.
  max_stake_per_slip  numeric(12, 2) check (max_stake_per_slip is null or max_stake_per_slip > 0),
  daily_loss_limit    numeric(12, 2) check (daily_loss_limit is null or daily_loss_limit > 0),
  monthly_loss_limit  numeric(12, 2) check (monthly_loss_limit is null or monthly_loss_limit > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- `create table if not exists` does NOTHING when the table already exists — including adding a column
-- that was not in the version someone ran before. So every optional profile column is also stated as
-- an `add column if not exists`, and a re-run converges instead of quietly leaving an older table in
-- place while the app writes to a column that is not there.
alter table public.profiles add column if not exists display_name        text;
alter table public.profiles add column if not exists risk                text;
alter table public.profiles add column if not exists bankroll            numeric(12, 2);
alter table public.profiles add column if not exists unit_pct            numeric(4, 1);
alter table public.profiles add column if not exists max_stake_per_slip  numeric(12, 2);
alter table public.profiles add column if not exists daily_loss_limit    numeric(12, 2);
alter table public.profiles add column if not exists monthly_loss_limit  numeric(12, 2);

-- ── Bet slips ──────────────────────────────────────────────────────────────────────────────────────
-- A slip the user actually placed, entered by hand or read from a screenshot they uploaded.
--
-- `source` records HOW it got here, and `confirmed_at` records that a human checked the reading before
-- it counted: a slip parsed from an image is a claim about a picture until its owner confirms it.
create table if not exists public.bet_slips (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  source         text not null check (source in ('screenshot', 'manual', 'book_sync')),
  -- Sportsbook name as the user states it. Never a credential, never an account number.
  book           text,
  placed_at      timestamptz,
  stake          numeric(12, 2) check (stake is null or stake >= 0),
  price_american integer,
  -- The legs as read or entered: [{player, market, side, line, odds, event, starts_at}]. Kept as one
  -- document because a slip is a single artifact — the legs have no meaning apart from their ticket.
  legs           jsonb not null default '[]'::jsonb,
  -- pending → won / lost / push / void / cashed_out. Settlement is written from official results only.
  status         text not null default 'pending'
                 check (status in ('pending', 'won', 'lost', 'push', 'void', 'cashed_out')),
  settled_at     timestamptz,
  returned       numeric(12, 2) check (returned is null or returned >= 0),
  -- Path in the private `slips` storage bucket, when the slip came from an image.
  image_path     text,
  -- Set when the person confirmed the reading. An unconfirmed slip never enters a record.
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists bet_slips_user_placed_idx on public.bet_slips (user_id, placed_at desc);
create index if not exists bet_slips_user_status_idx on public.bet_slips (user_id, status);

-- ── Row-level security ─────────────────────────────────────────────────────────────────────────────
-- Enabled on every table, with policies that compare auth.uid() to the row's owner. There is no
-- "read all" policy anywhere, and the anon key alone can therefore reach nothing.
alter table public.profiles  enable row level security;
alter table public.bet_slips enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles for delete using (auth.uid() = id);

drop policy if exists bet_slips_select_own on public.bet_slips;
create policy bet_slips_select_own on public.bet_slips for select using (auth.uid() = user_id);
drop policy if exists bet_slips_insert_own on public.bet_slips;
create policy bet_slips_insert_own on public.bet_slips for insert with check (auth.uid() = user_id);
drop policy if exists bet_slips_update_own on public.bet_slips;
create policy bet_slips_update_own on public.bet_slips for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists bet_slips_delete_own on public.bet_slips;
create policy bet_slips_delete_own on public.bet_slips for delete using (auth.uid() = user_id);

-- ── Slip images ────────────────────────────────────────────────────────────────────────────────────
-- A PRIVATE bucket: no public URLs, ever. Objects live under `<user id>/<slip id>.<ext>`, and the
-- policies below allow a person to touch only the folder named for their own id.
insert into storage.buckets (id, name, public)
  values ('slips', 'slips', false)
  on conflict (id) do update set public = false;

drop policy if exists slips_read_own on storage.objects;
create policy slips_read_own on storage.objects for select
  using (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists slips_write_own on storage.objects;
create policy slips_write_own on storage.objects for insert
  with check (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists slips_delete_own on storage.objects;
create policy slips_delete_own on storage.objects for delete
  using (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Account deletion ───────────────────────────────────────────────────────────────────────────────
-- Deleting the auth user cascades to the profile and every slip (the foreign keys above). The images
-- are removed by the application before the user row goes, because storage has no cascade.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists bet_slips_touch_updated_at on public.bet_slips;
create trigger bet_slips_touch_updated_at before update on public.bet_slips
  for each row execute function public.touch_updated_at();
