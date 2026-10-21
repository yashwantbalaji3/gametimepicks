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
/**
 * ONE FILE PER GAME (release owner 2026-10-21, storage): data/internal/research/nba/theater-possession/<date>/<id>.json.
 * Each file carries the artifact header (schema, engine, rules, sources) and ONE game; stored-run.mjs
 * readPossessionArtifact assembles the slate. A tick adds only the games that froze in it.
 */
export const possessionArtifactPath = (date) => `${POSSESSION_ARTIFACT_DIR}/${date}`;
export const possessionGamePath = (date, eventId) => `${POSSESSION_ARTIFACT_DIR}/${date}/${eventId}.json`;
/** Header fields every per-game file of one slate must share (the reader refuses a mixed slate). */
export const POSSESSION_SLATE_HEADER = Object.freeze(["schema", "artifact", "dataClass", "productEligible", "feedsProducts", "date", "modelVersion"]);

export const POSSESSION_CHECKER = Object.freeze({ name: "checkPossessionDraw", families: Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11"]) });

/** Column order of a stored run's engine ledger rows (one row per roster player, roster order). */
export const ledgerColumns = () => ["ds", ...BOX_KEYS];
