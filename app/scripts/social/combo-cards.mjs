/* global document, window, getComputedStyle -- comboLayoutErrors evaluates in the Playwright browser page */
/**
 * BANK BUILDER and MOONSHOT CARDS on the established social stage (game-day-cards.mjs shell, 1080x1350). Script-only.
 * Input is a resolved combo (src/lib/social/combo-social.mjs resolveCombo): every leg already checked against the lane
 * and the availability guard. Every number sits in a data-cell element and is proven by verifyComboCard.
 *
 *   Bank Builder  calm and premium: deep teal and gold, two wide leg panels, the conservative tier stated plainly.
 *   Moonshot      dramatic: violet and flame, up to four leg rows, LONGSHOT · HIGHER RISK, and the plain fact that
 *                 every leg must land. No chance is printed unless every leg's probability is validated.
 *
 * Neither card prints a price, a line, a book or a payout. When no verified price exists the card says it is model-only
 * and not a sportsbook offer; when prices exist it still says it is not an offer and that prices are not shown.
 */
import { esc, cell } from "./social-pack-cards.mjs";
import { shell, teamOf, verifyGameDayCard } from "./game-day-cards.mjs";
import { visibleText } from "./nba-line-cards.mjs";

export const COMBO_DESIGN_VERSION = "combo-1";
export const COMBO_DISCLOSURE = "Model projections · Not betting advice";
export const MODEL_LABEL = "MODEL PROJECTION";
export const TEST_RIBBON = "TEST FIXTURE · NOT REAL DATA";
export const PRICING_TEXT = Object.freeze({
  MODEL_ONLY: "MODEL-ONLY · NOT A SPORTSBOOK OFFER",
  VERIFIED_PRICES: "NOT A SPORTSBOOK OFFER · PRICES NOT SHOWN",
});
const THEME = Object.freeze({
  "bank-builder": { a: { abbr: "BANK", color: "#0E4A4F" }, b: { abbr: "BUILD", color: "#1B2F52" }, accent: "#F2C14E" },
  moonshot: { a: { abbr: "MOON", color: "#6B1FA8" }, b: { abbr: "SHOT", color: "#E0480F" }, accent: "#FF7A2E" },
});

