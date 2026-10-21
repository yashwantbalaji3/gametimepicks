/**
 * NBA DAILY POSTGAME EVALUATION — "forecast vs actual" for ONE ET date. PURE: parsed documents in, a frozen report out.
 * No fs, no clock, no network. SERVER / CLI ONLY: grader-metrics.mjs reaches node:crypto (through
 * experimental-grading-ledger.mjs → forecast-receipt.mjs), so a component imports postgame-evaluation-vocab.mjs
 * (which imports nothing) and receives the built report as data.
 *
 * INPUTS (all committed, all read by the caller):
 *   - the frozen forecast artifacts of each NBA experimental family for the date (nba-forecast-receipt@1 per game);
 *   - the season finals record (finals-record.mjs — write-once; `finalFor` is the lookup used);
 *   - box scores where they exist (boxscore-parse.mjs docs); a missing one is PENDING_BOXSCORE, never zero;
 *   - optionally the receipt-integrity state per family/event (the CLI runs `receiptIntegrity`) and the committed
 *     promotion record (promotion-record.mjs).
 *
 * WHAT IS OFFICIAL (founder N1/N2; the official-composition draft, PR 1149):
 *   - the WINNER SIDE is Elo's (frozen `publishedSide`, rule nba-winner-side@1) — OFFICIAL;
 *   - the PLAYER figures are the v0.1 roster-gated family — OFFICIAL (its own team win probability is not official);
 *   - v1 `nba-sim-v1-coherent` is the SUPPORTING challenger, labelled research only;
 *   - v0.2, v0 and possession-sim-v0 are RESEARCH ONLY.
 *   - Team scores, margin and total are WITHHELD from the official snapshot, so this report grades none of them.
 *
 * SCORING. Every number comes from the existing grader: `gradeForecastGame` (experimental-forecast.mjs) grades each
 * frozen game, `validationMetrics` (grader-metrics.mjs) aggregates Brier / log loss / player-family MAE and p10–p90
 * coverage, and `clusterBootstrap` (champion-challenger.mjs, one game per cluster) gives the paired intervals.
 * Nothing here re-implements a metric. Lower log loss and lower Brier are better.
 *
 * RELATION TO THE GRADER V2 STACK (PR 1154, merged). That stack keeps append-only per-family ledgers, a season-long
 * champion/challenger evaluator (v0.1 vs v0.2 / v1 on paired ledger rows, §6 minimums, READY_FOR_FOUNDER_REVIEW) and
 * per-family daily diagnostics. This report is the ONE-DAY, ALL-ROLES view: it reads the frozen forecasts and the
 * finals record directly (no ledger), labels each model's role in the official composition, scores every model
 * beside the official Elo winner head, and renders. It writes nothing and decides nothing.
 *
 * HONEST WORDING. With fewer than MIN_COMPARISON_N graded games the summary says the sample supports no model
 * comparison and the paired differences are INSUFFICIENT_SAMPLE. At or above it, a paired bootstrap interval is
 * computed, and a direction is stated only when the interval excludes 0 — never "beats" or "outperforms".
 *
 * NO AUTO-PROMOTION. Roles come from the composition above; promotion state is READ from the committed promotion
 * record (checked with its owner's `promotionRecordViolations`), reported, and never applied or decided here.
 *
 * EXCLUSIONS ARE EXPLICIT. A held event (HELD_EVENTS, or a final the record holds a conflict for — the same rule as
 * `underReviewIds`) is listed with its HELD reason and enters no metric. A forecast frozen at or after tip (the
 * earliest of the receipt tip, the game time and the recorded start) is REFUSED, never graded.
 */
import { validationMetrics, PREREG } from "./grader-metrics.mjs";
import { gradeForecastGame, familyGuard, FAMILIES } from "./experimental-forecast.mjs";
import { finalFor } from "./finals-record.mjs";
import { underReviewIds } from "./experimental-grading-ledger.mjs";
import { clusterBootstrap, BOOTSTRAP_DEFAULTS } from "./champion-challenger.mjs";
import { PROMOTION_RECORD_ARTIFACT, promotionRecordViolations } from "./promotion-record.mjs";
import {
  POSTGAME_EVALUATION_SCHEMA, MIN_COMPARISON_N, ROLE, ROLE_LABEL, GAME_STATE, MODEL_GAME_STATE, PLAYER_STATE,
  COMPARISON_STATE, PROMOTION_STATE, PLAYER_FAMILIES, FAMILY_LABEL, WITHHELD, WORDING,
} from "./postgame-evaluation-vocab.mjs";

