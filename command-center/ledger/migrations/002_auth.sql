-- Authentication state (mutable by design: counters, expiries, revocations). Every security-relevant event is ALSO
-- written to the append-only ledger as kind "auth", without secrets, so the audit trail never depends on these rows.

CREATE TABLE IF NOT EXISTS auth_passkeys (
  credential_id  TEXT PRIMARY KEY,           -- base64url
  public_key     TEXT NOT NULL,              -- base64url COSE key
  counter        BIGINT NOT NULL DEFAULT 0,
  transports     JSONB NOT NULL DEFAULT '[]',
  label          TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  last_used_at   TEXT
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id          TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL,                  -- register | login | stepup
  challenge   TEXT NOT NULL,
  binding     TEXT,                           -- step-up: sha256(session, action, payload digest)
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash   TEXT PRIMARY KEY,             -- sha256(cookie token); the token itself is never stored
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,                -- absolute expiry
  scope        TEXT NOT NULL DEFAULT 'full', -- full | recovery (may only register a new passkey)
  revoked_at   TEXT,
  credential_id TEXT
);

CREATE TABLE IF NOT EXISTS auth_recovery_codes (
  code_hash  TEXT PRIMARY KEY,               -- scrypt(code, salt) as salt$hash
  created_at TEXT NOT NULL,
  used_at    TEXT
);

-- Exactly one "first passkey" registration can ever succeed through the setup token, even if two race.
CREATE TABLE IF NOT EXISTS auth_setup (
  id       SMALLINT PRIMARY KEY CHECK (id = 1),
  used_at  TEXT NOT NULL
);
