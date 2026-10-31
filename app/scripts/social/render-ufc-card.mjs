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
import { SEGMENT_TYPE, UFC_LINE_MAX_AGE_HOURS, UFC_MARKET, UFC_MAX_IMAGES, sectionFlags, pctText, priceText, ufcBouts, ufcCaption, ufcClose, ufcPages } from "../../src/lib/social/ufc-card-post.mjs";

const REL = "public/data/ufc/card-latest.json";
const RED = { abbr: "", color: "#B3121D" };
const readJson = (rel) => { const b = fs.readFileSync(path.join(APP, rel)); return { doc: JSON.parse(b.toString("utf8")), sha256: crypto.createHash("sha256").update(b).digest("hex") }; };
const startWords = (ms) => etLabel(ms).replace(/^.*?(\d+(?::(?!00)\d\d)?)(?::00)? ([AP]M).*$/, "$1 $2 ET");

const NEON = "#39FF14";
const UFC_CSS = `
.stage{background:#050608}
.frame{border-color:#7A0E14!important}
.ufk{font-weight:900;font-size:64px;line-height:1;letter-spacing:.5px;text-transform:uppercase;color:#fff;margin-top:6px}
.ufs{font-weight:700;font-size:27px;color:${NEON};margin:10px 0 16px;letter-spacing:.3px}
.ufl{display:flex;flex-direction:column;gap:13px;width:100%;align-self:stretch}
.uf{background:rgba(7,8,11,.82);border:1px solid rgba(255,255,255,.1);border-left:5px solid ${NEON};border-radius:10px;padding:13px 20px 15px}
.uft{font-weight:700;font-size:19px;color:#C9CDD3;text-transform:uppercase;letter-spacing:1px}
.ufn{display:block;font-weight:800;font-size:38px;line-height:1.3;white-space:nowrap;margin:3px 0 8px}
.ufn b{color:${NEON}}.ufn em{margin:0 12px;font-style:normal;font-weight:600;font-size:21px;color:#9AA0A8}.ufn .o{color:#fff}
.ufm{display:flex;align-items:center;gap:16px}
.ufp{font-weight:900;font-size:36px;color:${NEON};min-width:84px}
.ufb{flex:1;height:13px;border-radius:7px;background:rgba(255,255,255,.17);overflow:hidden}
.ufb i{display:block;height:100%;background:${NEON};box-shadow:0 0 12px ${NEON}}
.ufq{font-weight:700;font-size:26px;color:#fff;white-space:nowrap}.ufq span:first-child{font-size:18px;color:#C9CDD3;letter-spacing:1px;margin-right:7px}
.uf.ufm0{border-color:rgba(57,255,20,.75);border-left-width:8px;padding:18px 22px 20px;box-shadow:0 0 34px rgba(255,30,40,.34)}
.uf.ufm0 .ufn{font-size:54px}.uf.ufm0 .ufn em{font-size:27px}.uf.ufm0 .ufp{font-size:58px;min-width:124px}.uf.ufm0 .ufb{height:20px;border-radius:10px}.uf.ufm0 .ufq{font-size:30px}
`;
const OCT = (cx, cy, rx, ry) => { const k = 0.414; return [[-k, -1], [k, -1], [1, -k], [1, k], [k, 1], [-k, 1], [-1, k], [-1, -k]].map(([x, y]) => `${cx + x * rx},${cy + y * ry}`).join(" "); };
/** Dark cage: chain-link, red overhead lighting, an octagon floor in perspective. Drawn here; no photo, portrait or league mark. */
const OCTAGON_STAGE = `<div class="stage"><svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0"><defs>
<radialGradient id="r1" cx=".5" cy="0" r=".85"><stop offset="0" stop-color="#E0121E" stop-opacity=".78"/><stop offset=".5" stop-color="#7A0A12" stop-opacity=".34"/><stop offset="1" stop-color="#050608" stop-opacity="0"/></radialGradient>
<radialGradient id="r2" cx=".5" cy="1" r=".7"><stop offset="0" stop-color="#C20F1A" stop-opacity=".42"/><stop offset="1" stop-color="#050608" stop-opacity="0"/></radialGradient>
<pattern id="cage" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H46M0 0V46" stroke="#fff" stroke-opacity=".085" stroke-width="2"/></pattern>
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter></defs>
<rect width="1080" height="1350" fill="#050608"/><rect width="1080" height="1350" fill="url(#cage)"/><rect width="1080" height="1350" fill="url(#r1)"/><rect width="1080" height="1350" fill="url(#r2)"/>
<polygon points="${OCT(540, 800, 690, 560)}" fill="none" stroke="#E0121E" stroke-opacity=".6" stroke-width="10" filter="url(#glow)"/>
<polygon points="${OCT(540, 800, 690, 560)}" fill="none" stroke="#E0121E" stroke-opacity=".55" stroke-width="3"/>
<polygon points="${OCT(540, 800, 590, 470)}" fill="rgba(0,0,0,.28)" stroke="${NEON}" stroke-opacity=".32" stroke-width="2"/>
</svg></div>`;

