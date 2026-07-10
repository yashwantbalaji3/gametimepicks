/**
 * build-paper-track-record.mjs — an INTERNAL-ONLY summary of paper-card performance, kept strictly
 * separate from the official 19-14 money record. It reads committed paper cards + their settlements and
 * tallies paper units only. It NEVER reads/writes money, is NEVER web-served, and makes no public claim.
 *
 * With a single pending slate the track record is explicitly "not meaningful yet".
 *
 * Output: data/internal/product-cards/track-record/summary.json (public:false).
 * Usage:  npx tsx scripts/build-paper-track-record.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const CARDS = path.join(REPO, "data", "internal", "product-cards");
const OUT_DIR = path.join(CARDS, "track-record");
const WRITE = process.argv.includes("--write");
const SLUG_TO_PRODUCT = { "bank-builder": "bank_builder", moonshot: "moonshot", longshot: "longshot" };

const walk = (d) => (!fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
}));

function main() {
  const cardFiles = walk(path.join(CARDS, "paper"));
  const cards = cardFiles.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));

  const byProduct = {}; const bySportMix = {}; const byStatus = {};
  let settled = 0, pending = 0, wins = 0, losses = 0, voids = 0, pushes = 0, pnl = 0;
  let lastSlate = null;

  for (const c of cards) {
    const slug = { bank_builder: "bank-builder", moonshot: "moonshot", longshot: "longshot" }[c.productType] ?? c.productType;
    const settlement = (() => {
      const p = path.join(CARDS, "settlements", slug, c.slateDate, `${c.cardId}.json`);
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
    })();
    const result = settlement?.cardResult ?? "pending";
    const units = typeof settlement?.paperPnlUnits === "number" ? settlement.paperPnlUnits : 0;

    if (result === "pending") pending += 1; else settled += 1;
    if (result === "won") wins += 1;
    else if (result === "lost") losses += 1;
    else if (result === "void") voids += 1;
    else if (result === "push") pushes += 1;
    if (result !== "pending") pnl += units;

    byProduct[c.productType] = (byProduct[c.productType] ?? 0) + 1;
    const sports = [...new Set((c.legs || []).map((l) => l.sport))];
    const mix = sports.length > 1 ? "Multi-sport" : (sports[0] ?? "unknown");
    bySportMix[mix] = (bySportMix[mix] ?? 0) + 1;
    byStatus[result] = (byStatus[result] ?? 0) + 1;
    if (!lastSlate || c.slateDate > lastSlate) lastSlate = c.slateDate;
    void SLUG_TO_PRODUCT;
  }

  const meaningful = settled >= 10; // an internal rule of thumb; a handful of cards proves nothing
  const summary = {
    kind: "paper-track-record", public: false, internal: true,
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    lastUpdatedSlateDate: lastSlate,
    paperCardsTotal: cards.length, paperCardsSettled: settled, paperCardsPending: pending,
    paperWins: wins, paperLosses: losses, paperVoids: voids, paperPushes: pushes,
    paperPnlUnits: Number(pnl.toFixed(4)),
    byProduct, bySportMix, byStatus,
    meaningful,
    verdict: meaningful
      ? `paper track record across ${settled} settled card(s)`
      : `NOT MEANINGFUL YET — only ${settled} settled card(s) (${pending} pending). Paper units only; never part of the official 19-14 record.`,
    note: "INTERNAL paper-only track record. Paper units, never dollars; never summed into bankroll/record. NOT web-served. Separate from the official 19-14 money record.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n"); }
  console.log(`[paper-track-record] ${WRITE ? "WROTE" : "DRY-RUN"} · cards ${cards.length} (settled ${settled}, pending ${pending}) · W-L-V-P ${wins}-${losses}-${voids}-${pushes} · pnl ${summary.paperPnlUnits}u · ${meaningful ? "meaningful" : "NOT meaningful yet"}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist to data/internal)");
}

main();
