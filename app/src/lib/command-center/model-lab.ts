/**
 * MODEL LAB (P312) — the research discipline as a public page, built from the receipts that hold it.
 *
 * Three lists, every line derived at build time so the page cannot go stale on its own:
 *   live         each sport's model families and their public status (lib/command-center/model-status.ts)
 *   experiments  what is being tested and what is research only — blind forward tests and private shadows, with
 *                their own states mapped to the public vocabulary; a research candidate is never described as
 *                powering a public number
 *   decisions    what the receipts decided, most recent first: adopted, rejected, second look, estimate, paused
 * Anything a receipt does not say is absent, never assumed.
 */
import fs from "node:fs";
import path from "node:path";
import { loadEplForecasts } from "@/lib/sports/epl/forecast-view";
import type { CardSport, ModelStatusItem, PublicModelState } from "./contract";
import { modelStatusFor } from "./model-status";

const readJson = (p: string): unknown => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export interface LabExperiment {
  id: string;
  sport: CardSport;
  label: string;
  kind: "FORWARD_TEST" | "SHADOW";
  state: PublicModelState;
  headline: string;
  detail: string;
  n: number | null;
  needed: number | null;
}

export interface LabDecision {
  when: string;            // ISO date of the receipt
  sport: CardSport;
  outcome: "ADOPTED" | "REJECTED" | "SECOND_LOOK" | "ESTIMATE" | "PAUSED" | "SHADOW";
  what: string;
  detail: string;
}

export interface ModelLab {
  generatedAt: string;
  live: Array<{ sport: CardSport; label: string; items: ModelStatusItem[] }>;
  experiments: LabExperiment[];
  decisions: LabDecision[];
}

const FAMILY_LABEL: Record<string, string> = { player_receptions: "receptions", player_reception_yds: "receiving yards", player_rush_yds: "rushing yards", player_pass_yds: "passing yards", anytime_td: "touchdown chances" };
const dateOf = (iso: string | undefined | null) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 10) : "unknown date");

