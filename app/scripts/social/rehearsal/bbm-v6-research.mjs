// BBM V6 FOUNDER-REVIEW PREVIEWS of the engine's Level B research selections (PD 2026-11-04): drawn straight from the
// sealed card@2 records (no lane log exists before approval). FOUNDER REVIEW ribbon, never VERIFIED unless the record's
// price event is verified, no probability rows, the engine's k/n evidence line, lineup flags, the actual payout with the
// step target beneath. Writes to --out: full/, mobile/ (400 px), captions/, manifest.json (parity rows against the
// records). Never a package: the founder approves before anything is packaged for posting.
//
//   npx tsx scripts/social/rehearsal/bbm-v6-research.mjs --selection <research-selection.json> --out <dir outside the repo>
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { parseArgs } from "../render-social-pack.mjs";
import { X_LIMIT, CAPTION_PRICE_TEXT, rendererCommit, xWeighted } from "../render-bbm.mjs";
import { american, cents } from "../bbm-cards.mjs";
import { RULES_V2, bbmCardV6, bbmV6LayoutErrors, verifyBbmCardV6 } from "../bbm-cards-v6.mjs";
import { BADGE, BBM_LANES, RUNG, VIEW, socialPricesOk } from "../../../src/lib/social/bbm-lane.mjs";
import { evidenceLine } from "../../../src/lib/challenge-lanes/card-fields.mjs";

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(a.out);
const raw = fs.readFileSync(a.selection);
const sel = JSON.parse(raw);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
if (!socialPricesOk()) throw new Error("the display record does not authorize NBA challenge-graphics prices; prices are not drawn");
const TERMS = { "bank-builder": { baseCents: 10000, targetCents: 1000000 }, moonshot: { baseCents: 2500, targetCents: 100000 } };
const SHORT = { player_points: "PTS", player_rebounds: "REB", player_assists: "AST", player_threes: "3PM" };
const WORD = { player_points: "points", player_rebounds: "rebounds", player_assists: "assists", player_threes: "threes" };
const REVIEW = "Founder review · not approved · do not post";

const models = [];
for (const laneId of ["bb-a", "bb-b", "ms-a", "ms-b"]) {
  const lane = sel.lanes[laneId]; const c = lane?.card;
  if (!c || c.schema !== "gtp.bbm.card@2" || c.rulesVersion !== "bbm-rules@2") throw new Error(`${laneId}: no card@2 record under rules v2`);
  if (c.classification !== "LEVEL_B" || c.probability != null || c.evClaim) throw new Error(`${laneId}: not a Level B research card without a probability`);
  if (c.legs.length > RULES_V2.maxLegs) throw new Error(`${laneId}: ${c.legs.length} legs`);
  const L = BBM_LANES[laneId]; const product = L.product;
  const legs = c.legs.map((l) => {
    const [away, home] = l.eventLabel.split(" @ ");
    const ev = evidenceLine(l);
    if (!ev) throw new Error(`${laneId}: ${l.legId} lacks L10 or L20 hit counts`);
    const w10 = l.hitRate.windows.find((w) => w.window === "last10");
    const inj = c.injuryStatus.find((x) => x.legId === l.legId);
    const flags = [...(inj && inj.status !== "ACTIVE" ? [`${l.player.name} ${String(inj.status).toLowerCase()}`] : []), ...(inj?.lineup?.sensitive ? [`Lineup watch: ${inj.lineup.tonightScenario}`] : [])];
    return { kind: "PROP", legId: l.legId, player: { name: l.player.name }, team: { abbr: l.team, name: l.team }, opponent: { abbr: l.team === home ? away : home }, home: l.team === home, tipUtc: l.startUtc, level: "B", lineText: `${l.side.toUpperCase()} ${l.line} ${SHORT[l.market] ?? ""}`.trim(), evidenceText: ev, evidenceBig: `${w10.hits}/${w10.n}`, flagText: flags };
  });
  const verified = c.priceEventSha256 != null;
  const rungs = RULES_V2.milestonesCents[product].map((m, i) => ({ step: i + 1, milestoneCents: m, state: i ? RUNG.UPCOMING : RUNG.ACTIVE }));
  models.push({ laneId, record: c, legsRaw: c.legs, model: {
    product, letter: L.letter, laneId, date: c.date, step: 1, steps: 5, rungs, ...TERMS[product], bankrollCents: c.money.stakeCents, badge: BADGE.ACTIVE, view: VIEW.CARD, template: false,
    legs, selectionLabel: "Research selection — no validated edge claim", reviewRibbon: REVIEW, showStepTarget: true,
    payout: { combinedAmerican: c.combined.american, grossCents: c.money.grossPayoutCents, profitCents: c.money.profitCents, stakeCents: c.money.stakeCents, preliminary: !verified, fixture: false, estimate: false, legs: Object.fromEntries(c.legs.map((l) => [l.legId, { price: l.price, oddsFormat: "american", line: l.line }])) },
  } });
}
const cards = models.map((m) => ({ ...m, card: { ...bbmCardV6(m.model), name: m.laneId } }));
const bad = cards.flatMap((m) => verifyBbmCardV6(m.card).map((e) => `${m.laneId}: ${e}`));

