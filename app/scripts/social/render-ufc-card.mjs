#!/usr/bin/env node
/**
 * UFC CARD PACKAGES: prelims and main card from the official pregame card and one saved moneyline capture.
 *   cd app && npx tsx scripts/social/render-ufc-card.mjs --as-of <ISO> --moneyline <capture under ~/gtp-private> [--out <dir>] [--no-png]
 * No key, no network, no clock. Founder review only: nothing is scheduled or posted.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP, assertPrivateOutDir, DEFAULT_PRIVATE_ROOT } from "./nba-line-graphics-io.mjs";
import { DISCLOSURE, shell, verifyGameDayCard } from "./game-day-cards.mjs";
import { cell, esc } from "./social-pack-cards.mjs";
import { loadMoneyline, parseArgs, writePackages } from "./render-social-pack.mjs";
import { CONTENT_TYPE, ELIGIBILITY, etLabel, instant, recommendedPostTime, toIso, validationOf } from "../../src/lib/social/social-package.mjs";
import { NBA_PROP_LINE_ADAPTER } from "../../src/lib/sports/nba/prop-line-adapter.mjs";
import { SEGMENT_TYPE, UFC_LINE_MAX_AGE_HOURS, UFC_MARKET, pctText, priceText, ufcBouts, ufcCaption, ufcClose, ufcPages } from "../../src/lib/social/ufc-card-post.mjs";

const REL = "public/data/ufc/card-latest.json";
const RED = { abbr: "UFC", color: "#B3121D" }; const BLUE = { abbr: "UFC", color: "#123A8C" };
const readJson = (rel) => { const b = fs.readFileSync(path.join(APP, rel)); return { doc: JSON.parse(b.toString("utf8")), sha256: crypto.createHash("sha256").update(b).digest("hex") }; };
const startWords = (ms) => etLabel(ms).replace(/^.*?(\d+(?::(?!00)\d\d)?)(?::00)? ([AP]M).*$/, "$1 $2 ET");

function boutHtml(cells, b, hero) {
  const id = b.boutId;
  const forecast = b.pick
    ? `<div class="ubf"><span class="ubl">Model forecast</span>${cell(cells, `${id}.pick`, b.pick, "ubp")}${cell(cells, `${id}.pct`, pctText(b.probability), "ubc")}</div><div class="ubb"><i style="width:${(b.probability * 100).toFixed(2)}%"></i></div>`
    : `<div class="ubf none"><span class="ubl">No model forecast</span></div>`;
  const price = b.price != null ? `${cell(cells, `${id}.price`, priceText(b.price), "ubq")}${cell(cells, `${id}.book`, NBA_PROP_LINE_ADAPTER.bookLabel(b.book), "ubk")}` : `<span class="ubk">No price shown</span>`;
  return `<div class="ub${hero ? " hero" : ""}"><div class="ubt">${cell(cells, `${id}.weight`, b.weightClass, "")}${b.position === "Main event" || hero ? " · Main event" : ""}${b.basis === "ONE_FIGHTER_DEBUT" ? " · Limited history" : ""}</div><div class="ubm" data-fit>${cell(cells, `${id}.a`, b.fighterA)} <em>vs</em> ${cell(cells, `${id}.b`, b.fighterB)}</div>${forecast}<div class="ubr">${price}</div></div>`;
}
function ufcCard({ bouts, label, startText, chip, quoteNote, hero, name }) {
  const cells = {};
  const body = `<div class="kicker">${esc(label)}</div><div class="ubh">${cell(cells, `${name}.start`, startText)} · Meta APEX</div><div class="ul">${bouts.map((b) => boutHtml(cells, b, hero)).join("")}</div><div class="mkn">${esc(quoteNote)}</div>`;
  const card = { html: shell({ away: RED, home: BLUE, chip, body }), cells, v2: true, disclosure: DISCLOSURE, name };
  const e = verifyGameDayCard(card);
  if (e.length) throw new Error(`${name} failed validation:\n  - ${e.join("\n  - ")}`);
  return card;
}

export function prepareUfcCard({ asOf, moneyline, card, cardSha256, aliasJoins, oddsSha256 }) {
  if (card.state !== "SCHEDULED_CARD" || !card.bouts?.length) throw new Error(`no scheduled UFC card: ${card.state}`);
  const date = card.event.slateDate; const { doc, ref: source } = moneyline;
  const all = ufcBouts({ card, odds: doc, asOf, aliasJoins });
  if (all.some((b) => !b.segment)) throw new Error("a bout has no official card segment");
  const snapshotRefs = [{ ref: `app/${REL}`, sha256: cardSha256 }, { ref: "app/public/data/ufc/odds-latest.json", sha256: oddsSha256 }, source];
  const [mainEvent] = all;
  const headline = mainEvent.fighterA.split(" ").at(-1) + " vs " + mainEvent.fighterB.split(" ").at(-1);
  const prior = new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const posts = Object.entries(SEGMENT_TYPE).map(([segment, type]) => {
    const bouts = all.filter((b) => b.segment === segment);
    const start = Math.min(...bouts.map((b) => instant(b.startUtc)));
    if (Date.parse(asOf) >= start) throw new Error(`${type}: already started`);
    const close = ufcClose(bouts);
    if (!(Date.parse(asOf) < close)) throw new Error(`${type}: its window has closed`);
    const startText = startWords(start);
    const modelled = bouts.filter((b) => b.pick).length;
    const books = [...new Set(bouts.filter((b) => b.book).map((b) => NBA_PROP_LINE_ADAPTER.bookLabel(b.book)))];
    const firstQuote = bouts.map((b) => b.quotedAt).filter(Boolean).sort()[0] ?? null;
    const quoteNote = firstQuote ? `${books.join(", ")} prices observed ${startWords(Date.parse(firstQuote)).replace(" ET", "")} ET. Separate from the model.` : "No sportsbook price shown.";
    const slug = `ufc-${date}-${type.toLowerCase().replace(/_/g, "-")}`;
    const pages = ufcPages(bouts, type);
    const cards = pages.map((page, i) => ufcCard({ bouts: page, label: type === "UFC_MAIN_CARD" ? "UFC Fight Night · Main Card" : "UFC Fight Night · Prelims", startText, chip: `UFC · Sat, Oct 31`, quoteNote, hero: type === "UFC_MAIN_CARD" && i === 0, name: `${slug}-${i + 1}` }));
    const caption = ufcCaption({ type, headline, bouts: bouts.length, modelled, startText });
    if (/%|[—–]/.test(caption)) throw new Error(`caption refused: ${caption}`);
    const rec = recommendedPostTime({ games: [{ kickoffUtc: toIso(start) }], afterEtDate: prior, asOf });
    const fits = rec?.recommendedAt && instant(rec.recommendedAt) < close && instant(rec.recommendedAt) >= Date.parse(asOf);
    return {
      sport: "ufc", date, contentType: CONTENT_TYPE[type], variant: null, containsMarketData: firstQuote != null, designVersion: "3", snapshotRefs, cards, caption, ccCaption: caption, ccCaptionB: `${bouts.length} UFC bouts, ${modelled} model forecasts, ${startText}. #UFC Not betting advice.`,
      title: `UFC ${segment.toLowerCase()} ${date}`, firstStartUtc: toIso(start), eventId: String(card.event.providerEventId), eligibilityClass: ELIGIBILITY.OFFICIAL, ...validationOf(null),
      disclosures: ["Sportsbook prices are observed quotes, separate from the model", DISCLOSURE], extraClaims: [{ key: "bouts", display: String(bouts.length), evidenceRef: `app/${REL}` }, { key: "modelled", display: String(modelled), evidenceRef: `app/${REL}` }, { key: "startClaim", display: startText, evidenceRef: `app/${REL}` }],
      checks: ["forecast read from the official card through buildPredictionBoard", "split by the card's segment start times", "priced only with both fighters matched", "no bout invented; no-forecast bouts stay neutral", "no athlete image"],
      window: { opensAt: asOf, closesAt: toIso(close) }, recommended: fits ? rec : null, recommendedNote: "the recommended time falls after this window closes; a newer capture is needed first",
      freshness: { asOf, sourceGeneratedAt: card.generatedAt, ageHours: Math.round(((Date.parse(asOf) - Date.parse(doc.fetchedAt)) / 3600000) * 10) / 10, expiresAt: toIso(close), rule: `until the first start, an earlier provider start of a priced bout, or ${UFC_LINE_MAX_AGE_HOURS} hours after the quote` },
      content: { eventId: String(card.event.providerEventId), eventName: card.event.name, modelId: card.model.id, segment, marketKey: UFC_MARKET, firstStartUtc: toIso(start), mainEventCommenceUtc: mainEvent.providerCommenceUtc, sourceFile: source.ref, sourceSha256: source.sha256, fetchedAt: doc.fetchedAt, bouts, socialAuthorized: false },
    };
  });
  return { posts, bouts: all };
}

async function main(argv) {
  const a = parseArgs(argv);
  if (!/T.*Z$/.test(String(a["as-of"])) || !a.moneyline) throw new Error("--as-of <ISO Z> and --moneyline are required");
  const { doc: card, sha256: cardSha256 } = readJson(REL);
  const { doc: odds, sha256: oddsSha256 } = readJson("public/data/ufc/odds-latest.json");
  const { posts, bouts } = prepareUfcCard({ asOf: a["as-of"], moneyline: loadMoneyline(a.moneyline), card, cardSha256, aliasJoins: odds.aliasJoins ?? [], oddsSha256 });
  const outRoot = assertPrivateOutDir(a.out ?? path.join(DEFAULT_PRIVATE_ROOT, "packages"));
  const done = await writePackages(posts, { outRoot, png: !a["no-png"] });
  for (const { file, pkg } of done) console.log(`${pkg.dedupeId} · ${pkg.content.bouts.length} bouts · ${pkg.images.filter((i) => i.scale === 1).length} images · closes ${pkg.window.closesAt} · rec ${pkg.recommendedAtEt ?? "none"} · ${file}`);
  for (const b of bouts) console.log(`${b.segment} | ${b.fighterA} vs ${b.fighterB} | ${b.pick ?? "NO FORECAST"} ${b.probability ?? ""} | ${b.price ?? "-"} ${b.book ?? ""} ${b.matchMethod ?? ""} ${b.noPriceReason ?? ""} | ${b.providerCommenceUtc ?? ""}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
