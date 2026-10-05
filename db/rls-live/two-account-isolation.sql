-- LIVE TWO-ACCOUNT RLS ISOLATION (Session 9 · H5).
--
-- Executes the REAL policies of db/accounts-schema.sql in a real Postgres, as the real roles, with real
-- JWT claims — the step a regex over the SQL file cannot take. Run by app/scripts/accounts/rls-live.mjs:
--   · locally: a throwaway cluster + db/rls-live/supabase-shim.sql + db/accounts-schema.sql, then this;
--   · against a hosted project: this file alone, as `postgres` (the shim is the platform there).
--
-- Everything happens inside ONE transaction that is ROLLED BACK at the end, so a run against a real
-- project leaves no user, row or object behind. Any failed expectation raises and aborts the run; the
-- last line printed on success is exactly `RLS LIVE ISOLATION: PASS`.
--
-- Identities (fixed uuids so a failure message names the actor):
--   A …0a  invited tester            B …0b  invited tester
--   C …0c  signed in, NOT invited    R …0d  invited, then REVOKED     anon  no JWT at all
-- (C and R may not upload slip images either: an upload is a write, and writes need an active invite.)
\set ON_ERROR_STOP on
begin;

create schema rls_test;
grant usage on schema rls_test to anon, authenticated;

-- Act as someone: the role PostgREST would use plus the claims it would set, local to the transaction.
create function rls_test.act_as(who text) returns void language plpgsql as $$
begin
  if who = 'anon' then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object(
      'sub', '00000000-0000-4000-8000-0000000000' || who, 'email', 'tester-' || who || '@example.test', 'role', 'authenticated')::text, true);
  end if;
end $$;
grant execute on function rls_test.act_as(text) to anon, authenticated;

-- The isolation battery for one owned table, run AS `me` against `other`'s rows (invoker rights: RLS applies).
create function rls_test.isolation(tbl regclass, owner_col text, me uuid, other uuid, blind_col text, blind_val text) returns text language plpgsql as $$
declare n bigint; mine bigint;
begin
  execute format('select count(*) from %s where %I = $1', tbl, owner_col) into n using other;
  if n <> 0 then raise exception 'LEAK %: % read % row(s) owned by %', tbl, me, n, other; end if;
  execute format('select count(*) from %s where %I is distinct from $1', tbl, owner_col) into n using me;
  if n <> 0 then raise exception 'LEAK %: % can see % row(s) that are not theirs', tbl, me, n; end if;
  execute format('select count(*) from %s where %I = $1', tbl, owner_col) into n using me;
  if n < 1 then raise exception 'OWN-READ %: % cannot read their own row', tbl, me; end if;
  execute format('update %s set %I = %I where %I = $1', tbl, owner_col, owner_col, owner_col) using other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK %: % updated % row(s) owned by %', tbl, me, n, other; end if;
  begin
    execute format('update %s set %I = $1 where %I = $2', tbl, owner_col, owner_col) using other, me;
    raise exception 'LEAK %: % re-assigned their own row to %', tbl, me, other;
  exception when insufficient_privilege then null;
  end;
  -- A BLANKET update (no WHERE, constant SET) reads no column, so Postgres consults ONLY the UPDATE policy's
  -- USING — not SELECT. An open UPDATE USING hides behind an owner-only SELECT for every WHERE'd update and
  -- shows here: it must touch exactly my rows. (The first version of this battery missed that defect.)
  execute format('select count(*) from %s where %I = $1', tbl, owner_col) into mine using me;
  execute format('update %s set %I = %L', tbl, blind_col, blind_val);
  get diagnostics n = row_count;
  if n <> mine then raise exception 'LEAK %: a blanket update by % touched % row(s), they own %', tbl, me, n, mine; end if;
  execute format('delete from %s where %I = $1', tbl, owner_col) using other;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'LEAK %: % deleted % row(s) owned by %', tbl, me, n, other; end if;
  return tbl::text || ' isolated for ' || me;
end $$;
grant execute on function rls_test.isolation(regclass, text, uuid, uuid, text, text) to anon, authenticated;

-- An INSERT that must be refused by policy (42501). Anything else — success or another error — fails.
create function rls_test.refused(sql text, why text) returns text language plpgsql as $$
begin
  begin
    execute sql;
  exception when insufficient_privilege then return 'refused: ' || why;
  end;
  raise exception 'NOT REFUSED: % — %', why, sql;
end $$;
grant execute on function rls_test.refused(text, text) to anon, authenticated;

