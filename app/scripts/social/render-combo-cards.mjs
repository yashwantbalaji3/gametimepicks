#!/usr/bin/env node
/**
 * BANK BUILDER / MOONSHOT SOCIAL PACKAGES. One `gtp-social-package@1` per qualifying combo, written beside the other
 * packages so it enters the same founder review, clean export and second approval. FOUNDER REVIEW ONLY: nothing is
 * scheduled or posted.
 *
 *   cd app && npx tsx scripts/social/render-combo-cards.mjs --as-of <ISO> --combo <bank-builder.json>[,<moonshot.json>] \
 *       --roster <unified roster.json> [--out <dir outside the repo>] [--scales 1,2] [--no-png]
 *
 * The combo comes from the engine (gtp.products.social-combo@1). The lane is the committed public lane for the combo's
 * slate, read from this checkout or, when absent here, from GTP_DATA_COMMIT. Any failed check (data, identity,
 * availability R1-R3, freshness, honesty, layout) refuses that combo: no image and no package, the reasons in the report.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP, DEFAULT_PRIVATE_ROOT, assertPrivateOutDir } from "./nba-line-graphics-io.mjs";
import { parseArgs, writePackages } from "./render-social-pack.mjs";
import { COMBO_DESIGN_VERSION, COMBO_DISCLOSURE, PRICING_TEXT, comboCard, comboLayoutErrors, riskText, verifyComboCard } from "./combo-cards.mjs";
import { COMBO_FRESHNESS, SOCIAL_COMBO_SCHEMA, resolveCombo } from "../../src/lib/social/combo-social.mjs";
import { CONTENT_TYPE, ELIGIBILITY, etLabel, instant, toIso } from "../../src/lib/social/social-package.mjs";
import { slateWord } from "../../src/lib/social/approved-captions.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const TYPE = Object.freeze({ "bank-builder": CONTENT_TYPE.NBA_BANK_BUILDER, moonshot: CONTENT_TYPE.NBA_MOONSHOT });
export const COMBO_TYPES = Object.freeze(Object.values(TYPE));
/**
 * A source file as a snapshot ref clean export can re-read: repo-relative inside the repository, home-relative under
 * ~/gtp-private or ~/gtp-evidence. Anything else cannot be rebuilt, so it is refused.
 */
export function sourceRef(file, bytes) {
  const abs = path.resolve(file); const repo = path.resolve(APP, "..") + path.sep; const home = path.join(os.homedir(), path.sep);
  const rel = abs.startsWith(repo) ? path.relative(path.resolve(APP, ".."), abs) : abs.startsWith(home) && /^gtp-(private|evidence)\//.test(path.relative(os.homedir(), abs)) ? path.relative(os.homedir(), abs) : null;
  if (!rel) throw new Error(`${abs}: a combo or roster file must sit in the repository, ~/gtp-private or ~/gtp-evidence so clean export can re-read it`);
  return { ref: rel, sha256: sha(bytes) };
}
/**
 * CADENCE (proposal for the founder, 2026-11-03): one Bank Builder and one Moonshot per slate day, after NBA Today and the
 * Top 5 boards and before the first game's winner post (first tip - 60). Bank Builder first tip - 90, Moonshot first tip
 * - 75, so neither shares a slot with the first-game posts. The window closes at the first leg's tip minus the cutoff.
 */
export const COMBO_LEAD = Object.freeze({ "bank-builder": 90, moonshot: 75 });
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five"];

/** The lane bytes for a slate: this checkout, else the data commit. */
export function laneBytes(date, { dataCommit = process.env.GTP_DATA_COMMIT ?? null } = {}) {
  const rel = `app/public/data/nba/experimental-public/${date}.json`;
  const local = path.join(APP, "public", "data", "nba", "experimental-public", `${date}.json`);
  if (fs.existsSync(local)) return { rel, bytes: fs.readFileSync(local) };
  if (!dataCommit) throw new Error(`no lane for ${date} in this checkout; set GTP_DATA_COMMIT to a commit that holds ${rel}`);
  return { rel, bytes: execSync(`git show ${dataCommit}:${rel}`, { cwd: path.join(APP, ".."), maxBuffer: 1 << 28 }) };
}

