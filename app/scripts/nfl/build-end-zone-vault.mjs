/**
 * End Zone Vault — the NFL signature touchdown experience (Program 174 · Release E).
 *
 * ONE engine, one receipt per event window, exactly one outcome from a closed set. The product
 * exists to be USEFUL on a night when it cannot responsibly present a card: with calibrated
 * touchdown probabilities but no offered market and no role evidence, the honest output is a
 * WATCHLIST — model candidates a reader can look at — and explicitly NOT a card, a return, or
 * anything shaped like an instruction to bet.
 *
 * OUTCOMES (exactly one per window):
 *   ACTIVE          every product gate passed AND current comparable TD prices exist
 *   WATCHLIST_ONLY  model candidates exist; price and/or role gates do not pass — no card
 *   NO_VAULT        the evaluator ran over a real pool and nothing qualified even as a candidate
 *   STALE           the evidence behind the candidates aged past its window
 *   INCIDENT        the pipeline contradicted itself or failed
 * A missing input is INCIDENT or STALE — never a quiet NO_VAULT, because "we found nothing" and
 * "we could not look" are different answers.
 *
 * Selections are NEVER forced to hit a count. If two candidates qualify, the card has two.
 *
 * Usage: node scripts/nfl/build-end-zone-vault.mjs --now <iso> [--date YYYY-MM-DD]
 * Writes: app/public/data/nfl/end-zone-vault/<date>.json + latest.json (PUBLIC_DERIVED)
 *         data/internal/nfl/end-zone-vault/ledger.json (append-only, guarded)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateVaultLedgerAppend } from "../../src/lib/sports/nfl/end-zone-vault.mjs";
import { teamTdDistribution, anytimeTdProbability, loadScoringBridgeMapping, loadTdCalibrationReceipt, flattenPoolShares } from "../../src/lib/sports/nfl/td-engine.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DATE = arg("--date", NOW.slice(0, 10));
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** The committed product card: every gate this product enforces, in one place. */
export const VAULT_PRODUCT_CARD = Object.freeze({
  productId: "end-zone-vault",
  version: 2,
  objective: "Surface the players our model thinks are most likely to score a touchdown, with honest uncertainty.",
  allowedMarket: "ANYTIME_TOUCHDOWN",
  minCandidateProbability: 0.12,
  maxSelections: 3,
  minSelectionsForCard: 2,
  requiredForActive: ["calibrated TD probability", "current active/role evidence", "current comparable TD price", "settlement coverage", "compatibility check"],
  requiredForWatchlist: ["calibrated TD probability", "team simulation the probabilities reconcile to"],
  correlationPolicy: "same-game scorers are correlated; a card discloses it and never advertises it as diversification",
  stakeFraming: "paper only — the Vault never stakes real money and never promises a return",
  settlementOwner: "settle-anytime-td (official scoring credit; the passer is not the scorer)",
  exclusions: ["first/last TD markets", "2+ TD markets", "defensive scorers", "players without durable identity"],
});

