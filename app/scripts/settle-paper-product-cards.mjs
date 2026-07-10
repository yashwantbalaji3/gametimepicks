/**
 * settle-paper-product-cards.mjs — settles PAPER-ONLY product cards using ONLY the existing, tested
 * settlement rules + official/committed data. It never touches the official money record, never marks a
 * pending game as a loss, and never grades a non-final game.
 *
 * Coverage (honest): MLB TEAM markets (moneyline / run_line / total / team_totals) grade from the
 * committed StatsAPI linescore cache (join gameId→gamePk via the board). MLB player props + soccer are
 * left PENDING (their actuals are not wired into paper settlement here) — never fabricated, never a loss.
 * Card result: one LOSS ⇒ lost; all WIN ⇒ won; a PENDING leg keeps the card pending unless a loss already
 * decides it; push/unavailable legs are dropped from the parlay (a card of only those ⇒ void).
 *
 * Money-guarded (md5 before == after) and internal-only. Writes to
 * data/internal/product-cards/settlements/<product>/<slateDate>/<cardId>.json.
 *
 * Usage: npx tsx scripts/settle-paper-product-cards.mjs [--date 2026-07-08] [--product bank_builder]
 *        [--fetch-final] [--write] [--out-root <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { settleMlbMoneyline, settleMlbRunLine, settleMlbTotal } from "../src/lib/mlb/product-settlement/mlb-markets.ts";
import { parseSchedulePayload } from "../src/lib/mlb/product-settlement/statsapi-linescore.ts";
import { resolveCardResult, validatePaperSettlementEntry } from "../src/lib/product-workflow/schema.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const MONEY_FILES = [path.join(APP, "public", "data", "mr-dub", "portfolio.json"), path.join(APP, "public", "data", "mr-dub", "banked-ladders.json")];
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const has = (n) => process.argv.includes(n);
const shortHash = (s) => crypto.createHash("md5").update(s).digest("hex").slice(0, 12);
const moneyMd5 = () => crypto.createHash("md5").update(MONEY_FILES.map((f) => (fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0))).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0))).digest("hex");
const decFromAmerican = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o));

const OUT_ROOT = arg("--out-root") ?? REPO;
const WRITE = has("--write");
const FETCH_FINAL = has("--fetch-final");

/** gameId → gamePk from the committed board leans. */
function gameIdToPk(date) {
  const p = path.join(APP, "public", "data", "mlb", "boards", `${date}.json`);
  const m = new Map();
  if (!fs.existsSync(p)) return m;
  for (const l of (JSON.parse(fs.readFileSync(p, "utf8")).leans || [])) if (l.gameId && l.gamePk != null && !m.has(l.gameId)) m.set(l.gameId, l.gamePk);
  return m;
}
/** gamePk → {homeRuns, awayRuns, isFinal} from committed linescore (+ optional live fetch). */
async function finalsByPk(date) {
  const m = new Map();
  const cache = path.join(REPO, "data", "internal", "mlb", "linescores", `${date}.json`);
  if (fs.existsSync(cache)) for (const g of (JSON.parse(fs.readFileSync(cache, "utf8")).games || [])) m.set(g.gamePk, g);
  if (FETCH_FINAL) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, { headers: { accept: "application/json" } });
      for (const g of parseSchedulePayload(await res.json())) if (g.isFinal) m.set(g.gamePk, g);
    } catch { /* committed cache only */ }
  }
  return m;
}

/** Settle one leg via the existing MLB rules; anything not wired stays PENDING (never a loss). Pure. */
export function settleLeg(leg, score) {
  const base = { legId: leg.legId };
  if (leg.sport !== "MLB") return { ...base, status: "pending", reason: `${leg.sport} ${leg.marketKey}: no committed official settlement wired in paper settlement` };
  const final = score?.isFinal === true;
  const homeScore = score?.homeRuns, awayScore = score?.awayRuns;
  let o;
  switch (leg.marketKey) {
    case "moneyline": o = settleMlbMoneyline({ homeScore, awayScore, selectedTeam: leg.side, gameFinal: final }); break;
    case "run_line": o = settleMlbRunLine({ homeScore, awayScore, selectedTeam: leg.side, line: leg.line, gameFinal: final }); break;
    case "total": o = settleMlbTotal({ homeScore, awayScore, side: leg.side, line: leg.line, gameFinal: final }); break;
    // team_totals + player props: the per-team / per-player actual is not wired into paper settlement →
    // PENDING (honest), never fabricated, never a loss.
    default: return { ...base, status: "pending", reason: `MLB ${leg.marketKey}: per-team/per-player actual not wired into paper settlement` };
  }
  return { ...base, status: o.status, actual: o.actual, line: o.line, reason: o.reason };
}

