/**
 * Build-time reader for MLB game calls' publication status (F05). ONE reader: the /results overview, the day pages
 * (and through them Ask's results days) all classify a graded MLB call through here, so a call counted as paused on
 * one surface is paused on every one. The rule itself is pure and lives in lib/results/mlb-call-publication.mjs.
 *
 * Evidence read: the model-health scorecard this build ships (public/data/admin/model-health.json — the same file the
 * live-record gate reads) and the committed forecast-of-record deployment evidence
 * (data/internal/ops/forecast-of-record-shadow/classification.json). Either missing degrades to less evidence, never
 * to a guess: a row the remaining evidence cannot decide is UNKNOWN.
 */
import fs from "node:fs";
import path from "node:path";

import { mlbCallPublication, servedEvidence } from "@/lib/results/mlb-call-publication.mjs";

export type MlbCallPublicationStatus = "PUBLIC" | "PAUSED" | "NOT_SERVED" | "UNKNOWN";

const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

let memo: { appDir: string; ctx: Parameters<typeof mlbCallPublication>[1] } | null = null;

function context() {
  const appDir = process.cwd();
  if (memo && memo.appDir === appDir) return memo.ctx;
  const ctx = {
    scorecard: readJson(path.join(appDir, "public/data/admin/model-health.json")),
    evidence: servedEvidence(readJson(path.resolve(appDir, "..", "data/internal/ops/forecast-of-record-shadow/classification.json"))),
  };
  memo = { appDir, ctx };
  return ctx;
}

/** One graded row of public/data/mlb/results/game-predictions-graded.jsonl → its publication status at first pitch. */
export function mlbCallStatus(row: Record<string, unknown>): MlbCallPublicationStatus {
  return mlbCallPublication(row as never, context()).status as MlbCallPublicationStatus;
}