create function rls_test.n(sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute sql into n; return n; end $$;
grant execute on function rls_test.n(text) to anon, authenticated;

-- ── Setup (as the database owner: what sign-up + the founder's invite would create) ─────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'tester-0a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'tester-0b@example.test'),
  ('00000000-0000-4000-8000-00000000000c', 'tester-0c@example.test'),
  ('00000000-0000-4000-8000-00000000000d', 'tester-0d@example.test');
insert into public.beta_access (email, tester_code) values
  ('tester-0a@example.test', 'RLS-A'), ('tester-0b@example.test', 'RLS-B'), ('tester-0d@example.test', 'RLS-R');
insert into storage.buckets (id, name, public) values ('slips', 'slips', false) on conflict (id) do nothing;

-- ── Each invited tester writes their own rows, through the policies ───────────────────────────────────
select rls_test.act_as('0a');
insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-00000000000a', 'A');
insert into public.user_preferences (user_id, favorite_sports) values ('00000000-0000-4000-8000-00000000000a', '{nfl}');
insert into public.user_follows (user_id, kind, entity_id) values ('00000000-0000-4000-8000-00000000000a', 'sport', 'nfl');
insert into public.saved_items (user_id, kind, ref) values ('00000000-0000-4000-8000-00000000000a', 'official_card', 'bank-builder:2026-10-04:A:1');
insert into public.bet_slips (user_id, source, book, stake, price_american, legs, official_card_id)
  values ('00000000-0000-4000-8000-00000000000a', 'manual', 'ExampleBook', 20, 150,
          '[{"player":"x","market":"anytime_td","side":"yes","odds":150}]', 'bank-builder:2026-10-04:A:1');
insert into public.beta_feedback (user_id, route, severity, actual) values ('00000000-0000-4000-8000-00000000000a', '/nfl/', 'minor', 'A only');
insert into storage.objects (bucket_id, name) values ('slips', '00000000-0000-4000-8000-00000000000a/slip-a.png');
reset role;

select rls_test.act_as('0b');
insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-00000000000b', 'B');
insert into public.user_preferences (user_id, favorite_sports) values ('00000000-0000-4000-8000-00000000000b', '{mlb}');
insert into public.user_follows (user_id, kind, entity_id) values ('00000000-0000-4000-8000-00000000000b', 'sport', 'mlb');
insert into public.saved_items (user_id, kind, ref) values ('00000000-0000-4000-8000-00000000000b', 'game', 'mlb-2026-10-04-1');
insert into public.bet_slips (user_id, source, stake, price_american, legs) values ('00000000-0000-4000-8000-00000000000b', 'manual', 10, -110, '[]');
insert into public.beta_feedback (user_id, route, severity, actual) values ('00000000-0000-4000-8000-00000000000b', '/mlb/', 'major', 'B only');
insert into storage.objects (bucket_id, name) values ('slips', '00000000-0000-4000-8000-00000000000b/slip-b.png');
reset role;

-- R's rows exist from before the revocation (inserted as the owner), then R is revoked.
insert into public.profiles (id) values ('00000000-0000-4000-8000-00000000000d');
insert into public.bet_slips (user_id, source, stake) values ('00000000-0000-4000-8000-00000000000d', 'manual', 5);
update public.beta_access set revoked_at = now() where tester_code = 'RLS-R';

-- ── A vs B and B vs A, every private table ────────────────────────────────────────────────────────────
select rls_test.act_as('0a');
select rls_test.isolation('public.profiles', 'id', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'display_name', 'x');
select rls_test.isolation('public.user_preferences', 'user_id', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'hide_player_props', 'true');
select rls_test.isolation('public.user_follows', 'user_id', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'followed_at', '2026-01-01T00:00:00Z');
select rls_test.isolation('public.saved_items', 'user_id', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'saved_at', '2026-01-01T00:00:00Z');
select rls_test.isolation('public.bet_slips', 'user_id', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'book', 'blanket');
select rls_test.isolation('public.beta_feedback', 'user_id', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'link', 'blanket');
select rls_test.refused($$insert into public.bet_slips (user_id, source) values ('00000000-0000-4000-8000-00000000000b', 'manual')$$, 'A writes a bet as B');
select rls_test.refused($$insert into public.beta_feedback (user_id, route) values ('00000000-0000-4000-8000-00000000000b', '/')$$, 'A files feedback as B');
select rls_test.refused($$insert into storage.objects (bucket_id, name) values ('slips', '00000000-0000-4000-8000-00000000000b/x.png')$$, 'A uploads into B''s folder');
do $$ begin
  if rls_test.n('select count(*) from storage.objects') <> 1 then raise exception 'LEAK storage: A sees another folder'; end if;
  if rls_test.n('select count(*) from public.beta_access') <> 0 then raise exception 'LEAK beta_access: the invite list is readable by a tester'; end if;
end $$;
select rls_test.refused($$insert into public.beta_access (email) values ('friend@example.test')$$, 'a tester invites someone');
reset role;

select rls_test.act_as('0b');
select rls_test.isolation('public.profiles', 'id', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a', 'display_name', 'x');
select rls_test.isolation('public.user_preferences', 'user_id', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a', 'hide_player_props', 'true');
select rls_test.isolation('public.user_follows', 'user_id', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a', 'followed_at', '2026-01-01T00:00:00Z');
select rls_test.isolation('public.saved_items', 'user_id', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a', 'saved_at', '2026-01-01T00:00:00Z');
select rls_test.isolation('public.bet_slips', 'user_id', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a', 'book', 'blanket');
select rls_test.isolation('public.beta_feedback', 'user_id', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a', 'link', 'blanket');
reset role;

-- The battery's UPDATE / DELETE attempts must have changed nothing: check as the owner.
do $$ begin
  if (select count(*) from public.bet_slips) <> 3 or (select count(*) from public.beta_feedback) <> 2
     or (select count(*) from public.profiles) <> 3 or (select count(*) from storage.objects) <> 2 then
    raise exception 'TAMPER: a cross-user UPDATE/DELETE changed the row set';
  end if;
  if (select stake from public.bet_slips where user_id = '00000000-0000-4000-8000-00000000000a') <> 20 then
    raise exception 'TAMPER: A''s stake changed';
  end if;
  if (select display_name from public.profiles where id = '00000000-0000-4000-8000-00000000000d') is not null
     or (select book from public.bet_slips where user_id = '00000000-0000-4000-8000-00000000000d') is not null then
    raise exception 'TAMPER: a blanket update reached R''s rows';
  end if;
end $$;

-- ── Anonymous: reads nothing, writes nothing ─────────────────────────────────────────────────────────
select rls_test.act_as('anon');
do $$ declare t text; begin
  foreach t in array array['public.profiles','public.user_preferences','public.user_follows','public.saved_items',
                           'public.bet_slips','public.beta_feedback','public.beta_access','storage.objects'] loop
    if rls_test.n('select count(*) from ' || t) <> 0 then raise exception 'LEAK %: anonymous read private rows', t; end if;
  end loop;
end $$;
-- anon has no EXECUTE on is_beta_member() on a correctly granted project, so the refusal may arrive as
-- either a policy violation or a function-permission error: both are 42501, and both are a refusal.
select rls_test.refused($$insert into public.bet_slips (user_id, source) values ('00000000-0000-4000-8000-00000000000a', 'manual')$$, 'anonymous writes a bet');
reset role;

-- ── Invite flow: an uninvited account cannot onboard; a revoked tester keeps read/delete, loses write ─
select rls_test.act_as('0c');
select rls_test.refused($$insert into public.profiles (id) values ('00000000-0000-4000-8000-00000000000c')$$, 'an uninvited account creates a profile');
select rls_test.refused($$insert into public.bet_slips (user_id, source) values ('00000000-0000-4000-8000-00000000000c', 'manual')$$, 'an uninvited account records a bet');
select rls_test.refused($$insert into storage.objects (bucket_id, name) values ('slips', '00000000-0000-4000-8000-00000000000c/c.png')$$, 'an uninvited account uploads a slip image into its own folder');
reset role;

select rls_test.act_as('0d');
do $$ begin
  if rls_test.n('select count(*) from public.bet_slips') <> 1 then raise exception 'REVOKED: R cannot read their own slip'; end if;
end $$;
select rls_test.refused($$insert into public.bet_slips (user_id, source) values ('00000000-0000-4000-8000-00000000000d', 'manual')$$, 'a revoked tester records a new bet');
select rls_test.refused($$insert into storage.objects (bucket_id, name) values ('slips', '00000000-0000-4000-8000-00000000000d/r.png')$$, 'a revoked tester uploads a slip image into their own folder');
delete from public.bet_slips where user_id = '00000000-0000-4000-8000-00000000000d';
do $$ begin
  if rls_test.n('select count(*) from public.bet_slips') <> 0 then raise exception 'REVOKED: R cannot delete their own slip'; end if;
end $$;
reset role;

-- ── Every private table is covered: RLS on, and no table in `public` escaped this battery ─────────────
do $$ declare missing text; begin
  select string_agg(c.relname, ', ') into missing from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then raise exception 'RLS DISABLED on: %', missing; end if;
  select string_agg(c.relname, ', ') into missing from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('profiles','user_preferences','user_follows','saved_items','bet_slips','beta_feedback','beta_access');
  if missing is not null then raise exception 'UNTESTED private table(s): % — add them to db/rls-live/two-account-isolation.sql', missing; end if;
end $$;

select 'RLS LIVE ISOLATION: PASS' as result;
rollback;
