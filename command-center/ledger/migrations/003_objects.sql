-- Rendered media, verification screenshots, raw Claude Code run logs and G3 change sets, by key. Small (a recap PNG
-- is ~300 KB; a run log is capped at 2 MB), so they live in the same database as the ledger instead of a second
-- storage vendor. Write-once like the ledger: a key, once written, never changes.
CREATE TABLE IF NOT EXISTS stored_objects (
  key          TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  bytes        BYTEA NOT NULL,
  sha256       TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);

DROP TRIGGER IF EXISTS stored_objects_append_only ON stored_objects;
CREATE TRIGGER stored_objects_append_only BEFORE UPDATE OR DELETE ON stored_objects
  FOR EACH ROW EXECUTE FUNCTION gtp_append_only();
DROP TRIGGER IF EXISTS stored_objects_no_truncate ON stored_objects;
CREATE TRIGGER stored_objects_no_truncate BEFORE TRUNCATE ON stored_objects
  FOR EACH STATEMENT EXECUTE FUNCTION gtp_append_only();
