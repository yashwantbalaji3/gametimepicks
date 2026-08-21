#!/usr/bin/env node
/**
 * CAPTURE EPL PLAYER STATS — the free-tier backfill that answers whether a player model is possible
 * at all, before anyone spends money on it. PRIVATE RESEARCH.
 *
 *   node scripts/epl/capture-epl-player-stats.mjs [--season 2024] [--max-requests 40] [--write]
 *
 * WHY THIS EXISTS AND WHY IT IS SLOW ON PURPOSE.
 *
 * api-football's /fixtures/players endpoint is NOT feature-gated — it works on the founder's existing
 * FREE plan. What the free plan gates is SEASONS: "Free plans do not have access to this season, try
 * from 2022 to 2024." So three full seasons of real player data are reachable for $0, which is enough
 * to test whether a player model clears a preregistered bar. Only the CURRENT season and the live
 * lineup feed need the $19/month Pro plan, and that spend should follow the evidence rather than
 * precede it.
 *
 * The cost of $0 is throughput: 100 requests per day, one request per fixture. This script is
 * therefore RESUMABLE and QUOTA-AWARE — it asks the API what is left, captures up to that, records
 * what it got, and stops. Run it daily and the backfill completes on its own.
 *
 * WHAT IS AND IS NOT COMMITTED. The raw response bodies land in players/raw/, which is GITIGNORED:
 * this repository is public, and the payloads are a licensed provider's. What IS committed is our own
 * compact extraction — the fields a prop model needs — as private-research class that never reaches
 * the public export.
 *
 * FAIL-CLOSED. A plan/quota error stops the run and reports it. It never writes a short capture that
 * looks like a complete one, because a corpus that silently covers 60% of a season would quietly
 * bias every rate fitted on it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const PLAYERS = path.join(REPO, "data/internal/research/epl/players");
const RAW = path.join(PLAYERS, "raw");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes("--write");
const SEASON = arg("--season", null);
const MAX_REQ = Number(arg("--max-requests", "40"));
/* Free plans are rate-limited per MINUTE as well as per day; pace conservatively rather than get 429s. */
const DELAY_MS = Number(arg("--delay-ms", "7500"));   // 8/min, under the free plan's 10/min ceiling