export {
  POSTGAME_EVALUATION_SCHEMA, MIN_COMPARISON_N, ROLE, ROLE_LABEL, GAME_STATE, MODEL_GAME_STATE, PLAYER_STATE,
  COMPARISON_STATE, PROMOTION_STATE, PLAYER_FAMILIES, FAMILY_LABEL, WITHHELD, WORDING,
};

/** The paired bootstrap's settings: champion-challenger.mjs's defaults, so the two reports re-derive alike. */
export const BOOTSTRAP = BOOTSTRAP_DEFAULTS;

/** Events on HOLD. Excluded with their reason; the release owner lifts a hold, never this module. */
export const HELD_EVENTS = Object.freeze({
  "401901822": "HELD: the finals record holds a conflicting later observation (recorded 117–98, observed 116–98); excluded until the release owner resolves it",
});

/**
 * The models this report scores, in display order. `family` names the frozen artifact the numbers come from;
 * `head` is the winner probability read from it (elo | sim); `players` whether its player families are scored.
 */
export const MODELS = Object.freeze([
  Object.freeze({ id: "elo", label: "Elo team rating", role: ROLE.OFFICIAL, officialFor: "winner side", family: "v0.1", head: "elo", players: false,
    note: "the official winner side is Elo's frozen side; Brier and log loss score the frozen Elo probability behind it" }),
  Object.freeze({ id: "v0.1", label: "v0.1 roster-gated simulation", role: ROLE.OFFICIAL, officialFor: "player figures", family: "v0.1", head: "sim", players: true,
    note: "official for player figures only; its team win probability is not the official winner side" }),
  Object.freeze({ id: "v1", label: "v1 coherent simulation", role: ROLE.SUPPORTING, officialFor: null, family: "v1", head: "sim", players: true,
    note: "supporting challenger, research only; never the headline" }),
  Object.freeze({ id: "v0.2", label: "v0.2 season-folded simulation", role: ROLE.RESEARCH_ONLY, officialFor: null, family: "v0.2", head: "sim", players: true,
    note: "research only" }),
  Object.freeze({ id: "v0", label: "v0 preregistered simulation", role: ROLE.RESEARCH_ONLY, officialFor: null, family: "v0", head: "sim", players: true,
    note: "research only" }),
  Object.freeze({ id: "possession-sim-v0", label: "possession simulation v0", role: ROLE.RESEARCH_ONLY, officialFor: null, family: null, head: null, players: false,
    note: "research only; no committed frozen forecast artifact exists for it" }),
]);
const OFFICIAL_WINNER = MODELS[0];
const OFFICIAL_FAMILY = "v0.1";

/* ───────────────────────── helpers (no metric lives here) ───────────────────────── */

const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/**
 * Paired percentile bootstrap over games of per-game differences: champion-challenger's `clusterBootstrap` with one
 * game per cluster (so resampling is by game, exactly the paired bootstrap). Exported for tests.
 */
export const pairedBootstrap = (diffs, opts = BOOTSTRAP) => clusterBootstrap(diffs.filter(Number.isFinite).map((d) => [d]), opts);

const sideOf = (s) => (s === "home" || s === "HOME" ? "HOME" : s === "away" || s === "AWAY" ? "AWAY" : s === "TOO_CLOSE" ? "TOO_CLOSE" : null);

/** The date's games from one artifact (etDate, else the artifact's date). */
function gamesOn(doc, date) {
  return (doc?.games ?? []).filter((g) => (g?.etDate ?? doc?.date) === date && g?.providerEventId != null);
}

function boxState(doc) {
  if (!doc) return { ok: false, reason: "no committed box score for this event" };
  if (!doc.boxscoreAvailable) return { ok: false, reason: "box score document has no player box" };
  if (!/FINAL/.test(String(doc.status ?? ""))) return { ok: false, reason: `box score status ${doc.status ?? "unknown"} is not final` };
  return { ok: true, reason: null };
}

