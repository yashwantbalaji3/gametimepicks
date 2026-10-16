/**
 * NCAAF · capture an in-progress season's played finals up to a cutoff slate day (NCAAF-004 E26 window).
 * PRIVATE_RESEARCH.
 *
 * Bounded (cap 40 requests, 300 ms throttle), keyless ESPN scoreboard for regular-season weeks 1..--max-week
 * × FBS/FCS, plus season group membership. Raw bodies are cached under .cache/raw/espn/season-to-date/<season>/
 * (gitignored; separate from the frozen 2016–2025 coverage cache). Corpus rows are built with the same
 * corpus.mjs rules and kept only when slateDate ≤ --through. Output (tracked):
 *   data/internal/research/ncaaf/corpus/<--out>/games-<season>.jsonl + manifest.json
 *
 * Run (from app/): node scripts/ncaaf/capture-season-to-date.mjs --season 2026 --max-week 6 --through 2026-10-05 --out e26
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESPN_CFB_GROUPS, mergeEventRows, normalizeScoreboardEvent } from "../../src/lib/sports/ncaaf/espn-events.mjs";
import { CORPUS_SCHEMA_VERSION, buildSeasonCorpus, serializeRows, summarizeCorpus } from "../../src/lib/sports/ncaaf/corpus.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const SEASON = Number(arg("--season")), MAX_WEEK = Number(arg("--max-week")), THROUGH = arg("--through"), OUTNAME = arg("--out");
if (!Number.isInteger(SEASON) || !Number.isInteger(MAX_WEEK) || MAX_WEEK < 1 || MAX_WEEK > 16 || !/^\d{4}-\d{2}-\d{2}$/.test(THROUGH ?? "") || !/^[a-z0-9-]+$/.test(OUTNAME ?? "")) {
  console.error("REFUSED: --season YYYY --max-week 1..16 --through YYYY-MM-DD --out <name>"); process.exit(1);
}
if (OUTNAME === "v1") { console.error("REFUSED: corpus v1 is frozen"); process.exit(1); }
const CACHE = path.join(ROOT, "data", "internal", "research", "ncaaf", ".cache", "raw", "espn", "season-to-date", String(SEASON));
const OUT = path.join(ROOT, "data", "internal", "research", "ncaaf", "corpus", OUTNAME);
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";
const CAP = 40;
let requests = 0, cacheHits = 0;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function get(key, url) {
  const f = path.join(CACHE, `${key}.json`);
  if (fs.existsSync(f)) { cacheHits++; return JSON.parse(fs.readFileSync(f, "utf8")); }
  if (requests >= CAP) throw new Error(`request cap ${CAP} reached`);
  requests++;
  await new Promise((r) => setTimeout(r, 300));
  const capturedAt = new Date().toISOString();
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url} — refusing a partial season`);
  const w = { url, capturedAt, status: res.status, body: await res.json() };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(w));
  return w;
}

const rows = [], captured = [];
let refused = 0;
for (let wk = 1; wk <= MAX_WEEK; wk++) {
  for (const grp of [ESPN_CFB_GROUPS.FBS, ESPN_CFB_GROUPS.FCS]) {
    const w = await get(`2-${wk}-${grp}`, `${SITE}/scoreboard?dates=${SEASON}&seasontype=2&week=${wk}&groups=${grp}&limit=500`);
    captured.push(w.capturedAt);
    for (const e of w.body.events ?? []) {
      const n = normalizeScoreboardEvent(e, { capturedAt: w.capturedAt, sourceGroup: grp });
      if (n.row) rows.push(n.row); else refused++;
    }
  }
}
const ids = (b) => (b?.items ?? []).map((it) => /\/teams\/(\d+)/.exec(it?.$ref ?? "")?.[1]).filter(Boolean);
const fbs = await get("membership-80", `${CORE}/seasons/${SEASON}/types/2/groups/80/teams?limit=400`);
const fcs = await get("membership-81", `${CORE}/seasons/${SEASON}/types/2/groups/81/teams?limit=400`);

const { events, conflicts } = mergeEventRows(rows);
if (conflicts.length) { console.error(`REFUSED: ${conflicts.length} provider conflicts`); process.exit(1); }
const built = buildSeasonCorpus(SEASON, events, { fbs: ids(fbs.body), fcs: ids(fcs.body) });
const kept = built.rows.filter((r) => r.slateDate <= THROUGH);
const afterCutoff = built.rows.length - kept.length;
const body = serializeRows(kept);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `games-${SEASON}.jsonl`), body);
captured.sort();
const manifest = {
  schemaVersion: CORPUS_SCHEMA_VERSION, sport: "ncaaf", dataClass: "SEASON_TO_DATE_RESULTS", authorization: "PRIVATE_RESEARCH",
  season: SEASON, throughSlateDate: THROUGH, regularWeeksRequested: MAX_WEEK,
  capturedAtRange: [captured[0], captured.at(-1)],
  note: "Backtest window only: these results were captured after the games; no pregame forecast was frozen for them.",
  file: `games-${SEASON}.jsonl`, sha256: sha256(body),
  network: { requests, cacheHits, cap: CAP },
  providerEventsMerged: events.length, providerEventsRefusedByNormaliser: refused, playedFinalsAfterCutoff: afterCutoff,
  membershipReconciled: { fbs: built.membership.fbs.size, fcs: built.membership.fcs.size },
  ...summarizeCorpus(kept, built.excluded),
  excludedEvents: built.excluded.map((x) => `${x.eventId}:${x.reason}`),
};
fs.writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${SEASON} through ${THROUGH}: ${kept.length} games ${JSON.stringify(manifest.byPairing)} · ${afterCutoff} later finals dropped · excluded ${built.excluded.length} · ${requests} requests`);
