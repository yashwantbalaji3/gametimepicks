/**
 * FULL-GAME ARTIFACT READER (Sprint 008). Loads the daily full-game simulation artifact and indexes it by
 * gamePk so the game report can join by the board's matchId (= gamePk). Pure filesystem read; a missing
 * artifact is normal (returns null) and the report falls back to its honest "full-game not available" state.
 */
import fs from "node:fs";
import path from "node:path";
import type { FullGameSimGame } from "./types";

export interface FullGameArtifactMeta {
  date: string;
  modelVersion: string | null;
  simulationVersion: number | null;
  runCount: number | null;
  generatedAt: string | null;
}

export interface LoadedFullGameArtifact {
  meta: FullGameArtifactMeta;
  byGamePk: Map<string, FullGameSimGame>;
}

/** Load + index the full-game artifact for a slate date. Returns null when the file is missing/malformed. */
export function loadFullGameArtifact(root: string, date: string): LoadedFullGameArtifact | null {
  const fp = path.join(root, "mlb", "full-game-simulations", `${date}.json`);
  let raw: string;
  try {
    raw = fs.readFileSync(fp, "utf8");
  } catch {
    return null;
  }
  try {
    const a = JSON.parse(raw) as {
      date: string;
      modelVersion?: string;
      simulationVersion?: number;
      runCount?: number;
      generatedAt?: string;
      games?: FullGameSimGame[];
    };
    const byGamePk = new Map<string, FullGameSimGame>();
    for (const g of a.games ?? []) if (g.gamePk != null) byGamePk.set(String(g.gamePk), g);
    return {
      meta: {
        date: a.date,
        modelVersion: a.modelVersion ?? null,
        simulationVersion: a.simulationVersion ?? null,
        runCount: a.runCount ?? null,
        generatedAt: a.generatedAt ?? null,
      },
      byGamePk,
    };
  } catch {
    return null;
  }
}