/** Founder caption format: short lines, no digits outside the claims, no disclaimer (the image keeps its footer). */
export function comboCaption(combo) {
  const word = slateWord(instant(combo.firstTipUtc));
  const D = word[0].toUpperCase() + word.slice(1);
  const n = WORDS[combo.legs.length];
  const legLine = (l) => (l.kind === "GAME_WINNER" ? `${l.team.name} to win` : `${l.player.name} ${l.marketLabel.toLowerCase()}`);
  const head = combo.product === "bank-builder" ? `🏦 ${D}'s Bank Builder 🏀` : `🚀 ${D}'s Moonshot 🌙`;
  const why = combo.product === "bank-builder" ? `${n} legs, each with its model projection:` : `${n} legs. Higher risk: all ${n.toLowerCase()} must land, and longshots usually miss.`;
  const offer = combo.pricing === "MODEL_ONLY" ? "Model-only, not a sportsbook offer." : "Not a sportsbook offer.";
  return [head, [why, ...combo.legs.map(legLine)].join("\n"), offer, "#NBA"].join("\n\n");
}

/**
 * One combo file → { posts, refused }. `lane` / `roster` / `refOf` may be passed in (tests); otherwise read from disk.
 */
export function prepareCombo({ comboPath, asOf, rosterPath = null, lane: laneIn = null, laneSha256: laneShaIn = null, roster: rosterIn = null, refOf = sourceRef }) {
  const bytes = fs.readFileSync(comboPath);
  const doc = JSON.parse(bytes.toString("utf8"));
  const contentType = TYPE[doc.product] ?? `COMBO_${doc.product}`;
  const refuse = (reason) => ({ posts: [], refused: [{ contentType, date: doc.slateDate ?? null, testData: doc.testData === true, reason }] });
  if (doc.schema !== SOCIAL_COMBO_SCHEMA) return refuse(`schema ${doc.schema}`);
  if (doc.state !== "QUALIFIED") return refuse(`NO_QUALIFYING_COMBINATION: ${(doc.reasons ?? []).map((r) => r.text ?? r.code).join("; ") || "no reason given"}`);
  let lane = laneIn; let laneSha256 = laneShaIn; let laneRel = `app/public/data/nba/experimental-public/${doc.slateDate}.json`;
  if (!lane) { const l = laneBytes(doc.slateDate); lane = JSON.parse(l.bytes.toString("utf8")); laneSha256 = sha(l.bytes); laneRel = l.rel; }
  const hasPlayer = (doc.combination?.legs ?? []).some((l) => l.kind === "PLAYER_PROJECTION");
  let roster = rosterIn; let rosterRef = null;
  let comboRef;
  try { comboRef = refOf(comboPath, bytes); if (!roster && rosterPath) { const rb = fs.readFileSync(rosterPath); roster = JSON.parse(rb.toString("utf8")); rosterRef = refOf(rosterPath, rb); } } catch (e) { return refuse(e.message); }
  if (hasPlayer && !roster) return refuse("NO_ROSTER: the R1-R3 availability guard needs the slate's unified roster (--roster)");
  if (rosterRef && doc.source?.roster?.sha256 && doc.source.roster.sha256 !== rosterRef.sha256) return refuse("the combo was checked against a different roster file");
  let combo;
  try { combo = resolveCombo(doc, { lane, laneSha256, asOf, roster }); } catch (e) { return refuse(e.message); }
  const card = comboCard(combo);
  const errs = verifyComboCard(card);
  if (errs.length) return refuse(`card failed validation: ${errs.join("; ")}`);
  const first = instant(combo.firstTipUtc);
  const closes = first - COMBO_FRESHNESS.cutoffMin * 60e3;
  const at = first - COMBO_LEAD[doc.product] * 60e3;
  const recommended = at > instant(asOf) && at < closes ? { recommendedAt: toIso(at), recommendedAtEt: etLabel(at), firstGameUtc: toIso(first), firstGameEt: etLabel(first), slateEtDate: doc.slateDate, rule: `first tip - ${COMBO_LEAD[doc.product]} min` } : null;
  const caption = comboCaption(combo);
  const slug = `nba-${doc.slateDate}-${doc.product}${combo.testData ? "-test" : ""}`;
  return { posts: [{
    sport: "nba", date: doc.slateDate, contentType, variant: combo.testData ? "test" : null, designVersion: COMBO_DESIGN_VERSION,
    cards: [{ ...card, name: slug }], caption, ccCaption: caption, ccCaptionB: caption,
    extraClaims: [{ key: "caption.legs", display: WORDS[combo.legs.length], evidenceRef: "combo" }],
    snapshotRefs: [{ ref: laneRel, sha256: laneSha256 }, comboRef, ...(rosterRef ? [rosterRef] : [])],
    eligibilityClass: ELIGIBILITY.ESTIMATE, validationStatus: { state: ELIGIBILITY.ESTIMATE, label: "MODEL PROJECTION", blocksDisplay: false }, displayStatus: "SHOW_WITH_ESTIMATE_LABEL",
    disclosures: [COMBO_DISCLOSURE, PRICING_TEXT[combo.pricing], riskText(combo)],
    title: `NBA ${combo.label} ${doc.slateDate}${combo.testData ? " (TEST)" : ""}`, firstStartUtc: combo.firstTipUtc,
    checks: ["social-combo@1 contentSha256", "every leg == committed lane (game, tip, team, player, projection)", "availability: leg guard, lane R1, roster __guard R1-R3, __cells, review rows", `freshness: lane <= combo <= asOf < first tip - ${COMBO_FRESHNESS.cutoffMin} min, combo <= ${COMBO_FRESHNESS.maxAgeHours} h`, "no price, line, book or payout on image", "card cells == resolved text", "fit pass"],
    window: { opensAt: asOf, closesAt: toIso(closes) }, recommended, recommendedNote: "the combo slot before the first tip has passed",
    freshness: { asOf, sourceGeneratedAt: doc.asOf, laneGeneratedAt: lane.generatedAt, ageHours: Math.round(((instant(asOf) - instant(doc.asOf)) / 3.6e6) * 10) / 10, expiresAt: toIso(closes), rule: `valid until ${COMBO_FRESHNESS.cutoffMin} minutes before the first leg tips` },
    content: { sources: { combo: comboRef.ref, roster: rosterRef?.ref ?? null }, product: doc.product, policyId: doc.policyId, testData: combo.testData, pricing: combo.pricing, jointShown: combo.joint != null, legs: combo.legs.map((l) => ({ legId: l.legId, eventId: l.eventId, kind: l.kind, team: l.team.abbr, opponent: l.opponent.abbr, player: l.player, market: l.market, projection: l.projection, target: l.targetText })), socialAuthorized: false },
  }], refused: [] };
}

