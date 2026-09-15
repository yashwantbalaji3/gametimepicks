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
import { pausedFamiliesFrom } from "@/lib/ops/live-record-gate.mjs";
import type { CardSport, ModelStatusItem, PublicModelState } from "./contract";

type HealthFamily = { id: string; sport: string; state: string; n: number; judgement?: { receiptState?: string; needed?: number | null; watch?: boolean | null } | null; context?: { hitRate?: number | null; meanPickProbability?: number | null } | null };
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

function liveRecordDetail(f: HealthFamily | undefined, floor: string): string {
  if (!f) return "The health scorecard could not be read at build time.";
  const n = f.n ?? 0;
  const hit = pct(f.context?.hitRate);
  const shown = pct(f.context?.meanPickProbability);
  const record = hit && shown ? ` It has landed ${hit} of the time while showing about ${shown}.` : "";
  if (f.state === "INSUFFICIENT_SAMPLE") return `${n} graded so far — not yet enough to judge against ${floor}.`;
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
    const rows: Array<[string, string, string]> = [["mlb_moneyline", "Winner calls", "a coin flip"], ["mlb_total", "Game totals", "a coin flip"], ["mlb_run_line", "Run line calls", "a coin flip"]];
    return rows.map(([id, family, floor]) => {
      const f = fam(id);
      const state = healthState(f, paused);
      const headline = state === "PAUSED" ? "Paused · below a coin flip" : state === "WATCH" ? "Watch · slightly behind" : state === "HOLDING" ? "Holding its record" : state === "TOO_EARLY" ? "Too early to judge" : "Status unknown";
      return item(id, family, state, headline, liveRecordDetail(f, floor), f?.n ?? null, HEALTH);
    });
  }

  if (sport === "nfl") {
    const ms = readJson(path.join(ctx.dataRoot, "nfl", "model-status.json")) as { teamSimulation?: { state?: string; headline?: string; detail?: string } } | null;
    const team = ms?.teamSimulation;
    const teamState: PublicModelState = team?.state === "PUBLIC_EXPERIMENTAL" ? "EXPERIMENTAL" : team?.state === "VALIDATED" ? "VALIDATED" : team ? "EXPERIMENTAL" : "UNKNOWN";
    const forward = (health?.families ?? []).filter((f) => f.id.startsWith("nfl_forward_"));
    const fwdBreached = forward.some((f) => f.state === "BREACHED");
    const fwdHolding = forward.length > 0 && forward.every((f) => f.state === "HOLDING");
    const fwdN = forward.reduce((a, f) => a + (f.n ?? 0), 0);
    const td = fam("nfl_anytime_td");
    return [
      item("nfl_team", "Game forecasts", teamState, team?.headline ? "Experimental · tested on past seasons" : "Status unknown",
        (team?.detail ?? "The NFL model-status artifact could not be read at build time.").replace(/beat the sportsbook market/g, "out-predict the sportsbook market"), null, "nfl/model-status.json"),
      item("nfl_player_forward", "Player ranges", forward.length ? (fwdBreached ? "PAUSED" : fwdHolding ? "HOLDING" : "FORWARD_TEST") : "UNKNOWN",
        forward.length ? (fwdBreached ? "A family fell back to the previous rule" : fwdHolding ? "Holding in the forward test" : "Blind forward test running") : "Status unknown",
        forward.length
          ? `Receptions, yards and touchdown chances are graded week by week against preregistered bars; a family that breaches them falls back to the previous rule automatically. ${fwdN} player-games graded so far.`
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
          ? "Scored on 3,420 Premier League matches from seasons it was never fit on, where it beat the previous model and a plain rating system. Its totals follow the league's recent scoring rate, so over-2.5 is the same for every match."
          : "The live model was fit and judged on recent seasons only; no blind historical test backs it.", null, "soccer/epl/forecasts/latest.json"),
      item("epl_forward", "Forward test", fwdState, !receipt ? "Status unknown" : fwdState === "FORWARD_TEST" ? `Forward test · ${receipt.n ?? 0} of ${receipt.needed ?? 60} matches` : fwdState === "PAUSED" ? "Previous model publishing again" : fwdState === "WATCH" ? "Watch · behind the model it replaced" : "Holding against the model it replaced",
        receipt ? `Every graded match scores the live model beside the one it replaced. A verdict needs ${receipt.needed ?? 60} matches; ${receipt.n ?? 0} are in.` : "The forward receipt could not be read at build time.", receipt?.n ?? null, "epl/forward/receipt.json"),
      item("epl_result", "Live record", healthState(live, paused), live ? (live.state === "INSUFFICIENT_SAMPLE" ? "Too early to judge" : live.state === "HOLDING" ? "Holding against even odds" : "Watch · behind even odds") : "Status unknown",
        live ? liveRecordDetail(live, "even odds") : "The health scorecard could not be read at build time.", live?.n ?? null, HEALTH),
    ];
  }

  // ufc
  const verdicts = ctx.ufcVerdicts ?? null;
  const passed = verdicts ? Object.values(verdicts).every((v) => v === "PASS") : null;
  const live = fam("ufc_winner");
  return [
    item("ufc_model", "Fight model", passed == null ? "UNKNOWN" : passed ? "VALIDATED" : "EXPERIMENTAL", passed == null ? "Status unknown" : passed ? "Backtest passed on held-out fights" : "Backtest did not clear its bars",
      passed == null ? "The card artifact carries no model verdicts." : passed ? "Winner, method and round heads each beat their baseline on fights held out of the fit." : "One or more heads missed their preregistered bar; see the card for which.", null, "ufc/card-latest.json"),
    item("ufc_winner", "Live record", healthState(live, paused), live ? (live.state === "INSUFFICIENT_SAMPLE" ? "Too early to judge" : live.state === "HOLDING" ? "Holding against a coin flip" : "Watch · behind a coin flip") : "Status unknown",
      live ? liveRecordDetail(live, "a coin flip") : "The health scorecard could not be read at build time.", live?.n ?? null, HEALTH),
  ];
}
