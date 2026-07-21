/**
 * capture-mlb-pregame-research.mjs — FORWARD-ONLY internal capture of MLB pregame research data.
 *
 * Records exactly WHAT was known, WHEN, and WHERE it came from — as immutable, provenance-stamped snapshots.
 * This is a SHADOW research pipeline: it never touches public UI, products, money, settlement, or the official
 * board, and it never backfills a missing pregame value from postgame data. A value is research-eligible only
 * when it was captured strictly before first pitch.
 *
 * Source: StatsAPI (free, no key) — schedule + probable pitchers + per-game feed (confirmed lineup, weather,
 * roof, umpires). Markets require a paid Odds provider (capability documented, credit-gated — NOT fetched here).
 *
 * Writes (internal, public:false): data/internal/mlb/pregame-archive/snapshots/<date>/<gamePk>-<capturedAt>.json
 * + manifests/<date>/<runId>.json. Immutable: a snapshot filename encodes its capture time; never overwritten.
 *
 * Run: node app/scripts/capture-mlb-pregame-research.mjs [--date YYYY-MM-DD] [--reason SCHEDULED_REFRESH]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive");
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const nowIso = () => new Date().toISOString();
const hash = (o) => crypto.createHash("sha256").update(typeof o === "string" ? o : JSON.stringify(o)).digest("hex").slice(0, 32);
const before = (a, b) => Date.parse(a) < Date.parse(b);

const DATE = getArg("--date", new Date().toISOString().slice(0, 10));
const REASON = getArg("--reason", "SCHEDULED_REFRESH");
const RUN_ID = `run-${DATE}-${hash(nowIso())}`;

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const requestedAt = nowIso();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      return { body, requestedAt, receivedAt: nowIso(), status: r.status, ok: true };
    } catch (e) { if (attempt === 2) return { body: null, requestedAt: nowIso(), receivedAt: nowIso(), status: 0, ok: false, error: String(e.message || e) }; }
  }
}

/** One captured feature-family record with provenance + a self-eligibility read (capturedAt < eventStart). */
function familyRecord(family, value, present, capturedAt, eventStartTime, sourceName, sourceUrl, sourcePublishedAt) {
  // availableAt = the earliest provable time the value existed. We observed it at capturedAt (pregame if
  // capturedAt < eventStart); a source publish time (weather) can only make it earlier. Never later than observed.
  const availableAt = present ? (sourcePublishedAt && before(sourcePublishedAt, capturedAt) ? sourcePublishedAt : capturedAt) : null;
  const capturedPregame = eventStartTime ? before(capturedAt, eventStartTime) : false;
  const eligible = present && capturedPregame; // proven pregame observation
  return {
    family, present, value,
    status: !present ? "MISSING" : capturedPregame ? "COMPLETE" : "POST_START_ONLY",
    observedAt: capturedAt, availableAt, sourceUpdatedAt: sourcePublishedAt ?? null, capturedAt,
    timestampProven: capturedPregame, researchEligible: eligible,
    source: { sourceName, sourceType: "official_league", sourceUrlOrIdentifier: sourceUrl, requestedAt: capturedAt, receivedAt: capturedAt, sourcePublishedAt: sourcePublishedAt ?? null },
  };
}

