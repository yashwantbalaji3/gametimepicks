/**
 * DAILY CANDIDATE BETSLIP GRAPHIC · card HTML + validators (founder review only). Pure apart from reading the approved
 * logo once (nfl-game-cards.mjs logoDataUri).
 *
 * Input is a written daily-candidate receipt (lib/products/daily-candidates/receipt.mjs). The card refuses unless:
 *   · the receipt is a CANDIDATE and its contentSha256 matches its body (an edited receipt is not a source);
 *   · every leg carries a verified price: American odds inside LEG_BOUNDS, a book, a quote instant before the leg's
 *     start, and the price receipt it was read from;
 *   · the combined odds, gross payout and net gain recompute exactly from the legs (engine.mjs parlayMath);
 *   · the visible text has no em or en dash and none of the social BANNED_WORDS (so the net figure is called "net gain").
 * Every card carries the gold FOUNDER REVIEW banner, the hypothetical-stake label, the pricing label (illustrative unless
 * a book quoted the parlay), "Not betting advice." and the responsible-gambling line. Nothing says a bet was placed.
 */
import { createHash } from "node:crypto";
import { PALETTE, BANNED_WORDS, EM_DASH, EN_DASH, visibleText } from "./nba-line-cards.mjs";
import { logoDataUri, REVIEW_BANNER } from "./nfl-game-cards.mjs";
import { canonicalJson } from "../../src/lib/products/daily-candidates/receipt.mjs";
import { parlayMath } from "../../src/lib/products/daily-candidates/engine.mjs";
import { LEG_BOUNDS } from "../../src/lib/products/eligible-leg/contract.mjs";

export const SIZE = Object.freeze({ key: "1080x1350", width: 1080, height: 1350 });
export const HYPOTHETICAL_LABEL = "Hypothetical example stake. No bet has been placed.";
export const FOOT = Object.freeze({
  advice: "Not betting advice.",
  responsible: "21+ where required; the legal age varies by state. Gambling problem? Call 1-800-GAMBLER.",
});

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const am = (a) => (a > 0 ? `+${a}` : `${a}`);
const usd = (n) => `$${Number(n).toFixed(2)}`;
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const etOf = (iso) => `${ET.format(new Date(iso))} ET`;

/** Every reason the receipt cannot become a card ([] = renderable). */
export function receiptViolations(receipt) {
  const v = [];
  if (receipt?.kind !== "CANDIDATE" || !receipt?.result?.card) return ["not a CANDIDATE receipt: a no-candidate day has no betslip"];
  const { contentSha256, ...body } = receipt;
  if (createHash("sha256").update(canonicalJson(body)).digest("hex") !== contentSha256) v.push("contentSha256 does not match the receipt body");
  const card = receipt.result.card;
  for (const l of card.legs ?? []) {
    const id = l.legId ?? "?";
    if (typeof l.american !== "number" || !Number.isFinite(l.american) || l.american < LEG_BOUNDS.oddsMin || l.american > LEG_BOUNDS.oddsMax) v.push(`${id}: odds missing or outside the verified range`);
    if (!l.bookmaker) v.push(`${id}: no book`);
    if (!l.priceReceipt) v.push(`${id}: no price receipt`);
    if (!(Date.parse(l.capturedAt) < Date.parse(l.eventStartUtc))) v.push(`${id}: quote time is not before the start`);
    if (l.probabilityBasis !== "MODEL_VALIDATED") v.push(`${id}: probability is not validated`);
  }
  const m = parlayMath(card.legs ?? [], card.example?.stake);
  if (!m) v.push("combined price cannot be computed from the legs");
  else {
    if (m.american !== card.combined?.american || m.decimal !== card.combined?.decimal) v.push("combined odds do not recompute from the legs");
    if (m.example.grossPayout !== card.example?.grossPayout || m.example.netProfit !== card.example?.netProfit) v.push("example payout does not recompute from the legs");
  }
  return v;
}

/** [] when the visible text is clean. */
export function textViolations(html) {
  const text = visibleText(html);
  const v = [];
  if (text.includes(EM_DASH)) v.push("contains an em dash");
  if (text.includes(EN_DASH)) v.push("contains an en dash");
  const lower = text.toLowerCase();
  const hits = BANNED_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(lower));
  if (hits.length) v.push(`contains banned words: ${hits.join(", ")}`);
  for (const must of [HYPOTHETICAL_LABEL, FOOT.advice, "1-800-GAMBLER", REVIEW_BANNER]) if (!text.includes(must)) v.push(`missing: ${must}`);
  return v;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${SIZE.width}px;height:${SIZE.height}px;background:${PALETTE.bg};color:${PALETTE.text};font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:${SIZE.width}px;height:${SIZE.height}px;overflow:hidden;background:radial-gradient(60% 50% at 50% 0%,rgba(52,211,153,0.14) 0%,transparent 70%),${PALETTE.bg};display:flex;flex-direction:column;padding:62px 52px 36px}
