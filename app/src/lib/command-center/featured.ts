/**
 * FEATURED FORECASTS (P306/P307) — one card per sport from its canonical owner, through the universal contract.
 *
 * Each adapter reads the sport's committed public artifact (the same file its hub reads), applies the sport's own
 * gates (the MLB live-record gate pauses ride through, never around), picks the next pregame event the model has a
 * forecast for, and returns a PredictionCardModel or null with the reason. No adapter invents a "why": the line is
 * the pipeline's own field or it is absent. No adapter invents a tier: only MLB's strength label exists.
 *
 * P319: the CARD BUILDERS are exported (`cardFromMlbPrediction`, `cardFromNflEvent`, `cardFromEplRow`,
 * `cardFromUfcBout`) so a report page saves exactly the card the homepage would feature for that event — one
 * identity, one settlement key, one wording — rather than a second derivation of its own.
 */
import fs from "node:fs";
import path from "node:path";
import { formatEtTime } from "@/lib/mlb/public-provenance";
import { pausedFamiliesFrom, pauseMlbMarkets } from "@/lib/ops/live-record-gate.mjs";
import type { EplForecastRow, EplForecastSet } from "@/lib/sports/epl/forecast-view";
import type { CardSport, ConfidenceSignal, Freshness, ModelStatusItem, PredictionCardModel } from "./contract";

const readJson = (p: string): unknown => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const pct = (v: number) => `${Math.round(v * 100)}%`;
export const lifecycleOf = (startUtc: string | null, nowIso: string): PredictionCardModel["lifecycle"] => {
  const s = Date.parse(startUtc ?? ""), n = Date.parse(nowIso);
  if (!Number.isFinite(s) || !Number.isFinite(n)) return "PREGAME";
  return s > n ? "PREGAME" : "STARTED";
};
const startLabelOf = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
  const t = formatEtTime(iso);
  return t ? `${day} ${t}` : null;
};

export interface FeaturedInput {
  dataRoot: string;
  today: string;
  nowIso: string;
  freshness: Freshness;
  status: ModelStatusItem;
}
/** What a card builder needs beside the sport's own row: the lead status, the freshness and the clock. */
export interface CardContext { status: ModelStatusItem; freshness: Freshness; nowIso: string }

export type Featured = { card: PredictionCardModel | null; reason: string | null };