export function buildModelLab({ dataRoot, repoRoot, nowIso }: { dataRoot: string; repoRoot: string; nowIso: string }): ModelLab {
  const research = (rel: string) => readJson(path.join(repoRoot, "data", "internal", "research", rel));
  const eplSet = loadEplForecasts();
  const ufcCard = readJson(path.join(dataRoot, "ufc", "card-latest.json")) as { model?: { verdicts?: Record<string, string> } } | null;

  const live: ModelLab["live"] = [
    { sport: "nfl", label: "NFL", items: modelStatusFor("nfl", { dataRoot, repoRoot, nowIso }) },
    { sport: "mlb", label: "MLB", items: modelStatusFor("mlb", { dataRoot, repoRoot, nowIso }) },
    { sport: "epl", label: "Premier League", items: modelStatusFor("epl", { dataRoot, repoRoot, nowIso, eplValidation: eplSet?.validation ?? null }) },
    { sport: "ufc", label: "UFC", items: modelStatusFor("ufc", { dataRoot, repoRoot, nowIso, ufcVerdicts: ufcCard?.model?.verdicts ?? null }) },
  ];

  const experiments: LabExperiment[] = [];
  const decisions: LabDecision[] = [];

  /* NFL blind forward test on the player families (P300/P301). */
  const nflForward = research("nfl/replay/player-props-share-level-forward/receipt.json") as { updatedAt?: string; families?: Record<string, { state: string; n: number; needed: number }> } | null;
  for (const [market, fam] of Object.entries(nflForward?.families ?? {})) {
    const state: PublicModelState = fam.state === "FORWARD_BREACHED" ? "PAUSED" : fam.state === "FORWARD_HOLDING" ? "HOLDING" : "FORWARD_TEST";
    experiments.push({ id: `nfl_forward_${market}`, sport: "nfl", label: `NFL ${FAMILY_LABEL[market] ?? market.replace(/^player_/, "").replace(/_/g, " ")} · blind forward test`, kind: "FORWARD_TEST", state,
      headline: state === "PAUSED" ? "Breached its bars · previous rule publishes" : state === "HOLDING" ? "Holding in the forward test" : `Accumulating · ${fam.n} of ${fam.needed} player-games`,
      detail: "Every week's forecast is committed before its first kickoff and graded against the official box scores; a family that breaches its preregistered bars falls back to the previous rule automatically.",
      n: fam.n ?? null, needed: fam.needed ?? null });
  }

  /* EPL blind forward test (P304) and the private totals shadow (P305-F). */
  const eplForward = research("epl/forward/receipt.json") as { state?: string; watch?: boolean; n?: number; needed?: number } | null;
  if (eplForward) {
    const state: PublicModelState = eplForward.state === "FORWARD_BREACHED" ? "PAUSED" : eplForward.state === "FORWARD_HOLDING" ? (eplForward.watch ? "WATCH" : "HOLDING") : "FORWARD_TEST";
    experiments.push({ id: "epl_forward", sport: "epl", label: "Premier League match model · blind forward test", kind: "FORWARD_TEST", state,
      headline: state === "FORWARD_TEST" ? `Accumulating · ${eplForward.n ?? 0} of ${eplForward.needed ?? 60} matches` : state === "PAUSED" ? "Breached · the previous model publishes" : state === "WATCH" ? "Watch · behind the model it replaced" : "Holding against the model it replaced",
      detail: "The live match model is scored beside the model it replaced on every graded match. If it is significantly worse, the previous model publishes again from the next build.",
      n: eplForward.n ?? null, needed: eplForward.needed ?? null });
  }
  const shadow = research("epl/forward-totals/receipt.json") as { state?: string; n?: number; needed?: number } | null;
  const shadowProtocol = research("epl/reports/epl-totals-shadow-forward-protocol.json") as { registeredAt?: string } | null;
  if (shadowProtocol) {
    experiments.push({ id: "epl_shadow_totals", sport: "epl", label: "Premier League club-specific totals · private shadow", kind: "SHADOW", state: "SHADOW",
      headline: shadow ? (shadow.state === "ACCUMULATING" ? `Research only · ${shadow.n ?? 0} of ${shadow.needed ?? 60} matches` : `Research only · ${String(shadow.state).replace(/^SHADOW_/, "").toLowerCase().replace(/_/g, " ")}`) : "Research only · registered, first fixtures pending",
      detail: "A club-by-club total is scored privately beside the live model's constant total on every graded fixture. It powers no public number; adoption would be a separate decision.",
      n: shadow?.n ?? null, needed: shadow?.needed ?? 60 });
  }

  /* Decisions, from receipts. */
  const p304 = research("epl/reports/epl-history-replay-evaluation.json") as { generatedAt?: string; verdict?: string } | null;
  const p304Protocol = research("epl/reports/epl-elo-poisson-forward-protocol.json") as { frozen?: { adoptedAt?: string } } | null;
  if (p304?.verdict === "ELIGIBLE") decisions.push({ when: dateOf(p304Protocol?.frozen?.adoptedAt ?? p304.generatedAt), sport: "epl", outcome: "ADOPTED", what: "Premier League match model replaced by a rating model tested blind on nine past seasons",
    detail: "It beat the previous model and a plain rating system on 3,420 matches it was never fit on, and now runs a blind forward test against the model it replaced." });
  const p305 = research("epl/reports/epl-totals-replay-evaluation.json") as { generatedAt?: string; verdicts?: Record<string, { blind?: { verdict?: string }; secondLook?: { verdict?: string } }> } | null;
  if (p305?.verdicts) {
    const blind = Object.values(p305.verdicts).map((v) => v.blind?.verdict);
    decisions.push({ when: dateOf(p305.generatedAt), sport: "epl", outcome: blind.every((v) => v === "REJECTED") ? "REJECTED" : "SECOND_LOOK", what: "Club-specific match totals: rejected on the blind test, positive on a second look",
      detail: "Both candidates beat the constant total on every totals measure across four other leagues and the Premier League, but missed a preregistered result-calibration ceiling on the blind set. The verdict stands; the better candidate now runs as a private shadow." });
  }
  const secondLook = research("nfl/reports/player-props-share-level-second-look.json") as { generatedAt?: string; verdicts?: Record<string, Record<string, string>> } | null;
  if (secondLook?.verdicts) {
    const eligible = Object.entries(secondLook.verdicts).filter(([, c]) => Object.values(c).includes("SECOND_LOOK_ELIGIBLE")).map(([m]) => FAMILY_LABEL[m] ?? m);
    const rejected = Object.entries(secondLook.verdicts).filter(([, c]) => !Object.values(c).includes("SECOND_LOOK_ELIGIBLE")).map(([m]) => FAMILY_LABEL[m] ?? m);
    decisions.push({ when: dateOf(secondLook.generatedAt), sport: "nfl", outcome: "SECOND_LOOK", what: `NFL player ranges: ${eligible.join(", ")} eligible on a second look${rejected.length ? `; ${rejected.join(", ")} rejected` : ""}`,
      detail: "The share rule that pulled every player toward zero was replaced. The seasons had been seen once before, so the evidence is labelled second look and a blind forward test decides whether it holds." });
  }
  const estimate = research("nfl/reports/player-props-share-level-estimate-adoption.json") as { approvedAt?: string; markets?: Record<string, { state?: string }> } | null;
  for (const [m, v] of Object.entries(estimate?.markets ?? {})) if (v.state === "ESTIMATE") decisions.push({ when: dateOf(estimate?.approvedAt ? `${estimate.approvedAt}T00:00:00Z` : null), sport: "nfl", outcome: "ESTIMATE", what: `NFL ${FAMILY_LABEL[m] ?? m} published as an estimate`,
    detail: "The candidate missed its calibration bar. It replaced a worse live rule under a stated exception and stays labelled an estimate, never a validated forecast." });
  const td = research("nfl/reports/anytime-td-historical-replay-evaluation.json") as { generatedAt?: string; verdicts?: Record<string, string> } | null;
  if (td?.verdicts) {
    const adopted = Object.entries(td.verdicts).filter(([, v]) => v === "ELIGIBLE").map(([k]) => k);
    if (adopted.length) decisions.push({ when: dateOf(td.generatedAt), sport: "nfl", outcome: "ADOPTED", what: "NFL touchdown chances rebuilt from opportunity shares",
      detail: "Tested blind on eight past seasons, where it beat the live rule and a rolling rate and was calibrated overall. It runs a blind forward test this season." });
  }
  const winMargin = research("nfl/reports/win-margin-historical-replay-evaluation.json") as { generatedAt?: string; verdicts?: Record<string, Record<string, string>> } | null;
  if (winMargin?.verdicts) decisions.push({ when: dateOf(winMargin.generatedAt), sport: "nfl", outcome: "ADOPTED", what: "NFL win chance and margin heads adopted independently",
    detail: "Each head cleared its own bars on sixteen past seasons it was never fit on. Neither claims to out-predict the sportsbook market; the market's own number sits beside them." });
  const totals = research("nfl/reports/matchup-totals-historical-replay-evaluation.json") as { generatedAt?: string; verdicts?: Record<string, string> } | null;
  if (totals?.verdicts?.v3PlayEfficiency === "ELIGIBLE") decisions.push({ when: dateOf(totals.generatedAt), sport: "nfl", outcome: "ADOPTED", what: "NFL game-total head replaced after a centring bias was found",
    detail: "The previous head carried a frozen constant that lifted every total; the replacement was tested on twenty-two past seasons and the sportsbook total is shown beside it." });
  const health = readJson(path.join(dataRoot, "admin", "model-health.json")) as { generatedAt?: string; families?: Array<{ id: string; state: string; n: number }> } | null;
  for (const f of health?.families ?? []) if (f.state === "BREACHED" && f.id.startsWith("mlb_")) decisions.push({ when: dateOf(health?.generatedAt), sport: "mlb", outcome: "PAUSED", what: `MLB ${f.id.replace(/^mlb_/, "").replace(/_/g, " ")} call paused by the live-record gate`,
    detail: `Over ${f.n} graded games it did worse than a coin flip by a clear margin. The call is withdrawn from every page while it keeps being made and graded; it returns when the record recovers.` });
  if (shadowProtocol) decisions.push({ when: dateOf(shadowProtocol.registeredAt), sport: "epl", outcome: "SHADOW", what: "Premier League club-specific totals registered as a private shadow", detail: "Not adopted. Scored beside the live model on future fixtures for a later decision." });

  decisions.sort((a, b) => b.when.localeCompare(a.when));
  return { generatedAt: nowIso, live, experiments, decisions };
}
