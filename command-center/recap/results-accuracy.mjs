/**
 * NBA "PREDICTED WINNER vs FINAL" — one Eastern date's official predicted winners graded against the official finals.
 *
 * NOT an approved format: it feeds the gtp-social-results@1.0 template (render/social-results.mjs), which needs its own
 * founder design approval; every post still needs its own approval.
 *
 *   prediction  app/public/data/nba/experimental-public/<date>.json — the PUBLISHED lane, the only NBA forecast public
 *               surfaces read. Its game.elo.favoured (state FAVOURED, rule nba-winner-side@1) is the official winner
 *               side every product shows (public registry: nba_winner_side is an OFFICIAL_FORECAST family; this module
 *               refuses if that ever changes). Admitted only when frozenAt is before tip. The estimate beside it is the
 *               website's own accessor (eloWinProbabilityOf, loaded from the same commit) — the same value as the
 *               pregame posts' meter, shown as an "Elo-derived game-winner estimate", never called a probability.
 *               Internal receipts / private research paths are never read.
 *   final       app/public/data/nba/results/finals-<season>.json — write-once; STATUS_FINAL only, never exhibition,
 *               never a game with a recorded conflict, and the two teams must be the lane's two teams.
 *
 * A game that is not both (published pre-tip forecast AND official final) is EXCLUDED with its reason — never counted,
 * never silently dropped, never shown as a miss. A miss is counted and named exactly like a hit.
 *
 * Every number comes from those two files read at one pinned commit (gitDataSource): the bundle carries each source's
 * path, sha256 and commit, and a claim (key, display, evidenceRef) for every number a caption or the card may print.
 */
import { createHash } from "node:crypto";
import { FORBIDDEN_TERMS } from "../../app/scripts/build-mlb-social-content.mjs";
import { siteNbaAccessor } from "./probability-meter.mjs";
import { publicLabelOf } from "./public-registry.mjs";
import { validateCaption, MAX_CAPTION_CHARS } from "./caption-validator.mjs";

export const RESULTS_ACCURACY_SCHEMA = "gtp.cc.results-accuracy@1";
export const ESTIMATE_LABEL = "Elo-derived game-winner estimate";
export const CONTEXT_LINE = "One day of results. Not a long-term accuracy claim.";
const OFFICIAL_FAMILY = "nba_winner_side";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const DAY = (o) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o });
const noon = (ymd) => new Date(`${ymd}T12:00:00Z`);

