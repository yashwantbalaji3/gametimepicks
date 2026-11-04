/**
 * NBA PROVISIONAL PROP ANALYSIS — the site artifacts and their reader (founder P0 2026-11-04; format agreed with the
 * Bank Builder / Moonshot redesign). SERVER / BUILD TIME ONLY (node:crypto via display-crypto.mjs; nothing under
 * lib/odds/ may reach a client bundle).
 *
 * PROVISIONAL: no prop passed the reliability gate (backtest 0ce4b94208), so a row is never a challenge leg. There is no
 * probability and no confidence label anywhere in either artifact or in what the reader returns.
 *
 * TWO ARTIFACTS PER DATE (the repository is public; provider terms bar plaintext price files):
 *   PUBLIC   app/public/data/nba/prop-analysis/<date>.json   schema gtp.prop-analysis.public@1 — price-free: the official
 *            MODEL PROJECTION (lane median, as published), the guard state and reasons. contentSha256 = sha256 of the
 *            canonical JSON without that field. No wall clock (deterministic: same inputs → identical bytes).
 *   PRICES   data/odds-display/nba/prop-analysis/<date>.json.enc   aad "nba/prop-analysis/<date>", plaintext schema
 *            gtp.prop-analysis.prices@1 — line, book, prices, capture time per row; `projectionSha256` binds it to the
 *            public file it was built with.
 * READER readPropAnalysis joins them through compareToLine (nba-line-comparison@1: difference = projection − line,
 *   6-hour freshness, never after tip). Without the key (or with another key) it returns the public rows with
 *   pricesAvailable false; a prices file bound to a different public file THROWS (a release error, never a silent join).
 *   A difference / side exists only for an ELIGIBLE row whose comparison is valid.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { decryptDisplayArtifact, encryptDisplayArtifact, readDisplayKey } from "./display-crypto.mjs";
import { compareToLine, MARKET_KEYS } from "../sports/nba/line-comparison.mjs";

export const PROP_ANALYSIS_PUBLIC_SCHEMA = "gtp.prop-analysis.public@1";
export const PROP_ANALYSIS_PRICES_SCHEMA = "gtp.prop-analysis.prices@1";
export const PROP_ANALYSIS_LABEL = "PROVISIONAL ANALYSIS — not a challenge leg; no prop passed the reliability gate";
export const PROP_ANALYSIS_GATE = Object.freeze({ passed: false, reason: "No NBA prop family passed the reliability gate: every candidate method scored worse than the no-vig market on the 39-game backtest.", backtestCommit: "0ce4b94208" });
export const PROJECTION_LABEL = "MODEL PROJECTION";
export const publicPath = (appDir, date) => path.join(appDir, "public", "data", "nba", "prop-analysis", `${date}.json`);
export const pricesPath = (appDir, date) => path.join(appDir, "..", "data", "odds-display", "nba", "prop-analysis", `${date}.json.enc`);
export const pricesAad = (date) => `nba/prop-analysis/${date}`;
const sha = (s) => createHash("sha256").update(s).digest("hex");
/** Canonical JSON (keys sorted at every depth) — the same bytes as products/daily-candidates/receipt.mjs canonicalJson,
    inlined so this server module stays import-light. */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
const r1 = (x) => Math.round(x * 10) / 10;

/** Pure. The two artifacts from one private analysis document (build-nba-prop-provisional-analysis.mjs output). */
export function buildPropAnalysisArtifacts(analysis, { laneSha256 }) {
  if (analysis?.schema !== "gtp-nba-prop-provisional-analysis@1") throw new Error("refused: not a provisional prop analysis");
  if (!/^[0-9a-f]{64}$/.test(laneSha256 ?? "")) throw new Error("refused: laneSha256 required");
  const rows = analysis.rows.filter((r) => r.line && (r.state === "COMPARED" || r.state === "EXCLUDED" || r.state === "UNAVAILABLE"))
    .map((r) => {
      const [away, home] = String(r.game).split(" @ ");
      return {
        eventId: r.eventId, tipUtc: r.tipUtc, playerId: r.playerId, player: r.name, team: r.team, opponent: r.team === home ? away : home, market: r.family,
        projection: { value: r.projection, label: PROJECTION_LABEL, snapshotId: laneSha256 }, expectedMinutes: r.expectedMinutes,
        state: r.state === "EXCLUDED" ? "EXCLUDED" : "ELIGIBLE", excluded: r.excluded ?? [],
      };
    })
    .sort((a, b) => a.tipUtc.localeCompare(b.tipUtc) || a.eventId.localeCompare(b.eventId) || a.team.localeCompare(b.team) || a.player.localeCompare(b.player) || a.market.localeCompare(b.market));
  const body = {
    schema: PROP_ANALYSIS_PUBLIC_SCHEMA, sport: "nba", date: analysis.date, label: PROP_ANALYSIS_LABEL, gate: PROP_ANALYSIS_GATE,
    source: { laneFile: analysis.lane.file, laneGeneratedAt: analysis.lane.generatedAt, laneSha256, family: analysis.lane.family },
    guard: analysis.guard.rules, comparisonRule: analysis.comparisonRule, rows,
  };
  const publicDoc = { ...body, contentSha256: sha(canonicalJson(body)) };
  const byKey = new Map(analysis.rows.map((r) => [`${r.eventId}|${r.playerId}|${r.family}`, r]));
  const prices = {
    schema: PROP_ANALYSIS_PRICES_SCHEMA, date: analysis.date, projectionSha256: publicDoc.contentSha256,
    capture: { file: analysis.capture.file, capturedAt: analysis.capture.capturedAt }, offerRule: analysis.offerRule, lineMaxAgeHours: analysis.lineMaxAgeHours,
    rows: rows.map((p) => { const r = byKey.get(`${p.eventId}|${p.playerId}|${p.market}`); return { eventId: p.eventId, playerId: p.playerId, market: p.market, line: r.line.line, book: r.line.book, overAmerican: r.line.overPrice ?? null, underAmerican: r.line.underPrice ?? null, capturedAt: r.line.capturedAt, bookRange: r.bookRange }; }),
  };
  return { publicDoc, pricesPlain: canonicalJson(prices) };
}

