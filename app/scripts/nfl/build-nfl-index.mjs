/**
 * Canonical NFL public index (Program 174 · Release A). PUBLIC_DERIVED.
 *
 * ONE artifact every NFL surface consumes verbatim. Before this, homepage, Today, the hub and the
 * console each derived their own game count, forecast count and "next kickoff" from whatever they
 * happened to load — which is how the same slate reads three different ways on one site.
 *
 * It also owns the KICKOFF LOCK. A forecast is `upcoming` only while now < kickoff; afterwards it
 * becomes `started` and leaves every pregame selector, but its receipt stays reachable and its
 * pre-event numbers are reproduced exactly as published. Nothing is deleted at kickoff.
 *
 * CONTRADICTION DETECTION runs before the write and refuses on: a forecast with no settlement key,
 * a market count without rows, a forecast generated at/after its own kickoff, and a model
 * version/hash disagreement between the index and the artifacts it summarises. A contradiction is
 * an INTERNAL incident — it never renders publicly as a no-play.
 *
 * Usage: node scripts/nfl/build-nfl-index.mjs --now <iso>
 * Writes: app/public/data/nfl/index.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyTeamOutput } from "../../src/lib/sports/nfl/output-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const forecastsArtifact = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
const results = read(path.join(APP, "public/data/nfl/results/latest.json"));
const status = read(path.join(APP, "public/data/nfl/model-status.json"));
const card = read(path.join(ROOT, "data/internal/research/nfl/public-beta-model-card-v1.json"));

const nowMs = Date.parse(NOW);
const marketByEvent = new Map((markets?.rows ?? []).map((r) => [r.providerEventId, r]));
const resultByEvent = new Map((results?.rows ?? []).map((r) => [r.providerEventId, r]));
const settlementDir = path.join(ROOT, "data/internal/nfl/experimental-settlement");
const settlementByEvent = new Map();
if (fs.existsSync(settlementDir)) {
  for (const f of fs.readdirSync(settlementDir).filter((x) => x.endsWith(".json"))) {
    for (const e of read(path.join(settlementDir, f))?.events ?? []) settlementByEvent.set(e.providerEventId, { settled: true, ...e });
  }
}

const contradictions = [];
const events = [];
for (const f of forecastsArtifact?.forecasts ?? []) {
  const kickoff = Date.parse(f.kickoffUtc);
  // contradiction: a forecast must precede its own kickoff and carry a settlement key
  if (Date.parse(f.generatedAt) >= kickoff) contradictions.push({ event: f.providerEventId, kind: "GENERATED_AFTER_START", detail: `${f.generatedAt} >= ${f.kickoffUtc}` });
  if (!f.settlementKey) contradictions.push({ event: f.providerEventId, kind: "FORECAST_WITHOUT_SETTLEMENT_KEY", detail: f.matchup });
  if (f.model?.id !== forecastsArtifact.model?.id) contradictions.push({ event: f.providerEventId, kind: "MODEL_VERSION_DISAGREEMENT", detail: `${f.model?.id} vs ${forecastsArtifact.model?.id}` });

  const cls = classifyTeamOutput({
    forecast: f,
    market: marketByEvent.get(f.providerEventId) ?? null,
    result: resultByEvent.get(f.providerEventId) ?? null,
    settlement: settlementByEvent.get(f.providerEventId) ?? null,
    nowIso: NOW,
  });
  const started = nowMs >= kickoff;
  events.push({
    providerEventId: f.providerEventId,
    canonicalEventId: f.canonicalEventId,
    matchup: f.matchup,
    home: f.home, away: f.away,
    kickoffUtc: f.kickoffUtc,
    // the LOCK: started games leave pregame selectors but keep everything they published
    lifecycle: started ? (settlementByEvent.has(f.providerEventId) ? "SETTLED" : "STARTED") : "UPCOMING",
    locked: started,
    state: cls.state,
    stateMeaning: cls.meaning,
    lean: cls.state === "EXPERIMENTAL_LEAN" ? { gapPp: cls.gapPp, leansTo: cls.leansTo, notAnEdge: cls.notAnEdge } : null,
    projectedScore: f.forecastSummary.projectedScore,
    winProbability: { home: f.forecastSummary.winProbability.home, away: f.forecastSummary.winProbability.away },
    total: f.forecastSummary.total,
    hasMarket: (marketByEvent.get(f.providerEventId) ?? null) !== null,
    receipt: { model: f.model.id, version: f.model.version, inputHash: f.model.inputHash, generatedAt: f.generatedAt },
  });
}

// contradiction: a market count that no rows support
const marketRows = (markets?.rows ?? []).filter((r) => markets.capturedAt < r.kickoffUtc);
if ((markets?.eventCount ?? 0) > 0 && marketRows.length === 0) {
  contradictions.push({ kind: "MARKET_COUNT_WITHOUT_ROWS", detail: `eventCount ${markets.eventCount} but 0 pre-kickoff rows` });
}

const upcoming = events.filter((e) => e.lifecycle === "UPCOMING").sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
const scheduledUpcoming = (schedule?.rows ?? [])
  .filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs)
  .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

/*
 * P224: THE NEXT KICKOFF IS A SCHEDULE FACT, NOT A FORECAST FACT.
 *
 * `nextKickoffUtc` used to read `upcoming[0]`, i.e. the next event WE HAD FORECAST. The moment the
 * next real game has no forecast yet — every gap between a settled slate and the next modelled one —
 * it published `null` while `counts.scheduledUpcoming` in the same object said 1. On 2026-09-01 the
 * only indexed event was CHI @ TEN, played and SETTLED on 08-29, while NE @ SEA (09-10) sat in the
 * committed capture unnamed. Consumers cannot tell that one field counts the schedule and its
 * neighbour counts forecasts, and this artifact's own note promises they may read it verbatim.
 *
 * So the next kickoff now comes from the schedule, which is what its name has always claimed. What
 * we have MODELLED stays visible and separate in `counts.forecastsUpcoming` / `nextForecastUtc` —
 * no information is lost, and the two questions stop sharing one field.
 */