const forecasts = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
const markets = read(path.join(APP, "public/data/nfl/markets/latest.json"));
const shares = read(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/current.json"));
const mapping = loadScoringBridgeMapping({ fs, path, cwd: APP });
const calibration = loadTdCalibrationReceipt({ fs, path, cwd: APP });
const currentDir = path.join(ROOT, "data/internal/nfl/current", DATE);

// ---------------------------------------------------------------- inputs → outcome
const missing = [];
if (!forecasts?.forecasts?.length) missing.push("no current team forecasts");
if (!mapping?.receipt) missing.push("no committed points→TD bridge");
if (!calibration?.receipt) missing.push("no committed TD calibration");
if (!shares?.teams) missing.push("no committed role shares");

const nowMs = Date.parse(NOW);
const upcoming = (forecasts?.forecasts ?? []).filter((f) => Date.parse(f.kickoffUtc) > nowMs);

/** Participation, read from the newest current artifact for the event. */
function poolStatesFor(providerEventId, teamAbbr) {
  if (!fs.existsSync(currentDir)) return null;
  const files = fs.readdirSync(currentDir).filter((f) => f.startsWith(`${providerEventId}-`)).sort();
  if (!files.length) return null;
  const a = read(path.join(currentDir, files[files.length - 1]));
  return a?.research?.perTeam?.[teamAbbr]?.participationCounts ?? null;
}

const candidates = [];
const withheld = [];
for (const f of upcoming) {
  for (const side of ["home", "away"]) {
    const teamAbbr = f[side].abbr;
    const fam = shares?.teams?.[teamAbbr]?.scorerTd;
    if (!fam?.players?.length) { withheld.push({ event: f.matchup, team: teamAbbr, reason: "no corpus-backed scorer shares for this roster" }); continue; }
    // team TD distribution from THIS event's own projected points — never a league average
    const expectedPoints = f.forecastSummary.projectedScore[side];
    const teamTd = teamTdDistribution({ expectedPoints, mapping });
    if (teamTd.state !== "OK") { withheld.push({ event: f.matchup, team: teamAbbr, reason: teamTd.reason }); continue; }

    const raw = fam.players.map((p) => p.share);
    const flat = flattenPoolShares(raw, calibration?.poolFlattenBeta ?? 0);
    const counts = poolStatesFor(f.providerEventId, teamAbbr);
    const roleEvidence = counts && (counts.ACTIVE_PROJECTED > 0 || counts.ACTIVE_CONFIRMED > 0);

    fam.players.forEach((p, i) => {
      const prob = anytimeTdProbability({ teamTd, perTdShare: flat[i] });
      if (prob.state !== "OK") return;
      if (prob.probability < VAULT_PRODUCT_CARD.minCandidateProbability) return;
      candidates.push({
        playerId: p.playerId, name: p.name, position: p.position ?? null,
        team: teamAbbr, opponent: f[side === "home" ? "away" : "home"].abbr,
        event: f.matchup, providerEventId: f.providerEventId, kickoffUtc: f.kickoffUtc,
        tdProbability: prob.probability,
        probabilityRange: { note: "derived from the team's simulated scoring distribution; the visible list never sums to 100% because defence, special teams and unlisted players hold the residual" },
        roleState: roleEvidence ? "ACTIVE_EXPECTED" : "ROLE_UNCERTAIN",
        roleNote: roleEvidence ? "roster and injury evidence support expected participation" : "preseason: no source-backed evidence of how much this player will play",
        marketPrice: null,
        shareBasis: p.shareBasis,
        modelVersion: calibration?.receipt ?? null,
      });
    });
  }
}
candidates.sort((a, b) => b.tdProbability - a.tdProbability || (a.playerId < b.playerId ? -1 : 1));

// ---------------------------------------------------------------- the closed-set decision
const tdMarketOffered = markets?.propMarkets?.state === "PROBED"
  ? (markets.propMarkets.offeredMarkets ?? []).includes("player_anytime_td")
  : null;
const priced = candidates.filter((c) => c.marketPrice != null);
const roleReady = candidates.filter((c) => c.roleState === "ACTIVE_EXPECTED");

let state; let reason; let selections = [];
if (missing.length) {
  state = "INCIDENT";
  reason = `the Vault could not evaluate: ${missing.join("; ")} — "we could not look" is not "we found nothing"`;
} else if (!upcoming.length) {
  state = "NO_VAULT";
  reason = "no upcoming NFL event in this window to evaluate";
} else if (!candidates.length) {
  state = "NO_VAULT";
  reason = `the evaluator ran over a real pool and no player cleared the ${VAULT_PRODUCT_CARD.minCandidateProbability} candidate probability`;
} else if (priced.length >= VAULT_PRODUCT_CARD.minSelectionsForCard && roleReady.length >= VAULT_PRODUCT_CARD.minSelectionsForCard) {
  state = "ACTIVE";
  selections = priced.filter((c) => c.roleState === "ACTIVE_EXPECTED").slice(0, VAULT_PRODUCT_CARD.maxSelections);
  reason = `${selections.length} selection(s) cleared every product gate`;
} else {
  state = "WATCHLIST_ONLY";
  const blockers = [];
  if (tdMarketOffered === false) blockers.push("the sportsbooks are not offering anytime-touchdown markets for these games");
  else if (!priced.length) blockers.push("no current comparable touchdown price is available");
  if (!roleReady.length) blockers.push("preseason playing time is unknown, so no player's role is established");
  reason = `${candidates.length} model candidates, but no card: ${blockers.join(" and ")}. A watchlist is something to look at — it is not a card, carries no return, and is not an instruction to bet.`;
}

const publicArtifact = {
  schemaVersion: 1,
  artifact: "nfl-end-zone-vault",
  dataClass: "PUBLIC_DERIVED",
  date: DATE,
  generatedAt: NOW,
  product: { id: VAULT_PRODUCT_CARD.productId, version: VAULT_PRODUCT_CARD.version, objective: VAULT_PRODUCT_CARD.objective },
  state,
  reason,
  isCard: state === "ACTIVE",
  selections,
  watchlist: state === "WATCHLIST_ONLY" ? candidates.slice(0, 12) : [],
  candidateCount: candidates.length,
  withheld,
  gates: {
    required: VAULT_PRODUCT_CARD.requiredForActive,
    tdMarketOffered,
    pricedCandidates: priced.length,
    roleReadyCandidates: roleReady.length,
  },
  disclaimer: "Paper only and educational. Touchdown probabilities come from an experimental preseason model that has not been shown to beat the sportsbook market. A watchlist is not a bet.",
};

const payload = JSON.stringify(publicArtifact, null, 1);
for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey"]) {
  if (payload.includes(banned)) { console.error(`REFUSED: vault artifact would carry "${banned}"`); process.exit(2); }
}
for (const dir of ["end-zone-vault"]) fs.mkdirSync(path.join(APP, "public/data/nfl", dir), { recursive: true });
fs.writeFileSync(path.join(APP, "public/data/nfl/end-zone-vault", `${DATE}.json`), payload);
fs.writeFileSync(path.join(APP, "public/data/nfl/end-zone-vault", "latest.json"), payload);