/* ── MLB: the day's predictions, gated, next pregame game by the model's own probability ─────────────────────── */
export type MlbPrediction = {
  gamePk: number; slug: string; status: string; awayTeam: string; homeTeam: string; awayTeamName: string; homeTeamName: string;
  predictedWinner: { side: "home" | "away"; team: string } | null;
  projectedScore: { away: number; home: number; label: string } | null;
  moneyline: { side: "home" | "away"; team: string; simulationProbability: number; strengthLabel?: string | null } | null;
  total: { line: number | null; pick: string; overProbability: number | null; underProbability: number | null; pausedReason?: string } | null;
  runLine: { pick: string; coverProbability: number } | null;
  pausedReasons?: { moneyline?: string; runLine?: string };
};
/** The MLB card for one gated prediction row (`pauseMlbMarkets` already applied) and its first pitch. */
export function cardFromMlbPrediction(p: MlbPrediction, start: string | null, ctx: CardContext): PredictionCardModel {
  const ml = p.moneyline;
  const winnerPaused = Boolean(p.pausedReasons?.moneyline);
  const risks: string[] = [];
  if (winnerPaused) risks.push("The winner call is paused: its live record is below a coin flip. The projected score stays as evidence.");
  if (p.total?.pausedReason) risks.push("The over/under call is paused: its live record is below a coin flip.");
  if (p.pausedReasons?.runLine) risks.push("The run-line call is paused: its live record is below a coin flip.");
  risks.push("Not validated to out-predict the sportsbook market.");
  const forecast = ml
    ? { label: "Winner", value: `${ml.team} ${pct(ml.simulationProbability)}`, sub: p.projectedScore ? `Projected ${p.awayTeam} ${p.projectedScore.away}–${p.projectedScore.home} ${p.homeTeam}` : null }
    : { label: winnerPaused ? "Winner call paused" : "No winner call", value: p.projectedScore ? `${p.awayTeam} ${p.projectedScore.away}–${p.projectedScore.home} ${p.homeTeam}` : "—", sub: p.projectedScore ? "projected score, from the simulation" : null };
  const signal: ConfidenceSignal = ml
    ? { kind: "SIM_STRENGTH", label: ml.strengthLabel ?? "LEAN", probability: ml.simulationProbability }
    : { kind: "NONE", reason: winnerPaused ? "paused" : "no call" };
  const extras: string[] = [];
  if (p.total && p.total.pick !== "UNAVAILABLE" && p.total.line != null) {
    const prob = p.total.pick === "OVER" ? p.total.overProbability : p.total.underProbability;
    extras.push(`${p.total.pick === "OVER" ? "Over" : "Under"} ${p.total.line}${prob != null ? ` · ${pct(prob)}` : ""}`);
  }
  if (p.runLine) extras.push(`${p.runLine.pick} · ${pct(p.runLine.coverProbability)}`);
  return {
    id: `mlb-${p.gamePk}`, sport: "mlb", href: `/games/mlb/${p.slug}/`, lifecycle: lifecycleOf(start, ctx.nowIso), startUtc: start, startLabel: startLabelOf(start),
    context: extras.length ? extras.join(" · ") : null,
    away: { name: p.awayTeamName, code: p.awayTeam, favoured: ml?.side === "away" }, home: { name: p.homeTeamName, code: p.homeTeam, favoured: ml?.side === "home" },
    forecast, signal, why: ml ? `${ml.team} came out ahead in ${pct(ml.simulationProbability)} of the simulated games.` : null, risks,
    status: ctx.status, freshness: ctx.freshness, result: null,
    settlement: { kind: "mlb-game", gamePk: p.gamePk, family: forecast.label },
  };
}
export function featuredMlb(input: FeaturedInput): Featured {
  const doc = readJson(path.join(input.dataRoot, "mlb", "predictions", `${input.today}.json`)) as { generatedAt?: string; predictions?: MlbPrediction[] } | null;
  if (!doc?.predictions) return { card: null, reason: "No prediction set is published for today's slate yet." };
  const board = readJson(path.join(input.dataRoot, "mlb", "boards", `${input.today}.json`)) as { games?: Array<{ gamePk: number; gameDate?: string }> } | null;
  const firstPitch = new Map((board?.games ?? []).map((g) => [String(g.gamePk), g.gameDate ?? null]));
  const paused = pausedFamiliesFrom(readJson(path.join(input.dataRoot, "admin", "model-health.json")), Date.parse(input.nowIso));
  const candidates = doc.predictions
    .filter((p) => p.status !== "unavailable")
    .map((p) => pauseMlbMarkets(p, paused) as MlbPrediction)
    .map((p) => ({ p, start: firstPitch.get(String(p.gamePk)) ?? null }))
    .filter(({ start }) => lifecycleOf(start, input.nowIso) === "PREGAME")
    .sort((a, b) => (b.p.moneyline?.simulationProbability ?? 0) - (a.p.moneyline?.simulationProbability ?? 0) || String(a.start).localeCompare(String(b.start)));
  const pick = candidates[0];
  if (!pick) return { card: null, reason: doc.predictions.length ? "Every game on today's slate has started; its pre-game reads are frozen in each report." : "No game on today's slate carries a prediction." };
  return { card: cardFromMlbPrediction(pick.p, pick.start, input), reason: null };
}

