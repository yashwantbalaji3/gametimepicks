-- CEO Command Center ledger (hosted). Append-only by construction: the application never updates or deletes rows,
-- and the triggers below make the database refuse it too. Grants for the app/worker roles are in
-- deploy/sql/roles.sql (applied by the founder at CP-H1); this file is safe to run repeatedly.

CREATE TABLE IF NOT EXISTS ledger_entries (
  seq     BIGSERIAL PRIMARY KEY,
  id      TEXT NOT NULL UNIQUE,
  at      TEXT NOT NULL,              -- ISO instant exactly as the clock produced it (replays stay byte-identical)
  kind    TEXT NOT NULL,
  actor   TEXT NOT NULL,
  data    JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_entries_kind ON ledger_entries (kind);
CREATE INDEX IF NOT EXISTS ledger_entries_command ON ledger_entries ((data->>'commandId'));

CREATE TABLE IF NOT EXISTS ledger_claims (
  seq      BIGSERIAL,
  key_hash TEXT PRIMARY KEY,           -- sha256(key): first writer wins, enforced by the primary key
  key      TEXT NOT NULL,
  value    JSONB NOT NULL
);

CREATE OR REPLACE FUNCTION gtp_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger tables are append-only (% on %)', TG_OP, TG_TABLE_NAME;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entries_append_only ON ledger_entries;
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION gtp_append_only();
DROP TRIGGER IF EXISTS ledger_claims_append_only ON ledger_claims;
CREATE TRIGGER ledger_claims_append_only BEFORE UPDATE OR DELETE ON ledger_claims
  FOR EACH ROW EXECUTE FUNCTION gtp_append_only();
-- TRUNCATE bypasses row triggers, so it gets its own statement trigger. (The owner role could still drop these
-- triggers; it is used only from the Mac for migrations, never by the app or the worker.)
DROP TRIGGER IF EXISTS ledger_entries_no_truncate ON ledger_entries;
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION gtp_append_only();
DROP TRIGGER IF EXISTS ledger_claims_no_truncate ON ledger_claims;
CREATE TRIGGER ledger_claims_no_truncate BEFORE TRUNCATE ON ledger_claims
  FOR EACH STATEMENT EXECUTE FUNCTION gtp_append_only();

-- Which database role wrote each row, set by the database itself (a client cannot choose it). Audit, and a second
-- check behind row-level security for anything that must come from the web app (worker/check-kept.mjs).
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS writer TEXT;
CREATE OR REPLACE FUNCTION gtp_set_writer() RETURNS trigger AS $$
BEGIN
  NEW.writer := current_user;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ledger_entries_writer ON ledger_entries;
CREATE TRIGGER ledger_entries_writer BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION gtp_set_writer();
