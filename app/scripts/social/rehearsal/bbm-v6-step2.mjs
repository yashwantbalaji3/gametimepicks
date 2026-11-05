// BBM V6 STEP 2 TEMPLATES (PD 2026-11-05): "Road to" mode (no lane letters), step 2 of 5, NFL-capable leg boxes
// (moneyline, Anytime TD, yards) mixed with NBA legs. TEST fixtures only (TEST ribbon; sample players carry no real
// evidence; fixture prices). Renders each card twice (byte identity) and derives 390 / 430 px copies from the full PNG.
//
//   npx tsx scripts/social/rehearsal/bbm-v6-step2.mjs --out <dir outside the repo>
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

import { parseArgs } from "../render-social-pack.mjs";
import { RULES_V2, bbmCardV6, bbmV6LayoutErrors, verifyBbmCardV6 } from "../bbm-cards-v6.mjs";
import { BADGE, RUNG, VIEW } from "../../../src/lib/social/bbm-lane.mjs";

const a = parseArgs(process.argv.slice(2));
const out = path.resolve(a.out);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const dec = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
const american = (d) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));
const TERMS = { "bank-builder": { baseCents: 10000, targetCents: 1000000 }, moonshot: { baseCents: 2500, targetCents: 100000 } };
const TNF = "2026-11-06T01:15:00Z";
const nflMl = (id, abbr, name, opp, oppName, home, price, stats) => ({ sport: "nfl", legId: id, team: { abbr, name }, opponent: { abbr: opp, name: oppName }, home, tipUtc: TNF, level: "B", price, ...(stats ? { recordStats: stats } : {}) });
const nbaMl = (id, abbr, name, opp, oppName, home, tip, price) => ({ legId: id, team: { abbr, name }, opponent: { abbr: opp, name: oppName }, home, tipUtc: tip, level: "B", price });
const prop = (id, sport, player, abbr, name, lineWords, gameLabel, tip, price, stats) => ({ kind: "PROP", sport, legId: id, player: { name: player }, team: { abbr, name }, opponent: { abbr: "" }, home: true, tipUtc: tip, level: "B", lineWords, gameLabel, price, ...(stats ? { recordStats: stats } : {}) });
function card(product, name, bankrollCents, legs) {
  const d = legs.reduce((x, l) => x * dec(l.price), 1);
  const gross = Math.floor(bankrollCents * d);
  const rungs = RULES_V2.milestonesCents[product].map((m, i) => ({ step: i + 1, milestoneCents: m, state: i === 0 ? RUNG.COMPLETED : i === 1 ? RUNG.ACTIVE : RUNG.UPCOMING }));
  return { name, model: { product, road: true, clean: true, letter: null, laneId: product === "moonshot" ? "ms" : "bb", date: "2026-11-05", chipText: legs.some((l) => l.sport !== "nfl") ? "NFL · NBA · Thu Nov 5" : "NFL · Thu Nov 5", step: 2, steps: 5, rungs, ...TERMS[product], bankrollCents, badge: BADGE.ACTIVE, view: VIEW.CARD, template: false,
    legs, payout: { snapshotText: "Odds snapshot · 3:05 PM ET (TEST)", verifiedMark: false, fixture: false, preliminary: false, combinedAmerican: american(d), grossCents: gross, profitCents: gross - bankrollCents, stakeCents: bankrollCents, legs: Object.fromEntries(legs.map((l) => [l.legId, { price: l.price, oddsFormat: "american" }])) } } };
}
const cards = [
  card("bank-builder", "bb-step2-1leg-nfl-ml", 20700, [nflMl("t1", "BAL", "Baltimore Ravens", "JAX", "Jacksonville Jaguars", true, -180, [{ label: "Last 5", value: "4-1" }, { label: "Last 8", value: "6-2" }])]),
  card("bank-builder", "bb-step2-2leg-nfl-yds-nba-ml", 20700, [prop("t2", "nfl", "Sample Receiver", "BAL", "Baltimore Ravens", "OVER 52.5 RECEIVING YDS", "JAX @ BAL", TNF, -115, [{ label: "L5 hits", value: "3/5" }, { label: "L10 hits", value: "6/10" }]), nbaMl("t3", "PHX", "Phoenix Suns", "ORL", "Orlando Magic", true, "2026-11-06T02:00:00Z", -150)]),
  card("moonshot", "ms-step2-1leg-nfl-anytime-td", 4516, [prop("t4", "nfl", "Sample Runner", "JAX", "Jacksonville Jaguars", "ANYTIME TD", "JAX @ BAL", TNF, 110)]),
  card("moonshot", "ms-step2-2leg-nfl-ml-nba-ml", 4516, [nflMl("t5", "JAX", "Jacksonville Jaguars", "BAL", "Baltimore Ravens", false, 150), nbaMl("t6", "MIA", "Miami Heat", "GS", "Golden State Warriors", false, "2026-11-06T03:00:00Z", -120)]),
].map((c) => ({ ...c, card: { ...bbmCardV6(c.model, { testData: true }), name: c.name } }));
const bad = cards.flatMap((c) => verifyBbmCardV6(c.card).map((e) => `${c.name}: ${e}`));
const require = createRequire(path.resolve("package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch();
const layout = await bbmV6LayoutErrors(browser, cards.map((c) => c.card));
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const report = [];
const derive = (src, dst, w) => execFileSync("python3", ["-I", "-c", "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGB')\nw=int(sys.argv[3])\nim.resize((w,round(im.height*w/im.width)),Image.LANCZOS).save(sys.argv[2],format='PNG',optimize=False)", src, dst, String(w)]);
try {
  for (const d of ["full", "check"]) fs.mkdirSync(path.join(out, d), { recursive: true });
  // Warm-up: the browser's first paint of a session can differ from later paints (fonts and images settling).
  await page.setContent(cards[0].card.html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef
  await page.screenshot({ type: "png" });
  for (const c of cards) {
    const shots = [];
    for (let n = 0; n < 2; n += 1) {
      await page.setContent(c.card.html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef
      shots.push(await page.screenshot({ type: "png" }));
    }
    const f = path.join(out, "full", `${c.name}.png`);
    fs.writeFileSync(f, shots[0]);
    for (const w of [390, 430]) derive(f, path.join(out, "check", `${c.name}-${w}w.png`), w);
    report.push({ name: c.name, sha256: sha(shots[0]), identical: sha(shots[0]) === sha(shots[1]) });
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, "report.json"), `${JSON.stringify({ checker: bad, layout, images: report }, null, 2)}\n`);
console.log(`checker problems: ${bad.length}${bad.length ? `\n  ${bad.join("\n  ")}` : ""}`);
console.log(`layout problems: ${layout.length}${layout.length ? `\n  ${layout.join("\n  ")}` : ""}`);
for (const r of report) console.log(`${r.name} ${r.sha256.slice(0, 16)} identical=${r.identical}`);
