/**
 * MODEL STATUS (P309) — the research discipline, in reader words, from the artifacts that hold it.
 *
 * Sources, all read at build time and mapped to the public vocabulary in contract.ts:
 *   health scorecard   public/data/admin/model-health.json (P303): INSUFFICIENT_SAMPLE / HOLDING / WATCH / BREACHED
 *                      per graded family; a BREACHED MLB game family is PAUSED because the live-record gate pauses it
 *   NFL                public/data/nfl/model-status.json (teamSimulation.state PUBLIC_EXPERIMENTAL …)
 *   EPL                the public forecast set's `validation` + the blind forward receipt (data/internal, read here
 *                      the way /ops reads it — state only, never a path or a figure the page did not earn)
 *   UFC                the card artifact's `model.verdicts` (the backtest) beside the live record
 * Nothing here decides what publishes. It reports. The gates that act live in their own modules.
 */
import fs from "node:fs";
import path from "node:path";
import { pausedFamiliesFrom, runLinePaused, MLB_RUN_LINE_POSTED_FAMILY } from "@/lib/ops/live-record-gate.mjs";
import type { CardSport, ModelStatusItem, PublicModelState } from "./contract";

type HealthFamily = { id: string; sport: string; state: string; n: number; baseline?: string; judgement?: { receiptState?: string; needed?: number | null; watch?: boolean | null; meanDiff?: number | null; lo95?: number | null; hi95?: number | null } | null; context?: { hitRate?: number | null; meanPickProbability?: number | null } | null };
type Health = { generatedAt: string; families: HealthFamily[] } | null;

const readJson = (p: string): unknown => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const pct = (v: number | null | undefined) => (typeof v === "number" ? `${Math.round(v * 100)}%` : null);

export interface StatusContext {
  dataRoot: string;
  repoRoot: string;
  nowIso: string;
  /** EPL forecast-set validation, passed in by the caller that already loaded the set (the lane loader). */
  eplValidation?: string | null;
  /** UFC card model verdicts, passed in by the caller that loaded the card. */
  ufcVerdicts?: Record<string, string> | null;
}