const key = (fs.readFileSync(path.join(REPO, ".env"), "utf8").match(/^API_FOOTBALL_KEY=(.*)$/m)?.[1] ?? "").trim().replace(/['"]/g, "");
if (!key) { console.error("no API_FOOTBALL_KEY — refused rather than run a capture that would write nothing"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (route) => {
  const res = await fetch(`https://v3.football.api-sports.io${route}`, { headers: { "x-apisports-key": key } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${route}`);
  return res.json();
};

/* ── What is left today, asked rather than assumed ───────────────────────────────────────────── */
const status = await api("/status");
const sub = status.response?.subscription ?? {};
const req = status.response?.requests ?? {};
const remaining = Math.max(0, (req.limit_day ?? 0) - (req.current ?? 0));
console.log(`plan ${sub.plan} · ${req.current}/${req.limit_day} used today · ${remaining} remaining`);

/* ── The fixtures to capture, from the COMMITTED corpus (never re-discovered over the wire) ───── */
const corpus = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/epl/corpus-v1.json"), "utf8"));
const wanted = corpus.rows
  .filter((r) => r.providerRef?.provider === "api-football" && r.providerRef?.id)
  .filter((r) => (SEASON ? r.season === SEASON : true))
  /* Most recent first: recency is what a prop model most needs, and the backfill may be interrupted. */
  .sort((a, b) => String(b.dateUtc).localeCompare(String(a.dateUtc)));

if (wanted.length === 0) {
  console.error(`no api-football fixtures in the corpus${SEASON ? ` for season ${SEASON}` : ""} — nothing to capture`);
  process.exit(2);
}

/* ── Resume: whatever is already extracted is never re-fetched ────────────────────────────────── */
const corpusFile = path.join(PLAYERS, "corpus-players-v1.jsonl");
const captured = new Set();
if (fs.existsSync(corpusFile)) {
  for (const line of fs.readFileSync(corpusFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { captured.add(String(JSON.parse(line).fixtureId)); } catch { /* a malformed line is not a capture */ }
  }
}

const todo = wanted.filter((r) => !captured.has(String(r.providerRef.id)));
const budget = Math.min(MAX_REQ, remaining, todo.length);
console.log(`corpus fixtures: ${wanted.length} · already captured: ${wanted.length - todo.length} · remaining to capture: ${todo.length}`);
console.log(`this run will attempt: ${budget}${budget < todo.length ? ` (resume tomorrow for the rest)` : " — this completes the set"}`);
if (budget === 0) { console.log("nothing to do this run."); process.exit(0); }

/* ── Capture ─────────────────────────────────────────────────────────────────────────────────── */
/*
 * APPENDED PER FIXTURE, not batched to the end. The first version accumulated every row in memory and
 * wrote once when the loop finished — so an interrupted run (a killed shell, a timeout, a quota
 * refusal three-quarters through) threw away everything it had genuinely fetched, having spent the
 * requests. It did exactly that on its first real run. A capture that costs quota must persist as it
 * goes, or the quota is the thing being lost.
 */
if (WRITE) fs.mkdirSync(PLAYERS, { recursive: true });
const appendRows = (rs) => { if (WRITE && rs.length) fs.appendFileSync(corpusFile, rs.map((r) => JSON.stringify(r)).join("\n") + "\n"); };
let total = 0;
let done = 0;
let rateRetries = 0;
const MAX_RATE_RETRIES = 8;
const RATE_BACKOFF_MS = 65_000;            // one full minute plus slack — the window is per minute
const retryQueue = [];
const queue = todo.slice(0, budget);
for (let qi = 0; qi < queue.length || retryQueue.length; qi++) {
  const fx = qi < queue.length ? queue[qi] : retryQueue.shift();
  if (!fx) break;
  const id = String(fx.providerRef.id);
  let payload;
  try {
    payload = await api(`/fixtures/players?fixture=${id}`);
  } catch (e) {
    console.error(`\nSTOPPED — request failed on fixture ${id}: ${e.message}`);
    break;
  }
  const errors = payload.errors;
  const hasError = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0;
  if (hasError) {
    /*
     * A RATE refusal and a PLAN refusal are not the same failure, and treating them alike threw away
     * most of a day's free quota on the first real run. "10 requests per minute" is transient — the
     * right response is to wait and retry the SAME fixture. A plan/season/quota lock is permanent for
     * this run, and continuing past it would build a partial season that reads like a complete one.
     */
    const isRate = JSON.stringify(errors).toLowerCase().includes("rate");
    if (isRate && rateRetries < MAX_RATE_RETRIES) {
      rateRetries += 1;
      process.stdout.write(`\r  rate-limited — waiting ${RATE_BACKOFF_MS / 1000}s and retrying fixture ${id} (retry ${rateRetries}/${MAX_RATE_RETRIES})   `);
      await sleep(RATE_BACKOFF_MS);
      retryQueue.push(fx);
      continue;
    }
    console.error(`\nSTOPPED — provider refused fixture ${id}: ${JSON.stringify(errors)}`);
    break;
  }
  rateRetries = 0;
  if (!payload.response?.length) {
    console.error(`  fixture ${id}: no player rows returned — skipped, not written as an empty match`);
    continue;
  }

  if (WRITE) fs.writeFileSync(path.join(RAW, `fixture-${id}.json`), JSON.stringify(payload));

  /* Our own compact extraction — the fields a prop model needs, nothing else. */
  const rows = [];
  for (const team of payload.response) {
    for (const p of team.players ?? []) {
      const s = p.statistics?.[0] ?? {};
      rows.push({
        fixtureId: id,
        season: fx.season,
        dateUtc: fx.dateUtc,
        homeClub: fx.home,
        awayClub: fx.away,
        teamId: team.team?.id ?? null,
        teamName: team.team?.name ?? null,
        playerId: p.player?.id ?? null,
        playerName: p.player?.name ?? null,
        position: s.games?.position ?? null,
        minutes: s.games?.minutes ?? 0,
        started: s.games?.substitute === false,
        goals: s.goals?.total ?? 0,
        assists: s.goals?.assists ?? 0,
        shots: s.shots?.total ?? 0,
        shotsOnTarget: s.shots?.on ?? 0,
        yellow: s.cards?.yellow ?? 0,
        red: s.cards?.red ?? 0,
      });
    }
  }
  appendRows(rows);
  total += rows.length;
  done += 1;
  process.stdout.write(`\r  captured ${done}/${budget} fixtures (${total} player rows)`);
  if (done < budget) await sleep(DELAY_MS);
}
process.stdout.write("\n");

if (total === 0) { console.error("no rows captured this run."); process.exit(1); }

const manifest = {
  schemaVersion: 1,
  artifact: "epl-player-capture-manifest",
  dataClass: "PRIVATE_RESEARCH",
  public: false,
  provider: "api_football",
  endpoint: "https://v3.football.api-sports.io/fixtures/players?fixture={id}",
  plan: sub.plan ?? null,
  licence: "api-sports licence. RAW response bodies are gitignored (this repository is public); only this derived extraction is tracked, and it never reaches the public export.",
  lastRunAt: new Date(status.response?.account ? Date.now() : Date.now()).toISOString(),
};

if (WRITE) {
  fs.writeFileSync(path.join(PLAYERS, "CAPTURE_MANIFEST.json"), JSON.stringify(manifest, null, 1) + "\n");
  const totalFixtures = captured.size + done;
  console.log(`\nappended ${total} player rows from ${done} fixture(s) (written as they arrived)`);
  console.log(`corpus now covers ${totalFixtures}/${wanted.length} fixtures (${((totalFixtures / wanted.length) * 100).toFixed(1)}%)`);
  console.log(`remaining: ${wanted.length - totalFixtures} fixtures ≈ ${Math.ceil((wanted.length - totalFixtures) / 100)} more day(s) on the free plan`);
} else {
  console.log(`\ndry run — ${total} rows from ${done} fixture(s) NOT written. Pass --write to persist.`);
}
