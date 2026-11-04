/**
 * NBA PROVISIONAL PROP ANALYSIS — the site's encrypted display artifact and its reader (founder P0 2026-11-04; format
 * agreed with the Bank Builder / Moonshot redesign). SERVER / BUILD TIME ONLY (node:crypto via display-crypto.mjs; nothing
 * under lib/odds/ may reach a client bundle).
 *
 * PROVISIONAL: no prop passed the reliability gate (backtest 0ce4b94208), so a row is never a challenge leg. There is no
 * probability, no confidence label and no OVER / UNDER side in the artifact (a side beside a price reads as a pick).
 *
 * ONE ARTIFACT PER DATE: data/odds-display/nba/prop-analysis/<date>.json.enc — gtp.odds-display.enc@1 under
 * GTP_ODDS_DISPLAY_KEY, aad "nba/prop-analysis/<date>" (odds-display-at-rest.test.mjs guards the directory). Plaintext
 * schema gtp.prop-analysis.site@1: the private analysis document (build-nba-prop-provisional-analysis.mjs) without its
 * wall-clock generatedAt and without any side, so the same inputs give the same bytes. The private plaintext stays in
 * ~/gtp-private.
 * Written only when displayAuthorization("nba", "site") is ok. readPropAnalysis returns the document, or null for: no
 * file, no key, another key, site display not authorized. A tampered envelope or a wrong-date / wrong-schema document
 * THROWS (a release error, never a silent page).
 */
import fs from "node:fs";
import path from "node:path";
import { decryptDisplayArtifact, encryptDisplayArtifact, readDisplayKey } from "./display-crypto.mjs";
import { DISPLAY_AUTHORIZATION, assertDisplayAuthorized, displayAuthorization } from "./display-authorization.mjs";

export const PROP_ANALYSIS_SITE_SCHEMA = "gtp.prop-analysis.site@1";
export const PROP_ANALYSIS_LABEL = "PROVISIONAL ANALYSIS — not a challenge leg; no prop passed the reliability gate (backtest 0ce4b94208)";
export const PROP_ANALYSIS_GATE = Object.freeze({ passed: false, reason: "No NBA prop family passed the reliability gate: every candidate method scored worse than the no-vig market on the 39-game backtest.", backtestCommit: "0ce4b94208" });
export const propAnalysisPath = (appDir, date) => path.join(appDir, "..", "data", "odds-display", "nba", "prop-analysis", `${date}.json.enc`);
export const propAnalysisAad = (date) => `nba/prop-analysis/${date}`;

/** Pure. The site document from one private analysis document. */
export function sitePropAnalysis(analysis) {
  if (analysis?.schema !== "gtp-nba-prop-provisional-analysis@1") throw new Error("refused: not a provisional prop analysis");
  if (analysis.label !== PROP_ANALYSIS_LABEL) throw new Error("refused: the analysis label is not the provisional label");
  const { generatedAt, schema, rows, summary, ...rest } = analysis;
  const noSide = ({ side, ...r }) => r;
  return {
    ...rest, schema: PROP_ANALYSIS_SITE_SCHEMA, source: "gtp-nba-prop-provisional-analysis@1", gate: PROP_ANALYSIS_GATE,
    rows: rows.map(noSide), summary: { ...summary, topDifferences: (summary.topDifferences ?? []).map(noSide) },
  };
}

/** Encrypt and write the artifact. Refuses without site authorization or a valid key (no plaintext fallback). */
export function writePropAnalysis({ appDir, analysis, env = process.env, record = DISPLAY_AUTHORIZATION }) {
  assertDisplayAuthorized("nba", "site", record);
  const k = readDisplayKey(env);
  if (!k.ok) throw new Error(`refused: ${k.reason}`);
  const doc = sitePropAnalysis(analysis);
  const file = propAnalysisPath(appDir, doc.date);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encryptDisplayArtifact(`${JSON.stringify(doc)}\n`, k.key, propAnalysisAad(doc.date)));
  return { file, rows: doc.rows.length, compared: doc.summary.compared, kid: k.kid };
}

/**
 * The site reader (same contract as the challenge-lane price reader): the decrypted document, or null.
 * @returns {null | object} gtp.prop-analysis.site@1
 */
export function readPropAnalysis({ appDir, date, env = process.env, record = DISPLAY_AUTHORIZATION }) {
  if (!displayAuthorization("nba", "site", record).ok) return null;
  const file = propAnalysisPath(appDir, date);
  if (!fs.existsSync(file)) return null;
  const k = readDisplayKey(env);
  if (!k.ok) return null;
  const text = decryptDisplayArtifact(fs.readFileSync(file, "utf8"), k.key, propAnalysisAad(date));
  if (text == null) return null;
  const doc = JSON.parse(text);
  if (doc.schema !== PROP_ANALYSIS_SITE_SCHEMA || doc.date !== date || doc.label !== PROP_ANALYSIS_LABEL) throw new Error(`prop analysis ${date}: decrypted document is not the provisional site document for this date`);
  return doc;
}
