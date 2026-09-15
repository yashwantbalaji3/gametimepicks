/**
 * WHICH EPL MATCH MODEL PUBLISHES — read from receipts, never a hardcoded switch (founder-approved 2026-09-14).
 *
 *   adopted (Elo-Poisson, elo-poisson.mjs)   when the P304 blind replay receipt says ELIGIBLE, the blind forward
 *                                           receipt has not BREACHED, and the openfootball history is present
 *   otherwise (split Poisson, strength-state.mjs)
 *
 * While adopted, the previous model is fit beside it as the CONTROL: its probabilities ride the private forecast
 * row, the grader scores both on the same match, and the forward receipt (forward-receipt.mjs) compares them
 * paired. A forward breach — the new model significantly worse than the one it replaced — makes the next build
 * publish the previous model again. Used by the team forecasts AND the player projections, so a fixture's
 * scorer probabilities are always allocated from the same score matrix as its team card.
 */
import fs from "node:fs";
import path from "node:path";
import { fitEplStrength } from "./strength-state.mjs";
import { loadEplCorpus } from "./corpus.mjs";
import { fitEloPoissonState, EPL_ELO_POISSON_MODEL_ID } from "./elo-poisson.mjs";
import { fitGoalRatiosState } from "./totals-shadow.mjs";
import { league } from "../soccer/leagues.mjs";

export const EPL_MATCH_MODEL_SOURCES = Object.freeze({
  evaluation: "data/internal/research/epl/reports/epl-history-replay-evaluation.json",
  preregistration: "data/internal/research/epl/reports/epl-history-replay-preregistration.json",
  forwardReceipt: "data/internal/research/epl/forward/receipt.json",
  history: "data/internal/research/soccer/epl/history-openfootball-v1.json",
  /* P305-F: the private totals shadow — a protocol, the P305 registration it reads constants from, its receipt. */
  totalsShadowProtocol: "data/internal/research/epl/reports/epl-totals-shadow-forward-protocol.json",
  totalsRegistration: "data/internal/research/epl/reports/epl-totals-replay-preregistration.json",
  totalsEvaluation: "data/internal/research/epl/reports/epl-totals-replay-evaluation.json",
});

/** Pure: whether the totals shadow may run beside the live model. It never affects what publishes. */
export function eplTotalsShadowDecision({ selection, protocol, registration, evaluation }) {
  if (!selection?.adopted || selection.modelId !== EPL_ELO_POISSON_MODEL_ID) return { run: false, reason: "the live model is not P304 Elo-Poisson — the shadow is defined against it" };
  if (!protocol?.frozen?.shadowModelId) return { run: false, reason: "no totals shadow protocol registered" };
  if (protocol.frozen.liveModelId !== EPL_ELO_POISSON_MODEL_ID) return { run: false, reason: "the protocol names a different live model" };
  if (!registration?.frozen?.totals?.goalRatios) return { run: false, reason: "the P305 registration (constants) is missing" };
  if (!evaluation?.results?.goalRatios) return { run: false, reason: "the P305 evaluation receipt is missing — the shadow only runs a scored candidate" };
  return { run: true, reason: `protocol ${protocol.program} registered ${protocol.registeredAt}; candidate ${protocol.frozen.shadowModelId}` };
}

/**
 * The totals shadow state for this build, or null with the reason. Fit on the same history at the same cutoff as the
 * live model. @returns {{ state: object|null, frozen: object|null, protocolId: string|null, reason: string }}
 */
export function selectEplTotalsShadow({ repoRoot, nowIso, selection, seasonClubs = [] }) {
  const protocol = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.totalsShadowProtocol));
  const registration = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.totalsRegistration));
  const evaluation = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.totalsEvaluation));
  const decision = eplTotalsShadowDecision({ selection, protocol, registration, evaluation });
  if (!decision.run) return { state: null, frozen: null, protocolId: null, reason: decision.reason };
  const history = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.history));
  if (!Array.isArray(history?.rows) || !history.rows.length) return { state: null, frozen: null, protocolId: null, reason: "the openfootball EPL history is missing" };
  const state = fitGoalRatiosState({ rows: history.rows, cutoffIso: nowIso, frozen: registration.frozen, seasonClubs, aliases: league("epl").aliases ?? {} });
  return { state, frozen: registration.frozen, protocolId: `${protocol.artifact}@${protocol.registeredAt}`, reason: decision.reason };
}

/** Pure decision from the three inputs. */
export function eplAdoptionDecision({ evaluation, forwardReceipt, historyRows }) {
  if (evaluation?.verdict !== "ELIGIBLE") return { adopted: false, reason: "the P304 replay receipt is missing or not ELIGIBLE" };
  if (forwardReceipt?.state === "FORWARD_BREACHED") return { adopted: false, reason: "the blind forward receipt is FORWARD_BREACHED — the previous model publishes again" };
  if (!Array.isArray(historyRows) || !historyRows.length) return { adopted: false, reason: "the openfootball EPL history is missing" };
  return { adopted: true, reason: `P304 replay ELIGIBLE; forward receipt ${forwardReceipt?.state ?? "not started"}` };
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * @returns {{ state: object, control: object|null, adopted: boolean, reason: string, forwardState: string|null }}
 */
export function selectEplMatchModel({ repoRoot, nowIso, seasonClubs = [] }) {
  const previous = fitEplStrength({ rows: loadEplCorpus(repoRoot).rows, cutoffIso: nowIso });
  const evaluation = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.evaluation));
  const forwardReceipt = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.forwardReceipt));
  const history = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.history));
  const decision = eplAdoptionDecision({ evaluation, forwardReceipt, historyRows: history?.rows });
  if (!decision.adopted) return { state: previous, control: null, adopted: false, reason: decision.reason, forwardState: forwardReceipt?.state ?? null };
  const frozen = readJson(path.join(repoRoot, EPL_MATCH_MODEL_SOURCES.preregistration))?.frozen;
  if (!frozen) return { state: previous, control: null, adopted: false, reason: "the P304 registration is unreadable", forwardState: forwardReceipt?.state ?? null };
  const state = fitEloPoissonState({ rows: history.rows, cutoffIso: nowIso, frozen, seasonClubs, aliases: league("epl").aliases ?? {} });
  /* The live fit must be the registered model: its warm-up slope is recomputed and checked against the receipt. */
  if (Number.isFinite(evaluation.supremacySlope) && Math.abs(state.supremacySlope - evaluation.supremacySlope) > 1e-4) {
    return { state: previous, control: null, adopted: false, reason: `supremacy slope ${state.supremacySlope} does not reproduce the receipt's ${evaluation.supremacySlope}`, forwardState: forwardReceipt?.state ?? null };
  }
  return { state, control: previous, adopted: true, reason: decision.reason, forwardState: forwardReceipt?.state ?? null, modelId: EPL_ELO_POISSON_MODEL_ID };
}