function boutHtml(cells, b, hero) {
  const id = b.boutId; const opponent = b.pick === b.fighterA ? b.fighterB : b.fighterA;
  const price = b.price != null ? `<div class="ufq"><span>PRICE</span>${cell(cells, `${id}.price`, priceText(b.price))}</div>` : "";
  return `<div class="uf${hero ? " ufm0" : ""}"><div class="uft">${cell(cells, `${id}.weight`, b.weightClass)}${hero ? " · Main event" : ""}${b.basis === "ONE_FIGHTER_DEBUT" ? " · Limited history" : ""}</div><div class="ufn" data-fit>${cell(cells, `${id}.pick`, b.pick, "w").replace(/^<span/, "<b").replace(/<\/span>$/, "</b>")}<em>vs</em>${cell(cells, `${id}.opponent`, opponent, "o")}</div><div class="ufm">${cell(cells, `${id}.pct`, pctText(b.probability), "ufp")}<div class="ufb" data-bar="${esc(id)}"><i style="width:${(b.probability * 100).toFixed(2)}%"></i></div>${price}</div></div>`;
}
function ufcCard({ bouts, label, startText, chip, name, heroFirst }) {
  const cells = {};
  const body = `<div class="ufk">${esc(label)}</div><div class="ufs">Model forecast · ${cell(cells, `${name}.start`, startText)}</div><div class="ufl">${bouts.map((b, i) => boutHtml(cells, b, heroFirst && i === 0)).join("")}</div>`;
  const html = shell({ away: RED, home: RED, chip, body })
    .replace(/<div class="stage">[\s\S]*?\n {2}<\/div>\n {2}<div class="content">/, `${OCTAGON_STAGE}\n  <div class="content">`)
    .replace("</style>", `${UFC_CSS}</style>`);
  const card = { html, cells, v2: true, disclosure: DISCLOSURE, name };
  const e = verifyGameDayCard(card);
  if (!html.includes('id="cage"')) e.push("octagon stage missing");
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
  if (!mainEvent.pick) throw new Error("the main event has no forecast");
  const headline = mainEvent.fighterA.split(" ").at(-1) + " vs " + mainEvent.fighterB.split(" ").at(-1);
  const prior = new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const posts = Object.entries(SEGMENT_TYPE).map(([segment, type]) => {
    const bouts = all.filter((b) => b.segment === segment);
    const start = Math.min(...bouts.map((b) => instant(b.startUtc)));
    if (Date.parse(asOf) >= start) throw new Error(`${type}: already started`);
    const close = ufcClose(bouts);
    if (!(Date.parse(asOf) < close)) throw new Error(`${type}: its window has closed`);
    const startText = startWords(start);
    const firstQuote = bouts.map((b) => b.quotedAt).filter(Boolean).sort()[0] ?? null;
    const slug = `ufc-${date}-${type.toLowerCase().replace(/_/g, "-")}`;
    const pages = ufcPages(bouts);
    if (pages.length !== UFC_MAX_IMAGES) throw new Error(`${type}: ${pages.length} images`);
    const [shown] = pages; const modelled = shown.length;
    const cards = [ufcCard({ bouts: shown, label: type === "UFC_MAIN_CARD" ? "Main Card" : "Prelims", startText, chip: "UFC · Sat, Oct 31", heroFirst: type === "UFC_MAIN_CARD", name: `${slug}-1` })];
    const caption = ufcCaption({ type, headline, modelled, startText });
    if (/%|[—–]|not betting advice/i.test(caption) || !caption.endsWith("#UFC")) throw new Error(`caption refused: ${caption}`);
    const rec = recommendedPostTime({ games: [{ kickoffUtc: toIso(start) }], afterEtDate: prior, asOf });
    const fits = rec?.recommendedAt && instant(rec.recommendedAt) < close && instant(rec.recommendedAt) >= Date.parse(asOf);
    return {
      sport: "ufc", date, contentType: CONTENT_TYPE[type], variant: null, containsMarketData: firstQuote != null, designVersion: "3", snapshotRefs, cards, caption, ccCaption: caption, ccCaptionB: caption,
      title: `UFC ${segment.toLowerCase()} ${date}`, firstStartUtc: toIso(start), eventId: String(card.event.providerEventId), eligibilityClass: ELIGIBILITY.OFFICIAL, ...validationOf(null),
      disclosures: ["Sportsbook prices are observed quotes, separate from the model", DISCLOSURE], extraClaims: [{ key: "modelled", display: String(modelled), evidenceRef: `app/${REL}` }, { key: "startClaim", display: startText, evidenceRef: `app/${REL}` }],
      checks: ["forecast read from the official card through buildPredictionBoard", "split by the card's segment start times", "priced only with both fighters matched", "each price read twice against the raw capture: same event, same fighter, same sign", "unverified prices omitted", "no-forecast bouts excluded, each eligible bout once", "no athlete image, no league mark"],
      window: { opensAt: asOf, closesAt: toIso(close) }, recommended: fits ? rec : null, recommendedNote: "the recommended time falls after this window closes; a newer capture is needed first",
      freshness: { asOf, sourceGeneratedAt: card.generatedAt, ageHours: Math.round(((Date.parse(asOf) - Date.parse(doc.fetchedAt)) / 3600000) * 10) / 10, expiresAt: toIso(close), rule: `until the first start, an earlier provider start of a priced bout, or ${UFC_LINE_MAX_AGE_HOURS} hours after the quote` },
      content: { eventId: String(card.event.providerEventId), eventName: card.event.name, modelId: card.model.id, segment, marketKey: UFC_MARKET, firstStartUtc: toIso(start), mainEventCommenceUtc: mainEvent.providerCommenceUtc, sourceFile: source.ref, sourceSha256: source.sha256, fetchedAt: doc.fetchedAt, bouts: shown, excludedNoForecast: bouts.filter((b) => !b.pick).map((b) => ({ boutId: b.boutId, fighterA: b.fighterA, fighterB: b.fighterB, reason: b.noForecastReason })), sectionFlags: sectionFlags(shown, segment), socialAuthorized: false },
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
  for (const b of bouts) console.log(`${b.segment} | ${b.fighterA} vs ${b.fighterB} | ${b.pick ?? "NO FORECAST"} ${b.probability ?? ""} | ${b.price ?? "-"} ${b.book ?? ""} ${b.matchMethod ?? ""} ${b.noPriceReason ?? ""} | ${b.providerCommenceUtc ?? ""} | ${b.priceCheck?.ok ? `verified ${b.priceCheck.providerFighter} vs ${b.priceCheck.providerOpponent} ${b.priceCheck.opponentPrice}` : "unverified"}`);
  for (const f of posts.flatMap((p) => p.content.sectionFlags)) console.log(`SECTION FLAG: ${f.fighterA} vs ${f.fighterB}: repo ${f.repoSegment} ${f.repoStartUtc}, provider ${f.providerCommenceUtc}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
