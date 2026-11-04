#!/usr/bin/env node
/**
 * BANK BUILDER & MOONSHOT V2 PACKAGES (SPEC ~/gtp-evidence/bbm-v2/SPEC.md §1, §4, §7 step 3). Per posting date:
 *   bb-<date>     ONE post, two images in order: bb-a then bb-b
 *   ms-a-<date>   its own post
 *   ms-b-<date>   its own post
 * Each package is a folder <out>/<date>/<packageId>/ holding manifest.json (gtp.bbm-package@1, agreed with the Command
 * Center console session 2026-11-04), the PNGs (1080x1350) and caption.txt. Nothing is scheduled or posted: the console
 * imports the folder and the founder approves the exact version there.
 *
 *   cd app && npx tsx scripts/social/render-bbm.mjs --date <ET date> --as-of <ISO> --suggested-cards <file> \
 *       --lanes <dir holding bb-a.jsonl ...> --roster <unified roster.json> --out <staging root, outside the repo>
 *
 * Every lane is replayed from its hash-chained log (bbm-lane.mjs), and its frozen card is joined to the founder rule B
 * suggested-cards file (contentSha256 verified, the CARD_FROZEN sha equal to it) and re-checked against the committed lane
 * and the render-time roster (combo-social.mjs resolveCombo). Any failure refuses that lane: no image, the reason in the
 * report. A fixture price or a TEST lane history never reaches a package (samples only, written by writeSamples).
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP, assertPrivateOutDir } from "./nba-line-graphics-io.mjs";
import { parseArgs } from "./render-social-pack.mjs";
import { laneBytes } from "./render-combo-cards.mjs";
import { BBM_DESIGN_VERSION, FACT_LINE, bbmCard, bbmLayoutErrors, money, verifyBbmCard } from "./bbm-cards.mjs";
import { BBM_LANES, P1_PRICE_SOURCE_DECIDED, VIEW, laneView, parseLaneLog } from "../../src/lib/social/bbm-lane.mjs";
import { comboFromSuggestedCards, resolveCombo, suggestedCardsSealed } from "../../src/lib/social/combo-social.mjs";

export const BBM_PACKAGE_SCHEMA = "gtp.bbm-package@1";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const KIND = Object.freeze({ "bank-builder": "bbm-bank-builder", moonshot: "bbm-moonshot" });
const SECTION = Object.freeze({ "bank-builder": "bankBuilder", moonshot: "moonshot" });
/** The live social packages folder: V2 never writes there before the founder approves the cut-over (SPEC §7.3). */
export const LIVE_PACKAGES = path.join(os.homedir(), "gtp-private", "graphics", "packages");

/** Every card object in the file's NBA section for this product (the section card is lane A; `cards`, if present, list more). */
function cardsOf(file, product) {
  const s = file?.[SECTION[product]]?.nba;
  return [s?.card, ...(Array.isArray(s?.cards) ? s.cards : [])].filter(Boolean);
}
const legIds = (legs) => (legs ?? []).map((l) => String(l.legId)).sort().join(",");

/**
 * The engine card a CARD_FROZEN event froze, from the rule B file, or a refusal. The file must be sealed, be the file the
 * event names, and hold a card of this product with exactly the frozen legs at exactly the frozen probabilities.
 */
export function frozenCardOf(frozen, file, product) {
  if (!suggestedCardsSealed(file)) return { error: "the suggested-cards file is not sealed (contentSha256 missing or wrong)" };
  if (frozen.suggestedCardsSha256 !== file.contentSha256) return { error: `CARD_FROZEN names suggested-cards ${String(frozen.suggestedCardsSha256).slice(0, 12)}, the file is ${file.contentSha256.slice(0, 12)}` };
  const card = cardsOf(file, product).find((c) => (frozen.engineCardId ? c.id === frozen.engineCardId : true) && legIds(c.legs) === legIds(frozen.legs));
  if (!card) return { error: `no ${product} card in the file has exactly the frozen legs ${legIds(frozen.legs)}` };
  for (const f of frozen.legs) {
    const l = card.legs.find((x) => String(x.legId) === String(f.legId));
    if (f.projection !== l.probability) return { error: `${f.legId}: frozen projection ${f.projection} is not the file's ${l.probability}` };
    if (f.selection != null && f.selection !== l.selection?.teamAbbr && f.selection !== l.selection?.code) return { error: `${f.legId}: frozen selection ${f.selection} is not the file's ${l.selection?.teamAbbr}` };
  }
  return { card };
}