function healthState(f: HealthFamily | undefined, paused: Set<string>): PublicModelState {
  if (!f) return "UNKNOWN";
  if (f.state === "BREACHED") return paused.has(f.id) ? "PAUSED" : "WATCH";
  if (f.state === "WATCH") return "WATCH";
  if (f.state === "HOLDING") return "HOLDING";
  return "TOO_EARLY";
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(3)}`;

/**
 * GTP-22 (2026-10-14) — THE MEASURE IS NAMED. "Watch · slightly behind a coin flip" left a reader to guess
 * behind on WHAT, and the only number beside it was a hit rate, which is not what the verdict is judged on.
 * Where the scorecard judges on log loss against a stated baseline with a 95% interval, the sentence says
 * so with the numbers: model vs baseline, the difference, the interval, and — when the interval spans zero —
 * that the two cannot yet be told apart. "Better than" is said only when the whole interval is below zero.
 */
export function logLossVerdict(f: HealthFamily | undefined, floor: string): string | null {
  const j = f?.judgement;
  const base = Number(/log loss ([0-9.]+)/.exec(f?.baseline ?? "")?.[1]);
  if (!f || !j || !Number.isFinite(base) || ![j.meanDiff, j.lo95, j.hi95].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const d = j.meanDiff as number, lo = j.lo95 as number, hi = j.hi95 as number;
  const interval = `95% interval ${signed(lo)} to ${signed(hi)}`;
  const reading = lo <= 0 && hi >= 0
    ? `The interval includes zero, so this call cannot yet be told apart from ${floor}.`
    : d > 0 ? `The whole interval is above zero: worse than ${floor} on this measure.` : `The whole interval is below zero: better than ${floor} on this measure.`;
  return `Measured by log loss (lower is better) over ${f.n} graded: ${(base + d).toFixed(3)} for this call against ${base.toFixed(3)} for ${floor}, a difference of ${signed(d)} (${interval}). ${reading}`;
}

/**
 * GTP-22 review fix: a WATCH headline must agree with its own detail line. `healthState` reports a BREACHED
 * family as WATCH whenever the gate is not pausing it (a stale scorecard, or a family the gate does not
 * cover) — and "not yet distinguishable" above "the whole interval is above zero: worse" is a contradiction.
 * The headline reads the same interval the detail does.
 */
export function watchHeadline(f: HealthFamily | undefined, floor: string): string {
  const lo = f?.judgement?.lo95;
  if (f?.state === "BREACHED" || (typeof lo === "number" && lo > 0)) return `Watch · clearly behind ${floor}, not paused`;
  return `Watch · not yet distinguishable from ${floor}`;
}

function liveRecordDetail(f: HealthFamily | undefined, floor: string): string {
  if (!f) return "The health scorecard could not be read at build time.";
  const n = f.n ?? 0;
  const hit = pct(f.context?.hitRate);
  const shown = pct(f.context?.meanPickProbability);
  const record = hit && shown ? ` For context only (not the measure judged): its picks have landed ${hit} of the time while showing about ${shown}.` : "";
  if (f.state === "INSUFFICIENT_SAMPLE") return `${n} graded so far — not yet enough to judge against ${floor}.`;
  const measured = logLossVerdict(f, floor);
  if (measured) return `${measured}${record}`;
  if (f.state === "BREACHED") return `Over ${n} graded, this call has done worse than ${floor} by a clear margin.${record}`;
  if (f.state === "WATCH") return `Over ${n} graded, this call is slightly behind ${floor}, not yet by enough to be sure.${record}`;
  return `Over ${n} graded, this call has held up against ${floor}.${record}`;
}

const item = (id: string, family: string, state: PublicModelState, headline: string, detail: string, n: number | null, source: string): ModelStatusItem => ({ id, family, state, headline, detail, n, source });

/** The status items a sport's lane shows, most decision-relevant first (at most three). */
export function modelStatusFor(sport: CardSport, ctx: StatusContext): ModelStatusItem[] {
  const health = readJson(path.join(ctx.dataRoot, "admin", "model-health.json")) as Health;
  const fam = (id: string) => health?.families?.find((f) => f.id === id);
  const paused = pausedFamiliesFrom(health, Date.parse(ctx.nowIso));
  const HEALTH = "admin/model-health.json";

  if (sport === "mlb") {
    const rows: Array<[string, string, string]> = [["mlb_moneyline", "Winner calls", "a coin flip"], ["mlb_total", "Game totals", "a coin flip"], ["mlb_run_line_posted", "Run line calls (posted line)", "a coin flip"]];
    // TRUTH-001: run-line calls are now made at the sportsbook's posted line (decision engine v2), a new family
    // with its own record. The retired v1 record (`mlb_run_line`) is not this call's record and is not shown here.
    return rows.map(([id, family, floor]) => {
      // The posted-line family has no scorecard row until its first graded call: that is "0 graded", not an
      // unreadable scorecard. It never borrows the retired v1 record's numbers.
      const f = fam(id) ?? (id === MLB_RUN_LINE_POSTED_FAMILY && health ? { id, state: "INSUFFICIENT_SAMPLE", n: 0 } as HealthFamily : undefined);
      // …but it DOES inherit v1's restrictions (live-record-gate POSTED_RUN_LINE_INHERITS_V1_RESTRICTIONS).
      const inheritedHold = id === MLB_RUN_LINE_POSTED_FAMILY && runLinePaused({ basis: "POSTED_LINE" }, paused) && !paused.has(id);
      const state = inheritedHold ? "PAUSED" : healthState(f, paused);
      const headline = inheritedHold ? "Paused · held by the earlier run-line record" : state === "PAUSED" ? "Paused · below a coin flip" : state === "WATCH" ? watchHeadline(f, "a coin flip") : state === "HOLDING" ? "Holding its record" : state === "TOO_EARLY" ? "Too early to judge" : "Status unknown";
      const detail = inheritedHold
        ? `The earlier run-line call's record is below ${floor}, and posted-line calls stay held with it until their own record justifies showing them. ${liveRecordDetail(f, floor)}`
        : liveRecordDetail(f, floor);
      return item(id, family, state, headline, detail, f?.n ?? null, HEALTH);
    });
  }

  if (sport === "nfl") {
    const ms = readJson(path.join(ctx.dataRoot, "nfl", "model-status.json")) as { teamSimulation?: { state?: string; headline?: string; detail?: string } } | null;
    const team = ms?.teamSimulation;
    const teamState: PublicModelState = team?.state === "PUBLIC_EXPERIMENTAL" ? "EXPERIMENTAL" : team?.state === "VALIDATED" ? "VALIDATED" : team ? "EXPERIMENTAL" : "UNKNOWN";
    const forward = (health?.families ?? []).filter((f) => f.id.startsWith("nfl_forward_"));
    const fwdBreached = forward.some((f) => f.state === "BREACHED");
    const fwdHolding = forward.length > 0 && forward.every((f) => f.state === "HOLDING");
    /* RESULTS INTEGRITY (2026-10-17): a SUM over families — a player-game forecast in five families counts five
       times — so it is labelled as forecasts, never as player-games (was "3104 player-games graded so far"). */
    const fwdN = forward.reduce((a, f) => a + (f.n ?? 0), 0);
    const td = fam("nfl_anytime_td");
    return [
      item("nfl_team", "Game forecasts", teamState, team?.headline ? "Experimental · tested on past seasons" : "Status unknown",
        (team?.detail ?? "The NFL model-status artifact could not be read at build time.").replace(/beat the sportsbook market/g, "out-predict the sportsbook market"), null, "nfl/model-status.json"),
      item("nfl_player_forward", "Player ranges", forward.length ? (fwdBreached ? "PAUSED" : fwdHolding ? "HOLDING" : "FORWARD_TEST") : "UNKNOWN",
        forward.length ? (fwdBreached ? "A family fell back to the previous rule" : fwdHolding ? "Holding in the forward test" : "Blind forward test running") : "Status unknown",
        forward.length
          ? `Receptions, yards and touchdown chances are graded week by week against preregistered bars; a family that breaches them falls back to the previous rule automatically. ${fwdN} forecasts graded so far across ${forward.length} families (one player-game is graded once in each family it was forecast in, so this is not a count of player-games).`
          : "The forward receipt could not be read at build time.", fwdN || null, HEALTH),
      item("nfl_anytime_td", "Touchdown chances", healthState(td, paused), td ? (td.state === "HOLDING" ? "Expected scorers match actual" : td.state === "INSUFFICIENT_SAMPLE" ? "Too early to judge" : "Watch · scorers off expectation") : "Status unknown",
        td ? liveRecordDetail(td, "its own expected-scorer count") : "The health scorecard could not be read at build time.", td?.n ?? null, HEALTH),
    ];
  }

  if (sport === "epl") {
    const validated = ctx.eplValidation === "VALIDATED_OUT_OF_SAMPLE_HISTORY";
    const receipt = readJson(path.join(ctx.repoRoot, "data", "internal", "research", "epl", "forward", "receipt.json")) as { state?: string; watch?: boolean; n?: number; needed?: number } | null;
    const fwdState: PublicModelState = !receipt ? "UNKNOWN" : receipt.state === "FORWARD_BREACHED" ? "PAUSED" : receipt.state === "FORWARD_HOLDING" ? (receipt.watch ? "WATCH" : "HOLDING") : "FORWARD_TEST";
    const live = fam("epl_result");
    return [
      item("epl_match_model", "Match model", validated ? "VALIDATED" : "EXPERIMENTAL", validated ? "Tested blind on nine past seasons" : "Not validated out of sample",
        validated
          /* Numbers from data/internal/research/epl/reports/epl-history-replay-evaluation.json (P304, frozen); the claim
             stands because its preregistered season-bootstrap interval excludes zero (pinned by claims-wording.test). */
          ? "Scored on 3,420 Premier League matches from seasons it was never fit on: log loss 0.974, against 0.983 for a plain rating system and 0.994 for the previous model (lower is better). The gain over the rating system held in a season bootstrap (95% interval −0.018 to −0.001 per match). Its totals follow the league's recent scoring rate, so over-2.5 is the same for every match."
          : "The live model was fit and judged on recent seasons only; no blind historical test backs it.", null, "soccer/epl/forecasts/latest.json"),
      item("epl_forward", "Forward test", fwdState, !receipt ? "Status unknown" : fwdState === "FORWARD_TEST" ? `Forward test · ${receipt.n ?? 0} of ${receipt.needed ?? 60} matches` : fwdState === "PAUSED" ? "Previous model publishing again" : fwdState === "WATCH" ? "Watch · behind the model it replaced" : "Holding against the model it replaced",
        receipt ? `Every graded match scores the live model beside the one it replaced. A verdict needs ${receipt.needed ?? 60} matches; ${receipt.n ?? 0} are in.` : "The forward receipt could not be read at build time.", receipt?.n ?? null, "epl/forward/receipt.json"),
      item("epl_result", "Live record", healthState(live, paused), live ? (live.state === "INSUFFICIENT_SAMPLE" ? "Too early to judge" : live.state === "HOLDING" ? "Holding against even odds" : watchHeadline(live, "even odds")) : "Status unknown",
        live ? liveRecordDetail(live, "even odds") : "The health scorecard could not be read at build time.", live?.n ?? null, HEALTH),
    ];
  }

  // ufc
  const verdicts = ctx.ufcVerdicts ?? null;
  const passed = verdicts ? Object.values(verdicts).every((v) => v === "PASS") : null;
  /*
   * Launch audit (2026-10-13, founder-approved wording fix): this said the heads "each beat their baseline". The card's
   * own evidence is POINT estimates against simple baselines (a coin flip, method and round base rates) with no
   * uncertainty interval — not a claim this site makes without one. The numbers are stated instead, read from the
   * card's evidence block so they never drift from it.
   */
  type Head = { logLoss?: number; baselineLogLoss?: number };
  const ev = (readJson(path.join(ctx.dataRoot, "ufc", "card-latest.json")) as { model?: { evidence?: { heldOutFights?: number; winner?: Head; method?: Head; round?: Head } } } | null)?.model?.evidence ?? null;
  const ll = (h?: Head) => (h && Number.isFinite(h.logLoss) && Number.isFinite(h.baselineLogLoss) ? `${(h.logLoss as number).toFixed(3)} against ${(h.baselineLogLoss as number).toFixed(3)}` : null);
  const ufcEvidence = ev && ll(ev.winner) && ll(ev.method) && ll(ev.round)
    ? `On ${ev.heldOutFights?.toLocaleString("en-US") ?? "held-out"} fights held out of the fit, log loss (lower is better) was ${ll(ev.winner)} for a coin flip on the winner, ${ll(ev.method)} for the method base rate and ${ll(ev.round)} for the round base rate. These are point estimates against simple baselines, with no uncertainty interval, and they are not a comparison with sportsbook prices.`
    : "Each head cleared its preregistered bar on fights held out of the fit. The bars are against simple baselines, not sportsbook prices.";
  const live = fam("ufc_winner");
  return [
    item("ufc_model", "Fight model", passed == null ? "UNKNOWN" : passed ? "VALIDATED" : "EXPERIMENTAL", passed == null ? "Status unknown" : passed ? "Backtest passed on held-out fights" : "Backtest did not clear its bars",
      passed == null ? "The card artifact carries no model verdicts." : passed ? ufcEvidence : "One or more heads missed their preregistered bar; see the card for which.", null, "ufc/card-latest.json"),
    item("ufc_winner", "Live record", healthState(live, paused), live ? (live.state === "INSUFFICIENT_SAMPLE" ? "Too early to judge" : live.state === "HOLDING" ? "Holding against a coin flip" : watchHeadline(live, "a coin flip")) : "Status unknown",
      live ? liveRecordDetail(live, "a coin flip") : "The health scorecard could not be read at build time.", live?.n ?? null, HEALTH),
  ];
}
