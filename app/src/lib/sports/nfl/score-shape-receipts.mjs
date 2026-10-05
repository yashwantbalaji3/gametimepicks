/**
 * NFL SCORE SHAPE — THE PRE-KICKOFF RECEIPT (NFL Department · 2026-10-05).
 *
 * The public score-shape file (app/public/data/nfl/score-shape/<date>.json) is rebuilt on every
 * nfl-event-window run from the games that have NOT started, so a game drops out of it at its first
 * run after kickoff. The shape that was public at kickoff then survives only in git history, and
 * nothing can grade a forecast whose record is "whatever the last commit before kickoff said".
 *
 * This is the receipt that makes it gradable, on the same rules as the forecast receipts
 * (data/internal/nfl/forecast-receipts/): written before kickoff, never rewritten, a pre-kickoff
 * input change writes a NEW revision beside the original, and nothing is ever written for a game
 * that has started. The receipt of record is the latest revision generated strictly before kickoff.
 *
 * Identity of a shape = the forecast it was solved onto (its inputHash) + the engine version + the
 * run count. The shape's random seed is derived from the same key, so identical inputs give an
 * identical shape and a re-run is UNCHANGED, not a new revision.
 */
import fs from "node:fs";
import path from "node:path";

/** The receipt key: what the shape was computed FROM. Null when the forecast carries no input hash. */
export function scoreShapeReceiptKey({ forecastInputHash, engineId, runs }) {
  if (!forecastInputHash || !engineId || !Number.isFinite(runs)) return null;
  return `${engineId}|${forecastInputHash}|${runs}`;
}

/** Folder a game's receipts live in: its kickoff date (UTC), so every revision of one game sits together. */
export function scoreShapeReceiptDir(root, kickoffUtc) {
  return path.join(root, "data/internal/nfl/score-shape-receipts", String(kickoffUtc).slice(0, 10));
}

const receiptFileRe = (id) => new RegExp(`^${id}(?:-rev-\\d{8}T\\d{4}Z)?\\.json$`);

/** Every receipt already on disk for one game, oldest first. */
export function existingScoreShapeReceipts(dir, providerEventId) {
  if (!fs.existsSync(dir)) return [];
  const re = receiptFileRe(String(providerEventId));
  return fs.readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => { try { return { file: f, receipt: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => String(a.receipt.generatedAt).localeCompare(String(b.receipt.generatedAt)));
}

/**
 * Decide what to write for one game. Pure: no I/O.
 * @returns {{action: "WRITE_ORIGINAL"|"WRITE_REVISION"|"UNCHANGED"|"LOCKED_AT_KICKOFF"|"NO_KEY", file?: string, reason?: string}}
 */
export function planScoreShapeReceipt({ providerEventId, kickoffUtc, receiptKey, nowIso, existing = [] }) {
  const kickoff = Date.parse(kickoffUtc);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(kickoff) || !Number.isFinite(now) || now >= kickoff) {
    return { action: "LOCKED_AT_KICKOFF", reason: "a receipt is only ever written before its game starts" };
  }
  if (!receiptKey) return { action: "NO_KEY", reason: "the published forecast carries no inputHash, so the shape has no stable identity" };
  const id = String(providerEventId);
  if (!existing.length) return { action: "WRITE_ORIGINAL", file: `${id}.json` };
  const latest = existing[existing.length - 1].receipt;
  if (latest?.receiptKey === receiptKey) return { action: "UNCHANGED" };
  const stamp = nowIso.slice(0, 16).replace(/[-:]/g, "");
  const file = `${id}-rev-${stamp}Z.json`;
  if (existing.some((e) => e.file === file)) return { action: "UNCHANGED", reason: `a revision stamped ${stamp}Z already exists; never overwritten` };
  return { action: "WRITE_REVISION", file, revisionOf: existing[existing.length - 1].file };
}

/** The receipt body for one solved game (the same entry the public file publishes, plus provenance). */
export function buildScoreShapeReceipt({ game, forecast, receiptKey, engineId, runs, nowIso, revisionOf = null }) {
  return {
    schemaVersion: 1,
    artifact: "nfl-score-shape-receipt",
    dataClass: "INTERNAL_RECEIPT",
    rule: "Written before kickoff, never rewritten. The receipt of record is the latest revision generated strictly before kickoff.",
    providerEventId: String(game.providerEventId),
    canonicalEventId: game.canonicalEventId ?? null,
    matchup: game.matchup,
    kickoffUtc: game.kickoffUtc,
    away: game.away,
    home: game.home,
    generatedAt: nowIso,
    receiptKey,
    engine: { id: engineId, runs },
    solvedOnto: {
      artifact: "nfl-public-forecasts",
      forecastGeneratedAt: forecast?.generatedAt ?? null,
      forecastInputHash: forecast?.model?.inputHash ?? null,
      modelVersion: forecast?.model?.version ?? null,
    },
    ...(revisionOf ? { revisionOf } : {}),
    shape: {
      centre: game.centre,
      finalScores: game.finalScores,
      keyNumbers: game.keyNumbers,
      marginDistribution: game.marginDistribution,
      totalDistribution: game.totalDistribution,
      teamPointsDistribution: game.teamPointsDistribution,
      scoringRates: game.scoringRates,
      overtimeProbability: game.overtimeProbability,
      tieProbability: game.tieProbability,
    },
  };
}

/** Write one receipt, refusing to touch a file that exists. Returns the action actually taken. */
export function writeScoreShapeReceipt({ root, game, forecast, receiptKey, engineId, runs, nowIso }) {
  const dir = scoreShapeReceiptDir(root, game.kickoffUtc);
  const plan = planScoreShapeReceipt({
    providerEventId: game.providerEventId, kickoffUtc: game.kickoffUtc, receiptKey, nowIso,
    existing: existingScoreShapeReceipts(dir, game.providerEventId),
  });
  if (plan.action !== "WRITE_ORIGINAL" && plan.action !== "WRITE_REVISION") return plan;
  const out = path.join(dir, plan.file);
  if (fs.existsSync(out)) return { action: "UNCHANGED", reason: `${plan.file} exists; never overwritten` };
  fs.mkdirSync(dir, { recursive: true });
  const body = buildScoreShapeReceipt({ game, forecast, receiptKey, engineId, runs, nowIso, revisionOf: plan.revisionOf ?? null });
  fs.writeFileSync(out, `${JSON.stringify(body, null, 1)}\n`, { flag: "wx" });
  return plan;
}