/**
 * One lane for one date → { laneId, view, combo, card } or { laneId, refused }. `slate(date)` returns that slate's
 * { file (rule B suggested-cards), lane, laneSha256 } (a BUSTED card reads its own day's slate); `roster` is the
 * render-time unified roster; `testData` marks a fixture lane history.
 */
export function prepareLane({ log, date, slate, roster, asOf, testData = false }) {
  const laneId = log?.header?.laneId ?? "?";
  const refuse = (reason) => ({ laneId, refused: reason });
  let view;
  try { view = laneView(log, date); } catch (e) { return refuse(e.message); }
  if (!view.view) return refuse(view.reason);
  if (view.view === VIEW.IN_PLAY) return refuse(`IN_PLAY: step ${view.step} from ${view.card.date} has not settled; no new card (SPEC §3.2)`);
  if (![VIEW.CARD, VIEW.BUSTED, VIEW.NO_ELIGIBLE_CARD, VIEW.COMPLETE].includes(view.view)) return refuse(`${view.view}: no graphic`);
  if (view.payout && !view.payout.fixture && !P1_PRICE_SOURCE_DECIDED) return refuse("a real payout cannot print until founder decision P1 names a permitted price source");
  let combo = null;
  if (view.card && (view.view === VIEW.CARD || view.view === VIEW.BUSTED)) {
    let s;
    try { s = slate(view.card.date); } catch (e) { return refuse(e.message); }
    if (s.file?.productDay !== view.card.date) return refuse(`the suggested-cards file is for ${s.file?.productDay}, the card is ${view.card.date}`);
    const { card, error } = frozenCardOf(view.card, s.file, view.product);
    if (error) return refuse(error);
    // CARD: every check at the render instant against the render-time roster. BUSTED: the record as frozen (its own instant).
    const doc = comboFromSuggestedCards(s.file, view.product, { card, testData });
    try { combo = resolveCombo(doc, view.view === VIEW.CARD ? { lane: s.lane, laneSha256: s.laneSha256, asOf, roster } : { lane: s.lane, laneSha256: s.laneSha256, asOf: view.card.at, roster: null }); } catch (e) { return refuse(e.message); }
  }
  const card = { ...bbmCard(view, combo, { testData }), name: `${laneId}-${date}` };
  const errs = verifyBbmCard(card);
  if (errs.length) return refuse(`card failed validation: ${errs.join("; ")}`);
  return { laneId, view, combo, card, testData };
}

/** slate(date) over suggested-cards files (keyed by productDay) and the committed lanes. */
export function slateReader(files) {
  const byDay = new Map(files.map((f) => [f.productDay, f]));
  const memo = new Map();
  return (d) => {
    if (!memo.has(d)) {
      if (!byDay.has(d)) throw new Error(`no suggested-cards file for ${d}`);
      const l = laneBytes(d);
      memo.set(d, { file: byDay.get(d), lane: JSON.parse(l.bytes.toString("utf8")), laneSha256: sha(l.bytes) });
    }
    return memo.get(d);
  };
}

const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const legLine = (l) => `${l.kind === "GAME_WINNER" ? `${l.team.name} to win` : `${l.player.name} ${l.marketLabel.toLowerCase()}`}${(l.flagText ?? []).length ? ` (${l.flagText.join("; ")})` : ""}`;
/** One lane's caption block: the step and the lane status, legs by name, no odds language. */
export function laneCaption(p) {
  const v = p.view; const head = `Lane ${v.letter}`;
  if (v.view === VIEW.CARD) return [`${head} · Step ${v.step} of ${v.steps}`, ...p.combo.legs.map(legLine), `Tracked bankroll ${money(v.bankroll)} · goal ${money(v.target)}`].join("\n");
  if (v.view === VIEW.BUSTED) return `${head} · Busted at step ${v.step} of ${v.steps}`;
  if (v.view === VIEW.NO_ELIGIBLE_CARD) return `${head} · No qualifying card today, still step ${v.step} of ${v.steps}`;
  return `${head} · Goal reached: tracked bankroll ${money(v.bankroll)}`;
}
export function packageCaption(product, lanes, date) {
  const title = product === "bank-builder" ? `🏦 Bank Builder · ${DAY.format(new Date(`${date}T12:00:00Z`))}` : `🚀 Moonshot · ${DAY.format(new Date(`${date}T12:00:00Z`))}`;
  return [title, ...lanes.map(laneCaption), "Tracked challenge, no real wager placed.", "#NBA"].join("\n\n");
}

/**
 * Prepared lanes → package plans (no I/O). bb-a and bb-b share bb-<date>; each Moonshot lane is its own package.
 * A Moonshot lane that refused has no package; a Bank Builder package needs both lanes (the console takes exactly bb-a,
 * then bb-b), so either lane refusing leaves no bb-<date> package.
 */