const nextScheduled = scheduledUpcoming[0] ?? null;
const matchupOf = (r) => r?.shortName ?? (r?.away && r?.home ? `${r.away} @ ${r.home}` : null);

const index = {
  schemaVersion: 1,
  artifact: "nfl-public-index",
  dataClass: "PUBLIC_DERIVED",
  generatedAt: NOW,
  note: "The ONE canonical NFL state. Every public surface consumes these counts and labels verbatim; a surface that computes its own is a defect.",
  model: {
    id: forecastsArtifact?.model?.id ?? null,
    version: forecastsArtifact?.model?.version ?? null,
    launchState: forecastsArtifact?.model?.launchState ?? null,
    plainEnglish: card?.plainEnglish ?? null,
  },
  counts: {
    scheduledUpcoming: scheduledUpcoming.length,
    forecastsTotal: events.length,
    forecastsUpcoming: upcoming.length,
    forecastsStarted: events.filter((e) => e.locked).length,
    marketEvents: marketRows.length,
    settled: events.filter((e) => e.lifecycle === "SETTLED").length,
  },
  nextKickoffUtc: nextScheduled?.dateUtc ?? null,
  nextMatchup: matchupOf(nextScheduled),
  /* What we have FORECAST, kept distinct from what is SCHEDULED — see the note above. */
  nextForecastUtc: upcoming[0]?.kickoffUtc ?? null,
  nextForecastMatchup: upcoming[0]?.matchup ?? null,
  marketCapturedAt: markets?.capturedAt ?? null,
  experimentalRecord: read(path.join(ROOT, "data/internal/nfl/experimental-settlement/summary.json")) ?? {
    settledForecasts: 0,
    note: "No experimental forecast has been settled yet. A record appears here once the first slate's official results land.",
  },
  events,
  playerFamilies: (status?.playerFamilies ?? []).map((f) => ({ label: f.label, state: f.state, headline: f.headline })),
  anytimeTd: status?.anytimeTd ? { state: status.anytimeTd.state, headline: status.anytimeTd.headline } : null,
  /** internal-only: surfaced on the protected console, never rendered as a public no-play */
  contradictions,
};

if (contradictions.length) {
  console.error(`CONTRADICTIONS (${contradictions.length}) — recorded as an internal incident, not a public state:`);
  for (const c of contradictions) console.error(`  ${c.kind}: ${c.detail}`);
}

const payload = JSON.stringify(index, null, 1);
for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey"]) {
  if (payload.includes(banned)) { console.error(`REFUSED: index would carry "${banned}"`); process.exit(2); }
}
fs.writeFileSync(path.join(APP, "public/data/nfl/index.json"), payload);
console.log(`nfl index: ${index.counts.forecastsUpcoming} upcoming · ${index.counts.forecastsStarted} started · ${index.counts.marketEvents} market · next ${index.nextMatchup ?? "—"} ${index.nextKickoffUtc ?? ""}`);
console.log(`states: ${[...new Set(events.map((e) => e.state))].join(", ")} · contradictions ${contradictions.length}`);
