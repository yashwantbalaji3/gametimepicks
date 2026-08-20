/**
 * EPL artifact loader — soccer-local on purpose.
 *
 * `lib/markets/load.ts` hardcodes `DATA_DIR` to `public/data/mlb` and its freshness cadence
 * describes the MLB one-artifact-per-slate pipeline. Pointing it at soccer would mean either
 * parameterising a loader that four MLB surfaces depend on, or quietly reading EPL files through
 * MLB-shaped assumptions. Neither belongs in the lane that writes EPL's first artifact.
 *
 * FUTURE CONSOLIDATION: when a second competition lands, the sensible move is a shared
 * data-root-parameterised loader with per-sport cadence, and this file becomes its soccer
 * configuration. That refactor touches `lib/markets/**` and is deliberately not attempted here.
 *
 * Build-time only: the site is a static export, so nothing in this module may reach the browser.
 */
import fs from "node:fs";
import path from "node:path";

import {
  EPL_ARTIFACT_ROOT,
  validateFixtureArtifact,
  validateOddsArtifact,
  type EplFixtureArtifact,
  type EplFixtureRow,
  type EplOddsArtifact,
  type EplOddsRow,
  type EplValidation,
} from "./epl-artifacts";

const ROOT = () => path.join(process.cwd(), EPL_ARTIFACT_ROOT);

function readJsonFiles<T>(subroot: string): { file: string; data: T }[] {
  const dir = path.join(ROOT(), subroot);
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out: { file: string; data: T }[] = [];
  for (const name of names) {
    try {
      out.push({ file: name, data: JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8")) as T });
    } catch (err) {
      // A malformed artifact is reported, never silently skipped into an empty-looking surface.
      console.warn(`[epl] could not parse ${subroot}/${name}:`, err);
    }
  }
  return out;
}

export interface EplLoadedArtifacts {
  /** Fixture rows that passed validation, newest artifact last. */
  readonly fixtures: readonly EplFixtureRow[];
  /** Every accepted odds row across every capture snapshot. Snapshots are never merged in place. */
  readonly odds: readonly EplOddsRow[];
  /** Per-artifact validation, so a surface can show what was refused rather than what survived. */
  readonly fixtureValidations: readonly { file: string; validation: EplValidation<EplFixtureRow> }[];
  readonly oddsValidations: readonly { file: string; validation: EplValidation<EplOddsRow> }[];
  /** True when the root exists but holds nothing — distinct from "the loader failed". */
  readonly empty: boolean;
  /** Data classes present. A surface must say so when everything it shows is a sample. */
  readonly dataClasses: readonly string[];
}

/** Load and validate every committed EPL artifact. Rejected rows never reach a surface. */
export function loadEplArtifacts(): EplLoadedArtifacts {
  const fixtureFiles = readJsonFiles<EplFixtureArtifact>("fixtures");
  /*
   * ODDS_CAPTURE is EXCLUDED here, deliberately.
   *
   * This loader feeds the public preview. An ODDS_CAPTURE is paid per-book market data written for
   * the shadow run — different row shape, and never display-eligible. When EPL odds went live
   * (2026-08-20) the capture landed in this directory and was validated as if it were a sample odds
   * artifact, so every row was rejected and the preview reported unclean. The boundary is the fix:
   * a display loader loads display artifacts.
   */
  const oddsFiles = readJsonFiles<EplOddsArtifact>("odds")
    .filter(({ data }) => (data as { dataClass?: string }).dataClass !== "ODDS_CAPTURE");

  const fixtureValidations = fixtureFiles.map(({ file, data }) => ({
    file,
    validation: validateFixtureArtifact({ ...data, rows: data.rows ?? [] }),
  }));
  const oddsValidations = oddsFiles.map(({ file, data }) => ({
    file,
    validation: validateOddsArtifact({ ...data, rows: data.rows ?? [] }),
  }));

  const fixtures = fixtureValidations.flatMap((v) => v.validation.accepted);
  const odds = oddsValidations.flatMap((v) => v.validation.accepted);
  const dataClasses = [
    ...new Set([...fixtureFiles, ...oddsFiles].map(({ data }) => data.dataClass).filter(Boolean)),
  ].sort();

  return {
    fixtures,
    odds,
    fixtureValidations,
    oddsValidations,
    empty: fixtures.length === 0 && odds.length === 0,
    dataClasses,
  };
}
