/**
 * LEG POOL · NFL OFFICIAL GAME FORECAST READER (draft for Level A). Node-only, read-only.
 *
 * Source: app/public/data/nfl/forecasts/<generation date>.json (`nfl-regular-season-public-v1`, PUBLIC_DERIVED), the
 * forecast the NFL game pages publish. Each game: `sideDecision.publishedSide` (HOME/AWAY, rule MODEL_FAVORED_V1,
 * `frozenAt`), `forecastSummary.winProbability` { home, away, tieMass } and `kickoffUtc`. Copied verbatim; no sportsbook
 * field is read; nothing is re-derived.
 *
 * TWO RULES ARE THE FOUNDER'S AND ARE NOT DECIDED HERE (Program Director, 2026-11-03). Each is a switch that stays
 * PENDING until a decision names a value; while EITHER is pending every NFL leg is refused with RULE_PENDING:<name>, so
 * the pool reports exactly what NFL would contribute and no NFL card is ever built.
 *   NFL_FORECAST_OF_RECORD   which generation is THE forecast a card uses. Files regenerate on most days until kickoff
 *                            (11-03 17:08Z covers kickoffs 11-06…11-10). Candidates:
 *                              "AS_OF_EVALUATION"  the newest file generated at or before the card's evaluation instant
 *                              "LAST_BEFORE_KICKOFF" the newest file generated before each game's kickoff (the game pages'
 *                                                  archived forecast) — not knowable when a morning card is frozen
 *                            The reader implements AS_OF_EVALUATION's selection (`nflForecastAsOf`) because that is the
 *                            only one a frozen morning card can read; adopting it is still the founder's call.
 *   NFL_TIE_RULE             how a tie (tieMass ≈ 2.9 % per game) grades a "winner" leg: "LOSS" (consistent with the
 *                            published P(win), which excludes the tie) or "VOID" (the leg drops out of the card).
 *                            `gradeNflWinner` implements both; PENDING grades nothing.
 * The registry's Level A row for NFL is also still CLOSED (sport-capability-registry.ts); opening it is the same decision.
 *
 * AVAILABILITY. The model does not consume team inputs (`teamInputs.consumedByModel:false`). A leg is `review` when the
 * favoured side's `teamInputs.state` is anything but NO_STARTING_QB_ABSENCE (a starting-QB absence, or UNKNOWN: no
 * readable depth chart) — the NBA rotation flag's analogue, shown on the leg and excluded from Bank Builder (rule A).
 */
import fs from "node:fs";
import path from "node:path";
import { levelALeg, productDayOf } from "../level-a/suggestions.mjs";

export const NFL_PENDING = "PENDING";
export const NFL_FORECAST_OF_RECORD = NFL_PENDING; // "AS_OF_EVALUATION" | "LAST_BEFORE_KICKOFF" — founder decision
export const NFL_TIE_RULE = NFL_PENDING; // "LOSS" | "VOID" — founder decision
export const NFL_OWNER = "nfl-regular-season-public-v1 public forecast";
const CLEAR_QB = "NO_STARTING_QB_ABSENCE";

export const NFL_FLAG_TEXT = Object.freeze({
  NFL_QB_ABSENCE: "The favoured team's starting quarterback is listed absent; the model does not account for it.",
  NFL_AVAILABILITY_UNKNOWN: "No readable depth chart for the favoured team, so a starting-quarterback absence cannot be ruled out.",
});

