/**
 * build-paper-track-record.mjs — the INTERNAL paper-card hit-rate ledger. Reads committed paper cards +
 * settlements and tallies card-level + leg-level performance with product / sport / market / leg-type
 * splits. Paper units ONLY — never dollars, never summed into the official 19-14 record. Read-only re:
 * money; NEVER web-served; makes no public claim; is honest about tiny samples (`meaningful:false`).
 *
 * The official baseline (19-14 / bankroll / exposure / money md5) is carried READ-ONLY, for sanity, and
 * with `officialRecordIncluded:false` — paper results are never part of it.
 *
 * Output (all internal, public:false):
 *   data/internal/product-cards/track-record/summary.json
 *   data/internal/product-cards/track-record/{by-product,by-sport,by-market,by-leg-type}.json
 * Usage: npx tsx scripts/build-paper-track-record.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const CARDS = path.join(REPO, "data", "internal", "product-cards");
const OUT_DIR = path.join(CARDS, "track-record");
const WRITE = process.argv.includes("--write");
const MIN_SAMPLE = 10;

const walk = (d) => (!fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
}));
const rate = (w, l) => (w + l > 0 ? Number((w / (w + l)).toFixed(4)) : null);
const legType = (leg) => (leg.sport === "Soccer" ? "soccer_market" : ["batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts"].includes(leg.marketKey) ? "mlb_player_prop" : "mlb_team_market");

/** A fresh leg-metrics bucket. */
const bucket = () => ({ legs: 0, settledLegs: 0, wins: 0, losses: 0, voids: 0, pushes: 0, pending: 0, paperPnlUnits: 0 });
function bumpLeg(b, status) {
  b.legs += 1;
  if (status === "win") { b.wins += 1; b.settledLegs += 1; }
  else if (status === "loss") { b.losses += 1; b.settledLegs += 1; }
  else if (status === "push") { b.pushes += 1; b.settledLegs += 1; }
  else if (status === "unavailable") { b.voids += 1; b.settledLegs += 1; }
  else b.pending += 1;
}
const finalizeLegBucket = (b) => ({ ...b, legHitRate: rate(b.wins, b.losses), sampleSizeWarning: b.settledLegs < MIN_SAMPLE ? `only ${b.settledLegs} settled leg(s) — not meaningful` : null });

