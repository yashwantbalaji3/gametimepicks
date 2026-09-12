#!/usr/bin/env node
/**
 * VERIFY THE ACCOUNTS SETUP (P266) — run this straight after adding the keys.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *     [SUPABASE_SERVICE_ROLE_KEY=…] [ANTHROPIC_API_KEY=…] \
 *     node app/scripts/accounts/verify-setup.mjs
 *
 * It answers one question the schema file cannot: does the project BEHAVE the way the schema says?
 * In particular it asks, as an anonymous stranger, for other people's rows — and treats any row that
 * comes back as a stop-everything finding rather than a warning.
 *
 * Reads only. Creates nothing, signs in as nobody, and never prints a key.
 */
import { accountsConfig } from "../../src/lib/accounts/config.mjs";
import { classifyTableProbe, classifyBucket, classifyReachable, classifyReaderKey, summariseSetup } from "../../src/lib/accounts/setup-check.mjs";

const cfg = accountsConfig(process.env);
if (cfg.state !== "READY") {
  console.error(`accounts setup: ${cfg.state} — ${cfg.reason}`);
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then run this again (docs/ACCOUNTS_SETUP.md).");
  process.exit(3);
}

const anon = { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` };
const get = async (url, headers) => {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    let body = null;
    try { body = await res.json(); } catch { /* not every endpoint answers JSON */ }
    return { status: res.status, body };
  } catch (e) {
    return { error: String(e?.message ?? e).slice(0, 120) };
  }
};

const results = [];
const root = await get(`${cfg.url}/rest/v1/`, anon);
results.push(classifyReachable(root));

for (const table of ["profiles", "bet_slips"]) {
  const r = await get(`${cfg.url}/rest/v1/${table}?select=id&limit=1`, anon);
  results.push(classifyTableProbe(table, { status: r.status, rows: r.body, error: r.error }));
}

const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (service) {
  const b = await get(`${cfg.url}/storage/v1/bucket/slips`, { apikey: service, Authorization: `Bearer ${service}` });
  results.push(classifyBucket({ status: b.status, bucket: b.body, error: b.error }));
} else {
  results.push({ id: "bucket:slips", state: "UNKNOWN", detail: "no SUPABASE_SERVICE_ROLE_KEY in this shell, so the bucket's privacy was not checked — re-run with it to prove that one" });
}

results.push(classifyReaderKey(Boolean(String(process.env.ANTHROPIC_API_KEY ?? "").trim())));

const summary = summariseSetup(results);
const MARK = { PASS: "  ok  ", WARN: " warn ", UNKNOWN: "  ?   ", FAIL: " FAIL ", REFUSE: " STOP " };
for (const r of summary.results) console.log(`[${MARK[r.state] ?? r.state}] ${r.id}: ${r.detail}`);
console.log(`\n${summary.headline}`);
process.exit(summary.exitCode);
