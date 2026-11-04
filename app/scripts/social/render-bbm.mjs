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
 *       --lanes <dir holding the public projections bb-a.json ...> --private-root <engine run logs, read only> \
 *       --roster <unified roster.json> [--roster-fetched-at <ISO>] --out <staging root>
 *
 * Every lane is read from the engine's public projection (gtp.challenge-lane.public@1, the file the website reads,
 * contentSha256 verified; bbm-lane.mjs), and its frozen card is joined to the founder rule B suggested-cards file it
 * names (sealed, same legs, sides, probabilities and flags) and re-checked against the committed lane and the
 * render-time roster (combo-social.mjs resolveCombo). Any failure refuses that lane: no image, the reason in the
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
import { BBM_DESIGN_VERSION, FACT_LINE, bbmCard, bbmLayoutErrors, cents, verifyBbmCard } from "./bbm-cards.mjs";
import { BBM_LANES, VIEW, laneView, pricedDay, privateBankrollCents, socialPricesOk } from "../../src/lib/social/bbm-lane.mjs";
import { readLaneProjection } from "../../src/lib/challenge-lanes/public-reader.mjs";
import { currentRun } from "../../src/lib/challenge-lanes/store.mjs";
import { MARKET_SHORT, comboFromSuggestedCards, resolveCombo, suggestedCardsSealed } from "../../src/lib/social/combo-social.mjs";

export const BBM_PACKAGE_SCHEMA = "gtp.bbm-package@1";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const KIND = Object.freeze({ "bank-builder": "bbm-bank-builder", moonshot: "bbm-moonshot" });
/** The live social packages folder: V2 never writes there before the founder approves the cut-over (SPEC §7.3). */
export const LIVE_PACKAGES = path.join(os.homedir(), "gtp-private", "graphics", "packages");

const SECTION = Object.freeze({ "bank-builder": "bankBuilder", moonshot: "moonshot" });
/** Every engine leg in the rule B file: the leg pool plus each card's legs (full guard, with rotation names). */
function fileLegs(file) {
  const all = [...(file?.legs ?? [])];
  for (const k of Object.values(SECTION)) for (const c of [file?.[k]?.nba?.card, ...(file?.[k]?.nba?.cards ?? [])]) for (const l of c?.legs ?? []) all.push(l);
  return new Map(all.map((l) => [String(l.legId), l]));
}

/**
 * The lane's frozen card (projection days[].card) as an engine card from the rule B file, or a refusal. The file must
 * be sealed and be the one the card names; every leg must be in it with the same game, side, probability and guard
 * flags. The file's leg carries the guard detail (which rotation player is listed) the card's flag line prints.
 */
export function engineCardFor(dayCard, file, product) {
  if (!suggestedCardsSealed(file)) return { error: "the suggested-cards file is not sealed (contentSha256 missing or wrong)" };
  if (dayCard?.suggestedCardsSha256 !== file.contentSha256) return { error: `the lane card names suggested-cards ${String(dayCard?.suggestedCardsSha256).slice(0, 12)}, the file is ${file.contentSha256.slice(0, 12)}` };
  if (dayCard.product !== product || dayCard.productDay !== file.productDay) return { error: `the lane card is ${dayCard.product} ${dayCard.productDay}, not ${product} ${file.productDay}` };
  const pool = fileLegs(file);
  const legs = [];
  for (const l of dayCard.legs ?? []) {
    const f = pool.get(String(l.legId));
    if (!f) return { error: `${l.legId} is not in the frozen file` };
    if (String(f.eventId) !== String(l.gameId) || f.selection?.teamAbbr !== l.selection?.teamAbbr || f.probability !== l.probability || f.startUtc !== l.startUtc) return { error: `${l.legId}: the lane card leg is not the frozen file's (game, side, probability or tip)` };
    if ([...(f.guard?.flags ?? [])].sort().join() !== [...(l.guard?.flags ?? [])].sort().join()) return { error: `${l.legId}: guard flags differ from the frozen file` };
    if (JSON.stringify(f.prop ?? null) !== JSON.stringify(l.prop ?? null)) return { error: `${l.legId}: the prop (player, stat, side, line) differs from the frozen file` };
    legs.push(f);
  }
  if (!legs.length) return { error: "the lane card has no legs" };
  return { card: { id: dayCard.cardId, tier: dayCard.tier, legs, jointProbability: dayCard.jointProbability ?? null, status: "MODEL_ONLY", priced: false, price: null, payout: null } };
}

/**
 * One lane for one date → { laneId, view, combo, card } or { laneId, refused }. `doc` is the lane's public projection;
 * `slate(date)` returns that slate's { file (rule B suggested-cards), lane, laneSha256 } (a BUSTED card reads its own
 * day's slate); `roster` is the render-time unified roster. Samples only: `testData` marks a fixture lane history and
 * `samplePayout` ({ grossCents, profitCents, fixture: true }) draws a labelled fixture price.
 */
