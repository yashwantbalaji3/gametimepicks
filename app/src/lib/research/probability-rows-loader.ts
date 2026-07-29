/**
 * SPRINT 055 — the four probability layers for a live slate, assembled server-side.
 *
 * Sprints 048–049 built the layers, the versioned calibrator, and the eligibility rules. Nothing
 * rendered them. This is the loader that closes that gap for `/today`.
 *
 * THE ORDERING THAT MATTERS
 * Rows are returned in EVENT-TIME order, never by probability. Sorting by the model's own confidence
 * would present the numbers it is least entitled to as the most prominent — the measured record shows
 * the "High" grouping is the *worst* performing and 14pp overconfident, so probability-ordering would
 * be actively misleading rather than merely unhelpful.
 *
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";

import {
  buildProbabilityLayers,
  type ProbabilityLayers,
} from "@/lib/mlb/calibration/probability-layers";
import {
  checkCompatibility,
  type CalibratorManifest,
} from "@/lib/mlb/calibration/calibrator-manifest";
import {
  decideEligibility,
  type EligibilityDecision,
  type MarketEvidence,
} from "@/lib/mlb/calibration/publishing-eligibility";
import { loadTerminal } from "./public-contract-adapter";

const APP = process.cwd();
const BOARDS = path.join(APP, "public/data/mlb/boards");
const MANIFEST = path.join(APP, "..", "data/internal/mlb/model-learning/calibrator-manifest.json");

/** The board/lean schema the calibrator was fitted against. */
const MODEL_SCHEMA_VERSION = "mlb-board-lean-1";

export interface ProbabilityRow {
  readonly id: string;
  readonly player: string;
  readonly market: string;
  readonly line: number | null;
  readonly side: "over" | "under";
  readonly startTime: string | null;
  readonly matchup: string;
  readonly layers: ProbabilityLayers;
  readonly eligibility: EligibilityDecision;
  readonly registryStatus: MarketEvidence["status"];
  readonly registrySample: number;
  /** Why calibration was or was not applied, in operator terms. */
  readonly calibrationNote: string;
}

const readManifest = (): CalibratorManifest | null => {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as CalibratorManifest;
  } catch {
    return null;
  }
};

/**
 * Build the probability rows for a slate.
 *
 * Returns an empty array rather than a partial one when the board is unreadable — a page rendering
 * half a slate as if it were the whole thing is the shape of defect this codebase keeps removing.
 */
export function loadProbabilityRows(date: string, limit = 12): ProbabilityRow[] {
  const boardPath = path.join(BOARDS, `${date}.json`);
  if (!fs.existsSync(boardPath)) return [];

  let board: { leans?: Record<string, unknown>[] };
  try {
    board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  } catch {
    return [];
  }

  const manifest = readManifest();
  const terminal = loadTerminal();
  const registry = new Map(
    (terminal.registry?.markets ?? []).map((m) => [m.market, m]),
  );

  const rows: ProbabilityRow[] = [];
  for (const raw of board.leans ?? []) {
    const lean = raw as Record<string, unknown>;
    const side = String(lean.lean ?? "").toLowerCase();
    if (side !== "over" && side !== "under") continue; // a Pass is not a probability claim

    const marketKey = String(lean.marketKey ?? "");
    const rawProb = side === "over" ? lean.modelProbOver : lean.modelProbUnder;
    if (typeof rawProb !== "number") continue;

    const compat = checkCompatibility({
      manifest,
      marketFamily: marketKey,
      modelSchemaVersion: MODEL_SCHEMA_VERSION,
      asOfSettledDate: terminal.asOfSettledDate ?? date,
    });

    const layers = buildProbabilityLayers({
      rawProbability: rawProb,
      side,
      impliedOver: typeof lean.impliedOver === "number" ? lean.impliedOver : null,
      impliedUnder: typeof lean.impliedUnder === "number" ? lean.impliedUnder : null,
      calibrator: compat.compatible ? manifest!.parameters : null,
      provenance: {
        method: compat.compatible ? "platt" : "none",
        trainedThrough: manifest?.fitWindow?.to ?? null,
        trainRows: manifest?.fitWindow?.rows ?? 0,
        measuredBrierImprovement: manifest?.heldOutEvaluation?.brierImprovementVsRaw ?? null,
        stillBehindMarket: manifest?.heldOutEvaluation?.stillBehindMarket ?? true,
      },
    });

    const reg = registry.get(marketKey);
    const evidence: MarketEvidence = {
      market: marketKey,
      status: reg?.status ?? "MONITOR",
      n: reg?.n ?? 0,
      hitRate: reg?.hitRate ?? null,
      hitRate95: reg?.hitRate95 ?? { low: null, high: null },
      beatsMarketBrier: false,
      overconfidencePp: reg?.overconfidencePp ?? null,
    };

    rows.push({
      id: String(lean.id ?? ""),
      player: String(lean.playerName ?? "—"),
      market: String(lean.marketLabel ?? marketKey),
      line: typeof lean.line === "number" ? lean.line : null,
      side,
      startTime: typeof lean.commenceTime === "string" ? lean.commenceTime : null,
      matchup: `${String(lean.awayTeamAbbr ?? "?")} @ ${String(lean.homeTeamAbbr ?? "?")}`,
      layers,
      eligibility: decideEligibility({
        layers,
        evidence,
        // The board carries a per-row commence time, which is what makes the capture window provable.
        provenanceComplete: typeof lean.commenceTime === "string",
      }),
      registryStatus: evidence.status,
      registrySample: evidence.n,
      calibrationNote: compat.reason,
    });
  }

  // Event time, then matchup. Never probability — see the note at the top of this file.
  rows.sort((a, b) => {
    const t = String(a.startTime ?? "").localeCompare(String(b.startTime ?? ""));
    return t !== 0 ? t : a.matchup.localeCompare(b.matchup);
  });
  return rows.slice(0, limit);
}