async function main() {
  fs.mkdirSync(path.join(ARCHIVE, "snapshots", DATE), { recursive: true });
  fs.mkdirSync(path.join(ARCHIVE, "manifests", DATE), { recursive: true });

  // 1) schedule + probable pitchers
  const sched = await getJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}&hydrate=probablePitcher,team,venue`);
  const games = sched.ok ? (sched.body?.dates?.[0]?.games ?? []) : [];
  const manifest = {
    ...{ public: false, approvedForProduction: false, productEligible: false },
    runId: RUN_ID, schemaVersion: "mlb-pregame-archive-1", snapshotReason: REASON, boardDateEt: DATE,
    startedAt: nowIso(), scheduledGames: games.length, gamesProcessed: 0, gamesSucceeded: 0, gamesPartial: 0, gamesFailed: 0,
    snapshotsCreated: 0, sourceFailures: sched.ok ? 0 : 1, parserFailures: 0, lateSnapshotsRejected: 0, snapshots: [],
  };

  for (const g of games) {
    manifest.gamesProcessed++;
    const gamePk = g.gamePk;
    const eventStartTime = g.gameDate; // ISO first-pitch
    const feed = await getJson(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
    const capturedAt = nowIso();
    if (!feed.ok || !feed.body) { manifest.gamesFailed++; manifest.sourceFailures++; continue; }
    const gd = feed.body.gameData ?? {}, ld = feed.body.liveData ?? {};
    const statusState = gd.status?.detailedState ?? "Unknown";
    const started = ["In Progress", "Final", "Game Over", "Completed Early"].some((s) => statusState.includes(s));
    const SRC = "StatsAPI", url = `statsapi/game/${gamePk}/feed/live`;

    // families (present = data exists at capture; eligible auto-gated to capturedAt < eventStart)
    const homeOrder = ld.boxscore?.teams?.home?.battingOrder ?? [];
    const awayOrder = ld.boxscore?.teams?.away?.battingOrder ?? [];
    const lineupPresent = homeOrder.length >= 9 && awayOrder.length >= 9 && !started;
    const officials = ld.boxscore?.officials ?? [];
    const weather = gd.weather ?? null;
    const families = [
      familyRecord("confirmed_lineup", lineupPresent ? { home: homeOrder, away: awayOrder, status: "CONFIRMED" } : { status: started ? "POST_START" : "PROJECTED_OR_UNPOSTED" }, lineupPresent, capturedAt, eventStartTime, SRC, url),
      familyRecord("pitcher_status", { homeProbable: gd.probablePitchers?.home?.fullName ?? g.teams?.home?.probablePitcher?.fullName ?? null, awayProbable: gd.probablePitchers?.away?.fullName ?? g.teams?.away?.probablePitcher?.fullName ?? null, status: started ? "POST_START" : "PROBABLE" }, !started && !!(g.teams?.home?.probablePitcher || g.teams?.away?.probablePitcher), capturedAt, eventStartTime, SRC, url),
      familyRecord("environment", weather ? { condition: weather.condition, temp: weather.temp, wind: weather.wind, roofType: gd.venue?.fieldInfo?.roofType ?? null, dayNight: gd.datetime?.dayNight ?? null, postgameOnly: started } : null, !!weather && !started, capturedAt, eventStartTime, SRC, url),
      familyRecord("umpire", officials.length ? { officials: officials.map((o) => ({ name: o.official?.fullName, type: o.officialType })) } : null, officials.length > 0 && !started, capturedAt, eventStartTime, SRC, url),
      // markets: paid provider (Odds API) — capability documented, credit-gated, NOT fetched here.
      { family: "markets", present: false, value: { note: "requires ODDS_API_KEY + credits — capability defined, not fetched in the free capture" }, status: "MISSING", researchEligible: false, timestampProven: false, source: { sourceName: "the-odds-api", sourceType: "licensed_provider", requestedAt: null } },
      { family: "bullpen", present: false, value: { note: "derive from strictly-completed prior team games — builder pending" }, status: "MISSING", researchEligible: false, timestampProven: false, source: { sourceName: "derived", sourceType: "internal_derivation", requestedAt: null } },
      { family: "plate_appearance_opportunity", present: false, value: { note: "needs full-slate market context (team/game totals) — pending markets" }, status: "MISSING", researchEligible: false, timestampProven: false, source: { sourceName: "derived", sourceType: "internal_derivation", requestedAt: null } },
    ];

    const snapshot = {
      public: false, approvedForProduction: false, productEligible: false,
      schemaVersion: "mlb-pregame-archive-1", snapshotId: `${gamePk}-${hash(capturedAt)}`, snapshotCreatedAt: capturedAt,
      snapshotReason: started ? "SCHEDULED_REFRESH" : REASON, boardDateEt: DATE, eventId: String(gamePk), gamePk,
      eventStartTime, homeTeam: g.teams?.home?.team?.abbreviation ?? g.teams?.home?.team?.name, awayTeam: g.teams?.away?.team?.abbreviation ?? g.teams?.away?.team?.name,
      venue: gd.venue?.name ?? g.venue?.name, statusState, startedAtCapture: started,
      dataQuality: { anyEligible: families.some((f) => f.researchEligible), eligibleFamilies: families.filter((f) => f.researchEligible).map((f) => f.family) },
      rawPayloadHash: hash(feed.body), normalizedPayloadHash: hash(families), parserVersion: "capture-v1",
      featureFamilies: families,
    };
    if (started) manifest.lateSnapshotsRejected++; // captured post-start → recorded but not research-eligible
    // immutable write: filename encodes capture time → never overwrites a prior snapshot
    const fname = `${gamePk}-${capturedAt.replace(/[:.]/g, "-")}.json`;
    const fpath = path.join(ARCHIVE, "snapshots", DATE, fname);
    if (!fs.existsSync(fpath)) { fs.writeFileSync(fpath, JSON.stringify(snapshot, null, 2)); manifest.snapshotsCreated++; }
    if (snapshot.dataQuality.anyEligible) manifest.gamesSucceeded++; else if (families.some((f) => f.present)) manifest.gamesPartial++; else manifest.gamesFailed++;
    manifest.snapshots.push({ gamePk, snapshotId: snapshot.snapshotId, eligibleFamilies: snapshot.dataQuality.eligibleFamilies, startedAtCapture: started });
  }

  manifest.completedAt = nowIso();
  fs.writeFileSync(path.join(ARCHIVE, "manifests", DATE, `${RUN_ID}.json`), JSON.stringify(manifest, null, 2));

  console.log(`\n=== pregame capture ${DATE} (reason ${REASON}) ===`);
  console.log(`scheduled ${manifest.scheduledGames} · processed ${manifest.gamesProcessed} · snapshots ${manifest.snapshotsCreated} · eligible ${manifest.gamesSucceeded} · partial ${manifest.gamesPartial} · post-start(rejected) ${manifest.lateSnapshotsRejected}`);
  const famCount = {};
  for (const s of manifest.snapshots) for (const f of s.eligibleFamilies) famCount[f] = (famCount[f] || 0) + 1;
  console.log(`eligible-family coverage (games w/ a pregame-proven value):`, JSON.stringify(famCount));
  console.log(`manifest → ${path.relative(REPO, path.join(ARCHIVE, "manifests", DATE, `${RUN_ID}.json`))}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