function main() {
  const cards = walk(path.join(CARDS, "paper")).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const settlementOf = (c) => {
    const slug = { bank_builder: "bank-builder", moonshot: "moonshot", longshot: "longshot" }[c.productType] ?? c.productType;
    const p = path.join(CARDS, "settlements", slug, c.slateDate, `${c.cardId}.json`);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
  };

  // Card-level.
  let totalCards = 0, settledCards = 0, pendingCards = 0, wonCards = 0, lostCards = 0, voidedCards = 0;
  let paperUnitsStaked = 0, paperPnlUnits = 0;
  // Leg-level.
  const legTotal = bucket();
  const byProduct = {}, bySport = {}, byMarket = {}, byLegType = {};
  let lastSlate = null;

  for (const c of cards) {
    const s = settlementOf(c);
    const result = s?.cardResult ?? "pending";
    const stake = c.paperStakeUnits ?? 1;
    totalCards += 1;
    if (result === "pending") pendingCards += 1;
    else { settledCards += 1; paperUnitsStaked += stake; paperPnlUnits += (typeof s?.paperPnlUnits === "number" ? s.paperPnlUnits : 0); }
    if (result === "won") wonCards += 1; else if (result === "lost") lostCards += 1; else if (result === "void") voidedCards += 1;
    if (!lastSlate || c.slateDate > lastSlate) lastSlate = c.slateDate;

    // Product split (card + leg).
    const bp = (byProduct[c.productType] ??= { cards: 0, settledCards: 0, wonCards: 0, lostCards: 0, paperPnlUnits: 0, legs: bucket() });
    bp.cards += 1; if (result !== "pending") { bp.settledCards += 1; bp.paperPnlUnits += (s?.paperPnlUnits ?? 0); } if (result === "won") bp.wonCards += 1; if (result === "lost") bp.lostCards += 1;
    // Sport split (card-level mix).
    const sports = [...new Set((c.legs || []).map((l) => l.sport))];
    const mix = sports.length > 1 ? "Mixed" : (sports[0] ?? "unknown");
    const bs = (bySport[mix] ??= { cards: 0, settledCards: 0, wonCards: 0, lostCards: 0, paperPnlUnits: 0 });
    bs.cards += 1; if (result !== "pending") { bs.settledCards += 1; bs.paperPnlUnits += (s?.paperPnlUnits ?? 0); } if (result === "won") bs.wonCards += 1; if (result === "lost") bs.lostCards += 1;

    // Leg-level: join settlement leg results back to the card legs.
    const resById = new Map((s?.legResults ?? []).map((r) => [r.legId, r.status]));
    for (const leg of c.legs || []) {
      const status = resById.get(leg.legId) ?? "pending";
      bumpLeg(legTotal, status);
      bumpLeg(bp.legs, status);
      bumpLeg((byMarket[`${leg.sport} ${leg.marketKey}`] ??= bucket()), status);
      bumpLeg((byLegType[legType(leg)] ??= bucket()), status);
    }
  }

  const meaningful = settledCards >= MIN_SAMPLE;
  const official = (() => {
    const pf = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "mr-dub", "portfolio.json"), "utf8"));
    return { officialRecord: pf.record ? `${pf.record.wins}-${pf.record.losses}` : null, officialBankroll: pf.currentBankroll, officialExposure: pf.openExposure ?? 0, officialMoneyMd5: crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public", "data", "mr-dub", "portfolio.json"))).digest("hex") };
  })();

  const envelope = { public: false, internal: true, officialMoneyRecordAffected: false, officialRecordIncluded: false, paperOnly: true, activationStatus: "internal_only", lastUpdatedSlateDate: lastSlate };
  const summary = {
    kind: "paper-track-record-summary", ...envelope,
    card: {
      totalCards, settledCards, pendingCards, voidedCards, wonCards, lostCards,
      cardHitRate: rate(wonCards, lostCards),
      paperUnitsStaked: Number(paperUnitsStaked.toFixed(4)), paperUnitsReturned: Number((paperUnitsStaked + paperPnlUnits).toFixed(4)),
      paperPnlUnits: Number(paperPnlUnits.toFixed(4)), roiPaperUnits: paperUnitsStaked > 0 ? Number((paperPnlUnits / paperUnitsStaked).toFixed(4)) : null,
    },
    leg: { totalLegs: legTotal.legs, settledLegs: legTotal.settledLegs, pendingLegs: legTotal.pending, wonLegs: legTotal.wins, lostLegs: legTotal.losses, voidedLegs: legTotal.voids, pushedLegs: legTotal.pushes, legHitRate: rate(legTotal.wins, legTotal.losses) },
    meaningful, minimumSampleForMeaningful: MIN_SAMPLE,
    reason: meaningful ? null : "Sample too small; internal paper track record only.",
    official,
    note: "INTERNAL paper-only hit-rate ledger. Paper units, never dollars; NEVER part of the official 19-14 record (officialRecordIncluded:false). Not web-served.",
  };

  const finalizeProduct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { cards: v.cards, settledCards: v.settledCards, cardRecord: `${v.wonCards}-${v.lostCards}`, cardHitRate: rate(v.wonCards, v.lostCards), paperPnlUnits: Number(v.paperPnlUnits.toFixed(4)), legs: v.legs.legs, settledLegs: v.legs.settledLegs, pendingLegs: v.legs.pending, legHitRate: rate(v.legs.wins, v.legs.losses) }]));
  const finalizeSport = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { cards: v.cards, settledCards: v.settledCards, cardRecord: `${v.wonCards}-${v.lostCards}`, cardHitRate: rate(v.wonCards, v.lostCards), paperPnlUnits: Number(v.paperPnlUnits.toFixed(4)) }]));
  const finalizeBuckets = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, finalizeLegBucket(v)]));

  const files = {
    "summary.json": summary,
    "by-product.json": { kind: "paper-track-record-by-product", ...envelope, byProduct: finalizeProduct(byProduct) },
    "by-sport.json": { kind: "paper-track-record-by-sport", ...envelope, bySport: finalizeSport(bySport) },
    "by-market.json": { kind: "paper-track-record-by-market", ...envelope, byMarket: finalizeBuckets(byMarket) },
    "by-leg-type.json": { kind: "paper-track-record-by-leg-type", ...envelope, byLegType: finalizeBuckets(byLegType) },
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); for (const [name, obj] of Object.entries(files)) fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(obj, null, 2) + "\n"); }
  console.log(`[paper-track-record] ${WRITE ? "WROTE 5 files" : "DRY-RUN"} · cards ${totalCards} (settled ${settledCards} → ${wonCards}-${lostCards}, pending ${pendingCards}) · legs ${legTotal.wins}-${legTotal.losses} (${legTotal.pending} pending) · pnl ${summary.card.paperPnlUnits}u · ${meaningful ? "meaningful" : "NOT meaningful yet"}`);
  if (!WRITE) console.log("  (dry run — pass --write)");
}

main();
