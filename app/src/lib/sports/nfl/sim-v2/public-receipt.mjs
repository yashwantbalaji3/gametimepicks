/**
 * NFL SIMULATION V2 — WHICH RECEIPT A READER MAY SEE (founder P0 · 2026-10-05). Pure apart from reading the committed
 * shadow receipts. The engine and receipts stay SHADOW (not promoted, not canonical); this module only decides whether
 * one game's frozen pre-kickoff receipt is fit to show on the separate, clearly EXPERIMENTAL Simulation page.
 *
 * THE RECEIPT OF RECORD for a game is the latest receipt generated strictly BEFORE its kickoff. Nothing written at or
 * after kickoff can be the record, so a live game is never re-simulated into the page.
 *
 * FAIL CLOSED. The record is shown only when it passes validateSimulationReceipt (0 incoherent runs, sampleCount =
 * runCount, market not an input, representative runs labelled and real, no self-claimed PUBLIC promotion) AND it has
 * at least MIN_PUBLIC_RUNS runs. If the record fails, the game shows nothing; an older receipt is never substituted,
 * because the older one is not what the engine last said before kickoff.
 */
import fs from "node:fs";
import path from "node:path";

import { validateSimulationReceipt } from "./receipt.mjs";

export const SHADOW_DIR_REL = "data/internal/research/nfl/sim-v2/shadow";
export const MIN_PUBLIC_RUNS = 10000;

/** Every committed shadow receipt under <repoRoot>/data/internal/research/nfl/sim-v2/shadow, with its relative path. */
export function readShadowReceipts(repoRoot) {
  const root = path.join(repoRoot, SHADOW_DIR_REL);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const d of fs.readdirSync(root).sort()) {
    const dir = path.join(root, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      try {
        out.push({ file: `${SHADOW_DIR_REL}/${d}/${f}`, receipt: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) });
      } catch { /* an unreadable file is not a receipt */ }
    }
  }
  return out;
}

/**
 * The receipt of record for one event and whether it may be shown.
 * @returns {{ eventId, file, receipt, showable: boolean, refusals: string[], preKickoffCount: number } | null}
 *          null when the event has no receipt generated before kickoff.
 */
export function simulationOfRecord(entries, eventId) {
  const id = String(eventId);
  const pre = entries
    .filter((e) => String(e.receipt?.eventId) === id)
    .filter((e) => {
      const g = Date.parse(e.receipt.generatedAt);
      const k = Date.parse(e.receipt.eventStart);
      return Number.isFinite(g) && Number.isFinite(k) && g < k;
    })
    .sort((a, b) => String(a.receipt.generatedAt).localeCompare(String(b.receipt.generatedAt)) || a.file.localeCompare(b.file));
  if (!pre.length) return null;
  const rec = pre[pre.length - 1];
  const refusals = validateSimulationReceipt(rec.receipt);
  if (!(rec.receipt.runCount >= MIN_PUBLIC_RUNS)) refusals.push(`runCount ${rec.receipt.runCount} < ${MIN_PUBLIC_RUNS}`);
  if (rec.receipt.promotionState !== "SHADOW" && rec.receipt.promotionState !== "EXPERIMENTAL") refusals.push(`promotionState ${rec.receipt.promotionState}`);
  return { eventId: id, file: rec.file, receipt: rec.receipt, showable: refusals.length === 0, refusals, preKickoffCount: pre.length };
}

/** Event ids whose receipt of record may be shown, sorted. */
export function showableSimulationEvents(entries) {
  const ids = [...new Set(entries.map((e) => String(e.receipt?.eventId ?? "")).filter(Boolean))].sort();
  return ids.filter((id) => simulationOfRecord(entries, id)?.showable);
}