export function prepareLane({ doc, date, slate, roster, asOf, testData = false, samplePayout = null, privateEvents = null, displayRecord = undefined }) {
  const laneId = doc?.laneId ?? "?";
  const refuse = (reason) => ({ laneId, refused: reason });
  let view;
  try { view = laneView(doc, date); } catch (e) { return refuse(e.message); }
  if (!view.view) return refuse(view.reason);
  if (view.view === VIEW.IN_PLAY) return refuse(`IN_PLAY: ${view.reason}; no new card (SPEC §3.2)`);
  // Real prices (SPEC §7, founder 2026-11-04): only the engine's verified PAYOUT_COMPUTED for this day's card.
  if (privateEvents && view.view === VIEW.CARD) {
    const pr = pricedDay(privateEvents, { date, doc });
    if (pr?.refused) return refuse(`price refused: ${pr.refused}`);
    // A real price prints only under the display record's NBA social surface; a fixture is a labelled sample either way.
    if (pr && !pr.unpricedReason && !pr.fixture && !socialPricesOk(displayRecord)) view = { ...view, unpricedReason: "challenge-graphics prices are not authorized in the display record (NBA challengeGraphicsPrices)" };
    else if (pr && !pr.unpricedReason) {
      view = { ...view, payout: pr };
      // A priced win withholds the public bankroll; the private log's own fold supplies it for the stake line.
      if (view.bankrollCents == null) view = { ...view, bankrollCents: privateBankrollCents(privateEvents) };
      if (pr.stakeCents !== view.bankrollCents) return refuse(`the verified stake ${pr.stakeCents} is not the tracked bankroll ${view.bankrollCents} (all-in ladder)`);
      view = { ...view, staked: true };
    }
  }
  if (samplePayout) {
    if (samplePayout.fixture !== true) return refuse("a sample payout is drawn only as a labelled fixture");
    if (view.view !== VIEW.CARD || samplePayout.grossCents - samplePayout.profitCents !== view.bankrollCents) return refuse("the sample payout does not fit the card's tracked stake (gross - profit = stake)");
    view = { ...view, payout: samplePayout };
  }
  let combo = null;
  if (view.card && [VIEW.CARD, VIEW.WON, VIEW.BUSTED].includes(view.view)) {
    let s;
    try { s = slate(view.card.productDay); } catch (e) { return refuse(e.message); }
    const { card, error } = engineCardFor(view.card, s.file, view.product);
    if (error) return refuse(error);
    // CARD: every check at the render instant against the render-time roster. WON / BUSTED: the record as frozen (its own instant).
    const doc2 = comboFromSuggestedCards(s.file, view.product, { card, testData });
    try { combo = resolveCombo(doc2, view.view === VIEW.CARD ? { lane: s.lane, laneSha256: s.laneSha256, asOf, roster } : { lane: s.lane, laneSha256: s.laneSha256, asOf: view.card.evaluatedAt, roster: null }); } catch (e) { return refuse(e.message); }
    const max = BBM_LANES[laneId].maxLegs;
    if (max != null && combo.legs.length > max) return refuse(`${combo.legs.length} legs: ${laneId} takes at most ${max} (SPEC rev. 2 §1, hard)`);
    // A sample line rides only with the labelled fixture price.
    // A prop's line prints only once its price is verified (a labelled sample here); the leg carries side and line.
    if (view.payout) combo = { ...combo, legs: combo.legs.map((l) => ({ ...l, lineText: l.kind === "PLAYER_PROP" && l.prop?.line != null ? `${String(l.prop.side ?? "").toUpperCase()} ${l.prop.line} ${MARKET_SHORT[l.market]}`.trim() : null })) };
  }
  const card = { ...bbmCard(view, combo, { testData }), name: `${laneId}-${date}` };
  const errs = verifyBbmCard(card);
  if (errs.length) return refuse(`card failed validation: ${errs.join("; ")}`);
  return { laneId, view, combo, card, testData, projectionSha256: doc.contentSha256 };
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
/** A caption leg: who, the model's own number, any flag. Never a line, odds, book or payout (PD 2026-11-04: image only). */
const legLine = (l) => `${l.kind === "GAME_WINNER" ? `${l.team.name} to win · model win probability ${l.projectionText}` : `${l.player.name} ${l.marketLabel.toLowerCase()} · model projection ${l.projectionText}`}${(l.flagText ?? []).length ? ` (${l.flagText.join("; ")})` : ""}`;
/** Odds, price, payout and book language a caption must never carry (the console refuses it). */
export const CAPTION_PRICE_TEXT = /[+-]\d{3}\b|\bodds\b|\bpayout\b|\bprofit\b|\bparlay\b|leg product|\bline\b|\bover\b|\bunder\b|\bcaptured\b|\$\d[\d,.]*\s*(payout|profit|return)|draftkings|fanduel|betmgm|caesars|espn ?bet|bet365|fanatics|betrivers|hard rock/i;
const title = (b) => b.charAt(0) + b.slice(1).toLowerCase();
/** One lane's caption block: its step and public status stated separately, legs by name, no odds language. */
export function laneCaption(p) {
  const v = p.view; const head = `Lane ${v.letter} · ${title(v.badge)}`;
  const held = v.badge === "HELD" ? (v.view === VIEW.CARD ? " (awaiting verification)" : " (no qualifying card today)") : "";
  if (v.view === VIEW.CARD) return [`${head}${held} · Step ${v.step} of ${v.steps}`, ...p.combo.legs.map(legLine), `Tracked bankroll ${cents(v.bankrollCents)} · goal ${cents(v.targetCents)}`].join("\n");
  if (v.view === VIEW.WON) return [`${head} · Step ${v.step} of ${v.steps} won`, ...p.combo.legs.map(legLine), `Tracked bankroll ${cents(v.bankrollCents)} · goal ${cents(v.targetCents)}`].join("\n");
  if (v.view === VIEW.BUSTED) return `${head} · Busted at step ${v.step} of ${v.steps}`;
  if (v.view === VIEW.NO_ELIGIBLE_CARD) return `${head}${held} · Still step ${v.step} of ${v.steps}`;
  return `${head} · ${cents(v.bankrollCents)} of ${cents(v.targetCents)}`;
}
export function packageCaption(product, lanes, date) {
  const title = product === "bank-builder" ? `🏦 Bank Builder · ${DAY.format(new Date(`${date}T12:00:00Z`))}` : `🚀 Moonshot · ${DAY.format(new Date(`${date}T12:00:00Z`))}`;
  return [title, ...lanes.map(laneCaption), "Tracked challenge, no real wager placed.", "#NBA"].join("\n\n");
}

/**
 * Prepared lanes → package plans (no I/O). Exactly two posts a day (SPEC rev. 2 §5): bb-<date> = bb-a then bb-b,
 * ms-<date> = ms-a then ms-b. A held or busted lane still has its truthful image; a lane that refused (no graphic at
 * all) leaves its product with no post that day, since the console takes exactly two images per post.
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
  return [...groups.values()].filter((g) => g.lanes.length === 2).map((g) => {
    g.lanes.sort((a, b) => a.laneId.localeCompare(b.laneId));
    const cards = g.lanes.filter((p) => p.view.view === VIEW.CARD);
    const needsFounderReview = cards.some((p) => !p.view.payout) ? "unpriced" : cards.some((p) => p.view.payout?.preliminary) ? "preliminary-prices" : cards.length === 0 ? "status-only" : null;
    return { ...g, kind: KIND[g.product], date, caption: packageCaption(g.product, g.lanes, date), needsFounderReview };
  });
}

/** A fixture price or a TEST history in a package is refused before anything is written. */
export function stagingViolations(plans, outRoot, { displayRecord = undefined } = {}) {
  const v = [];
  const abs = path.resolve(outRoot);
  if (abs === LIVE_PACKAGES || abs.startsWith(LIVE_PACKAGES + path.sep) || LIVE_PACKAGES.startsWith(abs + path.sep)) v.push(`${abs}: V2 packages never go to the live packages folder before the cut-over is approved`);
  for (const p of plans) if (CAPTION_PRICE_TEXT.test(p.caption)) v.push(`${p.packageId}: the caption carries price language (${p.caption.match(CAPTION_PRICE_TEXT)[0]}); prices appear only on the image`);
  for (const p of plans) for (const l of p.lanes) {
    if (l.card.samplePrice || l.view.payout?.fixture) v.push(`${p.packageId}/${l.laneId}: a fixture price never reaches a package`);
    if (l.testData || l.card.testData) v.push(`${p.packageId}/${l.laneId}: a TEST lane history never reaches a package`);
    if (l.view.payout && !l.view.payout.fixture && !socialPricesOk(displayRecord)) v.push(`${p.packageId}/${l.laneId}: a price may be exported only when the display record authorizes NBA challenge graphics`);
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
export async function writeStaging(plans, { outRoot, browser, commit = rendererCommit(), lanesRef = {}, displayRecord = undefined, rosterRef = null }) {
  const bad = stagingViolations(plans, outRoot, { displayRecord });
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
        sources: p.lanes.map((l) => ({ laneId: l.laneId, laneLogRef: lanesRef[l.laneId] ?? null, projectionSha256: l.projectionSha256, runId: l.view.runId, eventSha256: drawnEventSha(l.view), suggestedCardsSha256: l.view.card?.suggestedCardsSha256 ?? null })),
        laneStatus: Object.fromEntries(p.lanes.map((l) => [l.laneId, l.view.view])),
        // An early render is a PREVIEW in the console (no approval); the post-refresh re-render drops it, a new version.
        preliminary: p.lanes.some((l) => l.view.payout?.preliminary === true),
        // Per lane: whether the printed price is preliminary (re-verified near the window; a changed image is a new version).
        pricing: Object.fromEntries(p.lanes.map((l) => [l.laneId, l.view.payout ? { state: l.view.payout.preliminary ? "PRELIMINARY" : "VERIFIED", capturedAt: l.view.payout.capturedAt, postScheduledAt: l.view.payout.postScheduledAt ?? null } : { state: l.view.view === VIEW.CARD ? "UNPRICED" : "NONE" }])),
        // The render-time availability input (PD 2026-11-04: fresh at render, never the morning build's).
        roster: rosterRef,
        testData: false,
      };
      fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      out.push({ dir, manifest });
    }
  } finally { await page.close(); }
  return out;
}