/* ── NFL: the index's next upcoming forecast ─────────────────────────────────────────────────────────────────── */
export type NflEvent = {
  providerEventId: string; matchup: string; kickoffUtc: string; lifecycle: string; state: string; stateMeaning?: string;
  home: { abbr: string; name: string }; away: { abbr: string; name: string };
  lean?: { gapPp: number; leansTo: string; notAnEdge?: string } | null;
  projectedScore?: { home: number; away: number } | null; winProbability?: { home: number; away: number } | null;
  total?: { median: number; p10: number; p90: number } | null;
};
/** The NFL card for one index event that carries a win probability. */
export function cardFromNflEvent(e: NflEvent, ctx: CardContext & { weekLabel?: string | null }): PredictionCardModel {
  const wp = e.winProbability!;
  const homeFav = wp.home >= wp.away;
  const favAbbr = homeFav ? e.home.abbr : e.away.abbr;
  const favProb = homeFav ? wp.home : wp.away;
  const margin = e.projectedScore ? Math.abs(e.projectedScore.home - e.projectedScore.away) : null;
  const risks = ["Experimental: tested on past seasons, not validated to out-predict the sportsbook market."];
  if (e.total) risks.push(`Game totals miss by a lot: about 8 in 10 land inside the ${e.total.p10}–${e.total.p90} range.`);
  return {
    id: `nfl-${e.providerEventId}`, sport: "nfl", href: `/nfl/game/${e.providerEventId}/`, lifecycle: lifecycleOf(e.kickoffUtc, ctx.nowIso), startUtc: e.kickoffUtc, startLabel: startLabelOf(e.kickoffUtc),
    context: ctx.weekLabel ?? null,
    away: { name: e.away.name, code: e.away.abbr, favoured: !homeFav }, home: { name: e.home.name, code: e.home.abbr, favoured: homeFav },
    forecast: { label: "Winner", value: `${favAbbr} ${pct(favProb)}`, sub: e.projectedScore ? `Projected ${e.away.abbr} ${e.projectedScore.away}–${e.projectedScore.home} ${e.home.abbr}${margin != null ? ` · by ${margin}` : ""}` : null },
    signal: { kind: "PROBABILITY", probability: favProb, of: `${favAbbr} to win` },
    why: e.stateMeaning ?? null, risks,
    status: ctx.status, freshness: ctx.freshness, result: null,
    settlement: { kind: "nfl-event", providerEventId: e.providerEventId, family: "Winner" },
  };
}
export function featuredNfl(input: FeaturedInput & { weekLabel?: string | null }): Featured {
  const index = readJson(path.join(input.dataRoot, "nfl", "index.json")) as { events?: NflEvent[] } | null;
  if (!index?.events) return { card: null, reason: "No NFL forecast set is published." };
  const upcoming = index.events
    .filter((e) => e.winProbability && lifecycleOf(e.kickoffUtc, input.nowIso) === "PREGAME")
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const e = upcoming[0];
  if (!e) return { card: null, reason: index.events.length ? "Every published game has kicked off; the next week's forecasts appear when they publish." : "No game forecast is published yet." };
  return { card: cardFromNflEvent(e, input), reason: null };
}

/* ── EPL: the next fixture with a current pre-event forecast ─────────────────────────────────────────────────── */
/** The EPL card for one forecast row that carries probabilities and both clubs. */
export function cardFromEplRow(r: EplForecastRow, ctx: CardContext): PredictionCardModel {
  const p = r.probs!;
  const homeClub = r.homeClub!, awayClub = r.awayClub!;
  const fav = p.home >= p.away ? "home" : "away";
  const favName = fav === "home" ? homeClub : awayClub;
  const favProb = fav === "home" ? p.home : p.away;
  const risks = ["Its total-goals number follows the league's recent scoring rate, so over 2.5 reads the same for every match."];
  if (r.coldStart?.home || r.coldStart?.away) risks.push("A club here has no rating history yet: it enters at a promoted club's average.");
  if (r.sparseInput?.note) risks.push(r.sparseInput.note);
  if (r.modelOnly) risks.push("No sportsbook price is captured yet, so there is no market beside this number.");
  return {
    id: `epl-${r.eventId}`, sport: "epl", href: r.slug ? `/epl/match/${r.slug}/` : "/epl/", lifecycle: lifecycleOf(r.kickoffUtc, ctx.nowIso), startUtc: r.kickoffUtc, startLabel: startLabelOf(r.kickoffUtc),
    context: r.matchweek ? `Matchweek ${r.matchweek}` : null,
    away: { name: awayClub, code: awayClub, favoured: fav === "away" }, home: { name: homeClub, code: homeClub, favoured: fav === "home" },
    forecast: { label: "Match result", value: `${favName} ${pct(favProb)}`, sub: `Draw ${pct(p.draw)} · ${fav === "home" ? awayClub : homeClub} ${pct(fav === "home" ? p.away : p.home)}${r.expectedGoals != null ? ` · ${r.expectedGoals.toFixed(1)} goals expected` : ""}` },
    signal: { kind: "PROBABILITY", probability: favProb, of: `${favName} to win` },
    why: null, risks,
    status: ctx.status, freshness: ctx.freshness, result: null,
    settlement: { kind: "epl-event", eventId: r.eventId, family: "Match result" },
  };
}
export function featuredEpl(input: FeaturedInput & { set: EplForecastSet | null }): Featured {
  const set = input.set;
  if (!set) return { card: null, reason: "The Premier League forecast set could not be read." };
  const rows = set.rows
    /* The product-day owner counts CURRENT_PRE_EVENT rows only; the lane features what the owner counts, so the
       chip and the card can never disagree (a model-only fixture is on the hub, reachable, not featured). */
    .filter((r) => r.probs && r.state === "CURRENT_PRE_EVENT" && lifecycleOf(r.kickoffUtc, input.nowIso) === "PREGAME")
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const r = rows[0];
  if (!r || !r.probs || !r.homeClub || !r.awayClub) return { card: null, reason: set.rows.length ? "Every forecast fixture has kicked off; the next matchweek appears when its forecasts publish." : "No fixture carries a current forecast yet." };
  return { card: cardFromEplRow(r, input), reason: null };
}