/** NBA season of an Eastern date: Aug–Dec → that year's season, Jan–Jul → the previous year's. */
export function nbaSeasonOf(date) {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export const lanePath = (date) => `app/public/data/nba/experimental-public/${date}.json`;
export const finalsPath = (season) => `app/public/data/nba/results/finals-${season}.json`;

/**
 * @param {{ src: object, date: string, sport?: "NBA", season?: string }} p  src = gitDataSource (pinned) or dirDataSource
 * @returns {Promise<object>} { ok:false, reason } when the date has no published lane / finals record; else the bundle
 */
export async function resultsAccuracy({ src, date, sport = "NBA", season = nbaSeasonOf(date) }) {
  if (sport !== "NBA") throw new Error(`no predicted-winner results pathway for ${sport}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date must be YYYY-MM-DD: ${date}`);
  const commit = src.commit ?? null;
  const laneP = lanePath(date);
  const finP = finalsPath(season);
  const laneRaw = src.read(laneP);
  if (laneRaw == null) return { ok: false, reason: `no published NBA lane for ${date} at ${src.label}` };
  const finRaw = src.read(finP);
  if (finRaw == null) return { ok: false, reason: `no NBA finals record ${finP} at ${src.label}` };
  const label = publicLabelOf("NBA", src);
  if (!label.officialFamilies.includes(OFFICIAL_FAMILY)) return { ok: false, reason: `${OFFICIAL_FAMILY} is not an Official Forecast family in the public registry at ${src.label}` };
  const lane = JSON.parse(laneRaw);
  if (lane.date !== date) return { ok: false, reason: `lane file ${laneP} is dated ${lane.date}` };
  const fin = JSON.parse(finRaw);
  const acc = await siteNbaAccessor(src);
  const sources = [
    { role: "forecast", path: laneP, sha256: sha(laneRaw), commit },
    { role: "finals", path: finP, sha256: sha(finRaw), commit },
  ];
  const laneRef = (id) => `${laneP}#${id}`;
  const finRef = (id) => `${finP}#${id}`;

  const finals = new Map((fin.finals ?? []).map((f) => [String(f.providerEventId), f]));
  const conflicts = new Set((fin.conflicts ?? []).map((c) => String(c.providerEventId)));
  const games = [];
  const excluded = [];
  const exclude = (id, game, code, reason) => excluded.push({ eventId: id, game, code, reason });
  const seen = new Set();

  for (const g of lane.games ?? []) {
    const id = String(g.providerEventId);
    seen.add(id);
    const game = `${g.away.abbr} @ ${g.home.abbr}`;
    if (g.elo?.state !== "FAVOURED") { exclude(id, game, "NO_PUBLISHED_WINNER", `no published predicted winner (Elo side ${g.elo?.state ?? "missing"})`); continue; }
    if (!(Date.parse(g.frozenAt) < Date.parse(g.tipUtc))) { exclude(id, game, "NOT_PRE_TIP", `forecast frozen ${g.frozenAt}, not before tip ${g.tipUtc}`); continue; }
    const side = g.elo.favoured === g.home.abbr ? "home" : g.elo.favoured === g.away.abbr ? "away" : null;
    if (!side) { exclude(id, game, "NO_PUBLISHED_WINNER", `published side ${g.elo.favoured} is neither team`); continue; }
    const f = finals.get(id);
    if (!f) { exclude(id, game, "NO_OFFICIAL_FINAL", "no official final in the finals record yet"); continue; }
    if (f.statusRaw !== "STATUS_FINAL") { exclude(id, game, "NO_OFFICIAL_FINAL", `finals record status ${f.statusRaw}`); continue; }
    if (f.exhibition) { exclude(id, game, "EXHIBITION", "exhibition game"); continue; }
    if (conflicts.has(id)) { exclude(id, game, "FINAL_UNDER_REVIEW", "the finals record lists a conflicting later observation for this game"); continue; }
    if (f.home.espnAbbr !== g.home.abbr || f.away.espnAbbr !== g.away.abbr) { exclude(id, game, "TEAMS_DIFFER", `finals teams ${f.away.espnAbbr} @ ${f.home.espnAbbr} differ from the lane`); continue; }
    if (!["home", "away"].includes(f.winnerSide) || f.ftHome === f.ftAway) { exclude(id, game, "NO_WINNER", `finals record winner ${f.winnerSide}`); continue; }
    const view = acc?.eloWinProbabilityOf?.(g) ?? null;
    const team = (t) => ({ abbr: t.abbr, name: t.name });
    games.push({
      eventId: id, tipUtc: g.tipUtc, frozenAt: g.frozenAt, receiptPayloadSha256: g.receipt?.payloadSha256 ?? null,
      away: team(g.away), home: team(g.home),
      predictedSide: side, predictedWinner: g.elo.favoured,
      // the predicted side's share as the site accessor returns it (null when the accessor refuses: winner only)
      winProbability: view ? view[side] : null, estimateDisplay: view ? `${side === "home" ? view.homePct : view.awayPct}%` : null,
      finalAway: f.ftAway, finalHome: f.ftHome, actualSide: f.winnerSide, actualWinner: f.winnerSide === "home" ? g.home.abbr : g.away.abbr,
      correct: f.winnerSide === side,
      refs: { forecast: laneRef(id), final: finRef(id) },
    });
  }
  // Lane-level exclusions (the publisher's own list) and finals on this date with no published forecast.
  for (const x of lane.excluded ?? []) {
    const id = String(x.providerEventId ?? x.eventId ?? "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    exclude(id || null, x.matchup ?? x.game ?? (x.away && x.home ? `${x.away.abbr ?? x.away} @ ${x.home.abbr ?? x.home}` : id), "NO_PUBLISHED_FORECAST", `not in the published lane: ${x.reason ?? "excluded by the lane publisher"}`);
  }
  for (const f of fin.finals ?? []) {
    const id = String(f.providerEventId);
    if (f.dateEt !== date || seen.has(id)) continue;
    exclude(id, `${f.away.espnAbbr} @ ${f.home.espnAbbr}`, f.exhibition ? "EXHIBITION" : "NO_PUBLISHED_FORECAST", f.exhibition ? "exhibition game" : "no published pre-tip forecast for this game");
  }
  games.sort((a, b) => Date.parse(a.tipUtc) - Date.parse(b.tipUtc) || a.eventId.localeCompare(b.eventId));
  excluded.sort((a, b) => String(a.eventId).localeCompare(String(b.eventId)));

  const correct = games.filter((g) => g.correct).length;
  const total = games.length;
  const missed = total - correct;
  // the day's share of graded games whose predicted winner won, one decimal (shown on the card with its sample size)
  const accuracy = total ? correct / total : null;
  const accuracyDisplay = total ? `${((100 * correct) / total).toFixed(1)}%` : null;
  const dateLabel = DAY({ weekday: "short", month: "short", day: "numeric" }).format(noon(date)); // "Wed, Oct 28"
  const dayName = DAY({ weekday: "long" }).format(noon(date));
  const claims = [
    { key: "date", display: dateLabel, evidenceRef: sources[0] },
    { key: "period", display: "1 day", value: 1, evidenceRef: sources[0] },
    { key: "games.total", display: `${total} games`, value: total, evidenceRef: sources[1] },
    { key: "games.correct", display: `${correct} correct`, value: correct, evidenceRef: sources[1] },
    { key: "games.missed", display: `${missed} missed`, value: missed, evidenceRef: sources[1] },
    { key: "accuracy", display: accuracyDisplay ?? "none graded", value: accuracy, evidenceRef: sources[1] },
    // read by recap/caption-validator.mjs: when any predicted winner lost, a caption must say "missed"
    { key: "result.side", display: missed ? `${missed} missed` : "none missed", value: missed ? "LOSS" : "WIN", evidenceRef: sources[1] },
  ];
  if (excluded.length) claims.push({ key: "games.excluded", display: `${excluded.length} not graded`, value: excluded.length, evidenceRef: sources[0] });
  for (const g of games) {
    claims.push({ key: `${g.eventId}.final`, display: `${g.away.abbr} ${g.finalAway} ${g.home.abbr} ${g.finalHome}`, value: [g.finalAway, g.finalHome], evidenceRef: g.refs.final });
    claims.push({ key: `${g.eventId}.predicted`, display: `${g.predictedWinner}${g.estimateDisplay ? ` ${g.estimateDisplay}` : ""}`, value: g.winProbability, evidenceRef: g.refs.forecast });
    claims.push({ key: `${g.eventId}.correct`, display: g.correct ? "correct" : "missed", value: g.correct, evidenceRef: g.refs.final });
  }
  return {
    ok: true, schema: RESULTS_ACCURACY_SCHEMA, contentKind: "results-accuracy",
    date, sport, period: "single day", season, dateLabel, dayName,
    games, correct, total, missed, accuracy, accuracyDisplay, excluded,
    // internal methodology (bundle, docs, captions; not printed on the 1.1 card)
    sampleSize: { days: 1, games: total, note: "one day of results; not a long-term accuracy claim" },
    estimateLabel: ESTIMATE_LABEL, contextLine: CONTEXT_LINE,
    publicLabel: { term: label.term, officialFamilies: label.officialFamilies, retiredPhrases: label.retiredPhrases, source: label.source },
    claims, sources, dataSource: { label: src.label, commit },
  };
}

// ── captions ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** A team's nickname for prose; a nickname with digits ("76ers") is written as its abbreviation so every number stays traceable. */
const nick = (t) => { const n = String(t.name).split(" ").at(-1); return /\d/.test(n) ? t.abbr : n; };
// Beyond the MLB pack's list: no betting talk, no "probability" (founder wording: the Elo number is an estimate).
const EXTRA_FORBIDDEN = ["bet", "betting", "bets", "picks", "odds", "probability", "lock", "locks"];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Two template captions — factual and narrative — built only from the bundle; the miss count and sample size always. */
export function resultsAccuracyCaptions(b) {
  const misses = b.games.filter((g) => !g.correct);
  const gameWord = (n) => `${n} game${n === 1 ? "" : "s"}`;
  const fit = (build) => {
    for (let n = misses.length; n >= 0; n--) { const t = build(n); if (t.length <= MAX_CAPTION_CHARS) return t; }
    return build(0);
  };
  const notGraded = b.excluded.length ? ` ${b.excluded.length} not graded.` : "";
  const tallyLine = `${b.correct} of ${b.total} correct, ${b.missed} missed`;
  const factual = fit((n) => {
    const list = misses.slice(0, n).map((g) => g.predictedWinner).join(", ");
    const named = b.missed ? (n === misses.length ? ` (${list})` : n ? ` (${list} and more)` : "") : "";
    return `NBA predicted winner vs final, ${b.dateLabel}: ${tallyLine}${named}.${notGraded} One day, ${gameWord(b.total)}: not a long-term accuracy claim.`;
  });
  const narrative = fit((n) => {
    const upsets = misses.slice(0, n).map((g) => `${nick(g[g.actualSide])} over ${nick(g[g.predictedSide])}`);
    const missText = !b.missed ? " and missed none." : n === misses.length
      ? ` and missed ${b.missed}: ${upsets.join(", ")}.`
      : ` and missed ${b.missed}${n ? `, including ${upsets.join(", ")}` : ""}.`;
    return `${b.dayName} in the NBA, graded in public: our predicted winner came through in ${b.correct} of ${b.total}${missText}${notGraded} One night, ${gameWord(b.total)}: a small sample, not a long-term accuracy claim.`;
  });
  return [{ id: "A", tone: "factual", text: factual }, { id: "B", tone: "narrative", text: narrative }];
}

/** recap/caption-validator.mjs over this bundle's claims, plus the results-specific rules. */
export function validateResultsAccuracyCaption(text, b) {
  const base = validateCaption(text, b);
  const problems = [...base.problems];
  const plain = String(text).replace(/\bnot betting advice\b/gi, "");
  for (const term of [...FORBIDDEN_TERMS, ...EXTRA_FORBIDDEN]) {
    if (new RegExp(`\\b${escapeRe(term)}\\b`, "i").test(plain) && !problems.some((p) => p.detail === `"${term}"`)) problems.push({ code: "FORBIDDEN_TERM", detail: `"${term}"` });
  }
  if (!new RegExp(`\\b${b.total}\\b`).test(text)) problems.push({ code: "SAMPLE_SIZE_MISSING", detail: `the caption must state the sample size (${b.total} games)` });
  if (b.missed && !new RegExp(`\\b(${b.missed} missed|missed ${b.missed})\\b`, "i").test(text)) {
    problems.push({ code: "MISS_COUNT_MISSING", detail: `the caption must state the miss count plainly ("${b.missed} missed")` });
  }
  return { ok: problems.length === 0, problems };
}