export function planPackages(prepared, date) {
  const ok = prepared.filter((p) => !p.refused);
  const groups = new Map();
  for (const p of ok) {
    const L = BBM_LANES[p.laneId];
    const id = L.packageId(date);
    if (!groups.has(id)) groups.set(id, { packageId: id, product: L.product, lanes: [] });
    groups.get(id).lanes.push(p);
  }
  // bb-<date> is exactly bb-a then bb-b (console contract): one lane refused means no Bank Builder post that day.
  return [...groups.values()].filter((g) => g.product !== "bank-builder" || g.lanes.length === 2).map((g) => {
    g.lanes.sort((a, b) => a.laneId.localeCompare(b.laneId));
    const cards = g.lanes.filter((p) => p.view.view === VIEW.CARD);
    const needsFounderReview = cards.some((p) => !p.view.payout) ? "unpriced" : cards.length === 0 ? "status-only" : null;
    return { ...g, kind: KIND[g.product], date, caption: packageCaption(g.product, g.lanes, date), needsFounderReview };
  });
}

/** A fixture price or a TEST history in a package is refused before anything is written. */
export function stagingViolations(plans, outRoot) {
  const v = [];
  const abs = path.resolve(outRoot);
  if (abs === LIVE_PACKAGES || abs.startsWith(LIVE_PACKAGES + path.sep) || LIVE_PACKAGES.startsWith(abs + path.sep)) v.push(`${abs}: V2 packages never go to the live packages folder before the cut-over is approved`);
  for (const p of plans) for (const l of p.lanes) {
    if (l.card.samplePrice || l.view.payout?.fixture) v.push(`${p.packageId}/${l.laneId}: a fixture price never reaches a package`);
    if (l.testData || l.card.testData) v.push(`${p.packageId}/${l.laneId}: a TEST lane history never reaches a package`);
    if (l.view.payout && !P1_PRICE_SOURCE_DECIDED) v.push(`${p.packageId}/${l.laneId}: no payout may be exported before founder decision P1`);
  }
  return v;
}

async function png(page, html) {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready); // eslint-disable-line no-undef
  return page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1350 } });
}
export function rendererCommit() {
  try {
    const head = execSync("git rev-parse HEAD", { cwd: APP }).toString().trim();
    const dirty = execSync("git status --porcelain -- scripts/social src/lib/social", { cwd: APP }).toString().trim();
    return dirty ? `${head}-dirty` : head;
  } catch { return null; }
}

/** Render and write the package folders. Returns the manifests. Throws (nothing written) on any staging violation. */
export async function writeStaging(plans, { outRoot, browser, commit = rendererCommit(), lanesRef = {} }) {
  const bad = stagingViolations(plans, outRoot);
  if (bad.length) throw new Error(`staging refused:\n  - ${bad.join("\n  - ")}`);
  const layout = await bbmLayoutErrors(browser, plans.flatMap((p) => p.lanes.map((l) => l.card)));
  if (layout.length) throw new Error(`layout check failed:\n  - ${layout.join("\n  - ")}`);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const out = [];
  try {
    for (const p of plans) {
      const dir = path.join(assertPrivateOutDir(outRoot), p.date, p.packageId);
      fs.mkdirSync(dir, { recursive: true });
      const media = [];
      for (const [i, l] of p.lanes.entries()) {
        const b = await png(page, l.card.html);
        const file = `${l.laneId}.png`;
        fs.writeFileSync(path.join(dir, file), b);
        media.push({ order: i + 1, file, sha256: sha(b), laneId: l.laneId, width: 1080, height: 1350, altText: altText(l) });
      }
      fs.writeFileSync(path.join(dir, "caption.txt"), p.caption);
      const manifest = {
        schema: BBM_PACKAGE_SCHEMA, packageId: p.packageId, kind: p.kind, date: p.date, lanes: p.lanes.map((l) => l.laneId), media,
        caption: { text: p.caption, sha256: sha(Buffer.from(p.caption, "utf8")) },
        needsFounderReview: p.needsFounderReview, rendererCommit: commit, designVersion: BBM_DESIGN_VERSION,
        sources: p.lanes.map((l) => ({ laneId: l.laneId, laneLogRef: lanesRef[l.laneId] ?? null, runId: l.view.runId, eventSha256: drawnEventSha(l.view), suggestedCardsSha256: l.view.card?.suggestedCardsSha256 ?? null })),
        laneStatus: Object.fromEntries(p.lanes.map((l) => [l.laneId, l.view.view])),
        testData: false,
      };
      fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      out.push({ dir, manifest });
    }
  } finally { await page.close(); }
  return out;
}