/* ── UFC: the card's main event with a model read ───────────────────────────────────────────────────────────── */
export type UfcBout = { boutId: string; titleFight?: boolean; startUtc?: string | null; weightClass?: string | null; red: { name: string }; blue: { name: string }; prediction: { winner: { name: string; probability: number } | null; method?: { most?: string; probabilities?: Record<string, number> } | null; rounds?: { endsIn?: string } | null; reason?: string | null } | null; unmodelledReason?: string | null };
export type UfcCardDoc = { event?: { name?: string; startUtc?: string; boutCount?: number }; bouts?: UfcBout[] };
/** The UFC card for one bout the model read, on the card it belongs to. */
export function cardFromUfcBout(main: UfcBout, card: UfcCardDoc, ctx: CardContext): PredictionCardModel {
  const start = main.startUtc ?? card.event?.startUtc ?? null;
  const w = main.prediction!.winner!;
  const method = main.prediction!.method?.most;
  const risks = ["Fight outcomes are high-variance: one clean strike changes everything."];
  if (main.unmodelledReason) risks.push(main.unmodelledReason);
  return {
    id: `ufc-${main.boutId}`, sport: "ufc", href: `/ufc/bout/${main.boutId}/`, lifecycle: lifecycleOf(start, ctx.nowIso), startUtc: start, startLabel: startLabelOf(start),
    context: [card.event?.name ?? null, main.titleFight ? "title fight" : "main card"].filter(Boolean).join(" · ") || null,
    away: { name: main.red.name, code: null, favoured: w.name === main.red.name }, home: { name: main.blue.name, code: null, favoured: w.name === main.blue.name },
    forecast: { label: "Winner", value: `${w.name} ${pct(w.probability)}`, sub: method ? `Most likely by ${method === "DEC" ? "decision" : method === "KO" ? "knockout" : method === "SUB" ? "submission" : method.toLowerCase()}${main.prediction!.rounds?.endsIn ? ` · round ${main.prediction!.rounds.endsIn}` : ""}` : null },
    signal: { kind: "PROBABILITY", probability: w.probability, of: `${w.name} to win` },
    why: main.prediction!.reason ?? null, risks,
    status: ctx.status, freshness: ctx.freshness, result: null,
    settlement: { kind: "ufc-bout", date: String(start ?? "").slice(0, 10), red: main.red.name, blue: main.blue.name },
  };
}
export function featuredUfc(input: FeaturedInput & { card: UfcCardDoc | null }): Featured {
  const card = input.card;
  if (!card?.bouts) return { card: null, reason: "No UFC card is published." };
  const modelled = card.bouts.filter((b) => b.prediction?.winner);
  const main = modelled.find((b) => b.titleFight) ?? modelled[modelled.length - 1];
  if (!main) return { card: null, reason: card.bouts.length ? "The card is published without a model read: no bout has enough fighter history." : "No bout is listed yet." };
  const start = main.startUtc ?? card.event?.startUtc ?? null;
  if (lifecycleOf(start, input.nowIso) !== "PREGAME") return { card: null, reason: "The card has started; each bout's pre-fight read is frozen on the card page." };
  return { card: cardFromUfcBout(main, card, input), reason: null };
}

export const FEATURED_SPORTS: CardSport[] = ["nfl", "mlb", "epl", "ufc"];