/** Is a model's frozen game usable? Returns { ok, state, detail, frozenAt, tipUtc }. */
function frozenCheck(g, { finalStartUtc, receiptState }) {
  const frozenAt = g?.receipt?.generatedAt ?? null;
  const tips = [g?.receipt?.tipUtc, g?.dateUtc, finalStartUtc].filter((t) => ms(t) != null);
  const tipMs = tips.length ? Math.min(...tips.map(ms)) : null;
  const tipUtc = tipMs == null ? null : tips.find((t) => ms(t) === tipMs);
  if (ms(frozenAt) == null) return { ok: false, state: MODEL_GAME_STATE.NO_FROZEN_TIMESTAMP, detail: "no receipt generatedAt — a forecast with no frozen instant is never graded", frozenAt, tipUtc };
  if (tipMs == null || !(ms(frozenAt) < tipMs)) {
    return { ok: false, state: MODEL_GAME_STATE.FROZEN_AFTER_TIP, detail: `frozen ${frozenAt} is not before tip ${tipUtc ?? "unknown"} — refused`, frozenAt, tipUtc };
  }
  if (receiptState != null && receiptState !== "OK") return { ok: false, state: MODEL_GAME_STATE.RECEIPT_NOT_OK, detail: `receipt integrity ${receiptState}`, frozenAt, tipUtc };
  return { ok: true, state: null, detail: null, frozenAt, tipUtc };
}

function promotionView(record, source) {
  if (!record) {
    return { state: PROMOTION_STATE.NO_RECORD_COMMITTED, source: source ?? null, records: [], violations: [], decidedHere: false,
      note: "no promotion record was supplied; roles follow the founder composition" };
  }
  if (record.artifact !== PROMOTION_RECORD_ARTIFACT || !Array.isArray(record.records)) {
    return { state: PROMOTION_STATE.UNRECOGNISED_RECORD, source: source ?? null, records: [], violations: [], decidedHere: false, note: "the promotion record is not an nba-promotion-record document; nothing read from it" };
  }
  const records = record.records.map((r) => ({ seq: r.seq ?? null, kind: r.kind ?? null, family: r.family ?? null, version: r.version ?? null, market: r.market ?? null, date: r.date ?? null, approver: r.approver ?? null }));
  return {
    state: records.length ? PROMOTION_STATE.RECORDED : PROMOTION_STATE.NO_PROMOTIONS_RECORDED,
    source: source ?? null, records,
    // The record's validity by its owner's guard: every record checked as if appended to an empty record.
    violations: promotionRecordViolations({ before: { records: [] }, after: record }),
    decidedHere: false,
    note: records.length ? "records are reported as committed; this report does not apply them to the roles above" : "the committed record holds no promotion or rollback",
  };
}

/* ───────────────────────── the report ───────────────────────── */

/**
 * @param {object} o
 * @param {string} o.date                          ET date YYYY-MM-DD
 * @param {Record<string, object|null>} o.forecasts  family → frozen forecast artifact for the date (v0, v0.1, v0.2, v1)
 * @param {Record<string, string>} [o.forecastSources] family → repo-relative path (provenance only)
 * @param {object} o.finalsRecord                  the season finals record (finals-record.mjs)
 * @param {string} [o.finalsSource]
 * @param {(id: string) => object|null} [o.boxscoreOf]  box-score doc lookup; absent → PENDING_BOXSCORE
 * @param {Record<string, Record<string, string>>} [o.receiptStates] family → eventId → receiptIntegrity state
 * @param {object|null} [o.promotionRecord]
 * @param {string|null} [o.promotionSource]
 * @param {string|null} [o.generatedAt]            stamp supplied by the caller (the module reads no clock)
 */