/** The lane-log event a graphic is drawn from: the CARD_FROZEN, the day's STATUS, or the STEP_SETTLED that busted or completed it. */
export const drawnEventSha = (v) => (v.view === VIEW.CARD ? v.card.sha256 : v.view === VIEW.NO_ELIGIBLE_CARD ? v.statusEventSha256 : v.settledSha256) ?? null;

/** Alt text for one image: the same facts as the card. */
export function altText(l) {
  const v = l.view; const name = v.product === "bank-builder" ? "Bank Builder" : "Moonshot";
  if (v.view === VIEW.CARD) return `${name} lane ${v.letter}, step ${v.step} of ${v.steps}. ${l.combo.legs.map((x) => `${legLine(x)}, ${x.kind === "GAME_WINNER" ? "model win probability" : "model projection"} ${x.projectionText}`).join("; ")}. Tracked bankroll ${money(v.bankroll)}, goal ${money(v.target)}. ${FACT_LINE}.`;
  return `${name} lane ${v.letter}. ${laneCaption(l).replace(/\n/g, ". ")}. ${FACT_LINE}.`;
}

/** Sample PNGs (labelled fixtures allowed) into a samples folder: no manifest, never a package. */
export async function writeSamples(items, { outDir, browser, scales = [1], preview = false }) {
  if (path.resolve(outDir).startsWith(LIVE_PACKAGES)) throw new Error("samples never go to the live packages folder");
  const layout = await bbmLayoutErrors(browser, items.map((i) => i.card));
  if (layout.length && !preview) throw new Error(`layout check failed:\n  - ${layout.join("\n  - ")}`);
  if (layout.length) console.log(`PREVIEW, layout errors:\n  - ${layout.join("\n  - ")}`);
  fs.mkdirSync(assertPrivateOutDir(outDir), { recursive: true });
  const done = [];
  for (const s of scales) {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: s });
    try {
      for (const i of items) {
        const f = path.join(outDir, `${i.name}${s === 1 ? "" : `@${s}x`}.png`);
        fs.writeFileSync(f, await png(page, i.card.html));
        done.push(f);
      }
    } finally { await page.close(); }
  }
  return done;
}

async function main(argv) {
  const a = parseArgs(argv);
  const { date, "as-of": asOf } = a;
  if (!/^\d{4}-\d\d-\d\d$/.test(String(date))) throw new Error("--date <ET date> is required");
  if (!/T.*(Z|[+-]\d\d:\d\d)$/.test(String(asOf)) || !Number.isFinite(Date.parse(asOf))) throw new Error("--as-of <ISO instant with zone> is required (no clock is read)");
  for (const k of ["suggested-cards", "lanes", "roster", "out"]) if (!a[k]) throw new Error(`--${k} is required`);
  const slate = slateReader(String(a["suggested-cards"]).split(",").map((f) => JSON.parse(fs.readFileSync(f, "utf8"))));
  const roster = JSON.parse(fs.readFileSync(a.roster, "utf8"));
  const lanesRef = {}; const prepared = [];
  for (const laneId of Object.keys(BBM_LANES)) {
    const f = [".jsonl", ".json"].map((x) => path.join(a.lanes, `${laneId}${x}`)).find((x) => fs.existsSync(x));
    if (!f) { prepared.push({ laneId, refused: `no lane log ${laneId}.jsonl in ${a.lanes}` }); continue; }
    lanesRef[laneId] = f;
    prepared.push(prepareLane({ log: parseLaneLog(fs.readFileSync(f, "utf8")), date, slate, roster, asOf }));
  }
  const plans = planPackages(prepared, date);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let done = [];
  try { done = await writeStaging(plans, { outRoot: a.out, browser, lanesRef }); } finally { await browser.close(); }
  const refused = prepared.filter((p) => p.refused).map((p) => ({ laneId: p.laneId, reason: p.refused }));
  const report = path.join(a.out, date, `bbm-run-${asOf.replace(/[:]/g, "")}.json`);
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, `${JSON.stringify({ date, asOf, packages: done.map((d) => d.manifest.packageId), refused }, null, 2)}\n`);
  for (const d of done) console.log(`${d.manifest.packageId} · ${d.manifest.media.length} image(s) · ${Object.entries(d.manifest.laneStatus).map(([k, v]) => `${k}=${v}`).join(" ")} · review ${d.manifest.needsFounderReview ?? "none"}`);
  for (const r of refused) console.log(`REFUSED ${r.laneId}: ${r.reason}`);
  console.log(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