/** The newest forecast file generated at or before `asOf` (AS_OF_EVALUATION selection), with its repo path. */
export function nflForecastAsOf({ repoRoot, asOf }) {
  const rel = "app/public/data/nfl/forecasts";
  let best = null;
  let files = [];
  try { files = fs.readdirSync(path.join(repoRoot, rel)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return null; }
  for (const f of files) {
    let doc; try { doc = JSON.parse(fs.readFileSync(path.join(repoRoot, rel, f), "utf8")); } catch { continue; }
    const at = Date.parse(doc?.generatedAt ?? "");
    if (Number.isFinite(at) && at <= Date.parse(asOf) && (!best || at > best.at)) best = { at, doc, file: `${rel}/${f}` };
  }
  return best;
}

/** The forecast's own games for one ET product day, as Level A ForecastSelections. */
export function nflSelections({ doc, file, date }) {
  const out = [];
  for (const g of doc?.forecasts ?? []) {
    if (productDayOf(g.kickoffUtc) !== date) continue;
    const pub = g.sideDecision?.publishedSide;
    const side = pub === "HOME" ? "home" : pub === "AWAY" ? "away" : null;
    const wp = g.forecastSummary?.winProbability ?? {};
    out.push({
      sport: "nfl", eventId: String(g.providerEventId), eventLabel: g.matchup ?? `${g.away?.abbr} @ ${g.home?.abbr}`, startUtc: g.kickoffUtc, market: "winner",
      selection: side ? { code: side, label: `${g[side]?.abbr} (official side)`, teamAbbr: g[side]?.abbr ?? null } : null,
      probability: side && typeof wp[side] === "number" ? wp[side] : null,
      forecast: { owner: NFL_OWNER, modelId: doc.model?.id ?? g.model?.id ?? null, stampedAt: g.sideDecision?.frozenAt ?? g.generatedAt ?? doc.generatedAt, ref: `${file}#${g.providerEventId}` },
      uncertainty: { kind: "win-probability-with-tie", home: wp.home ?? null, away: wp.away ?? null, tieMass: wp.tieMass ?? null },
      teamInputsState: side ? (g.teamInputs?.state ?? "UNKNOWN") : null,
      settlement: { grader: "nfl-official-final", market: "moneyline", side, tieRule: NFL_TIE_RULE },
    });
  }
  return out;
}

/**
 * NFL candidate legs for the pool. Each runs the Level A leg gates; the registry (CLOSED) and the two pending rules are
 * added as refusal reasons, so `wouldQualify` counts the legs that fail ONLY on those decisions.
 */
export function nflPoolCandidates({ repoRoot, date, evaluatedAt, rules = { forecastOfRecord: NFL_FORECAST_OF_RECORD, tieRule: NFL_TIE_RULE }, source = null }) {
  const src = source ?? nflForecastAsOf({ repoRoot, asOf: evaluatedAt });
  if (!src) return { input: null, legs: [], refused: [], wouldQualify: 0, rules };
  const pending = [rules.forecastOfRecord === NFL_PENDING ? "RULE_PENDING:FORECAST_OF_RECORD" : null, rules.tieRule === NFL_PENDING ? "RULE_PENDING:TIE_RULE" : null].filter(Boolean);
  const legs = []; const refused = [];
  let wouldQualify = 0;
  for (const sel of nflSelections({ doc: src.doc, file: src.file, date })) {
    const r = levelALeg(sel, { now: evaluatedAt, productDay: date });
    const gate = r.ok ? [] : r.refusal.reasons;
    const decisionOnly = gate.every((x) => x === "SPORT_CLOSED");
    if (decisionOnly) wouldQualify += 1;
    const flags = sel.teamInputsState == null || sel.teamInputsState === CLEAR_QB ? [] : [sel.teamInputsState === "UNKNOWN" ? "NFL_AVAILABILITY_UNKNOWN" : "NFL_QB_ABSENCE"];
    const reasons = [...gate, ...pending];
    const row = {
      legId: `nfl:${sel.eventId}:winner`, sport: "nfl", eventId: sel.eventId, eventLabel: sel.eventLabel, startUtc: sel.startUtc, market: "winner",
      selection: sel.selection, status: "MODEL_ONLY", probability: sel.probability,
      probabilityShown: typeof sel.probability === "number" ? `${(sel.probability * 100).toFixed(1)}%` : null,
      tieMass: sel.uncertainty.tieMass, forecast: sel.forecast,
      guard: { state: flags.length ? "review" : "pass", flags, flagText: flags.map((f) => NFL_FLAG_TEXT[f]) },
    };
    if (reasons.length) refused.push({ ...row, reasons, text: reasons });
    else legs.push(row);
  }
  return { input: { sport: "nfl", file: src.file, generatedAt: src.doc.generatedAt }, legs, refused, wouldQualify, rules };
}

/** Grade one NFL winner leg against an official final, under a decided tie rule (PENDING grades nothing). */
export function gradeNflWinner(leg, final, tieRule = NFL_TIE_RULE) {
  if (!final || final.state !== "FINAL") return { legId: leg.legId, state: "PENDING" };
  if (final.homeScore === final.awayScore) {
    if (tieRule === "LOSS") return { legId: leg.legId, state: "LOSS", tie: true };
    if (tieRule === "VOID") return { legId: leg.legId, state: "VOID", tie: true };
    return { legId: leg.legId, state: "PENDING_RULE", tie: true };
  }
  const winner = final.homeScore > final.awayScore ? "home" : "away";
  return { legId: leg.legId, state: winner === leg.selection?.code ? "WIN" : "LOSS" };
}