export function buildPostgameEvaluation({
  date, forecasts = {}, forecastSources = {}, finalsRecord = null, finalsSource = null, boxscoreOf = () => null,
  receiptStates = null, promotionRecord = null, promotionSource = null, generatedAt = null,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) throw new Error("postgame evaluation: date must be YYYY-MM-DD");

  // Family documents, each checked against its declared family (a ledger or report never mixes families).
  const docs = {};
  const inputs = {};
  for (const fam of Object.keys(FAMILIES)) {
    const doc = forecasts[fam] ?? null;
    if (!doc) { inputs[fam] = { state: "ABSENT", source: forecastSources[fam] ?? null, modelVersion: null, games: 0 }; continue; }
    const gate = familyGuard({ family: fam, doc, what: "forecast artifact" });
    if (!gate.ok) { inputs[fam] = { state: "REFUSED", reason: gate.reason, detail: gate.detail, source: forecastSources[fam] ?? null, modelVersion: doc.modelVersion ?? null, games: 0 }; continue; }
    docs[fam] = doc;
    inputs[fam] = { state: "READ", source: forecastSources[fam] ?? null, modelVersion: doc.modelVersion ?? FAMILIES[fam].modelVersion, games: gamesOn(doc, date).length };
  }

  const byFamily = Object.fromEntries(Object.entries(docs).map(([fam, doc]) => [fam, new Map(gamesOn(doc, date).map((g) => [String(g.providerEventId), g]))]));
  const ids = [...new Set(Object.values(byFamily).flatMap((m) => [...m.keys()]))];
  const official = byFamily[OFFICIAL_FAMILY] ?? new Map();
  const anyGame = (id) => official.get(id) ?? Object.values(byFamily).map((m) => m.get(id)).find(Boolean);
  ids.sort((a, b) => (ms(anyGame(a)?.dateUtc) ?? 0) - (ms(anyGame(b)?.dateUtc) ?? 0) || a.localeCompare(b));

  const finalRows = new Map((finalsRecord?.finals ?? []).map((f) => [String(f.providerEventId), f]));
  const underReview = underReviewIds({ season: finalsRecord });
  const graded = {}; // model id → [{ id, out }]
  for (const m of MODELS) graded[m.id] = [];

  const games = ids.map((id) => {
    const og = official.get(id) ?? null;
    const any = anyGame(id);
    const fin = finalFor(finalsRecord, id);
    const finRow = finalRows.get(id) ?? null;
    const base = {
      providerEventId: id,
      matchup: `${any?.away?.abbr ?? "?"} at ${any?.home?.abbr ?? "?"}`,
      home: { abbr: any?.home?.abbr ?? null, name: any?.home?.name ?? null },
      away: { abbr: any?.away?.abbr ?? null, name: any?.away?.name ?? null },
      tipUtc: og?.receipt?.tipUtc ?? any?.dateUtc ?? null,
      actualStartUtc: finRow?.dateUtc ?? null,
      frozenAt: og?.receipt?.generatedAt ?? null,
      official: {
        winnerSide: sideOf(og?.forecast?.publishedSide) ,
        winnerTeam: og ? (sideOf(og.forecast?.publishedSide) === "HOME" ? og.home?.abbr : sideOf(og.forecast?.publishedSide) === "AWAY" ? og.away?.abbr : null) ?? null : null,
        rule: og?.forecast?.sideRule?.id ?? null,
        head: og?.forecast?.sideRule?.head ?? null,
        receipt: og ? { family: og.receipt?.family ?? OFFICIAL_FAMILY, modelVersion: og.receipt?.modelVersion ?? null, payloadSha256: og.receipt?.payloadSha256 ?? null } : null,
      },
      actual: null,
      officialResult: null,
      state: null,
      reason: null,
      models: {},
    };

    const held = HELD_EVENTS[id] ?? (underReview.has(id) || fin.state === "FINAL_UNDER_REVIEW" ? "HELD: the finals record holds a conflicting observation for this final (under review); excluded until resolved" : null);
    const notGraded = (state, reason) => {
      for (const m of MODELS) base.models[m.id] = { state: MODEL_GAME_STATE.NOT_GRADED, reason: state };
      return { ...base, state, reason };
    };
    if (held) return notGraded(GAME_STATE.HELD, held);
    if (fin.state !== "FINAL") return notGraded(GAME_STATE.PENDING_FINAL, "no final in the committed finals record — pending, never a loss");

    base.actual = { winnerSide: sideOf(fin.winnerSide), winnerTeam: sideOf(fin.winnerSide) === "HOME" ? any?.home?.abbr ?? fin.home : any?.away?.abbr ?? fin.away, ftHome: fin.ftHome, ftAway: fin.ftAway, source: finalsSource ?? "finals record" };
    const box = boxscoreOf(id) ?? null;
    const bs = boxState(box);

    for (const m of MODELS) {
      if (!m.family) { base.models[m.id] = { state: MODEL_GAME_STATE.NO_FORECAST, reason: m.note }; continue; }
      const g = byFamily[m.family]?.get(id) ?? null;
      if (!g) { base.models[m.id] = { state: MODEL_GAME_STATE.NO_FORECAST, reason: `no ${m.family} frozen forecast for this event` }; continue; }
      // Identity by provider team id, never by abbreviation (finals-record.mjs keys sides the same way).
      if (finRow && (String(g.home?.providerTeamId) !== String(finRow.home?.providerTeamId) || String(g.away?.providerTeamId) !== String(finRow.away?.providerTeamId))) {
        base.models[m.id] = { state: MODEL_GAME_STATE.IDENTITY_MISMATCH, reason: "forecast home/away team ids differ from the recorded final" };
        continue;
      }
      const fc = frozenCheck(g, { finalStartUtc: finRow?.dateUtc ?? null, receiptState: receiptStates?.[m.family]?.[id] ?? null });
      if (!fc.ok) { base.models[m.id] = { state: fc.state, reason: fc.detail, frozenAt: fc.frozenAt, tipUtc: fc.tipUtc }; continue; }
      const out = gradeForecastGame(g, { ftHome: fin.ftHome, ftAway: fin.ftAway, source: "finals-record" }, bs.ok ? box : null);
      if (!out.graded) { base.models[m.id] = { state: MODEL_GAME_STATE.NOT_GRADED, reason: out.reason }; continue; }
      graded[m.id].push({ id, out });
      const w = out.winner?.[m.head] ?? null;
      const entry = {
        state: MODEL_GAME_STATE.GRADED, frozenAt: fc.frozenAt, tipUtc: fc.tipUtc,
        receipt: receiptStates?.[m.family]?.[id] ?? "NOT_CHECKED",
        winner: w ? { pHome: w.p, brier: w.brier, logLoss: w.logLoss } : null,
      };
      if (m.players) {
        entry.players = bs.ok && out.players
          ? { state: PLAYER_STATE.GRADED, matchedRows: out.players.rows.length, predictedButDnp: out.players.predictedButDnp.length, predictedButAbsent: out.players.predictedButAbsent.length, playedButUnpredicted: out.players.playedButUnpredicted.length }
          : { state: PLAYER_STATE.PENDING_BOXSCORE, reason: bs.reason ?? "box score not usable" };
      } else entry.players = { state: PLAYER_STATE.NOT_APPLICABLE };
      base.models[m.id] = entry;
    }

    const om = base.models[OFFICIAL_WINNER.id];
    if (!og) return { ...base, state: GAME_STATE.NO_OFFICIAL_FORECAST, reason: "no official (v0.1 receipt) forecast for this event" };
    if (om.state === MODEL_GAME_STATE.FROZEN_AFTER_TIP || om.state === MODEL_GAME_STATE.NO_FROZEN_TIMESTAMP) return { ...base, state: GAME_STATE.REFUSED_FROZEN_AFTER_TIP, reason: om.reason };
    if (om.state === MODEL_GAME_STATE.RECEIPT_NOT_OK) return { ...base, state: GAME_STATE.REFUSED_RECEIPT, reason: om.reason };
    if (om.state === MODEL_GAME_STATE.IDENTITY_MISMATCH) return { ...base, state: GAME_STATE.REFUSED_IDENTITY, reason: om.reason };
    const os = base.official.winnerSide;
    const officialResult = os === "TOO_CLOSE" ? "TOO_CLOSE" : os == null ? "NO_SIDE" : os === base.actual.winnerSide ? "MATCHED" : "MISSED";
    return { ...base, state: GAME_STATE.GRADED, reason: null, officialResult };
  });

  /* Per model: aggregate with grader-metrics over that model's graded games. */
  const models = MODELS.map((m) => {
    const rows = graded[m.id];
    const pendingBox = games.filter((g) => g.models[m.id]?.players?.state === PLAYER_STATE.PENDING_BOXSCORE).map((g) => g.providerEventId);
    const refused = games.filter((g) => [MODEL_GAME_STATE.FROZEN_AFTER_TIP, MODEL_GAME_STATE.NO_FROZEN_TIMESTAMP, MODEL_GAME_STATE.RECEIPT_NOT_OK, MODEL_GAME_STATE.IDENTITY_MISMATCH].includes(g.models[m.id]?.state))
      .map((g) => ({ providerEventId: g.providerEventId, state: g.models[m.id].state }));
    const base = { id: m.id, label: m.label, role: m.role, roleLabel: ROLE_LABEL[m.role], officialFor: m.officialFor, family: m.family, modelVersion: m.family ? inputs[m.family]?.modelVersion ?? null : null, note: m.note, refused };
    if (!m.family) return { ...base, state: "NO_COMMITTED_FORECAST", winner: { n: null, brier: null, logLoss: null }, players: { state: PLAYER_STATE.NOT_APPLICABLE } };
    if (!rows.length) {
      return { ...base, state: "NO_GRADED_GAMES", winner: { n: 0, brier: null, logLoss: null },
        players: m.players ? { state: pendingBox.length ? PLAYER_STATE.PENDING_BOXSCORE : PLAYER_STATE.NO_GRADED_GAMES, pendingGames: pendingBox, families: null } : { state: PLAYER_STATE.NOT_APPLICABLE } };
    }
    const vm = validationMetrics(rows.map((r) => r.out));
    const w = vm.winner[m.head];
    let players = { state: PLAYER_STATE.NOT_APPLICABLE };
    if (m.players) {
      const withBox = rows.filter((r) => r.out.players).length;
      const state = withBox === 0 ? PLAYER_STATE.PENDING_BOXSCORE : pendingBox.length ? PLAYER_STATE.PARTIAL : PLAYER_STATE.GRADED;
      players = {
        state,
        gamesWithBoxscore: withBox,
        pendingGames: pendingBox,
        minutes: withBox ? { n: vm.players.minutes.n, mae: vm.players.minutes.mae } : null,
        // Missing is never zero: with no box score every family is PENDING_BOXSCORE with null numbers.
        families: Object.fromEntries(PLAYER_FAMILIES.map((f) => {
          const x = vm.players.families[f];
          if (!withBox) return [f, { state: PLAYER_STATE.PENDING_BOXSCORE, n: null, minN: PREREG.player[f].minN, mae: null, coverage80: null, coverage80N: null }];
          return [f, { state, n: x.n, minN: x.minN, mae: x.unconditionalMAE, coverage80: x.coverage80, coverage80N: x.coverage80N }];
        })),
        eligibility: `prereg §6: rows with expected minutes ≥ ${PREREG.player.pts.minMinutes} (3PM also rate ≥ ${PREREG.player.threePm.minRatePerMin}/min); MAE is |frozen mean − actual|`,
      };
    }
    return { ...base, state: "GRADED", winner: { n: w.n, brier: w.brier, logLoss: w.logLoss, head: m.head }, players };
  });

  /* Paired differences vs the official winner head, on identical graded games — only with enough games. */
  const per = (mid) => new Map(graded[mid].map((r) => [r.id, r.out.winner?.[MODELS.find((x) => x.id === mid).head]]));
  const offPer = per(OFFICIAL_WINNER.id);
  const comparisons = MODELS.filter((m) => m.id !== OFFICIAL_WINNER.id && m.head).map((m) => {
    const mine = per(m.id);
    const shared = [...offPer.keys()].filter((id) => mine.get(id) && offPer.get(id));
    const n = shared.length;
    const head = { model: m.id, against: OFFICIAL_WINNER.id, n, minN: MIN_COMPARISON_N, rule: "model − Elo, per game; lower is better, so a negative difference is lower (better) loss for the model" };
    if (n < MIN_COMPARISON_N) {
      return { ...head, state: COMPARISON_STATE.INSUFFICIENT_SAMPLE, logLoss: null, brier: null,
        text: `${m.label} vs Elo: ${n} paired game${n === 1 ? "" : "s"} (fewer than ${MIN_COMPARISON_N}) — no comparison is made.` };
    }
    const one = (k) => {
      const ci = pairedBootstrap(shared.map((id) => mine.get(id)[k] - offPer.get(id)[k]));      const direction = ci.lo == null ? "NO_INTERVAL" : ci.hi < 0 ? "MODEL_LOWER" : ci.lo > 0 ? "ELO_LOWER" : "NOT_ESTABLISHED";
      return { meanDiff: ci.mean, ci95: [ci.lo, ci.hi], direction, B: ci.B, seed: ci.seed };
    };
    const ll = one("logLoss"), br = one("brier");
    const say = (name, x) => x.direction === "MODEL_LOWER" ? `${name} ${x.meanDiff} lower for ${m.label} (95% interval ${x.ci95[0]} to ${x.ci95[1]} excludes 0)`
      : x.direction === "ELO_LOWER" ? `${name} ${Math.abs(x.meanDiff)} lower for Elo (95% interval ${x.ci95[0]} to ${x.ci95[1]} excludes 0)`
      : `${name} difference ${x.meanDiff} not established (95% interval ${x.ci95[0]} to ${x.ci95[1]} includes 0)`;
    return { ...head, state: COMPARISON_STATE.COMPUTED, logLoss: ll, brier: br, text: `${m.label} vs Elo over ${n} paired games: ${say("log loss", ll)}; ${say("Brier", br)}.` };
  });

  const count = (s) => games.filter((g) => g.state === s).length;
  const gradedGames = games.filter((g) => g.state === GAME_STATE.GRADED);
  const n = gradedGames.length;
  const matched = gradedGames.filter((g) => g.officialResult === "MATCHED").length;
  const sampleState = n < MIN_COMPARISON_N ? COMPARISON_STATE.INSUFFICIENT_SAMPLE : COMPARISON_STATE.COMPUTED;
  const caveat = n < MIN_COMPARISON_N
    ? `${n} graded game${n === 1 ? "" : "s"}: the sample supports no model comparison (fewer than ${MIN_COMPARISON_N}). Scores are reported, not ranked.`
    : `${n} graded games: paired differences carry a ${Math.round((1 - BOOTSTRAP.alpha) * 100)}% bootstrap interval; a direction is stated only where the interval excludes 0.`;
  const pendingPlayers = models.filter((m) => m.players?.state === PLAYER_STATE.PENDING_BOXSCORE || m.players?.state === PLAYER_STATE.PARTIAL);

  const lines = [
    `Official winner side (Elo) matched the actual winner in ${matched} of ${n} graded game${n === 1 ? "" : "s"}.`,
    caveat,
    WORDING.direction,
    ...(count(GAME_STATE.HELD) ? [`${count(GAME_STATE.HELD)} game(s) held and excluded with their reason.`] : []),
    ...(count(GAME_STATE.PENDING_FINAL) ? [`${count(GAME_STATE.PENDING_FINAL)} game(s) have no final yet — pending, not graded.`] : []),
    ...(count(GAME_STATE.REFUSED_FROZEN_AFTER_TIP) ? [`${count(GAME_STATE.REFUSED_FROZEN_AFTER_TIP)} game(s) refused: the official forecast was not frozen before tip.`] : []),
    ...(pendingPlayers.length ? [`Player families: box scores pending for ${[...new Set(pendingPlayers.flatMap((m) => m.players.pendingGames))].length} game(s) — not graded, not zero.`] : []),
    WORDING.withheldLine,
    WORDING.noPromotion,
  ];

  return deepFreeze({
    schema: POSTGAME_EVALUATION_SCHEMA,
    sport: "nba",
    dataClass: "PRIVATE_RESEARCH",
    productEligible: false,
    date,
    generatedAt: generatedAt ?? null,
    composition: {
      source: "founder N1/N2 official composition (official-composition draft, PR 1149): Elo winner side + v0.1 player figures official; v1 supporting (research only)",
      winnerSide: { model: "elo", rule: "nba-winner-side@1", receiptFamily: OFFICIAL_FAMILY },
      players: { model: OFFICIAL_FAMILY },
    },
    withheld: WITHHELD,
    wording: { ...WORDING, minComparisonN: MIN_COMPARISON_N, minComparisonNSource: "caller brief 2026-10-21 (for founder approval); the prereg §6 winner-market minimum is " + PREREG.winner.minN },
    bootstrap: { ...BOOTSTRAP, method: "percentile bootstrap over games of the per-game paired difference (champion-challenger clusterBootstrap, one game per cluster)" },
    promotion: promotionView(promotionRecord, promotionSource),
    inputs: { forecasts: inputs, finals: { source: finalsSource ?? null, season: finalsRecord?.season ?? null, updatedAt: finalsRecord?.updatedAt ?? null }, heldEvents: Object.keys(HELD_EVENTS) },
    games,
    models,
    comparisons,
    baselines: { coin: { brier: PREREG.coin.brier, logLoss: r4(PREREG.coin.logLoss), note: "a 0.5 forecast every game; context, not a bar" } },
    summary: {
      slate: games.length,
      graded: n,
      held: count(GAME_STATE.HELD),
      pendingFinal: count(GAME_STATE.PENDING_FINAL),
      refusedFrozenAfterTip: count(GAME_STATE.REFUSED_FROZEN_AFTER_TIP),
      refusedOther: count(GAME_STATE.REFUSED_RECEIPT) + count(GAME_STATE.REFUSED_IDENTITY),
      noOfficialForecast: count(GAME_STATE.NO_OFFICIAL_FORECAST),
      officialSide: { matched, of: n },
      sample: { n, minN: MIN_COMPARISON_N, state: sampleState, text: caveat },
      lines,
    },
  });
}

