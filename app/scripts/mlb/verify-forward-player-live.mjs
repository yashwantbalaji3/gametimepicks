#!/usr/bin/env node
/**
 * Option A · POSTGAME evidence check of live research receipts (separate from capture; read-only; research only).
 *
 *   node scripts/mlb/verify-forward-player-live.mjs [--from 2026-10-10] [--json]
 *
 * For every receipt under data/internal/research/mlb/forward-player-live/<date>/<gamePk>.json:
 *   - integrity: its receiptSha256 recomputes; it was never rewritten (exactly one commit touches the file);
 *   - timing: the commit that ADDED it is before the game's actual first pitch, taken from the latest
 *     data/internal/mlb/actual-first-pitch/*.json capture (#1046: StatsAPI play-by-play, an interval [from, to]); a
 *     game with no actual-start evidence yet is PENDING, never verified by assumption;
 *   - generatedAt < scheduledStart and every input capturedAt <= generatedAt.
 * Classes: VERIFIED_PREGAME · PENDING_EVIDENCE · NOT_PREGAME · TAMPERED · UNCOMMITTED. Only VERIFIED_PREGAME
 * receipts may ever count toward a live forward evaluation. It prints counts only (no model performance).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const FROM = arg("--from") ?? "0000-00-00";
const ROOT = path.join(REPO, "data/internal/research/mlb/forward-player-live");
const git = (...a) => { try { return execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" }).trim(); } catch { return ""; } };

// Actual first pitch, from the newest capture that has the game.
const afpDir = path.join(REPO, "data/internal/mlb/actual-first-pitch");
const actual = new Map();
if (fs.existsSync(afpDir)) for (const f of fs.readdirSync(afpDir).filter((x) => x.endsWith(".json")).sort()) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(afpDir, f), "utf8"));
    for (const g of j.games ?? []) {
      // #1046's rule: the first pitch lies in [firstPitchEvent − 10 s, firstPitchEvent]; else the minute-precision
      // actual time minus its precision. The EARLIEST instant is the bound a pregame receipt must beat.
      const ev = Date.parse(g?.firstPitchEvent ?? ""); const ap = Date.parse(g?.actualFirstPitch ?? "");
      const from = Number.isFinite(ev) ? ev - 10_000 : Number.isFinite(ap) ? ap - 1000 * (g.precisionSec ?? 60) : NaN;
      if (g?.gamePk != null && Number.isFinite(from)) actual.set(g.gamePk, { from: new Date(from).toISOString(), source: f });
    }
  } catch { /* unreadable capture: ignored */ }
}

const rows = [];
if (fs.existsSync(ROOT)) for (const d of fs.readdirSync(ROOT).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= FROM).sort()) {
  for (const f of fs.readdirSync(path.join(ROOT, d)).filter((x) => x.endsWith(".json"))) {
    const rel = path.relative(REPO, path.join(ROOT, d, f));
    const r = JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
    const { receiptSha256, ...body } = r;
    const intact = receiptSha256 === crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const commits = git("log", "--format=%H %cI", "--", rel).split("\n").filter(Boolean);
    const added = commits.length ? commits[commits.length - 1].split(" ")[1] : null;
    const a = actual.get(r.gamePk) ?? null;
    const inputsOk = Date.parse(r.generatedAt) < Date.parse(r.scheduledStart) && ["lineup", "matchup"].every((k) => Date.parse(r.inputs?.[k]?.capturedAt) <= Date.parse(r.generatedAt));
    let cls;
    if (!intact || commits.length > 1) cls = "TAMPERED";
    else if (!added) cls = "UNCOMMITTED";
    else if (!inputsOk) cls = "NOT_PREGAME";
    else if (!a) cls = "PENDING_EVIDENCE";
    else cls = Date.parse(added) < Date.parse(a.from) ? "VERIFIED_PREGAME" : "NOT_PREGAME";
    rows.push({ date: d, gamePk: r.gamePk, class: cls, committedAt: added, actualStartFrom: a?.from ?? null, generatedAt: r.generatedAt });
  }
}
const counts = rows.reduce((m, x) => ({ ...m, [x.class]: (m[x.class] ?? 0) + 1 }), {});
console.log(`[forward-player-live verify] ${rows.length} receipt(s): ${JSON.stringify(counts)}`);
if (process.argv.includes("--json")) console.log(JSON.stringify(rows));
