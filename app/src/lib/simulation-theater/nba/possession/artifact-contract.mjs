/**
 * NBA SIMULATION THEATER · POSSESSION RUNS · PRIVATE ARTIFACT CONTRACT (server / script side only).
 *
 * Names the private research artifact (data path, schema). It is imported by the offline generator
 * (scripts/nba/research/build-theater-possession-runs.mjs) and the build-time loader (possession-loader.mjs) ONLY —
 * never by a client module: the data path is a private export marker (export-boundary.mjs), so a client chunk that
 * imported this file would leak it (possession-client-imports.test.mjs checks the client graph).
 */
import { BOX_KEYS } from "../../../sports/nba/research/possession-sim/events.mjs";

export const POSSESSION_ARTIFACT = "nba-theater-possession-runs";
export const POSSESSION_ARTIFACT_SCHEMA = "nba-theater-possession@1";
export const POSSESSION_ARTIFACT_DIR = "data/internal/research/nba/theater-possession";
export const possessionArtifactPath = (date) => `${POSSESSION_ARTIFACT_DIR}/${date}.json`;

export const POSSESSION_CHECKER = Object.freeze({ name: "checkPossessionDraw", families: Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11"]) });

/** Column order of a stored run's engine ledger rows (one row per roster player, roster order). */
export const ledgerColumns = () => ["ds", ...BOX_KEYS];