// append-only ledger, through the existing guard (duplicate dates refuse; corrections add lineage)
const ledgerPath = path.join(ROOT, "data/internal/nfl/end-zone-vault/ledger.json");
const ledger = read(ledgerPath);
const ledgerState = state === "ACTIVE" ? "ACTIVE" : state === "INCIDENT" ? "INCIDENT" : state === "STALE" ? "STALE" : "NO_PLAY";
const entry = { date: DATE, state: ledgerState, legs: state === "ACTIVE" ? selections.map((s) => ({ playerId: s.playerId, name: s.name, team: s.team })) : [], reasons: [reason], settlement: state === "ACTIVE" ? "PENDING_OFFICIAL_RESULT" : "NOT_APPLICABLE", productVersion: VAULT_PRODUCT_CARD.version };
if (ledger && !ledger.entries.some((e) => e.date === DATE)) {
  const check = validateVaultLedgerAppend(ledger, entry);
  if (check.ok) { ledger.entries.push(entry); fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1)); console.log(`ledger: appended ${DATE} → ${ledgerState}`); }
  else console.error(`ledger append refused: ${check.errors.join("; ")}`);
} else console.log(`ledger: ${DATE} entry already exists — append-only, nothing rewritten`);

console.log(`End Zone Vault ${DATE}: ${state} — ${reason}`);
console.log(`  candidates ${candidates.length} · priced ${priced.length} · role-ready ${roleReady.length} · TD market offered: ${tdMarketOffered}`);
for (const c of candidates.slice(0, 5)) console.log(`  ${c.name} (${c.team}) ${(c.tdProbability * 100).toFixed(1)}% · ${c.roleState}`);
