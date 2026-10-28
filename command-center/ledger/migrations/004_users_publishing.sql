-- P0 (2026-10-28): individual accounts with roles, invite-only; X Publisher V1 secrets and OAuth state.

-- One row per person. The founder is created by the setup-token registration (id 'founder', role admin);
-- everyone else only through an administrator's invite. There is no self-registration path.
CREATE TABLE IF NOT EXISTS auth_users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('viewer', 'drafter', 'approver', 'publisher', 'admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TEXT NOT NULL,
  created_by    TEXT,
  updated_at    TEXT
);

-- Passkeys and sessions belong to a user (H0 rows predate users: they are the founder's).
ALTER TABLE auth_passkeys ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_id TEXT;
UPDATE auth_passkeys SET user_id = 'founder' WHERE user_id IS NULL;
UPDATE auth_sessions SET user_id = 'founder' WHERE user_id IS NULL;
-- An H0 deployment upgraded in place: its passkeys are the founder's, who becomes the first administrator.
INSERT INTO auth_users (id, display_name, role, created_at, created_by)
  SELECT 'founder', 'Founder', 'admin', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'migration-004'
  WHERE EXISTS (SELECT 1 FROM auth_passkeys)
  ON CONFLICT (id) DO NOTHING;

-- An invite is a single-use, expiring, role-scoped link created by an administrator. Only sha256(token) is stored.
CREATE TABLE IF NOT EXISTS auth_invites (
  token_hash    TEXT PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('viewer', 'drafter', 'approver', 'publisher', 'admin')),
  display_name  TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  used_at       TEXT,
  used_by       TEXT,
  revoked_at    TEXT
);

-- X OAuth: state (keyed by sha256), PKCE verifier and the binding to the administrator session that started it.
-- 10-minute lifetime; a row is deleted when it is used.
CREATE TABLE IF NOT EXISTS cc_oauth_states (
  state_hash    TEXT PRIMARY KEY,
  verifier      TEXT NOT NULL,
  binding       TEXT NOT NULL,
  redirect_uri  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  code          TEXT,
  received_at   TEXT
);

-- Secrets (X tokens; a confidential app's client secret), AES-256-GCM with GTP_CC_SECRET_KEY; name is the AAD.
CREATE TABLE IF NOT EXISTS cc_secrets (
  name        TEXT PRIMARY KEY,
  iv          TEXT NOT NULL,
  tag         TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