/** The lane-log event a graphic is drawn from: the CARD_FROZEN (a card or the busting card) or the day's STATUS. */
export const drawnEventSha = (v) => v.eventSha256 ?? null;

/** Alt text for one image: the same facts as the card. */
export function altText(l) {
  const v = l.view; const name = v.product === "bank-builder" ? "Bank Builder" : "Moonshot";
  if (v.view === VIEW.CARD) return `${name} lane ${v.letter}, step ${v.step} of ${v.steps}. ${l.combo.legs.map((x) => `${legLine(x)}, ${x.kind === "GAME_WINNER" ? "model win probability" : "model projection"} ${x.projectionText}`).join("; ")}. Tracked bankroll ${cents(v.bankrollCents)}, goal ${cents(v.targetCents)}. ${FACT_LINE}.`;
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
  const rosterBytes = fs.readFileSync(a.roster);
  const roster = JSON.parse(rosterBytes.toString("utf8"));
  // The roster's fetch instant comes from the runbook (the script records none); it rides in the manifest.
  if (a["roster-fetched-at"] && !Number.isFinite(Date.parse(a["roster-fetched-at"]))) throw new Error("--roster-fetched-at must be an ISO instant");
  const rosterRef = { ref: path.resolve(a.roster), sha256: sha(rosterBytes), fetchedAt: a["roster-fetched-at"] ?? null };
  // The public file through the engine's one reader; prices from the engine's private run log (read only, never written).
  const lanesRef = {}; const prepared = [];
  for (const laneId of Object.keys(BBM_LANES)) {
    const r = readLaneProjection({ laneId, dir: a.lanes });
    if (!r.ok) { prepared.push({ laneId, refused: `lane projection ${r.refusal} (${a.lanes}/${laneId}.json)` }); continue; }
    const run = a["private-root"] ? currentRun(a["private-root"], laneId) : null;
    if (a["private-root"] && !run) { prepared.push({ laneId, refused: `no private run log for ${laneId} under ${a["private-root"]}` }); continue; }
    lanesRef[laneId] = run ? path.join(a["private-root"], laneId, run.file) : path.join(a.lanes, `${laneId}.json`);
    prepared.push(prepareLane({ doc: r.doc, date, slate, roster, asOf, privateEvents: run?.events ?? null }));
  }
  const plans = planPackages(prepared, date);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let done = [];
  try { done = await writeStaging(plans, { outRoot: a.out, browser, lanesRef, rosterRef }); } finally { await browser.close(); }
  const refused = prepared.filter((p) => p.refused).map((p) => ({ laneId: p.laneId, reason: p.refused }));
  const report = path.join(a.out, date, `bbm-run-${asOf.replace(/[:]/g, "")}.json`);
  fs.mkdirSync(path.dirname(report), { recursive: true });
  // Each run's report keeps that version's image and caption shas: a re-render that changes a visible value is a new
  // version the founder approves again (the staging folder holds only the latest).
  fs.writeFileSync(report, `${JSON.stringify({ date, asOf, roster: rosterRef, packages: done.map((d) => ({ packageId: d.manifest.packageId, pricing: d.manifest.pricing, captionSha256: d.manifest.caption.sha256, media: d.manifest.media.map((m) => ({ laneId: m.laneId, sha256: m.sha256 })) })), refused }, null, 2)}\n`);
  for (const d of done) console.log(`${d.manifest.packageId} · ${d.manifest.media.length} image(s) · ${Object.entries(d.manifest.laneStatus).map(([k, v]) => `${k}=${v}`).join(" ")} · review ${d.manifest.needsFounderReview ?? "none"}`);
  for (const r of refused) console.log(`REFUSED ${r.laneId}: ${r.reason}`);
  console.log(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