async function main(argv) {
  const a = parseArgs(argv);
  const asOf = a["as-of"];
  if (!/T.*(Z|[+-]\d\d:\d\d)$/.test(String(asOf)) || !Number.isFinite(Date.parse(asOf))) throw new Error("--as-of <ISO instant with zone> is required (no clock is read)");
  if (!a.combo) throw new Error("--combo <file>[,<file>] is required");
  const outRoot = assertPrivateOutDir(a.out ?? path.join(DEFAULT_PRIVATE_ROOT, "packages"));
  const posts = []; const refused = [];
  for (const f of String(a.combo).split(",")) {
    try { const r = prepareCombo({ comboPath: f, asOf, rosterPath: a.roster ?? null }); posts.push(...r.posts); refused.push(...r.refused); } catch (e) { refused.push({ combo: f, reason: e.message }); }
  }
  if (posts.length && !a["no-png"]) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      for (const p of [...posts]) {
        const e = await comboLayoutErrors(browser, p.cards);
        if (e.length) { posts.splice(posts.indexOf(p), 1); refused.push({ contentType: p.contentType, date: p.date, testData: p.content.testData, reason: `layout check failed: ${e.join("; ")}` }); }
      }
    } finally { await browser.close(); }
  }
  const done = posts.length ? await writePackages(posts, { outRoot, scales: String(a.scales ?? "1,2").split(",").map(Number), png: !a["no-png"] }) : [];
  fs.mkdirSync(path.join(outRoot, "reports"), { recursive: true });
  const report = path.join(outRoot, "reports", `combo-run-${asOf.replace(/[:]/g, "")}.json`);
  fs.writeFileSync(report, `${JSON.stringify({ asOf, packages: done.map((d) => d.pkg.dedupeId), refused }, null, 2)}\n`);
  for (const { pkg } of done) console.log(`${pkg.dedupeId} · ${pkg.images.length} images · ${pkg.verification.cellsVerified} cells · rec ${pkg.recommendedAtEt ?? "none"}`);
  for (const r of refused) console.log(`REFUSED ${JSON.stringify(r)}`);
  console.log(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