/** Write both artifacts (the exporter's only I/O). Refuses without a valid key: no plaintext fallback. */
export function writePropAnalysisArtifacts({ appDir, analysis, laneSha256, env = process.env }) {
  const k = readDisplayKey(env);
  if (!k.ok) throw new Error(`refused: ${k.reason}`);
  const { publicDoc, pricesPlain } = buildPropAnalysisArtifacts(analysis, { laneSha256 });
  const pub = publicPath(appDir, analysis.date), enc = pricesPath(appDir, analysis.date);
  fs.mkdirSync(path.dirname(pub), { recursive: true });
  fs.mkdirSync(path.dirname(enc), { recursive: true });
  fs.writeFileSync(pub, `${JSON.stringify(publicDoc, null, 1)}\n`);
  fs.writeFileSync(enc, encryptDisplayArtifact(pricesPlain, k.key, pricesAad(analysis.date)));
  return { publicFile: pub, pricesFile: enc, rows: publicDoc.rows.length, contentSha256: publicDoc.contentSha256, kid: k.kid };
}

/**
 * The site reader. null when there is no public file for the date.
 * @returns {null | { label, gate, date, source, pricesAvailable, rows: Array<public row & { line, book, overAmerican,
 *   underAmerican, capturedAt, difference, differenceExact, side, comparison }> }}
 */
export function readPropAnalysis({ appDir, date, env = process.env, asOf }) {
  const pub = publicPath(appDir, date);
  if (!fs.existsSync(pub)) return null;
  const doc = JSON.parse(fs.readFileSync(pub, "utf8"));
  const { contentSha256, ...body } = doc;
  if (doc.schema !== PROP_ANALYSIS_PUBLIC_SCHEMA || sha(canonicalJson(body)) !== contentSha256) throw new Error(`prop analysis ${date}: public file failed its contentSha256 check`);
  const base = { label: doc.label, gate: doc.gate, date: doc.date, source: doc.source, guard: doc.guard };
  const k = readDisplayKey(env);
  const encFile = pricesPath(appDir, date);
  const text = k.ok && fs.existsSync(encFile) ? decryptDisplayArtifact(fs.readFileSync(encFile, "utf8"), k.key, pricesAad(date)) : null;
  const blank = { line: null, book: null, overAmerican: null, underAmerican: null, capturedAt: null, difference: null, differenceExact: null, side: null, comparison: null };
  if (text == null) return { ...base, pricesAvailable: false, rows: doc.rows.map((r) => ({ ...r, ...blank })) };
  const prices = JSON.parse(text);
  if (prices.schema !== PROP_ANALYSIS_PRICES_SCHEMA || prices.projectionSha256 !== contentSha256) throw new Error(`prop analysis ${date}: prices file is bound to a different public file`);
  const byKey = new Map(prices.rows.map((p) => [`${p.eventId}|${p.playerId}|${p.market}`, p]));
  const at = asOf ?? new Date().toISOString();
  const rows = doc.rows.map((r) => {
    const p = byKey.get(`${r.eventId}|${r.playerId}|${r.market}`);
    if (!p) return { ...r, ...blank, comparison: "NO_LINE" };
    const priced = { line: p.line, book: p.book, overAmerican: p.overAmerican, underAmerican: p.underAmerican, capturedAt: p.capturedAt, bookRange: p.bookRange };
    if (r.state !== "ELIGIBLE") return { ...r, ...blank, ...priced, comparison: "EXCLUDED" };
    const c = compareToLine({ family: r.market, median: r.projection.value }, { eventId: r.eventId, athleteId: r.playerId, marketKey: MARKET_KEYS[r.market], slateDate: date, line: p.line, book: p.book, capturedAt: p.capturedAt, overPrice: p.overAmerican, underPrice: p.underAmerican }, { eventId: r.eventId, athleteId: r.playerId, slateDate: date, tipUtc: r.tipUtc, asOf: at });
    if (c.direction === "UNAVAILABLE") return { ...r, ...blank, ...priced, comparison: c.reason };
    return { ...r, ...priced, difference: r1(c.differenceExact), differenceExact: c.differenceExact, side: c.side, comparison: "COMPARED" };
  });
  return { ...base, pricesAvailable: true, rows };
}
