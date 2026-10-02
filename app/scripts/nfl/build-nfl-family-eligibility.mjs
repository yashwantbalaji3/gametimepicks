#!/usr/bin/env node
/**
 * NFL FAMILY ELIGIBILITY (Session 9 · G) — the family-level product gate, evaluated on the NEXT NFL slate
 * (every board kicking off in the next 8 days) and published in public terms for Ask and the site.
 *
 *   npx tsx app/scripts/nfl/build-nfl-family-eligibility.mjs --now <ISO> [--write]   (tsx: the sport registry is .ts)
 *
 * Same evidence path as the daily universe (loadNflBoardCandidates → receiptFromNflBoardCandidate →
 * deriveNflFamilyGates, with the committed forward receipt), so the two can never disagree; it differs only
 * in WHICH boards it reads — the universe is per ET date, and on a weekday with no NFL game its gate is empty,
 * which would leave "why isn't NFL in Bank Builder?" with nothing to cite. Free; reads committed files only.
 * Writes app/public/data/nfl/family-eligibility.json only when its content (not its timestamp) changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNflBoardCandidates, etDateOf } from "../../src/lib/products/engine-v2/nfl-boards.mjs";
import { receiptFromNflBoardCandidate } from "../../src/lib/products/engine-v2/sources.mjs";
import { deriveNflFamilyGates } from "../../src/lib/products/engine-v2/family-gate.mjs";
import { sportState } from "../../src/lib/products/engine-v2/eligibility.mjs";
import { buildPublicFamilyEligibility } from "../../src/lib/products/engine-v2/nfl-family-eligibility-public.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = path.resolve(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(2); }
const nowMs = Date.parse(NOW);
const HORIZON_MS = 8 * 24 * 3600_000;
const kick = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));

export function buildFamilyEligibility({ now = NOW, root = path.join(APP, "public", "data"), repo = REPO } = {}) {
  const t = Date.parse(now);
  const boards = loadNflBoardCandidates({
    dataRoot: root, workflowsDir: path.join(repo, ".github/workflows"),
    boardFilter: (b) => { const k = kick(b.kickoffUtc); return Number.isFinite(k) && k > t && k - t <= HORIZON_MS; },
  });
  const receipts = boards.candidates.map((c) => receiptFromNflBoardCandidate(c));
  const forwardReceipt = (() => { try { return JSON.parse(fs.readFileSync(path.join(repo, "data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json"), "utf8")); } catch { return null; } })();
  const gates = deriveNflFamilyGates({ receipts, forwardReceipt, familyState: boards.familyState });
  const dates = boards.boards.map((b) => etDateOf(String(b.kickoffUtc).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"))).filter(Boolean).sort();
  return buildPublicFamilyEligibility({
    gates, generatedAt: now, sportState: sportState("nfl"),
    slate: { from: dates[0] ?? null, to: dates.at(-1) ?? null, events: new Set(boards.boards.map((b) => b.providerEventId)).size },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const doc = buildFamilyEligibility();
  const file = path.join(APP, "public/data/nfl/family-eligibility.json");
  const prior = (() => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } })();
  const content = (d) => JSON.stringify({ ...d, generatedAt: null });
  const changed = !prior || content(prior) !== content(doc);
  console.log(`nfl family eligibility · slate ${doc.slate.from ?? "—"}→${doc.slate.to ?? "—"} (${doc.slate.events} events) · ${doc.families.length} families · eligible ${doc.families.filter((f) => f.eligibleForOfficialProducts).length}${changed ? "" : " · UNCHANGED"}`);
  for (const f of doc.families) console.log(`  ${f.family.padEnd(22)} ${f.eligibleForOfficialProducts ? "ELIGIBLE" : "not eligible"} · ${f.blockers.map((b) => b.code).join(", ")}`);
  if (process.argv.includes("--write") && changed) { fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n"); console.log(`  wrote ${path.relative(APP, file)}`); }
}
