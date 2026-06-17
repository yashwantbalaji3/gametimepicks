/**
 * Parlay engine — public entrypoint. Eligible-leg pool, leg quality, correlation, parlay generators,
 * suggested-parlay tracking, and the dual Bank Builder lane selector. All methodology-derived, pure,
 * and honest: nothing here publishes a slate or launches Bank Builder.
 */
export * from "./types";
export * from "./leg-scoring";
export * from "./eligible-leg";
export * from "./correlation";
export * from "./odds-math";
export * from "./risk-levels";
export * from "./daily-parlays";
export * from "./same-game";
export * from "./tracking";
export * from "./dual-bank-builder";
