/**
 * The Odds API key from the founder's existing dotenv file (founder 2026-11-11: no duplicate key file): only the
 * ODDS_API_KEY line is parsed, mode 600 is required, and the key appears in no log, state or ledger output. SYNTHETIC
 * keys and files in a temp directory; the end-to-end run stubs `fetch` (a 401), so no network call is ever made.
 *
 * Run: cd app && npx tsx --test src/lib/sports/odds/nba-props/key-env-file.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { readOddsKeyFromEnvFile } from "./key-env-file.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const KEY = "synthetic-key-0123456789abcdef";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gtp-keyenv-"));
const envFile = (dir, text, mode = 0o600) => { const f = path.join(dir, ".env"); fs.writeFileSync(f, text); fs.chmodSync(f, mode); return f; };

test("parses ONLY the ODDS_API_KEY line; no other variable is read or set", () => {
  const d = tmp();
  const f = envFile(d, `# comment\nGTP_ODDS_DISPLAY_KEY=display-secret\nOTHER_TOKEN="other"\nexport ODDS_API_KEY="${KEY}"\nTAIL=1\n`);
  const before = { ...process.env };
  const r = readOddsKeyFromEnvFile(f);
  assert.deepEqual(r, { ok: true, key: KEY }, "only the key, nothing else");
  assert.deepEqual(Object.keys(r).sort(), ["key", "ok"]);
  assert.deepEqual({ ...process.env }, before, "process.env is untouched");
  assert.equal(process.env.GTP_ODDS_DISPLAY_KEY === "display-secret", false);
  assert.equal(readOddsKeyFromEnvFile(envFile(tmp(), `ODDS_API_KEY=${KEY} # note\n`)).key, KEY);
  assert.equal(readOddsKeyFromEnvFile(envFile(tmp(), `ODDS_API_KEY='${KEY}'\n`)).key, KEY);
});

test("refusals: missing file, group/world-readable mode, no key line, two key lines, empty key — none echoes the key", () => {
  const cases = [
    [path.join(tmp(), "absent.env"), /does not exist/],
    [envFile(tmp(), `ODDS_API_KEY=${KEY}\n`, 0o644), /mode 644\); it must be 600/],
    [envFile(tmp(), `ODDS_API_KEY=${KEY}\n`, 0o640), /mode 640\); it must be 600/],
    [envFile(tmp(), "OTHER=1\n"), /no ODDS_API_KEY line/],
    [envFile(tmp(), `ODDS_API_KEY=${KEY}\nODDS_API_KEY=${KEY}x\n`), /more than one ODDS_API_KEY line/],
    [envFile(tmp(), "ODDS_API_KEY=\n"), /is empty/],
  ];
  for (const [f, re] of cases) {
    const r = readOddsKeyFromEnvFile(f);
    assert.equal(r.ok, false);
    assert.match(r.reason, re);
    assert.doesNotMatch(r.reason, new RegExp(KEY.slice(0, 8)), "a refusal never contains the key");
  }
  assert.equal(readOddsKeyFromEnvFile(envFile(tmp(), `ODDS_API_KEY=${KEY}\n`, 0o400)).ok, true, "stricter than 600 is fine");
});

test("end to end: the runner reads the key from --key-env-file and it appears in no output, state or ledger file", () => {
  // A throwaway origin + dedicated checkout holding just what a tick reads: the receipt, a schedule with one game in the
  // 20–75 min window, the ledger. fetch is stubbed (401) through a preload, so the tick refuses at the free plan check.
  const d = tmp();
  const origin = path.join(d, "origin.git"), work = path.join(d, "seed"), repo = path.join(d, "checkout"), priv = path.join(d, "private");
  const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["init", "-q", "-b", "main", work]);
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(work, rel)), { recursive: true }); fs.writeFileSync(path.join(work, rel), text); };
  put("docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11.md", fs.readFileSync(path.join(ROOT, "docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11.md"), "utf8"));
  put("app/public/data/nba/schedule/latest.json", JSON.stringify({ rows: [{ providerEventId: "999", dateUtc: "2026-11-12T00:40Z", statusRaw: "STATUS_SCHEDULED", home: { abbr: "AAA", providerTeamId: "1" }, away: { abbr: "BBB", providerTeamId: "2" } }] }));
  put("data/internal/research/odds/nba/authorization-ledger.json", JSON.stringify({ requests: [], cumulativeCredits: 0 }));
  git(work, "add", "-A"); git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "seed"); git(work, "push", "-q", origin, "main");
  execFileSync("git", ["clone", "-q", origin, repo]);
  fs.writeFileSync(path.join(repo, ".gtp-capture-checkout"), "");
  fs.mkdirSync(priv);
  const env = envFile(d, `GTP_ODDS_DISPLAY_KEY=display-secret\nODDS_API_KEY=${KEY}\n`);
  const stub = path.join(d, "fetch-stub.mjs");
  fs.writeFileSync(stub, "globalThis.fetch = async () => new Response('', { status: 401 });\n");
  const r = spawnSync(process.execPath, ["--import", stub, path.join(ROOT, "app/scripts/nba/run-nba-props-local-tick.mjs"), "--repo", repo, "--private", priv, "--key-env-file", env, "--now", "2026-11-12T00:00:00Z", "--apply", "--commit-ledger"], {
    encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  const out = `${r.stdout}\n${r.stderr}`;
  assert.match(out, /PREFLIGHT_REFUSED/, out);
  assert.match(out, /PROVIDER_UNAVAILABLE: plan check returned 401/);
  const written = [];
  const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) { if (e.name !== ".git") walk(f); } else written.push(f); } };
  walk(priv); walk(repo);
  assert.ok(written.some((f) => f.endsWith("state.json")), "the tick wrote its private state");
  for (const text of [out, ...written.map((f) => fs.readFileSync(f, "utf8"))]) {
    assert.equal(text.includes(KEY), false, "the key appears in no output, state or ledger");
    assert.equal(text.includes(KEY.slice(0, 12)), false, "nor any part of it");
    assert.equal(text.includes("display-secret"), false, "no other variable of the env file leaks either");
  }
});