const CSS = `<style>
.cb-ribbon{position:absolute;top:34px;left:0;right:0;z-index:9;background:#FF3B6B;color:#fff;text-align:center;font:900 26px/40px "GTP Condensed";letter-spacing:.12em}
.cb .kicker{color:var(--acc);text-shadow:0 0 22px color-mix(in srgb,var(--acc) 55%,transparent),0 2px 10px rgba(0,0,0,.9)}
.cb-title{margin-top:10px;text-align:center;font:900 112px/.92 var(--headline);letter-spacing:-1px;text-transform:uppercase;color:#F7F7F2;white-space:nowrap;text-shadow:0 6px 30px rgba(0,0,0,.6)}
.cb-sub{margin-top:10px;text-align:center;font:700 28px/1 var(--display);letter-spacing:4px;color:rgba(247,247,242,.82);text-transform:uppercase;white-space:nowrap}
.ufl{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:18px;margin-top:22px}
.lg{position:relative;display:grid;grid-template-columns:96px 1fr 360px;align-items:center;gap:20px;padding:22px 26px;border-radius:20px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 32%,rgba(5,8,6,.9)),rgba(5,8,6,.88) 58%);border:1px solid rgba(255,255,255,.16);border-left:10px solid var(--c)}
.lg .n{font:900 64px/1 var(--headline);color:var(--acc);text-align:center}
.lg .who{min-width:0}
.lg .nm{display:block;font:900 56px/1.02 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden}
.lg .mt{display:flex;align-items:center;gap:12px;margin-top:10px;font:700 25px/1 var(--display);letter-spacing:1px;color:rgba(247,247,242,.8);white-space:nowrap}
.lg .tg{font:900 26px/1 var(--headline);padding:6px 9px 4px;border-radius:7px;background:var(--c);color:var(--cink)}
.lg .pj{text-align:right}
.lg .pk{display:block;font:800 19px/1 var(--display);letter-spacing:2px;color:var(--acc)}
.lg .pv{display:block;margin-top:6px;font:900 78px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.lg .pr{display:flex;flex-wrap:wrap;row-gap:6px;justify-content:flex-end;align-items:center;gap:10px;margin-top:6px}
.lg .pm{font:700 22px/1 var(--display);letter-spacing:2px;color:rgba(247,247,242,.78);white-space:nowrap}
.lg .tt{font:800 22px/1 var(--display);letter-spacing:1px;padding:6px 9px 4px;border-radius:8px;border:2px solid var(--acc);color:var(--acc);white-space:nowrap}
.lg .fl{grid-column:2 / 4;margin-top:2px;display:flex;align-items:center;gap:10px;min-width:0;font:800 24px/1.1 var(--display);letter-spacing:.5px;color:#FFD166;white-space:nowrap;overflow:hidden}
.lg .fl i{flex:none;font:900 20px/1 var(--headline);font-style:normal;padding:4px 8px 2px;border-radius:6px;background:#FFD166;color:#050706;letter-spacing:1px}
.lg .fl span{min-width:0;overflow:hidden}
.ufl.d .lg .fl{font-size:22px}
.cb-state{flex:none;margin-top:18px;padding:14px 18px 11px;border-radius:14px;text-align:center;font:900 32px/1 var(--display);letter-spacing:3px;color:#050706;background:var(--acc)}
.cb-risk{flex:none;margin-top:12px;text-align:center;font:700 25px/1.25 var(--display);letter-spacing:1px;color:rgba(247,247,242,.86)}
.cb.bb .ufl{gap:26px}.cb.bb .lg{padding:34px 28px}.cb.bb .nm{font-size:60px}
.cb.ms .cb-title{font-size:132px;background:linear-gradient(180deg,#FFE3B0,#FF7A2E 55%,#E0480F);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 0 26px rgba(255,122,46,.55))}
.cb.ms .cb-title{font-size:120px}.ufl.d{gap:12px;margin-top:16px}.ufl.d .lg{padding:12px 22px;grid-template-columns:64px 1fr 340px;gap:14px}.ufl.d .n{font-size:50px}.ufl.d .nm{font-size:44px}.ufl.d .mt{margin-top:6px;font-size:21px}.ufl.d .tg{font-size:22px}.ufl.d .pk{font-size:16px}.ufl.d .pv{margin-top:2px;font-size:54px}.ufl.d .pr{margin-top:4px}.ufl.d .pm{font-size:19px}.ufl.d .tt{font-size:19px;padding:4px 7px 2px}
.cb-burst{position:absolute;left:50%;top:330px;width:1400px;height:1400px;margin-left:-700px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,122,46,.10) 0 4deg,transparent 4deg 12deg);-webkit-mask:radial-gradient(circle,#000 0,#000 30%,transparent 62%);mask:radial-gradient(circle,#000 0,#000 30%,transparent 62%);pointer-events:none}
.cb-hi{display:inline-block;margin-top:12px;font:900 40px/1 var(--headline);letter-spacing:4px;padding:10px 22px 7px;border-radius:999px;background:linear-gradient(90deg,#6B1FA8,#E0480F);color:#fff;box-shadow:0 0 30px rgba(224,72,15,.55)}
.cb-hiw{text-align:center}
</style>`;

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
const at = (iso) => new Date(Date.parse(String(iso).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")));
export const tipText = (iso) => `${ET_TIME.format(at(iso))} ET`;
export const chipText = (combo) => `NBA · ${ET_DAY.format(at(combo.firstTipUtc)).replace(",", "")}`;

function legHtml(cells, l, i) {
  const t = teamOf(l.team.abbr, l.team.name);
  const k = `leg${i + 1}`;
  const who = l.kind === "GAME_WINNER" ? t.name : l.player.name;
  const what = l.kind === "GAME_WINNER" ? "to win" : l.marketLabel;
  const vs = `${l.home ? "vs" : "@"} ${l.opponent.abbr}`;
  return `<div class="lg" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><div class="who"><span class="nm" data-fit>${cell(cells, `${k}.name`, who)}</span><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${vs} · ${tipText(l.tipUtc)}`)}</div></div><div class="pj"><span class="pk">${esc(MODEL_LABEL)}</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}<div class="pr">${cell(cells, `${k}.market`, what, "pm")}${l.targetText ? cell(cells, `${k}.target`, `Model target ${l.targetText}`, "tt") : ""}</div></div>${(l.flagText ?? []).length ? `<div class="fl" data-flag><i>FLAG</i>${cell(cells, `${k}.flag`, l.flagText.join(" · "))}</div>` : ""}</div>`;
}

/** Plain risk copy. A chance prints only when the combo carries a validated joint probability. */
export function riskText(combo) {
  const n = combo.legs.length;
  const all = n === 2 ? "Both legs" : `All ${n} legs`;
  if (combo.product === "bank-builder") return `${all} must land.${combo.joint ? ` Model chance all land: ${combo.joint.text}.` : " Their combined chance is not yet validated."}`;
  return `${all} must land. Longshots usually miss.${combo.joint ? ` Model chance all land: ${combo.joint.text}.` : " Their combined chance is not yet validated."}`;
}

/** One card for a resolved combo. */
export function comboCard(combo) {
  const theme = THEME[combo.product];
  if (!theme) throw new Error(`no card design for ${combo.product}`);
  const cells = {};
  const ms = combo.product === "moonshot";
  const legs = combo.legs.map((l, i) => legHtml(cells, l, i)).join("");
  const body = `${CSS}${ms ? '<div class="cb-burst"></div>' : ""}<div class="cb ${ms ? "ms" : "bb"}" style="--acc:${theme.accent};display:flex;flex-direction:column;flex:1;min-height:0">
