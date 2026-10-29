-- Hosted media off the database (2026-10-29): bytes live in a PRIVATE Vercel Blob store; Postgres keeps a permanent,
-- append-only reference per object (key, hash, size, where the bytes are). stored_objects (003) is unchanged and stays
-- readable, so nothing written before this migration moves or disappears.

CREATE TABLE IF NOT EXISTS stored_object_refs (
  key           TEXT PRIMARY KEY,
  content_type  TEXT NOT NULL,
  sha256        TEXT NOT NULL,
  size          INTEGER NOT NULL,
  storage       TEXT NOT NULL CHECK (storage IN ('blob')),
  pathname      TEXT NOT NULL,               -- the blob's pathname in the private store (never a public URL)
  created_at    TEXT NOT NULL
);

-- Retention removes BYTES only, never the evidence: one row per removed object, with the hash it had and why.
CREATE TABLE IF NOT EXISTS stored_object_deletions (
  key         TEXT PRIMARY KEY,
  sha256      TEXT NOT NULL,
  reason      TEXT NOT NULL,
  deleted_at  TEXT NOT NULL
);

DROP TRIGGER IF EXISTS stored_object_refs_append_only ON stored_object_refs;
CREATE TRIGGER stored_object_refs_append_only BEFORE UPDATE OR DELETE ON stored_object_refs
  FOR EACH ROW EXECUTE FUNCTION gtp_append_only();
DROP TRIGGER IF EXISTS stored_object_deletions_append_only ON stored_object_deletions;
CREATE TRIGGER stored_object_deletions_append_only BEFORE UPDATE OR DELETE ON stored_object_deletions
  FOR EACH ROW EXECUTE FUNCTION gtp_append_only();