function caption(product, pair) {
  const head = product === "bank-builder" ? "🏦 Bank Builder · Nov 4" : "🚀 Moonshot · Nov 4";
  const lanes = pair.map((m) => `Lane ${BBM_LANES[m.laneId].letter} · Step 1 of 5\n${m.legsRaw.map((l) => `${l.player.name} · ${WORD[l.market] ?? l.family}`).join("\n")}`);
  const t = [head, "Research selection · no validated edge claim", ...lanes, "Hit-rate research on the graphic. Tracked challenge, no real wager placed. #NBA"].join("\n\n");
  if (xWeighted(t) > X_LIMIT || CAPTION_PRICE_TEXT.test(t)) throw new Error(`${product}: caption fails (${xWeighted(t)} X-weighted; ${t.match(CAPTION_PRICE_TEXT)?.[0] ?? "no price text"})`);
  return t;
}

/** The image's printed cells against the record (fail-closed). */
function parity(m) {
  const c = m.record; const cells = m.card.cells; const mis = [];
  const want = { "money.wager": cents(c.money.stakeCents), "money.payout": cents(c.money.grossPayoutCents), "money.profit": cents(c.money.profitCents), "price.combined": american(c.combined.american) };
  c.legs.forEach((l, i) => Object.assign(want, { [`leg${i + 1}.name`]: l.player.name, [`leg${i + 1}.odds`]: american(l.price), [`leg${i + 1}.line`]: m.model.legs[i].lineText, [`leg${i + 1}.evidence`]: evidenceLine(l) }));
  for (const [k, v] of Object.entries(want)) if (cells[k] !== v) mis.push(`${k}: printed ${cells[k]} record ${v}`);
  if (Object.keys(cells).some((k) => /\.proj$|^price\.verified$/.test(k)) && c.priceEventSha256 == null) mis.push("a probability or VERIFIED on an unverified research card");
  return mis;
}

const require = createRequire(path.resolve("package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch();
const layout = await bbmV6LayoutErrors(browser, cards.map((m) => m.card));
const full = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const mobile = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 400 / 1080 });
const rows = [];
try {
  for (const d of ["full", "mobile", "captions"]) fs.mkdirSync(path.join(out, d), { recursive: true });
  for (const [product, ids, pkg] of [["bank-builder", ["bb-a", "bb-b"], "bb"], ["moonshot", ["ms-a", "ms-b"], "ms"]]) {
    const pair = ids.map((id) => cards.find((m) => m.laneId === id));
    const cap = caption(product, pair);
    fs.writeFileSync(path.join(out, "captions", `${pkg}-2026-11-04.txt`), cap);
    for (const [i, m] of pair.entries()) {
      const shots = {};
      for (const [pg, d, suf] of [[full, "full", ""], [mobile, "mobile", "-400w"]]) {
        await pg.setContent(m.card.html, { waitUntil: "load" });
        await pg.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef
        const b = await pg.screenshot({ type: "png" });
        fs.writeFileSync(path.join(out, d, `${m.laneId}${suf}.png`), b);
        shots[d] = sha(b);
      }
      const c = m.record;
      rows.push({
        laneId: m.laneId, date: c.date, packageId: `${pkg}-${c.date}`, mediaIndex: i + 1, imageSha256: shots.full, mobileSha256: shots.mobile, captionSha256: sha(Buffer.from(cap, "utf8")), caption: cap,
        graphicVersion: rendererCommit(), designVersion: m.card.design, rulesVersion: c.rulesVersion, recordSha256: c.recordSha256, candidateId: c.candidateId, classification: c.classification, approvalStatus: c.approvalStatus,
        step: 1, bankrollCents: c.money.stakeCents,
        legs: c.legs.map((l) => ({ legId: l.legId, side: l.side, line: l.line, market: l.market, odds: american(l.price), book: l.book, quotedAt: l.quotedAt, fetchedAt: l.fetchedAt, evidence: evidenceLine(l), injury: c.injuryStatus.find((x) => x.legId === l.legId) ?? null })),
        combinedAmerican: american(c.combined.american), payoutCents: c.money.grossPayoutCents, profitCents: c.money.profitCents,
        priceClass: c.priceEventSha256 ? "VERIFIED" : "QUOTE_UNVERIFIED", priceEventSha256: c.priceEventSha256, payoutEventSha256: null, refEventSha256: null,
        parity: { ok: parity(m).length === 0, mismatches: parity(m) },
      });
    }
  }
} finally { await browser.close(); }
const manifest = { schema: "gtp.bbm-v6-founder-review@1", source: { file: a.selection, sha256: sha(raw), now: sel.now }, note: "FOUNDER-REVIEW previews only: not approved, never packaged, never posted. Prices are 19:05Z quotes, not verified price events.", checker: bad, layout, parityRows: rows };
fs.writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`checker problems: ${bad.length}${bad.length ? `\n  ${bad.join("\n  ")}` : ""}`);
console.log(`layout problems: ${layout.length}${layout.length ? `\n  ${layout.join("\n  ")}` : ""}`);
for (const r of rows) console.log(`${r.laneId} parity=${r.parity.ok}${r.parity.ok ? "" : ` ${r.parity.mismatches.join("; ")}`} full=${r.imageSha256} 400w=${r.mobileSha256}`);