.review{position:absolute;top:0;left:0;right:0;height:34px;background:${PALETTE.gold};color:${PALETTE.bg};font:700 18px/34px Menlo,monospace;text-align:center;letter-spacing:2px}
.head{display:flex;align-items:center;gap:22px}
.logo{width:112px;height:auto}
.eyebrow{font:700 18px/1.2 Menlo,monospace;letter-spacing:2.5px;color:${PALETTE.accent};text-transform:uppercase}
.title{font:800 56px/1.05 "Helvetica Neue",Arial,sans-serif;letter-spacing:-1px;margin-top:4px}
.legs{margin-top:28px;display:flex;flex-direction:column;gap:14px}
.leg{background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:16px;padding:16px 22px;display:grid;grid-template-columns:1fr auto;row-gap:6px}
.sel{font:700 30px/1.15 "Helvetica Neue",Arial,sans-serif}
.odds{font:800 34px/1 Menlo,monospace;color:${PALETTE.accent};text-align:right}
.meta{font:500 19px/1.3 "Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted}}
.book{font:600 17px/1.3 Menlo,monospace;color:${PALETTE.faint};text-align:right}
.sum{margin-top:24px;background:${PALETTE.panel};border:1px solid ${PALETTE.border};border-radius:16px;padding:18px 22px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px}
.k{font:700 14px/1.2 Menlo,monospace;letter-spacing:1.5px;color:${PALETTE.faint};text-transform:uppercase}
.v{font:800 32px/1.2 Menlo,monospace;margin-top:4px}
.note{margin-top:14px;font:500 19px/1.4 "Helvetica Neue",Arial,sans-serif;color:${PALETTE.muted}}
.foot{margin-top:auto;font:500 16px/1.45 "Helvetica Neue",Arial,sans-serif;color:${PALETTE.faint}}
`;

/** One card. Throws on any receipt violation; the caller also runs textViolations on the result. */
export function renderCandidateCardHtml(receipt) {
  const bad = receiptViolations(receipt);
  if (bad.length) throw new Error(`receipt refused:\n  - ${bad.join("\n  - ")}`);
  const r = receipt.result;
  const c = r.card;
  const legs = c.legs.map((l) => `<div class="leg" data-leg-id="${esc(l.legId)}"><div class="sel">${esc(l.selection ?? `${l.side}${l.line != null ? ` ${l.line}` : ""}`)}</div><div class="odds">${esc(am(l.american))}</div><div class="meta">${esc(l.eventLabel ?? "")} · ${esc(etOf(l.eventStartUtc))}</div><div class="book">${esc(l.bookmaker)} · quoted ${esc(etOf(l.capturedAt))}</div></div>`).join("\n");
  const joint = c.jointProbability ? `<p class="note">Model chance all legs land: ${(c.jointProbability.value * 100).toFixed(1)}% (product of validated leg probabilities; legs are from different games).</p>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(`${r.productLabel} candidate ${r.productDay}`)}</title><style>${CSS}</style></head>
<body><div class="card"><div class="review">${esc(REVIEW_BANNER)}</div>
<header class="head"><img class="logo" alt="GameTime Picks" src="${logoDataUri()}"><div><div class="eyebrow">GameTime Picks · ${esc(r.productLabel)} · ${esc(r.productDay)}</div><div class="title">${c.legs.length}-leg candidate</div></div></header>
<div class="legs">${legs}</div>
<div class="sum"><div><div class="k">Combined</div><div class="v">${esc(am(c.combined.american))}</div></div><div><div class="k">Example stake</div><div class="v">${esc(usd(c.example.stake))}</div></div><div><div class="k">Gross payout</div><div class="v">${esc(usd(c.example.grossPayout))}</div></div><div><div class="k">Net gain</div><div class="v">${esc(usd(c.example.netProfit))}</div></div></div>
<p class="note">${esc(HYPOTHETICAL_LABEL)} ${esc(c.pricing.label)}</p>
${joint}
<footer class="foot">Prices as quoted by the named books at the times shown. ${esc(FOOT.advice)} ${esc(FOOT.responsible)}</footer>
</div></body></html>`;
}