<div class="kicker">${ms ? "Daily combination" : "Conservative combination"}</div><div class="cb-title">${esc(combo.label)}</div>
${ms ? `<div class="cb-hiw"><span class="cb-hi">${cell(cells, "risk.tier", "LONGSHOT · HIGHER RISK")}</span></div>` : ""}
<div class="cb-sub">${cell(cells, "legs", `${combo.legs.length} legs`)} · ${esc(MODEL_LABEL)}</div>
<div class="ufl${combo.legs.length > 2 ? " d" : ""}">${legs}</div>
<div class="cb-state">${cell(cells, "pricing", PRICING_TEXT[combo.pricing])}</div>
<div class="cb-risk">${cell(cells, "risk", riskText(combo))}</div></div>`;
  let html = shell({ away: theme.a, home: theme.b, chip: chipText(combo), body, disclosure: COMBO_DISCLOSURE });
  if (combo.testData) html = html.replace('<div class="frame"></div>', `<div class="cb-ribbon">${esc(TEST_RIBBON)}</div><div class="frame"></div>`);
  return { html, cells, v2: true, disclosure: COMBO_DISCLOSURE, testData: combo.testData };
}

/** Prices, lines, books and payouts never reach a combo image; neither does "parlay" or a promise. */
const PRICE_TEXT = /[+−-]\d{3}\b|\$\d|\bpayout\b|\bparlay\b|\bodds\b|\bline\b|\bover\b|\bunder \d+\.5\b|\bsportsbook price\b/i;
/** [] when the combo card is clean: the shared v2 checks plus the combo's own. */
export function verifyComboCard(card) {
  const e = verifyGameDayCard(card);
  const text = visibleText(card.html.replace(/<script>[\s\S]*?<\/script>/g, " "));
  if (!text.includes(MODEL_LABEL)) e.push("MODEL PROJECTION label missing");
  if (!Object.values(PRICING_TEXT).some((t) => text.includes(t))) e.push("not-an-offer state missing");
  if (PRICE_TEXT.test(text.replace(/NOT A SPORTSBOOK OFFER/g, " "))) e.push(`price, line or payout text on image: ${text.match(PRICE_TEXT)[0]}`);
  if (card.testData && !text.includes(TEST_RIBBON)) e.push("test fixture without its TEST ribbon");
  if (!card.testData && text.includes(TEST_RIBBON)) e.push("TEST ribbon on real data");
  return e;
}

/** Stacked blocks, top to bottom; each must start below the one before it (the shared fit check cannot see a centred overflow). */
const STACK = ".kicker,.cb-title,.cb-hi,.cb-sub,.lg,.cb-state,.cb-risk,.social,.disclosure";
/** Layout problems of each card in a real browser. `browser` is a Playwright browser. */
export async function comboLayoutErrors(browser, cards) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate((sel) => {
      const boxes = [...document.querySelectorAll(sel)].map((e) => ({ cls: e.className, r: e.getBoundingClientRect() }));
      const overlaps = [];
      for (let i = 1; i < boxes.length; i += 1) if (boxes[i].r.top < boxes[i - 1].r.bottom - 1) overlaps.push(`${boxes[i - 1].cls} / ${boxes[i].cls}`);
      const ufl = document.querySelector(".ufl").getBoundingClientRect();
      const outside = [...document.querySelectorAll(".lg")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < ufl.top - 1 || r.bottom > ufl.bottom + 1; }).length;
      const last = boxes.at(-1).r.bottom;
      const flags = [...document.querySelectorAll("[data-flag] span")].filter((e) => e.scrollWidth > e.clientWidth + 1 || parseFloat(getComputedStyle(e).fontSize) < 20).map((e) => e.textContent);
      return { overlaps, outside, last, flags, fit: (window.__fit?.items ?? []).filter((i) => !i.fits).map((i) => i.text), page: window.__fit?.pageOverflow };
    }, STACK);
    if (m.overlaps.length) errs.push(`${c.name}: blocks overlap: ${m.overlaps.join(", ")}`);
    if (m.flags.length) errs.push(`${c.name}: flag text does not fit legibly: ${m.flags.join(" | ")}`);
    if (m.outside) errs.push(`${c.name}: ${m.outside} leg(s) spill out of the leg area`);
    if (m.last > 1350 - 8) errs.push(`${c.name}: footer at ${Math.round(m.last)}px`);
    if (m.fit.length || m.page) errs.push(`${c.name}: does not fit: ${m.fit.join(" | ")}`);
  }
  await page.close();
  return errs;
}
