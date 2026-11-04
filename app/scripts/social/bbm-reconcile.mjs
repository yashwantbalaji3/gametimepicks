#!/usr/bin/env node
/**
 * BBM V2 RECONCILIATION REPORT for the founder (2026-11-04): one row per lane, every printed number recomputed
 * independently from the engine's own price record and checked against its PAYOUT_COMPUTED, plus the staged package's
 * state. Read only: the private run logs, the public lane files and the staged manifests.
 *
 *   npx tsx scripts/social/bbm-reconcile.mjs --date D --lanes <public lane dir> --private-root <run logs> --staging <dir>
 *
 * Writes <staging>/<D>/RECONCILIATION.md and .json; exits 1 if any lane does not reconcile.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./render-social-pack.mjs";
import { readLaneProjection } from "../../src/lib/challenge-lanes/public-reader.mjs";
import { currentRun } from "../../src/lib/challenge-lanes/store.mjs";
import { laneDisplay } from "../../src/lib/challenge-lanes/display.mjs";

const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const et = (iso) => (iso ? `${ET.format(new Date(Date.parse(iso)))} ET` : null);
const usd = (c) => (Number.isInteger(c) ? `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "n/a");
const pct = (x) => `${(x * 100).toFixed(1)}%`;
/** Independent of the engine: American odds to decimal, and back. */
const decOf = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const amOf = (d) => (d >= 2 ? `+${Math.round((d - 1) * 100)}` : `-${Math.round(100 / (d - 1))}`);

/** One lane's reconciliation row, or a row with its problems. */
export function reconcileLane({ laneId, doc, events, date, manifest = null }) {
  const problems = [];
  const card = events.findLast((e) => e.type === "CARD_FROZEN" && e.date === date);
  const pay = events.findLast((e) => e.type === "PAYOUT_COMPUTED" && e.date === date);
  const pv = pay && events.find((e) => e.type === "PRICE_VERIFIED" && e.sha256 === pay.inputs?.priceEventSha256);
  const stakeEv = events.findLast((e) => e.type === "STAKE_SET" && e.date === date);
  if (!card || !pay || !pv) return { laneId, ok: false, problems: ["no priced card for this date in the private log"] };
  const d = laneDisplay(doc, { date });
  const priceOf = new Map(pv.price.legs.map((l) => [String(l.legId), l]));
  const legs = card.card.legs.map((l) => {
    const p = priceOf.get(String(l.legId));
    if (!p) { problems.push(`${l.legId}: no price`); return { legId: l.legId }; }
    const dec = decOf(p.price);
    return { legId: l.legId, side: l.selection?.teamAbbr, book: p.book, american: p.price > 0 ? `+${p.price}` : `${p.price}`, decimal: dec, breakEven: 1 / dec, modelWin: l.probability, edgeVsBreakEven: l.probability - 1 / dec, capturedAt: p.fetchedAt, capturedEt: et(p.fetchedAt) };
  });
  const books = [...new Set(legs.map((l) => l.book))];
  if (books.length !== 1) problems.push(`legs come from ${books.length} books`);
  const dec = legs.reduce((a, l) => a * (l.decimal ?? NaN), 1);
  const joint = legs.reduce((a, l) => a * (l.modelWin ?? NaN), 1);
  if (Math.abs(dec - pay.inputs.decimalPrice) > 1e-9) problems.push(`combined decimal ${dec} is not the engine's ${pay.inputs.decimalPrice}`);
  const sameGame = new Set(card.card.legs.map((l) => l.gameId)).size !== card.card.legs.length;
  const stake = stakeEv?.stakeCents ?? pay.inputs.stakeCents;
  const gross = Math.round(stake * dec);
  if (Math.abs(gross - pay.grossPayoutCents) > 1) problems.push(`gross ${gross} recomputed vs engine ${pay.grossPayoutCents}`);
  if (pay.grossPayoutCents - pay.profitCents !== stake) problems.push("engine profit is not gross - stake");
  const belowPace = pay.inputs.belowPace === true;
  if (typeof pay.inputs.pace === "number" && (dec < pay.inputs.pace) !== belowPace) problems.push(`belowPace ${belowPace} disagrees with ${dec.toFixed(4)} vs pace ${pay.inputs.pace}`);
  const pace = belowPace ? "BELOW PACE" : d.pace?.state === "behind" ? `BEHIND PACE by ${usd(d.pace.behindCents)}` : "no pace label";
  const verification = pay.result;
  const pkg = manifest ? { packageId: manifest.packageId, preliminary: manifest.preliminary, pricing: manifest.pricing?.[laneId]?.state ?? null, image: manifest.media.find((m) => m.laneId === laneId)?.sha256 ?? null, parity: manifest.parity?.find((p) => p.laneId === laneId)?.ok ?? null } : null;
  if (pkg && verification === "VERIFIED" && (pkg.preliminary || pkg.pricing !== "VERIFIED")) problems.push("the staged image is not the VERIFIED version");
  if (pkg && pkg.parity !== true) problems.push("the staged package's parity row is not ok");
  return {
    laneId, ok: problems.length === 0, problems, verification, book: books[0] ?? null, legs,
    combined: { decimal: dec, american: amOf(dec), breakEven: 1 / dec, modelJoint: joint, method: sameGame ? "ESTIMATE (same game), not a book offer" : "leg product (different games), not a book-quoted parlay", engineDecimal: pay.inputs.decimalPrice },
    money: { stakeCents: stake, grossCents: pay.grossPayoutCents, profitCents: pay.profitCents, grossRecomputedCents: gross },
    lane: { step: d.step, steps: d.steps, bankrollCents: d.trackedBankrollCents, nextMilestoneCents: d.pace?.nextMilestoneCents ?? d.rungs[d.step - 1]?.milestoneCents ?? null, pace, status: d.status },
    package: pkg,
  };
}

