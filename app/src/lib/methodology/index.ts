/**
 * Methodology framework v1 — public entrypoint. Re-exports the canonical contracts, global rules,
 * leakage validation, confidence + risk scoring, data-quality helpers, and sport feature registries.
 */
export * from "./types";
export * from "./global-rules";
export * from "./validation";
export * from "./data-quality";
export * from "./confidence";
export * from "./risk";
export * from "./sport-feature-groups";
export { MLB_REGISTRY } from "./mlb";
export { NBA_REGISTRY } from "./nba";
export { UFC_REGISTRY } from "./ufc";
export { WORLD_CUP_REGISTRY } from "./world-cup";
