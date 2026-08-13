/**
 * NFL lane status for the protected /launch console (Program 171 · Release G).
 *
 * EVERY field is DERIVED from a committed receipt on disk. Nothing is typed by hand, and a
 * missing receipt renders UNKNOWN — never green, never zero. The output is an INTERNAL artifact:
 * prune-internal-routes sweeps app/public/data by build references, so this file ships only to
 * the host-protected gtp-ops deployment (the public export keeps it out by construction).
 *
 * Usage: node scripts/nfl/build-nfl-lane-status.mjs --now <iso>
 * Writes: app/public/data/admin/nfl-lane.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SPORT_ASSESSMENTS } from "../../src/lib/sports/sport-assessments.mjs";
import { deriveSportMaturity, remainingPath, GATE_STAGES } from "../../src/lib/sports/sport-gate.mjs";
import { checkFreshness } from "../../src/lib/sports/nfl/season-context.mjs";
import { validateCurrentEventArtifact } from "../../src/lib/sports/nfl/current-event-contract.mjs";
import { parseAuthorizationReceipt } from "../../src/lib/sports/odds/p171-authorization.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const UNKNOWN = (why) => ({ state: "UNKNOWN", detail: why });

// ---------------------------------------------------------------- sources
const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const rosters = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
const injuries = read(path.join(ROOT, "data/internal/research/injuries/nfl/latest.json"));
const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
const ledger = read(path.join(ROOT, "data/internal/research/odds/nfl/p171-ledger.json"));
const vaultLedger = read(path.join(ROOT, "data/internal/nfl/end-zone-vault/ledger.json"));
const receiptText = (() => { try { return fs.readFileSync(path.join(ROOT, "docs/receipts/ODDS_AUTHORIZATION_P171.md"), "utf8"); } catch { return null; } })();

const freshnessOf = (input, artifact, stampKeys) => {
  if (!artifact) return UNKNOWN(`no ${input} artifact on disk`);
  const sourceAsOf = stampKeys.map((k) => artifact[k]).find(Boolean);
  const f = checkFreshness(input, { sourceAsOf, fetchedAt: artifact.generatedAt ?? sourceAsOf }, NOW);
  return { state: f.state, detail: `as of ${sourceAsOf ?? "—"} (${f.state})` };
};

// ---------------------------------------------------------------- next window
const nowMs = Date.parse(NOW);
const upcoming = (schedule?.rows ?? [])
  .filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs)
  .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
const nextEvent = upcoming[0] ?? null;

// ---------------------------------------------------------------- current artifacts
const currentDir = path.join(ROOT, "data/internal/nfl/current");
const artifacts = [];
if (fs.existsSync(currentDir)) {
  for (const date of fs.readdirSync(currentDir)) {
    const d = path.join(currentDir, date);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) {
      const a = read(path.join(d, f));
      if (a) artifacts.push({ date, file: f, a, valid: validateCurrentEventArtifact(a).ok });
    }
  }
}
const preStart = artifacts.filter((x) => Date.parse(x.a.kickoffUtc) > nowMs);
const settleable = artifacts.filter((x) => x.a.settlementTargets);

// ---------------------------------------------------------------- model receipts
const reportsDir = path.join(ROOT, "data/internal/research/nfl/reports");
const receipt = (file, describe) => {
  const r = read(path.join(reportsDir, file));
  return r ? describe(r) : UNKNOWN(`${file} absent`);
};
const models = {
  roleShares: receipt("role-shares-v1.json", (r) => ({
    state: "EVALUATED",
    detail: `held-out 2025 TV ${r.heldOut2025.model.overall} vs best baseline ${Math.min(...Object.values(r.heldOut2025.baselines).map((b) => b.overall))} (n=${r.heldOut2025.model.n})`,
  })),
  playerProps: receipt("player-props-v1-evaluation.json", (r) => ({
    state: "EVALUATED",
    detail: Object.entries(r.promotion).map(([m, p]) => `${m}=${p.state}`).join(" · "),
    promotion: Object.fromEntries(Object.entries(r.promotion).map(([m, p]) => [m, p.state])),
  })),
  anytimeTd: receipt("anytime-td-v1-calibration.json", (r) => ({
    state: "CALIBRATED",
    detail: `logLoss ${r.heldOut2025.model.logLoss} vs const-λ ${r.heldOut2025.baselines.constantLambdaSameShares.logLoss}, ECE ${r.heldOut2025.ece}, n=${r.heldOut2025.n}`,
  })),
  scoringBridge: receipt("scoring-bridge-v1.json", (r) => ({ state: "CALIBRATED", detail: `λ = ${r.mapping.lambdaIntercept} + ${r.mapping.lambdaPerPoint}·points (${r.mapping.receipt})` })),
  teamModel: receipt("model-v1-evaluation.json", (r) => ({ state: "EVALUATED", detail: `held-out logLoss ${r.metrics.model.testLogLoss ?? r.metrics?.model?.logLoss ?? "—"} vs coin 0.6931; PRESEASON ABSTAINS by model card` })),
};

// ---------------------------------------------------------------- credits
const auth = receiptText ? parseAuthorizationReceipt(receiptText) : { ok: false };
const credits = ledger
  ? {
    state: auth.ok ? "AUTHORIZED" : "UNKNOWN",
    programSpend: ledger.cumulativeCredits,
    ceiling: auth.ok ? auth.ceiling : null,
    remainingProgram: auth.ok ? auth.ceiling - ledger.cumulativeCredits : null,
    providerRemaining: ledger.requests.at(-1)?.providerRequestsRemaining ?? null,
    openingBalance: ledger.openingBalance,
    requests: ledger.requests.length,
    detail: auth.ok
      ? `${ledger.cumulativeCredits} of ${auth.ceiling} Program 171 credits across ${ledger.requests.length} requests; provider reports ${ledger.requests.at(-1)?.providerRequestsRemaining ?? "—"} remaining`
      : "authorization receipt did not parse — no paid call may run",
  }
  : UNKNOWN("no credit ledger — no authorized call has run");

// ---------------------------------------------------------------- gate + blockers
const stages = SPORT_ASSESSMENTS.nfl.stages;
const maturity = deriveSportMaturity(stages, SPORT_ASSESSMENTS.nfl);
const proven = GATE_STAGES.filter((s) => stages[s.id]?.status === "PROVEN").length;
const gaps = remainingPath(stages, SPORT_ASSESSMENTS.nfl);

const blockers = [];
if ((nextEvent?.seasonType ?? 0) === 1) blockers.push({ id: "preseason-participation", state: "REALITY_GATED", detail: "preseason: no dated+sourced snap scenarios exist, so every player market is ROLE_UNCERTAIN and the team model abstains by its model card. Clears when the regular season starts (or a participation source is authorized)." });
if (markets?.propMarkets?.state === "PROBED" && (markets.propMarkets.offeredMarkets ?? []).length === 0) blockers.push({ id: "player-markets-absent", state: "NO_MARKET", detail: "the authorized capture probed this window: the provider offers no NFL player-prop or anytime-TD market. Absence is evidence — not a retry target. Re-probe when the regular season opens." });
if (!settleable.some((x) => Date.parse(x.a.kickoffUtc) < nowMs)) blockers.push({ id: "first-settlement", state: "NOT_YET_OBSERVABLE", detail: `no pre-start artifact has passed its kickoff yet; the first settleable event is ${settleable[0]?.a.matchup ?? "—"} at ${settleable[0]?.a.kickoffUtc ?? "—"}` });
if (!process.env.OPS_WEBHOOK_URL) blockers.push({ id: "ops-webhook", state: "FOUNDER_ACTION", detail: "OPS_WEBHOOK_URL unset — NFL workflow failures land in the Actions tab only" });

const out = {
  schemaVersion: 1,
  artifact: "nfl-lane-status",
  dataClass: "INTERNAL_ADMIN",
  generatedAt: NOW,
  program: "P171",
  nextWindow: nextEvent
    ? { matchup: `${nextEvent.away.abbr} @ ${nextEvent.home.abbr}`, kickoffUtc: nextEvent.dateUtc, seasonType: nextEvent.seasonType, week: nextEvent.week, hoursToKickoff: Number(((Date.parse(nextEvent.dateUtc) - nowMs) / 3.6e6).toFixed(2)), eventsInWindow: upcoming.length }
    : UNKNOWN("no scheduled event ahead of the clock"),
  freshness: {
    schedule: freshnessOf("schedule", schedule, ["generatedAt"]),
    rosters: freshnessOf("rosters", rosters, ["sourceAsOf", "generatedAt"]),
    injuries: freshnessOf("injuries", injuries, ["sourceAsOf", "generatedAt"]),
    odds: markets ? freshnessOf("odds", markets, ["capturedAt"]) : UNKNOWN("no market capture"),
  },
  markets: markets
    ? { state: "CAPTURED", events: markets.eventCount, books: Math.max(...(markets.rows ?? []).map((r) => r.books.length), 0), capturedAt: markets.capturedAt, propMarkets: markets.propMarkets }
    : UNKNOWN("no authorized capture"),
  credits,
  models,
  currentArtifacts: {
    total: artifacts.length,
    contractValid: artifacts.filter((x) => x.valid).length,
    preStart: preStart.length,
    settlementReady: settleable.length,
    detail: artifacts.length ? `${artifacts.filter((x) => x.valid).length}/${artifacts.length} pass the current-event contract; ${settleable.length} carry pinned settlement targets` : "none generated",
  },
  vault: vaultLedger
    ? { state: vaultLedger.entries.at(-1)?.state ?? "UNKNOWN", date: vaultLedger.entries.at(-1)?.date ?? null, entries: vaultLedger.entries.length, corrections: (vaultLedger.entries.at(-1)?.corrections ?? []).length }
    : UNKNOWN("no vault ledger"),
  gate: { maturity, proven, total: GATE_STAGES.length, nextGate: gaps[0] ? `${gaps[0].stage} (${gaps[0].status ?? "UNPROVEN"})` : null, detail: `${proven}/${GATE_STAGES.length} stages proven` },
  cadence: { state: "UNPROVEN", detail: "nfl-event-window.yml is deployed with two daily window passes, but a workflow file is not cadence proof — promotion waits for terminal scheduled receipts" },
  blockers,
};

const outPath = path.join(APP, "public/data/admin/nfl-lane.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`nfl-lane: gate ${proven}/${GATE_STAGES.length} (${maturity}) · window ${out.nextWindow.matchup ?? "—"} · credits ${credits.programSpend ?? "?"}/${credits.ceiling ?? "?"} · artifacts ${artifacts.length} · blockers ${blockers.length}`);