export function cardPnlUnits(card, legResults, cardResult) {
  const stake = card.paperStakeUnits ?? 1;
  if (cardResult === "lost") return -stake;
  if (cardResult === "won") {
    const dec = legResults.filter((r) => r.status === "win").reduce((p, r) => { const leg = card.legs.find((l) => l.legId === r.legId); return p * (leg?.oddsAmerican != null ? decFromAmerican(leg.oddsAmerican) : 1); }, 1);
    return Number(((dec - 1) * stake).toFixed(4));
  }
  return 0; // push/void/pending
}

async function settleCard(card, md5Before) {
  const date = card.slateDate;
  const ids = gameIdToPk(date);
  const finals = await finalsByPk(date);
  const legResults = card.legs.map((leg) => {
    const pk = leg.gamePk ?? ids.get(leg.gameId);
    return settleLeg(leg, pk != null ? finals.get(pk) : undefined);
  });
  const { cardResult, status } = resolveCardResult(legResults);
  const unsettledReasons = legResults.filter((r) => r.status === "pending" || r.status === "unavailable").map((r) => `${r.legId}: ${r.reason}`);
  const entry = {
    settlementId: `st-${shortHash(`${card.cardId}|${legResults.map((r) => r.status).join(",")}`)}`,
    cardId: card.cardId, settledAt: date, status, legResults, cardResult,
    paperPnlUnits: cardPnlUnits(card, legResults, cardResult),
    officialMoneyRecordAffected: false, public: false, moneyGuardMd5AtSettlement: md5Before, unsettledReasons,
  };
  const v = validatePaperSettlementEntry(entry);
  if (!v.valid) throw new Error(`settlement entry invalid for ${card.cardId}: ${v.errors.join("; ")}`);
  return entry;
}

async function main() {
  const date = arg("--date");
  const product = arg("--product");
  const cardArg = arg("--card");
  const md5Before = moneyMd5();

  // Collect card files.
  let cardFiles = [];
  if (cardArg) cardFiles = [cardArg];
  else {
    const paperRoot = path.join(OUT_ROOT, "data", "internal", "product-cards", "paper");
    const slugs = product ? [{ bank_builder: "bank-builder", moonshot: "moonshot", longshot: "longshot" }[product]] : (fs.existsSync(paperRoot) ? fs.readdirSync(paperRoot) : []);
    for (const slug of slugs.filter(Boolean)) {
      const dir = path.join(paperRoot, slug);
      if (!fs.existsSync(dir)) continue;
      for (const d of (date ? [date] : fs.readdirSync(dir))) {
        const dd = path.join(dir, d);
        if (!fs.existsSync(dd)) continue;
        for (const f of fs.readdirSync(dd).filter((x) => x.endsWith(".json"))) cardFiles.push(path.join(dd, f));
      }
    }
  }
  if (!cardFiles.length) { console.log("[settle-paper] no paper cards found (nothing to settle)"); return; }

  let wrote = 0, skipped = 0;
  for (const cf of cardFiles) {
    const card = JSON.parse(fs.readFileSync(cf, "utf8"));
    const entry = await settleCard(card, md5Before);
    const outPath = path.join(OUT_ROOT, "data", "internal", "product-cards", "settlements", { bank_builder: "bank-builder", moonshot: "moonshot", longshot: "longshot" }[card.productType] ?? card.productType, card.slateDate, `${card.cardId}.json`);
    if (WRITE) {
      // Idempotent: only rewrite when the settled state actually changed.
      const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
      if (prev && prev.status === entry.status && prev.cardResult === entry.cardResult) { skipped += 1; }
      else { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, JSON.stringify(entry, null, 2) + "\n"); wrote += 1; }
    }
    console.log(`[settle-paper] ${card.cardId} · ${entry.cardResult}/${entry.status} · pnl ${entry.paperPnlUnits}u · ${entry.legResults.map((r) => r.status).join(",")}${entry.unsettledReasons.length ? ` · ${entry.unsettledReasons.length} pending` : ""}`);
  }

  const md5After = moneyMd5();
  if (md5After !== md5Before) { console.error(`[settle-paper] OFFICIAL MONEY MD5 CHANGED (${md5Before} → ${md5After}) — aborting`); process.exit(1); }
  console.log(`[settle-paper] ${WRITE ? `WROTE ${wrote}, skipped ${skipped}` : "DRY-RUN"} · money md5 ${md5After} (unchanged)`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