/** The founder-facing table. */
export function reconciliationMarkdown(date, rows) {
  const out = [`# BBM V2 reconciliation · ${date}`, "", `All lanes reconcile: ${rows.every((r) => r.ok) ? "YES" : "NO"}`, ""];
  for (const r of rows) {
    out.push(`## ${r.laneId} · ${r.ok ? "reconciled" : `NOT RECONCILED: ${r.problems.join("; ")}`}`);
    if (!r.legs) continue;
    out.push(`Prices: ${r.verification} · book ${r.book}`, "", "| Leg | Book | American | Decimal | Break-even | Model win | Captured |", "|---|---|---|---|---|---|---|");
    for (const l of r.legs) out.push(`| ${l.side} (${l.legId}) | ${l.book} | ${l.american} | ${l.decimal.toFixed(4)} | ${pct(l.breakEven)} | ${pct(l.modelWin)} | ${l.capturedEt} |`);
    const c = r.combined;
    out.push("", `Combined: ${c.american} (decimal ${c.decimal.toFixed(4)}; engine ${c.engineDecimal.toFixed(4)}) · ${c.method} · break-even ${pct(c.breakEven)} vs model joint ${pct(c.modelJoint)}`);
    out.push(`Money: stake ${usd(r.money.stakeCents)} · gross ${usd(r.money.grossCents)} (recomputed ${usd(r.money.grossRecomputedCents)}) · profit ${usd(r.money.profitCents)}`);
    out.push(`Lane: step ${r.lane.step} of ${r.lane.steps} · bankroll ${usd(r.lane.bankrollCents)} · next milestone ${usd(r.lane.nextMilestoneCents)} · pace ${r.lane.pace} · status ${r.lane.status}`);
    if (r.package) out.push(`Staged: ${r.package.packageId} · image ${String(r.package.image).slice(0, 12)} · pricing ${r.package.pricing} · preliminary ${r.package.preliminary} · parity ${r.package.parity ? "ok" : "NOT ok"}`);
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

async function main(argv) {
  const a = parseArgs(argv);
  for (const k of ["date", "lanes", "private-root", "staging"]) if (!a[k]) throw new Error(`--${k} is required`);
  const dir = path.join(a.staging, a.date);
  const manifests = fs.readdirSync(dir).map((f) => path.join(dir, f, "manifest.json")).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const rows = ["bb-a", "bb-b", "ms-a", "ms-b"].map((laneId) => {
    const r = readLaneProjection({ laneId, dir: a.lanes });
    if (!r.ok) return { laneId, ok: false, problems: [`lane file ${r.refusal}`] };
    const run = currentRun(a["private-root"], laneId);
    return reconcileLane({ laneId, doc: r.doc, events: run.events, date: a.date, manifest: manifests.find((m) => m.lanes.includes(laneId)) });
  });
  fs.writeFileSync(path.join(dir, "RECONCILIATION.json"), `${JSON.stringify(rows, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "RECONCILIATION.md"), reconciliationMarkdown(a.date, rows));
  console.log(reconciliationMarkdown(a.date, rows));
  if (!rows.every((r) => r.ok)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
