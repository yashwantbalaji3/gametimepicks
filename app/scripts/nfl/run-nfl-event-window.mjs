/**
 * NFL event-window orchestrator (Program 171 · Release E). PRIVATE RESEARCH writer.
 *
 * THE production caller the P169 modules never had: for every pre-start event in the window it
 * runs the full chain — participation pool → shadow ladder → team score sim → player-prop heads
 * → TD boards → Vault decision — and writes ONE append-only current artifact per event with a
 * typed state PER MARKET FAMILY. Missing player evidence never erases a valid team read;
 * a valid market capture never implies model claims.
 *
 * TIME DISCIPLINE: --now is mandatory; a post-kickoff event is REFUSED by the shadow contract
 * (recorded, not patched); every evidence block carries its own asOf and the artifact refuses
 * to write if any evidence stamp sits at/after kickoff. Artifacts are append-only: a rerun
 * writes a NEW stamped file, never overwrites an earlier snapshot.
 *
 * IDENTITY DISCIPLINE: strength rows carry FULL NAMES while events carry abbrs — ratingFor is
 * wrapped through the event's own abbr→name map (the P170-B join lesson; an unwrapped lookup
 * silently hands every team the league-mean rating).
 *
 * Usage: node scripts/nfl/run-nfl-event-window.mjs --now <iso> [--lookahead-hours 18] [--runs 10000]
 * Writes: data/internal/nfl/current/<date>/<eventId>-<HHMM>Z.json (per event)
 *         data/internal/nfl/end-zone-vault/ledger.json (append or correction, guarded)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runNflShadow } from "../../src/lib/sports/nfl/shadow-run.mjs";
import { buildActivePool } from "../../src/lib/sports/nfl/participation.mjs";
import { buildPlayerRegistry } from "../../src/lib/sports/nfl/player-identity.mjs";
import { simulateNflGame } from "../../src/lib/sports/nfl/game-sim.mjs";
import { simulatePlayerProps, loadPlayerPropsFit } from "../../src/lib/sports/nfl/player-props-v1.mjs";
import { buildScorerBoard, loadScoringBridgeMapping, loadTdCalibrationReceipt, flattenPoolShares } from "../../src/lib/sports/nfl/td-engine.mjs";
import { buildVault, validateVaultLedgerAppend, appendVaultCorrection } from "../../src/lib/sports/nfl/end-zone-vault.mjs";
import { checkFreshness } from "../../src/lib/sports/nfl/season-context.mjs";
import { validateCurrentEventArtifact } from "../../src/lib/sports/nfl/current-event-contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required — this orchestrator never reads a live clock"); process.exit(1); }
const LOOKAHEAD_H = Number(arg("--lookahead-hours", "18"));
const RUNS = Number(arg("--runs", "10000"));
const DATE = NOW.slice(0, 10);
const STAMP = NOW.slice(11, 16).replace(":", "") + "Z";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readMaybe = (p) => { try { return read(p); } catch { return null; } };

// ---------------------------------------------------------------- evidence inputs (each dated)
const schedule = read(path.join(APP, "public/data/nfl/schedule/latest.json"));
const rosters = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
const injuries = readMaybe(path.join(ROOT, "data/internal/research/injuries/nfl/latest.json"));
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;
const modelReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/model-v1-evaluation.json"));
const currentShares = read(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/current.json"));
const mapping = loadScoringBridgeMapping({ fs, path, cwd: APP });
const calibration = loadTdCalibrationReceipt({ fs, path, cwd: APP });
const propsFit = loadPlayerPropsFit({ fs, path, cwd: APP });
const publicMarkets = readMaybe(path.join(APP, "public/data/nfl/markets/latest.json"));
const snapFiles = fs.existsSync(path.join(ROOT, "data/internal/research/odds/nfl"))
  ? fs.readdirSync(path.join(ROOT, "data/internal/research/odds/nfl")).filter((f) => f.startsWith("capture-")).sort()
  : [];
const oddsSnapshot = snapFiles.length ? read(path.join(ROOT, "data/internal/research/odds/nfl", snapFiles[snapFiles.length - 1])) : null;

const fit = { modelId: modelReceipt.modelId, version: modelReceipt.modelVersion, method: "ANALYTICAL_NORMAL_HEADS_OVER_CUTOFF_ELO", params: modelReceipt.fitParams };
// the registry consumes the WHOLE roster artifact as one capture (participation.test's shape)
const registry = buildPlayerRegistry([rosters]);

const nowMs = Date.parse(NOW);
const events = schedule.rows.filter((r) => {
  const t = Date.parse(r.dateUtc);
  return t > nowMs && t <= nowMs + LOOKAHEAD_H * 3.6e6 && r.statusRaw === "STATUS_SCHEDULED";
}).sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : 1));
console.log(`window: ${events.length} pre-start events within ${LOOKAHEAD_H}h of ${NOW}`);
if (!events.length) { console.log("NO_EVENTS: the correct unavailable state — nothing is generated, nothing is faked"); process.exit(0); }

// market rows keyed by providerEventId (public capture is the display + settlement-target source)
const marketByEvent = new Map((publicMarkets?.rows ?? []).map((r) => [r.providerEventId, r]));
const marketFreshness = publicMarkets
  ? checkFreshness("odds", { sourceAsOf: publicMarkets.capturedAt, fetchedAt: publicMarkets.capturedAt }, NOW)
  : null;

// prop-market availability: the authorized probe's absence evidence covers the window
const propProbe = oddsSnapshot?.propProbe ?? null;
const anytimeTdAbsent = propProbe?.state === "PROBED" && (propProbe.absentMarkets ?? []).includes("player_anytime_td");
const scorerPriceState = anytimeTdAbsent
  ? "NO_MARKET — authorized capture probed this window and the provider offers no anytime-TD market"
  : "AUTH_REQUIRED — no authorized current price";

// ---------------------------------------------------------------- per-team roleRates composition
const THRESH = { qbShare: 0.3, carryShare: 0.05, targetShare: 0.05 };
function composeRoleRates(teamAbbr) {
  const fam = currentShares.teams[teamAbbr];
  if (!fam?.rates?.players?.length) return null;
  const ratesById = new Map(fam.rates.players.map((r) => [r.playerId, r]));
  const share = (family, playerId) => fam[family].players.find((p) => p.playerId === playerId)?.share ?? 0;
  const names = new Map();
  for (const f of ["passAttempts", "rushAttempts", "targets"]) for (const p of fam[f].players) names.set(p.playerId, { name: p.name, shareBasis: p.shareBasis });
  const players = [];
  for (const [playerId, meta] of names) {
    const rates = ratesById.get(playerId);
    if (!rates) continue;
    const qbShare = share("passAttempts", playerId);
    const carryShare = share("rushAttempts", playerId);
    const targetShare = share("targets", playerId);
    const families = new Set();
    if (qbShare >= THRESH.qbShare) families.add("passAttempts");
    if (carryShare >= THRESH.carryShare) families.add("rushAttempts");
    if (targetShare >= THRESH.targetShare) families.add("targets");
    if (!families.size) continue;
    players.push({ playerId, name: meta.name, shareBasis: meta.shareBasis, families, qbShare, carryShare, targetShare, share: Math.max(qbShare, carryShare, targetShare), compRate: rates.compRate, ypcmp: rates.ypcmp, intRate: rates.intRate, catchRate: rates.catchRate, ypr: rates.ypr, ypc: rates.ypc });
  }
  return players.length ? { players } : null;
}

// ---------------------------------------------------------------- run the chain per event
const outDir = path.join(ROOT, "data/internal/nfl/current", DATE);
fs.mkdirSync(outDir, { recursive: true });
const boards = [];
const written = [];
for (const ev of events) {
  const abbrToName = new Map([[ev.home.abbr, ev.home.name], [ev.away.abbr, ev.away.name]]);
  const shadow = runNflShadow({ event: ev, nowIso: NOW, strengthRows: finals, fit, injuriesArtifact: injuries, oddsSnapshot });
  const pool = buildActivePool({ event: ev, registry, injuriesArtifact: injuries, nowIso: NOW });

  // strength for the sims: name-keyed rows behind an abbr-aware wrapper
  const { strengthStateAt } = await import("../../src/lib/sports/nfl/strength-state.mjs");
  const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < ev.dateUtc), cutoffIso: NOW });
  const wrapped = { ...strength, ratingFor: (t) => strength.ratingFor(abbrToName.get(t) ?? t) };

  const gamesim = simulateNflGame({ fit, strengthState: wrapped, event: ev, artifactDate: DATE, runs: RUNS });

  const perTeam = {};
  for (const side of ["home", "away"]) {
    const teamAbbr = ev[side].abbr;
    const roleRates = composeRoleRates(teamAbbr);
    const props = roleRates
      ? simulatePlayerProps({ event: ev, teamAbbr, fit: propsFit, strengthState: wrapped, roleRates, artifactDate: DATE, runs: Math.min(RUNS, 5000) })
      : { state: "ABSTAIN", reason: "no corpus-backed role/rate evidence for this roster — mass belongs to OTHER, not to a guess" };
    if (props.state === "SIMULATED" && (ev.seasonType ?? 0) === 1) {
      props.preseasonCaveat = "volumes are regular-season-shaped: preseason snap scripting is unmodeled — one more reason these distributions stay RESEARCH-only and unpublishable in this window";
    }

    const famShares = currentShares.teams[teamAbbr]?.scorerTd;
    let board = { state: "REFUSED", reason: "no scorer share block" };
    if (famShares && gamesim.state === "SIMULATED") {
      const raw = famShares.players.map((p) => p.share);
      const flat = flattenPoolShares(raw, calibration?.poolFlattenBeta ?? 0);
      board = buildScorerBoard({
        event: ev,
        teamAbbr,
        teamSim: gamesim,
        mapping,
        pool: pool.pools[teamAbbr],
        roleShares: {
          players: famShares.players.map((p, i) => ({ playerId: p.playerId, name: p.name, perTdShare: flat[i], shareBasis: `${p.shareBasis}; pool-flattened β=${calibration?.poolFlattenBeta} per ${calibration?.receipt}` })),
          teamPassAttempts: currentShares.teams[teamAbbr].expectedTeamVolume.passAttempts,
          teamRushAttempts: currentShares.teams[teamAbbr].expectedTeamVolume.rushAttempts,
          residualShare: famShares.residual.share,
          residualLabel: famShares.residual.label,
        },
        scorerPrices: null,
        scorerPriceState,
        calibrationReceipt: calibration?.receipt ?? null,
        nowIso: NOW,
      });
      if (board.state === "BOARD") boards.push(board);
    }
    perTeam[teamAbbr] = { participationCounts: pool.pools[teamAbbr]?.counts ?? null, props, anytimeTdBoard: board.state === "BOARD" ? { counts: board.counts, teamTd: board.teamTd, topRows: board.rows.slice(0, 8) } : board };
  }

  const market = marketByEvent.get(ev.providerEventId);
  const marketFamily = market
    ? { state: marketFreshness?.state === "FRESH" ? "CAPTURED_FRESH" : "CAPTURED_STALE", capturedAt: publicMarkets.capturedAt, books: market.books.length, consensus: market.consensus }
    : { state: "NO_MARKET", reason: "no authorized capture row joined this event" };

  const artifact = {
    schemaVersion: 1,
    artifact: "nfl-current-event",
    dataClass: "PRIVATE_RESEARCH",
    generatedAt: NOW,
    artifactDate: DATE,
    providerEventId: ev.providerEventId,
    canonicalEventId: `nfl-${ev.providerEventId}`,
    matchup: `${ev.away.abbr} @ ${ev.home.abbr}`,
    kickoffUtc: ev.dateUtc,
    seasonType: ev.seasonType,
    week: ev.week,
    evidence: {
      schedule: { asOf: schedule.generatedAt },
      rosters: { asOf: rosters.sourceAsOf ?? rosters.generatedAt },
      injuries: injuries ? { asOf: injuries.sourceAsOf ?? injuries.generatedAt } : null,
      odds: publicMarkets ? { asOf: publicMarkets.capturedAt } : null,
      strengthCutoff: NOW,
    },
    families: {
      teamModel: { state: shadow.state, reason: shadow.reason ?? null, note: "model-v1 preseason policy abstains; the research sim below is REDUCED_PRESEASON and RESEARCH_ONLY" },
      market: marketFamily,
      playerProps: {
        state: (ev.seasonType ?? 0) === 1 ? "ROLE_UNCERTAIN" : "SEE_PROMOTION",
        reason: (ev.seasonType ?? 0) === 1 ? "preseason: no dated+sourced snap scenarios exist — every player market abstains regardless of promotion" : null,
        promotion: propsFit?.promotion ?? null,
      },
      anytimeTd: { state: boards.length ? "MODELLED_NOT_PUBLISHABLE" : "REFUSED", scorerPriceState },
      vault: { state: "SEE_LEDGER", ledger: "data/internal/nfl/end-zone-vault/ledger.json" },
    },
    research: {
      gamesim: gamesim.state === "SIMULATED" ? { variant: gamesim.variant, evidenceTier: gamesim.evidenceTier, winProbability: gamesim.winProbability, scores: gamesim.scores, headAgreementGap: gamesim.scoreImpliedWinDiagnostic?.headAgreementGap ?? null } : { state: gamesim.state, reason: gamesim.reason },
      perTeam,
    },
    settlementTargets: market ? {
      family: "market",
      moneylineNoVig: { home: market.consensus.homeWinProbNoVig, away: market.consensus.awayWinProbNoVig },
      spreadHome: market.consensus.spreadHome,
      total: market.consensus.total,
      capturedAt: publicMarkets.capturedAt,
      note: "the pre-start captured consensus this event settles against, exactly once, after the official final",
    } : null,
    publicActivation: "OFF",
  };

  // the shared contract refuses what the guard tests would refuse — one rule, two consumers
  const contract = validateCurrentEventArtifact(artifact);
  if (!contract.ok) { console.error(`REFUSED ${ev.providerEventId}: ${contract.errors.join("; ")}`); continue; }

  const file = path.join(outDir, `${ev.providerEventId}-${STAMP}.json`);
  if (fs.existsSync(file)) { console.error(`REFUSED: ${file} already exists — append-only means a new stamp, never an overwrite`); continue; }
  fs.writeFileSync(file, JSON.stringify(artifact, null, 1));
  written.push(path.relative(ROOT, file));
  console.log(`${ev.away.abbr}@${ev.home.abbr} ${ev.dateUtc}: teamModel=${shadow.state} market=${marketFamily.state} props=${artifact.families.playerProps.state} atd=${artifact.families.anytimeTd.state}`);
}

// ---------------------------------------------------------------- vault decision for the DATE
const ledgerPath = path.join(ROOT, "data/internal/nfl/end-zone-vault/ledger.json");
const ledger = read(ledgerPath);
const vault = buildVault({ boards, date: DATE, nowIso: NOW });
const existing = ledger.entries.find((e) => e.date === DATE);
if (!existing) {
  const check = validateVaultLedgerAppend(ledger, vault.ledgerEntry);
  if (check.ok) {
    ledger.entries.push(vault.ledgerEntry);
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
    console.log(`vault: appended ${DATE} → ${vault.state}`);
  } else {
    console.error(`vault append refused: ${check.errors.join("; ")}`);
  }
} else if (anytimeTdAbsent && !(existing.corrections ?? []).some((c) => c.note.includes("NO_MARKET"))) {
  const res = appendVaultCorrection(ledger, { date: DATE, at: NOW, note: `Reason 2 (scorer prices AUTH_REQUIRED) superseded by P171-D evidence: the authorized capture probed this window and the provider offers no anytime-TD market — the price gate is now typed NO_MARKET. ${existing.state} stands on participation (preseason ROLE_UNCERTAIN).` });
  if (res.ok) { fs.writeFileSync(ledgerPath, JSON.stringify(res.ledger, null, 1)); console.log(`vault: ${DATE} entry stands (${existing.state}); NO_MARKET correction lineage appended`); }
  else console.error(`vault correction refused: ${res.errors.join("; ")}`);
} else {
  console.log(`vault: ${DATE} entry stands (${existing.state}); nothing new to record`);
}

console.log(`written: ${written.length} current artifacts under data/internal/nfl/current/${DATE}/`);