/* ───────────────────────── Markdown ───────────────────────── */

const fmt = (v) => (v == null ? "—" : String(v));

export function postgameMarkdown(r) {
  const out = [];
  out.push(`# NBA postgame evaluation · ${r.date}`, "");
  out.push(`Private research (${r.dataClass}) · schema ${r.schema}${r.generatedAt ? ` · generated ${r.generatedAt}` : ""}`, "");
  out.push("## Summary", "", ...r.summary.lines.map((l) => `- ${l}`), "");
  out.push("## Games", "", "| Game | State | Official side (Elo) | Actual winner | Final | Frozen at | Tip |", "|---|---|---|---|---|---|---|");
  for (const g of r.games) {
    const fin = g.actual ? `${g.away.abbr} ${g.actual.ftAway} – ${g.home.abbr} ${g.actual.ftHome}` : "—";
    out.push(`| ${g.matchup} (${g.providerEventId}) | ${g.state}${g.officialResult ? ` · ${g.officialResult}` : ""} | ${fmt(g.official.winnerTeam)} | ${fmt(g.actual?.winnerTeam)} | ${fin} | ${fmt(g.frozenAt)} | ${fmt(g.tipUtc)} |`);
  }
  for (const g of r.games.filter((x) => x.reason)) out.push("", `- ${g.providerEventId}: ${g.reason}`);
  out.push("", "## Models (winner probability)", "", `${r.wording.direction} ${r.summary.sample.text}`, "", "| Model | Role | Games | Brier | Log loss | Note |", "|---|---|---|---|---|---|");
  for (const m of r.models) out.push(`| ${m.label} | ${m.roleLabel}${m.officialFor ? ` (${m.officialFor})` : ""} | ${fmt(m.winner.n)} | ${fmt(m.winner.brier)} | ${fmt(m.winner.logLoss)} | ${m.note} |`);
  out.push("", `Coin baseline (context): Brier ${r.baselines.coin.brier}, log loss ${r.baselines.coin.logLoss}.`);
  out.push("", "## Paired differences vs Elo", "", ...r.comparisons.map((c) => `- [${c.state}] ${c.text}`));
  out.push("", "## Player families", "", r.wording.playerDirection, "");
  for (const m of r.models.filter((x) => x.players?.state && x.players.state !== PLAYER_STATE.NOT_APPLICABLE)) {
    out.push(`### ${m.label} · ${m.roleLabel}`, "", `State: ${m.players.state}${m.players.pendingGames?.length ? ` (box score pending: ${m.players.pendingGames.join(", ")})` : ""}`);
    if (m.players.families) {
      out.push("", "| Family | State | n | MAE | p10–p90 coverage |", "|---|---|---|---|---|");
      for (const f of PLAYER_FAMILIES) {
        const x = m.players.families[f];
        out.push(`| ${FAMILY_LABEL[f]} | ${x.state} | ${fmt(x.n)} | ${fmt(x.mae)} | ${fmt(x.coverage80)} |`);
      }
    }
    out.push("");
  }
  out.push("## Withheld", "", ...Object.values(r.withheld).map((w) => `- ${w}`), "");
  out.push("## Promotion", "", `State: ${r.promotion.state} — ${r.promotion.note}`, "");
  return out.join("\n");
}
