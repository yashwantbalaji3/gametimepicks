/**
 * join-mlb-pregame-settlements.mjs — INTERNAL research settlement-join for the MLB pregame archive.
 *
 * Joins immutable FINAL_PREGAME_FREEZE records + captured market-lean KEYS to OFFICIAL MLB Stats API
 * postgame box scores, producing SEPARATE research-join artifacts so the archive can begin counting
 * settled-eligible rows toward the 500-row research gate.
 *
 * HARD RULES (enforced):
 *   • Reads freezes/snapshots/market payloads; NEVER modifies them (capturedAt/availableAt/eligibility/
 *     provenance/hashes are copied, never written back).
 *   • A settlement join can NEVER make an ineligible pregame value eligible (researchEligible is copied
 *     verbatim from the capture; ineligible rows are recorded but never counted as settled-eligible).
 *   • OFFICIAL MLB Stats API box scores only. No inferred/unofficial outcomes.
 *   • Equal to the line is a PUSH, never a loss. Missing stat / game-not-final is PENDING, never a loss.
 *   • Postponed/suspended/cancelled = PENDING (never final, never a loss).
 *   • playerId first; normalized name is a guarded fallback; a mismatch is AMBIGUOUS (never a silent grade).
 *   • No modeling, calibration, feature scoring, or public prediction. No money/official-settlement change.
 *
 * Durable-data design: market payloads (raw/normalized.json) are gitignored, so a FUTURE run cannot see a
 * PAST date's odds. The per-game join file therefore carries the small market-lean KEYS forward (committed);
 * once the game is final, a later run grades those carried-forward keys from the official box score — no odds
 * payload needed at grade time.
 *
 * Runs on FREE StatsAPI (no Odds credits), pure node builtins (no npm deps — CI runs it with `node`).
 *
 *   node app/scripts/join-mlb-pregame-settlements.mjs --date 2026-07-21            # dry-run (prints, writes nothing)
 *   node app/scripts/join-mlb-pregame-settlements.mjs --date 2026-07-21 --write    # persist join artifacts
 *   node app/scripts/join-mlb-pregame-settlements.mjs --lookback 3 --write         # today + 3 prior dates (re-grade pending)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { revalidateMarketEligibility } from "./lib/research-eligibility.mjs";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive");
const FREEZE_DIR = path.join(ARCHIVE, "freezes");
const SNAP_DIR = path.join(ARCHIVE, "snapshots");
const MKT_DIR = path.join(ARCHIVE, "market-snapshots");
const JOIN_DIR = path.join(ARCHIVE, "settlement-joins");
const HOST = "https://statsapi.mlb.com"; // free; the ONLY host this script contacts
const SCHEMA_VERSION = "mlb-pregame-settlement-join-1";

// ── the 12 deterministically-settleable markets (provider keys). Anything else is UNSUPPORTED. ──
const TEAM_MARKETS = new Set(["h2h", "spreads", "totals"]);
const PLAYER_MARKETS = new Set([
  "pitcher_strikeouts", "pitcher_outs", "pitcher_earned_runs",
  "batter_hits", "batter_total_bases", "batter_home_runs", "batter_rbis", "batter_runs_scored", "batter_hits_runs_rbis",
]);
export const SUPPORTED_JOIN_MARKETS = new Set([...TEAM_MARKETS, ...PLAYER_MARKETS]);

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const num = (x) => (x == null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));
const sha256 = (s) => crypto.createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const normName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── pure graders (ported from src/lib/mlb/product-settlement/mlb-markets.ts; a parity guard test pins them). ──
export function settleOverUnder(actual, side, line) {
  if (!isNum(line)) return { status: "unavailable", reason: "no line provided" };
  if (!isNum(actual)) return { status: "pending", line, reason: "final stat not available" };
  if (actual > line) return { status: side === "over" ? "win" : "loss", actual, line, reason: `${actual} > ${line}` };
  if (actual < line) return { status: side === "under" ? "win" : "loss", actual, line, reason: `${actual} < ${line}` };
  return { status: "push", actual, line, reason: `${actual} == ${line} (push)` };
}
export function settleMoneyline(homeRuns, awayRuns, selectedSide) {
  if (!isNum(homeRuns) || !isNum(awayRuns)) return { status: "pending", reason: "final score not available" };
  if (homeRuns === awayRuns) return { status: "pending", reason: "scores equal — game not final (MLB has no ties)" };
  const winner = homeRuns > awayRuns ? "home" : "away";
  return { status: selectedSide === winner ? "win" : "loss", actual: Math.abs(homeRuns - awayRuns), reason: `${winner} won` };
}
export function settleRunLine(homeRuns, awayRuns, selectedSide, line) {
  if (!isNum(line)) return { status: "unavailable", reason: "no line provided" };
  if (!isNum(homeRuns) || !isNum(awayRuns)) return { status: "pending", line, reason: "final score not available" };
  const self = selectedSide === "home" ? homeRuns : awayRuns;
  const opp = selectedSide === "home" ? awayRuns : homeRuns;
  const adj = self - opp + line;
  return { status: adj > 0 ? "win" : adj < 0 ? "loss" : "push", actual: self - opp, line, reason: `margin ${self - opp} ${line >= 0 ? "+" : ""}${line} = ${adj}` };
}

// ── official box score (StatsAPI feed/live) ──
async function fetchJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "gtp-pregame-settlement-join/1" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

export function extractOfficialGame(feed) {
  const st = feed?.gameData?.status || {};
  const abstractGameState = st.abstractGameState ?? "Other";
  const codedGameState = st.codedGameState ?? "";
  const detailedState = st.detailedState ?? abstractGameState;
  const postponedSuspended = ["C", "D", "U", "T"].includes(codedGameState) || /Postponed|Suspended|Cancel/i.test(detailedState);
  const isFinal = abstractGameState === "Final" && !postponedSuspended;
  const ls = feed?.liveData?.linescore?.teams || {};
  const homeRuns = isFinal ? num(ls.home?.runs) : null;
  const awayRuns = isFinal ? num(ls.away?.runs) : null;
  const teams = feed?.gameData?.teams || {};
  const players = {};
  for (const sideKey of ["home", "away"]) {
    const ps = feed?.liveData?.boxscore?.teams?.[sideKey]?.players || {};
    for (const key of Object.keys(ps)) {
      const p = ps[key];
      const id = p?.person?.id;
      if (id == null) continue;
      const b = p?.stats?.batting || {};
      const pit = p?.stats?.pitching || {};
      const batted = Object.keys(b).length > 0;
      const pitched = Object.keys(pit).length > 0;
      players[String(id)] = {
        id, name: p?.person?.fullName, side: sideKey,
        batting: batted ? { hits: num(b.hits), totalBases: num(b.totalBases), homeRuns: num(b.homeRuns), rbi: num(b.rbi), runs: num(b.runs), atBats: num(b.atBats), plateAppearances: num(b.plateAppearances), gamesPlayed: num(b.gamesPlayed) } : null,
        pitching: pitched ? { strikeOuts: num(pit.strikeOuts), outs: num(pit.outs), earnedRuns: num(pit.earnedRuns), inningsPitched: pit.inningsPitched ?? null, gamesStarted: num(pit.gamesStarted), gamesPlayed: num(pit.gamesPlayed) } : null,
      };
    }
  }
  return {
    isFinal, abstractGameState, codedGameState, detailedState, postponedSuspended,
    homeRuns, awayRuns,
    homeName: teams.home?.name ?? null, awayName: teams.away?.name ?? null,
    homeAbbr: teams.home?.abbreviation ?? null, awayAbbr: teams.away?.abbreviation ?? null,
    winner: isFinal && isNum(homeRuns) && isNum(awayRuns) && homeRuns !== awayRuns ? (homeRuns > awayRuns ? "home" : "away") : null,
    players,
  };
}

function resolveTeamSide(teamNameOrSel, game) {
  const t = normName(teamNameOrSel);
  const cands = [
    ["home", normName(game.homeName)], ["home", normName(game.homeAbbr)],
    ["away", normName(game.awayName)], ["away", normName(game.awayAbbr)],
  ].filter(([, v]) => v);
  const exact = cands.find(([, v]) => v === t);
  if (exact) return exact[0];
  const contains = cands.filter(([, v]) => v && (v.includes(t) || t.includes(v)));
  if (contains.length === 1) return contains[0][0];
  return null; // ambiguous
}

export function findPlayer(lean, game) {
  const byId = lean.playerId != null ? game.players[String(lean.playerId)] : null;
  if (byId) return { player: byId, matchBy: "playerId" };
  // guarded name fallback — must match exactly one player
  const target = normName(lean.player || lean.playerName);
  if (!target) return { player: null, matchBy: "none" };
  const matches = Object.values(game.players).filter((p) => normName(p.name) === target);
  if (matches.length === 1) return { player: matches[0], matchBy: "name-fallback" };
  return { player: null, matchBy: matches.length > 1 ? "ambiguous-name" : "none" };
}

export function gradePlayerLean(lean, game) {
  const market = lean.market;
  const side = String(lean.selection).toLowerCase() === "under" ? "under" : "over";
  if (!isNum(lean.line)) return { settlementStatus: "unsupported", reason: "missing/malformed line" };
  if (!(side === "over" || side === "under")) return { settlementStatus: "unsupported", reason: "unrecognized selection" };
  if (!game.isFinal) return { settlementStatus: "pending", reason: `game not final (${game.detailedState})` };
  const { player, matchBy } = findPlayer(lean, game);
  if (!player) return { settlementStatus: matchBy === "ambiguous-name" ? "ambiguous" : "unavailable", reason: matchBy === "ambiguous-name" ? "player name matched multiple box-score players" : "player not in box score / did not play", matchBy };
  const isPitcher = market.startsWith("pitcher_");
  const stats = isPitcher ? player.pitching : player.batting;
  if (!stats) return { settlementStatus: "unavailable", reason: `player did not ${isPitcher ? "pitch" : "bat"}`, matchBy };
  let actual, r;
  if (market === "batter_hits_runs_rbis") {
    if (!isNum(stats.hits) || !isNum(stats.runs) || !isNum(stats.rbi)) return { settlementStatus: "pending", reason: "a H/R/RBI component is missing — never a partial settle", matchBy };
    actual = stats.hits + stats.runs + stats.rbi;
  } else {
    const map = {
      pitcher_strikeouts: stats.strikeOuts, pitcher_outs: stats.outs, pitcher_earned_runs: stats.earnedRuns,
      batter_hits: stats.hits, batter_total_bases: stats.totalBases, batter_home_runs: stats.homeRuns,
      batter_rbis: stats.rbi, batter_runs_scored: stats.runs,
    };
    if (!(market in map)) return { settlementStatus: "unsupported", reason: `market ${market} not deterministically settleable` };
    actual = map[market];
  }
  r = settleOverUnder(actual, side, lean.line);
  return { settlementStatus: r.status, actual: r.actual ?? null, reason: r.reason, matchBy };
}

export function gradeTeamLean(lean, game) {
  const market = lean.market;
  if (!game.isFinal) return { settlementStatus: "pending", reason: `game not final (${game.detailedState})` };
  if (market === "totals") {
    const side = String(lean.selection).toLowerCase() === "under" ? "under" : "over";
    if (!isNum(game.homeRuns) || !isNum(game.awayRuns)) return { settlementStatus: "pending", reason: "final score not available" };
    const r = settleOverUnder(game.homeRuns + game.awayRuns, side, lean.line);
    return { settlementStatus: r.status, actual: r.actual ?? null, reason: r.reason };
  }
  const teamSide = resolveTeamSide(lean.selection ?? lean.team, game);
  if (!teamSide) return { settlementStatus: "ambiguous", reason: `could not map team "${lean.selection ?? lean.team}" to home/away` };
  const r = market === "h2h" ? settleMoneyline(game.homeRuns, game.awayRuns, teamSide) : settleRunLine(game.homeRuns, game.awayRuns, teamSide, lean.line);
  return { settlementStatus: r.status, actual: r.actual ?? null, reason: r.reason, teamSide };
}

export function gradeLean(lean, game) {
  if (!SUPPORTED_JOIN_MARKETS.has(lean.market)) return { settlementStatus: "unsupported", reason: `market ${lean.market} is not in the deterministic settleable set` };
  return TEAM_MARKETS.has(lean.market) ? gradeTeamLean(lean, game) : gradePlayerLean(lean, game);
}

// ── gather captured market-lean KEYS for a date (from local normalized payloads, if present) ──
function leanKey(l) {
  return TEAM_MARKETS.has(l.market)
    ? `${l.gamePk}|${l.market}|${normName(l.selection ?? l.team)}|${l.line}`
    : `${l.gamePk}|${l.playerId}|${l.market}|${String(l.selection).toLowerCase()}|${l.line}`;
}
function slimLean(l) {
  // minimal durable KEY + provenance needed to (re)grade later from official box scores. Odds books are NOT
  // stored (large payloads stay gitignored → artifacts); only the de-vig probability is kept for research.
  return {
    market: l.market, gamePk: l.gamePk, providerEventId: l.providerEventId ?? null,
    playerId: l.playerId ?? null, player: l.player ?? l.playerName ?? null,
    selection: l.selection ?? l.team ?? null, line: isNum(l.line) ? l.line : (l.line ?? null),
    researchEligible: l.researchEligible === true,
    noVigProbability: isNum(l.noVigProbability) ? l.noVigProbability : null,
    capturedAt: l.capturedAt ?? null,
    availableAt: l.availableAt ?? null, // preserved so eligibility can be re-validated against the authoritative start
  };
}
// merge carried-forward (existing) + freshly-captured leans, keeping the LATEST pregame capturedAt per key.
// An older capture must NEVER regress a newer carried lean, so a re-run with same-or-older market data is a
// true no-op (idempotent). Returns a Map keyed by leanKey.
export function mergeLeanKeys(existingRows, capturedForGame) {
  const leanMap = new Map();
  const consider = (l) => {
    const k = leanKey(l);
    const prev = leanMap.get(k);
    if (!prev || String(l.capturedAt || "") > String(prev.capturedAt || "")) leanMap.set(k, slimLean(l));
  };
  for (const l of existingRows || []) consider(l);
  for (const l of capturedForGame || []) consider(l);
  return leanMap;
}
function gatherCapturedLeans(date) {
  const out = new Map();
  const dir = path.join(MKT_DIR, date);
  if (!fs.existsSync(dir)) return out;
  for (const cap of fs.readdirSync(dir)) {
    const norm = readJson(path.join(dir, cap, "normalized.json"));
    if (!norm) continue; // gitignored → only present in the capturing run's working tree
    const recs = Array.isArray(norm) ? norm : norm.records || [];
    for (const r of recs) {
      if (!SUPPORTED_JOIN_MARKETS.has(r.market)) continue;
      const k = leanKey(r);
      const prev = out.get(k);
      // keep the latest pregame-captured version per key (closest-to-first-pitch pregame state)
      if (!prev || String(r.capturedAt || "") > String(prev.capturedAt || "")) out.set(k, slimLean(r));
    }
  }
  return out;
}

// ── contextual research rows (Phase 4): feature families → linked official outcomes (NOT graded as bets) ──
function loadSnapshotValues(date, freeze) {
  const byId = {};
  const ids = new Set(Object.values(freeze.featureEligibility || {}).map((f) => f.snapshotId).filter(Boolean));
  if (!ids.size) return byId;
  const dir = path.join(SNAP_DIR, date);
  if (!fs.existsSync(dir)) return byId;
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(`${freeze.gamePk}-`) && x.endsWith(".json"))) {
    const s = readJson(path.join(dir, f));
    if (!s || !ids.has(s.snapshotId)) continue;
    for (const fam of s.featureFamilies || []) byId[fam.family] = fam.value;
  }
  return byId;
}
function contextualRows(freeze, values, game) {
  const gf = game.isFinal;
  const totalRuns = isNum(game.homeRuns) && isNum(game.awayRuns) ? game.homeRuns + game.awayRuns : null;
  const rows = [];
  for (const fam of freeze.coverageSummary?.eligibleFamilies || []) {
    const base = { family: fam, researchEligible: true, note: "contextual research row — NOT a graded market and NOT claimed predictive" };
    if (fam === "environment") {
      rows.push({ ...base, feature: "pregame weather/roof", outcome: gf ? { gameTotalRuns: totalRuns, homeRuns: game.homeRuns, awayRuns: game.awayRuns } : null, outcomeStatus: gf ? "linked" : "pending" });
    } else if (fam === "umpire") {
      rows.push({ ...base, feature: "pregame home-plate umpire", outcome: gf ? { gameTotalRuns: totalRuns } : null, outcomeStatus: gf ? "linked" : "pending" });
    } else if (fam === "pitcher_status") {
      const v = values.pitcher_status || {};
      for (const [slot, name] of [["home", v.homeProbable], ["away", v.awayProbable]]) {
        if (!name) continue;
        const m = Object.values(game.players).filter((p) => normName(p.name) === normName(name));
        const match = m.length === 1 ? m[0] : null;
        rows.push({
          ...base, feature: `pregame probable ${slot} pitcher: ${name}`,
          outcome: !gf ? null : match && match.pitching ? { didStart: match.pitching.gamesStarted >= 1, outs: match.pitching.outs, strikeOuts: match.pitching.strikeOuts, earnedRuns: match.pitching.earnedRuns } : { didAppear: false, note: "probable did not appear in the box score" },
          outcomeStatus: !gf ? "pending" : match ? "linked" : m.length > 1 ? "ambiguous" : "linked",
        });
      }
    } else if (fam === "confirmed_lineup") {
      const v = values.confirmed_lineup || {};
      rows.push({ ...base, feature: "pregame confirmed lineup", pregameValue: v.status ?? "posted", outcome: gf ? { note: "per-batter PA/hits available in the official box score for a later per-slot join" } : null, outcomeStatus: gf ? "linked" : "pending" });
    } else if (fam === "bullpen" || fam === "plate_appearance_opportunity") {
      rows.push({ ...base, feature: `pregame ${fam}`, outcome: null, outcomeStatus: "unsupported", reason: "no deterministic outcome target defined for this family" });
    }
  }
  return rows;
}

async function joinGame(date, gamePk, freeze, capturedLeans, existing) {
  const feed = await fetchJson(`${HOST}/api/v1.1/game/${gamePk}/feed/live`);
  const fetchedAt = new Date().toISOString();
  const game = extractOfficialGame(feed);

  // market leans: union of freshly-captured keys + keys carried forward from a prior join file (durability).
  const capturedForGame = [...capturedLeans.values()].filter((l) => l.gamePk === gamePk);
  const leanMap = mergeLeanKeys(existing?.marketRows, capturedForGame);

  // The freeze's eventStartTime is the AUTHORITATIVE first pitch. Re-validate every carried/captured row's inherited
  // researchEligible against it — a provider commence_time can differ from the official start, so a flag captured
  // "pregame" upstream may actually be post-first-pitch here. Inherited booleans are never trusted without this
  // re-check; post-start rows are downgraded to researchEligible=false + kept as evidence (never deleted).
  const authoritativeStart = freeze.eventStartTime ?? null;
  const marketRows = [];
  for (const l of leanMap.values()) {
    const g = gradeLean(l, game);
    const reval = revalidateMarketEligibility({ inherited: l.researchEligible, capturedAt: l.capturedAt, availableAt: l.availableAt, eventStartTime: authoritativeStart });
    const researchEligible = reval.eligible;
    const countsAsSettledEligible = researchEligible && (g.settlementStatus === "win" || g.settlementStatus === "loss");
    // record a SHORT ineligibility code only on downgraded rows (keeps committed join files under the size cap)
    const extra = researchEligible ? {} : { ineligibleReason: reval.quality };
    marketRows.push({ ...l, researchEligible, ...extra, actual: g.actual ?? null, settlementStatus: g.settlementStatus, settlementReason: g.reason, matchBy: g.matchBy ?? null, teamSide: g.teamSide ?? null, countsAsSettledEligible });
  }

  const values = loadSnapshotValues(date, freeze);
  const ctx = contextualRows(freeze, values, game);

  const counts = {
    marketRows: marketRows.length,
    marketSettledEligible: marketRows.filter((r) => r.countsAsSettledEligible).length,
    marketPush: marketRows.filter((r) => r.settlementStatus === "push").length,
    marketPending: marketRows.filter((r) => r.settlementStatus === "pending").length,
    marketUnavailable: marketRows.filter((r) => r.settlementStatus === "unavailable").length,
    marketAmbiguous: marketRows.filter((r) => r.settlementStatus === "ambiguous").length,
    marketUnsupported: marketRows.filter((r) => r.settlementStatus === "unsupported").length,
    marketIneligibleGraded: marketRows.filter((r) => !r.researchEligible && (r.settlementStatus === "win" || r.settlementStatus === "loss")).length,
    contextualLinked: ctx.filter((r) => r.outcomeStatus === "linked").length,
    contextualPending: ctx.filter((r) => r.outcomeStatus === "pending").length,
    contextualAmbiguous: ctx.filter((r) => r.outcomeStatus === "ambiguous").length,
  };

  const joinStatus = !game.isFinal ? "pending" : marketRows.length + ctx.length === 0 ? "unsupported" : "joined";
  const record = {
    schemaVersion: SCHEMA_VERSION, public: false, approvedForProduction: false, productEligible: false,
    kind: "mlb-pregame-settlement-join",
    date, gamePk,
    providerEventId: marketRows.find((r) => r.providerEventId)?.providerEventId ?? null,
    freezeId: freeze.gamePk, freezeHash: sha256(freeze), boardDateEt: freeze.boardDateEt ?? date,
    eventStartTime: freeze.eventStartTime ?? null,
    sourceSnapshotIds: [...new Set(Object.values(freeze.featureEligibility || {}).map((f) => f.snapshotId).filter(Boolean))],
    researchEligibleFamilies: freeze.coverageSummary?.eligibleFamilies ?? [],
    officialSource: { source: "MLB Stats API (official)", endpoint: `${HOST}/api/v1.1/game/${gamePk}/feed/live`, sourceType: "official_league", fetchedAt },
    gameFinalStatus: { isFinal: game.isFinal, abstractGameState: game.abstractGameState, codedGameState: game.codedGameState, detailedState: game.detailedState, postponedSuspended: game.postponedSuspended },
    teamOutcome: { homeTeam: game.homeName, awayTeam: game.awayName, homeRuns: game.homeRuns, awayRuns: game.awayRuns, totalRuns: isNum(game.homeRuns) && isNum(game.awayRuns) ? game.homeRuns + game.awayRuns : null, winner: game.winner },
    marketRows, contextualRows: ctx, counts,
    joinStatus, joinReason: !game.isFinal ? `game not final (${game.detailedState}) — remains pending` : "official box score joined",
  };
  // idempotency: contentHash excludes wall-clock fields; only rewrite when the deterministic content changes
  const contentHash = sha256({ ...record, officialSource: { ...record.officialSource, fetchedAt: undefined } });
  record.contentHash = contentHash;
  record.createdAt = existing?.createdAt ?? fetchedAt;
  record.updatedAt = fetchedAt;
  return { record, changed: !existing || existing.contentHash !== contentHash };
}

function dateList(args) {
  const idx = (k) => args.indexOf(k);
  if (idx("--dates") >= 0) return args[idx("--dates") + 1].split(",").map((s) => s.trim()).filter(Boolean);
  const raw = idx("--today") >= 0 ? args[idx("--today") + 1] : (idx("--date") >= 0 ? args[idx("--date") + 1] : "");
  // empty/invalid (e.g. a scheduled CI run passes an empty --today) ⇒ default to today UTC
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? raw : new Date().toISOString().slice(0, 10);
  if (idx("--lookback") >= 0) {
    const n = Math.max(0, parseInt(args[idx("--lookback") + 1], 10) || 0);
    const base = new Date(`${today}T12:00:00Z`);
    const ds = [];
    for (let i = n; i >= 0; i--) { const d = new Date(base); d.setUTCDate(d.getUTCDate() - i); ds.push(d.toISOString().slice(0, 10)); }
    return ds;
  }
  return [today];
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const FORCE_FINAL = args.includes("--refresh-final");
  const dates = dateList(args).filter((d) => fs.existsSync(path.join(FREEZE_DIR, d)));
  if (!dates.length) { console.log("[join] no archived freeze dates in range — nothing to join"); return; }

  const summary = { dates: [], gamesJoined: 0, gamesPending: 0, gamesUnsupported: 0, gamesWritten: 0, gamesUnchanged: 0, marketSettledEligible: 0, marketPush: 0, marketPending: 0, marketAmbiguous: 0, marketUnavailable: 0, marketUnsupported: 0, contextualLinked: 0 };
  for (const date of dates) {
    const freezes = fs.readdirSync(path.join(FREEZE_DIR, date)).filter((f) => f.endsWith(".json"));
    const captured = gatherCapturedLeans(date);
    const outDir = path.join(JOIN_DIR, date);
    let joined = 0, pending = 0, unsupported = 0, written = 0, unchanged = 0, se = 0, push = 0, pend = 0, amb = 0, unav = 0, unsup = 0, ctxL = 0;
    for (const ff of freezes) {
      const freeze = readJson(path.join(FREEZE_DIR, date, ff));
      if (!freeze) continue;
      const gamePk = freeze.gamePk;
      const existing = readJson(path.join(outDir, `${gamePk}.json`));
      // a FINAL game is terminal — re-fetching/re-grading it every run is wasteful and can never change the
      // official outcome. Reuse the existing joined record (still counted) unless --refresh-final is passed.
      const terminal = existing?.gameFinalStatus?.isFinal === true && existing.joinStatus === "joined" && !FORCE_FINAL;
      let res;
      if (terminal) { res = { record: existing, changed: false }; }
      else {
        try { res = await joinGame(date, gamePk, freeze, captured, existing); }
        catch (e) { console.log(`  [${date}] gamePk ${gamePk}: StatsAPI fetch failed (${String(e).slice(0, 60)}) — skipped, nothing written`); continue; }
      }
      const r = res.record;
      if (r.joinStatus === "joined") joined++; else if (r.joinStatus === "pending") pending++; else unsupported++;
      se += r.counts.marketSettledEligible; push += r.counts.marketPush; pend += r.counts.marketPending;
      amb += r.counts.marketAmbiguous; unav += r.counts.marketUnavailable; unsup += r.counts.marketUnsupported; ctxL += r.counts.contextualLinked;
      if (WRITE) {
        // compact JSON — these derived join files can carry hundreds of per-line market leans; compact keeps
        // even the biggest game well under the 128 KiB metadata commit size guard (odds books are never stored).
        if (res.changed) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${gamePk}.json`), JSON.stringify(r)); written++; }
        else unchanged++;
      }
    }
    summary.dates.push(date);
    summary.gamesJoined += joined; summary.gamesPending += pending; summary.gamesUnsupported += unsupported;
    summary.gamesWritten += written; summary.gamesUnchanged += unchanged;
    summary.marketSettledEligible += se; summary.marketPush += push; summary.marketPending += pend;
    summary.marketAmbiguous += amb; summary.marketUnavailable += unav; summary.marketUnsupported += unsup; summary.contextualLinked += ctxL;
    console.log(`[join] ${date}: ${freezes.length} games · joined ${joined} · pending ${pending} · settled-eligible ${se} · push ${push} · market-pending ${pend} · ambiguous ${amb} · unavailable ${unav} · contextual-linked ${ctxL}${WRITE ? ` · wrote ${written} (unchanged ${unchanged})` : " · DRY-RUN"}`);
  }
  console.log(`\n[join] ${WRITE ? "WROTE" : "DRY-RUN"} · dates ${summary.dates.join(",")} · games joined ${summary.gamesJoined} / pending ${summary.gamesPending} · SETTLED-ELIGIBLE ROWS ${summary.marketSettledEligible} (push ${summary.marketPush}, pending ${summary.marketPending}, ambiguous ${summary.marketAmbiguous}, unavailable ${summary.marketUnavailable}) · contextual linked ${summary.contextualLinked}`);
  if (!WRITE) console.log(`[join] dry-run — pass --write to persist settlement-joins/<date>/<gamePk>.json`);
  return summary;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main().catch((e) => { console.error("[join] fatal:", e); process.exit(1); });
