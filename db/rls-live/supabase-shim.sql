-- SUPABASE SHIM — the parts of a Supabase database that db/accounts-schema.sql depends on, for a LOCAL
-- throwaway Postgres only (Session 9 · H5). NEVER run this against a real Supabase project: it already
-- has all of this, and re-creating it there would collide with the platform's own objects.
--
-- What it reproduces, and why each piece matters to the isolation test being honest:
--   · roles `anon` / `authenticated` (NOLOGIN, NO BYPASSRLS) and `service_role` (BYPASSRLS);
--   · Supabase's DEFAULT GRANTS: anon and authenticated get ALL on every public table. That is the
--     platform default, and it means RLS is the ONLY barrier between two users. A shim without these
--     grants would "pass" because of a permission error, not because of a policy — a vacuous test;
--   · auth.uid() / auth.jwt() read the request's JWT claims from the `request.jwt.claims` setting, exactly
--     as PostgREST sets it per request on the hosted platform;
--   · auth.users (id, email) as the foreign-key target;
--   · storage.buckets / storage.objects / storage.foldername() for the private `slips` bucket policies.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create extension if not exists pgcrypto;

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text not null,
  owner     uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
-- The platform default for every table created in `public` later (accounts-schema.sql runs after this).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
