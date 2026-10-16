/**
 * NCAAF · ESPN coverage probe (NCAAF V1 · Stage 1, data capability). PRIVATE_RESEARCH — research only.
 *
 * Answers "what does the free, keyless ESPN college-football scoreboard actually hold?" with counts, not
 * claims: per season, how many FBS/FCS events, finals, overtimes, neutral sites, TBD kickoffs, missing
 * scores, inconsistent line scores, and how the provider's season-scoped FBS/FCS group membership pairs up.
 *
 * Requests are BOUNDED (--max-requests, refuses to start a plan larger than the cap), throttled, and cached:
 * every raw response body lands in data/internal/research/ncaaf/.cache/ (gitignored by `.cache/`), wrapped
 * with its URL and capture time, and a cached response is reused instead of re-fetched. The only tracked
 * output is a derived COUNTS summary — no provider rows, no raw bodies.
 *
 * Run: node scripts/ncaaf/probe-espn-coverage.mjs --now 2026-10-09T04:00:00Z --seasons 2021-2025 [--max-requests 250] [--dry-run]
 *   --dry-run: print the request plan and write nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ESPN_CFB_GROUPS, mergeEventRows, normalizeScoreboardEvent, summarizeSeasonCoverage,
} from "../../src/lib/sports/ncaaf/espn-events.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const CACHE = path.join(ROOT, "data", "internal", "research", "ncaaf", ".cache", "raw", "espn", "coverage");
const OUT = path.join(ROOT, "data", "internal", "research", "ncaaf", "capability", "espn-coverage-v1.json");

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const DRY = process.argv.includes("--dry-run");
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const m = /^(\d{4})-(\d{4})$/.exec(arg("--seasons", ""));
if (!m || Number(m[1]) > Number(m[2]) || Number(m[1]) < 2004) { console.error("REFUSED: --seasons YYYY-YYYY required (from 2004)"); process.exit(1); }
const SEASONS = Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i);
const MAX = Math.min(400, Math.max(1, Number(arg("--max-requests", "250"))));
const THROTTLE_MS = 300;

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";
// Regular season weeks are read from the provider calendar (seasontype 2); postseason entries are
// "Bowls" (week 1) and "CFP" (week 999), per the 2026-10-09 calendar probe.
const scoreboardUrl = (season, st, wk, grp) => `${SITE}/scoreboard?dates=${season}&seasontype=${st}&week=${wk}&groups=${grp}&limit=500`;
const membershipUrl = (season, grp) => `${CORE}/seasons/${season}/types/2/groups/${grp}/teams?limit=400`;

let requests = 0, cacheHits = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cacheFile = (key) => path.join(CACHE, `${key}.json`);

async function get(key, url) {
  const f = cacheFile(key);
  if (fs.existsSync(f)) { cacheHits++; return JSON.parse(fs.readFileSync(f, "utf8")); }
  if (requests >= MAX) throw new Error(`request cap ${MAX} reached before ${key}`);
  requests++;
  await sleep(THROTTLE_MS);
  const capturedAt = new Date().toISOString();
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const wrapped = { url, capturedAt, status: res.status, body: res.ok ? await res.json() : null };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (res.ok) fs.writeFileSync(f, JSON.stringify(wrapped));
  return wrapped;
}

const idsFromRefs = (body) => (body?.items ?? []).map((it) => /\/teams\/(\d+)/.exec(it?.$ref ?? "")?.[1]).filter(Boolean);

// Plan: per season, the week-1 FBS request yields the calendar; then every week × group, then membership.
const plannedPerSeason = (weeks) => weeks * 2 + 2 * 2 + 2;
console.log(`plan: ${SEASONS.length} season(s) ${SEASONS[0]}–${SEASONS.at(-1)}, ~${plannedPerSeason(16) * SEASONS.length} requests max, cap ${MAX}`);
if (plannedPerSeason(16) * SEASONS.length > MAX) { console.error(`REFUSED: plan exceeds --max-requests ${MAX}; narrow --seasons`); process.exit(1); }
if (DRY) process.exit(0);

const seasons = {};
const failures = [];
for (const season of SEASONS) {
  const first = await get(`${season}/2-1-80`, scoreboardUrl(season, 2, 1, ESPN_CFB_GROUPS.FBS));
  const cal = first.body?.leagues?.[0]?.calendar ?? [];
  const regWeeks = (cal.find((c) => String(c.value) === "2")?.entries ?? []).map((e) => Number(e.value)).filter(Number.isInteger);
  const postWeeks = (cal.find((c) => String(c.value) === "3")?.entries ?? []).map((e) => Number(e.value)).filter(Number.isInteger);
  if (regWeeks.length === 0) { failures.push({ season, reason: "no regular-season calendar in provider response" }); continue; }

  const rows = [], refused = [];
  const responses = [];
  for (const [st, weeks] of [[2, regWeeks], [3, postWeeks]]) {
    for (const wk of weeks) {
      for (const grp of [ESPN_CFB_GROUPS.FBS, ESPN_CFB_GROUPS.FCS]) {
        const r = await get(`${season}/${st}-${wk}-${grp}`, scoreboardUrl(season, st, wk, grp));
        responses.push({ st, wk, grp, status: r.status, capturedAt: r.capturedAt, events: r.body?.events?.length ?? null });
        if (!r.body) { failures.push({ season, st, wk, grp, reason: `HTTP ${r.status}` }); continue; }
        for (const e of r.body.events ?? []) {
          const n = normalizeScoreboardEvent(e, { capturedAt: r.capturedAt, sourceGroup: grp });
          if (n.row) rows.push(n.row); else refused.push(n.refused);
        }
      }
    }
  }
  const fbsM = await get(`${season}/membership-80`, membershipUrl(season, ESPN_CFB_GROUPS.FBS));
  const fcsM = await get(`${season}/membership-81`, membershipUrl(season, ESPN_CFB_GROUPS.FCS));
  const membership = { fbs: new Set(idsFromRefs(fbsM.body)), fcs: new Set(idsFromRefs(fcsM.body)) };
  const inBoth = [...membership.fbs].filter((id) => membership.fcs.has(id));

  // Rows from a season's own calendar must carry that season; anything else is counted and set aside.
  const { events, conflicts } = mergeEventRows(rows);
  const offSeason = events.filter((e) => e.season !== season);
  const own = events.filter((e) => e.season === season);
  const fbsPlaying = new Set(own.filter((e) => e.sourceGroups.includes(ESPN_CFB_GROUPS.FBS)).flatMap((e) => [e.home.providerTeamId, e.away.providerTeamId]));
  const fbsMemberNoGame = [...membership.fbs].filter((id) => !own.some((e) => e.home.providerTeamId === id || e.away.providerTeamId === id)).sort((a, b) => a - b);

  fs.mkdirSync(path.join(CACHE, String(season)), { recursive: true });
  fs.writeFileSync(path.join(CACHE, String(season), "normalized-events.json"), JSON.stringify(own));

  const capturedTimes = responses.map((r) => r.capturedAt).filter(Boolean).sort();
  seasons[season] = {
    calendar: { regularWeeks: regWeeks.length, postseasonWeeks: postWeeks },
    requests: responses.length,
    capturedAtRange: [capturedTimes[0] ?? null, capturedTimes.at(-1) ?? null],
    refusedEvents: refused.length,
    refusedReasons: refused.reduce((o, r) => ((o[r] = (o[r] ?? 0) + 1), o), {}),
    mergeConflicts: conflicts.length,
    eventsOutsideSeason: offSeason.length,
    membership: {
      fbs: membership.fbs.size,
      fcs: membership.fcs.size,
      inBothGroups: inBoth.length,
      fbsMembersWithoutAnyGame: fbsMemberNoGame,
      // The provider's FBS group carries ids that never play a game; members that did play are the count to
      // compare with the official FBS size for the season.
      fbsMembersPlaying: membership.fbs.size - fbsMemberNoGame.length,
      fbsGroupTeamsSeenInFbsGames: fbsPlaying.size,
    },
    coverage: summarizeSeasonCoverage(own, membership),
  };
  console.log(`${season}: ${own.length} events · ${seasons[season].coverage.completed} final · OT ${seasons[season].coverage.overtime} · FBS members ${membership.fbs.size} (${fbsMemberNoGame.length} without a game) · conflicts ${conflicts.length}`);
}

const artifact = {
  schemaVersion: 1,
  sport: "ncaaf",
  dataClass: "PROVIDER_COVERAGE_PROBE",
  authorization: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  source: {
    provider: "ESPN public site/core API (keyless, unofficial, undocumented)",
    scoreboard: `${SITE}/scoreboard?dates=<season>&seasontype=<2|3>&week=<n>&groups=<80|81>&limit=500`,
    membership: `${CORE}/seasons/<season>/types/2/groups/<80|81>/teams`,
    rawBodies: "not committed — data/internal/research/ncaaf/.cache/ (gitignored)",
  },
  network: { requests, cacheHits, cap: MAX, throttleMs: THROTTLE_MS },
  failures,
  seasons,
  notes: [
    "Counts describe what the provider returned at capture time; a current response about a past game is not evidence of what was knowable before kickoff.",
    "groups=80/81 is the request filter (provenance). Division pairing uses the provider's season-scoped group membership, which this probe reconciles but does not validate against an official list.",
  ],
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`wrote ${path.relative(ROOT, OUT)} · ${requests} requests · ${cacheHits} cache hits`);
