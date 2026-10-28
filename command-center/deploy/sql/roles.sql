-- Applied ONCE at CP-H1 by `deploy/migrate.mjs --roles` (owner role), which generates the three passwords and fills
-- the :'…' placeholders; nothing is committed. tests/db-roles.test.mjs runs this exact file.
--
-- Three least-privilege roles. None can change the schema, drop the append-only triggers, or UPDATE/DELETE ledger
-- rows. Row-level security limits what the WORKER may append: never a founder action (decision, attestation,
-- seat change, pause/resume, command, auth, publish receipt) and no claim except a job start. So even a fully
-- compromised runner cannot approve, keep, resume or publish anything.

CREATE ROLE gtp_cc_app LOGIN PASSWORD :'app_pw';
CREATE ROLE gtp_cc_worker LOGIN PASSWORD :'worker_pw';
CREATE ROLE gtp_cc_reader LOGIN PASSWORD :'reader_pw';   -- the workflow's push job: checks a kept branch against the ledger

GRANT USAGE ON SCHEMA public TO gtp_cc_app, gtp_cc_worker, gtp_cc_reader;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT SELECT, INSERT ON ledger_entries, ledger_claims, stored_objects TO gtp_cc_app, gtp_cc_worker;
GRANT USAGE ON SEQUENCE ledger_entries_seq_seq, ledger_claims_seq_seq TO gtp_cc_app, gtp_cc_worker;
GRANT SELECT ON ledger_entries TO gtp_cc_reader;

-- Authentication state: the web app only.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_challenges TO gtp_cc_app;
GRANT SELECT, INSERT, UPDATE ON auth_passkeys, auth_sessions, auth_recovery_codes TO gtp_cc_app;
GRANT SELECT, INSERT ON auth_setup TO gtp_cc_app;

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_read ON ledger_entries FOR SELECT TO gtp_cc_app, gtp_cc_worker, gtp_cc_reader USING (true);
CREATE POLICY ledger_app_append ON ledger_entries FOR INSERT TO gtp_cc_app WITH CHECK (true);
CREATE POLICY ledger_worker_append ON ledger_entries FOR INSERT TO gtp_cc_worker WITH CHECK (
  kind IN ('task', 'contribution', 'progress', 'deliverable', 'report', 'refusal', 'job', 'decision-request', 'preflight', 'post-verification')
  -- V2.1: a queue build may invalidate an approval whose content changed; it can never record a schedule or a receipt
  OR (kind = 'post-status' AND data->>'status' = 'invalidated')
);

CREATE POLICY claims_read ON ledger_claims FOR SELECT TO gtp_cc_app, gtp_cc_worker USING (true);
CREATE POLICY claims_app_append ON ledger_claims FOR INSERT TO gtp_cc_app WITH CHECK (true);
CREATE POLICY claims_worker_append ON ledger_claims FOR INSERT TO gtp_cc_worker WITH CHECK (key LIKE 'job|%|start');
