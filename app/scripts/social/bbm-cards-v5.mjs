/* global document, window, getComputedStyle -- bbmV5LayoutErrors evaluates in the Playwright browser page */
/**
 * BANK BUILDER & MOONSHOT GRAPHICS V5 (founder acceptance target: the 2026-11-04 reference composition). Original
 * GameTimePicks art drawn in code, 1080x1350, every number and word code-rendered from the model:
 *   scene    arena spotlights with light cones, a crowd bokeh band, a polished court floor with reflections and a
 *            basketball, a fine noise grain (all procedural SVG; no third-party marks; the official GTP logo only)
 *   meter    Bank Builder: a large chrome battery (cap, cylindrical body with reflections, neon green glow, 5 glass
 *            compartments). Moonshot: a tall chrome rocket (nosecone, neon purple outline, orange rim light, lit fins,
 *            engine flame and purple smoke, 5 body segments, step 5 at the nose). Left third, full height.
 *   right    logo · NBA date chip · gold italic title · "$100 → $10,000 challenge" · LANE and STEP pills · up to two
 *            neon leg panels (moneyline or prop) · combined odds (leg product) bar, check badge only when verified ·
 *            tracked stake / potential payout (largest, gold) / potential profit
 * Template mode keeps every placeholder and gate of V4 (ribbon, never VERIFIED, never a payout, never packaged).
 */
import { esc, cell } from "./social-pack-cards.mjs";
import { shell, sourceTextProblems, statLabelProblems, teamOf } from "./game-day-cards.mjs";
import { logoDataUri, visibleText } from "./nba-line-cards.mjs";
import { american, cents, chipText, tipText, TEST_RIBBON, SAMPLE_PRICE_RIBBON } from "./bbm-cards.mjs";
import { RULES_V2, TEMPLATE_RIBBON } from "./bbm-cards-v4.mjs";
import { BADGE, RUNG, VIEW } from "../../src/lib/social/bbm-lane.mjs";

export { RULES_V2, TEMPLATE_RIBBON };
export const BBM_V5_DESIGN_VERSION = "bbm-v5";
export const V5_FOOTER = "21+ · Gamble responsibly";
export const V5_PLACEHOLDER = Object.freeze({ leg: "Awaiting qualified selection", price: "Price pending", payout: "Pending" });
/** Prop legs: Level A carries the model's probability; Level B is research evidence, never a probability. */
export const PROP_LEVEL = Object.freeze({ A: "Model value (Level A)", B: "Research (Level B)" });
export const V5_REMOVED = Object.freeze([/NO REAL WAGER/i, /\bCAPTURED\b/i, /NEXT MILESTONE/i, /BELOW PACE|ON PACE|BEHIND PACE/i, /FOUNDER REVIEW ONLY/i, /NOT A SPORTSBOOK OFFER/i, /must land/i, /betting advice/i, /\bACTIVE\b/]);
const STATUS_WORD = Object.freeze({ [BADGE.WON]: "Won", [BADGE.LOST]: "Lost", [BADGE.HELD]: "Held", [BADGE.COMPLETED]: "Completed", [BADGE.FINISHED_SHORT]: "Finished short" });
const PRODUCT = Object.freeze({
  "bank-builder": { name: "Bank Builder", cls: "bb", neon: "#3DFF6E", neon2: "#B6FF3D", tint: "#0E3B1C", tint2: "#2C3A06", spot: "#CFE9FF", gold1: "#FFF1A6", gold2: "#FFC21A", gold3: "#C46A00" },
  moonshot: { name: "Moonshot", cls: "ms", neon: "#C04BFF", neon2: "#FF8A1F", tint: "#3D0F6B", tint2: "#4A1606", spot: "#D9A8FF", gold1: "#FFE6A0", gold2: "#FF9A1F", gold3: "#C2410C" },
});

/** A deterministic pseudo-random sequence (no clock, no Math.random), so a re-render is byte-identical. */
function seeded(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/** The arena plate: spotlights, light cones, crowd bokeh, the court floor, a basketball and grain. */
function scene(P) {
  const r = seeded(P.cls === "bb" ? 7 : 11);
  const bokeh = Array.from({ length: 170 }, () => {
    const x = r() * 1080; const y = 90 + r() * 380; const rad = 1.5 + r() * 6; const warm = r() < 0.55;
    const col = warm ? ["#FFD27A", "#FF9F45", "#FFE9B8"][Math.floor(r() * 3)] : [P.spot, P.neon, "#9FD3FF"][Math.floor(r() * 3)];
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${col}" opacity="${(0.1 + r() * 0.5).toFixed(2)}"/>`;
  }).join("");
  const lamps = [[40, 40], [86, 30], [132, 22], [62, 78], [108, 68], [154, 58], [1040, 40], [994, 30], [948, 22], [1018, 78], [972, 68], [926, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="${P.spot}" opacity=".5" filter="url(#b8)"/><circle cx="${x}" cy="${y}" r="12" fill="#FFFFFF"/>`).join("");
  return `<svg class="plate" viewBox="0 0 1080 1350" preserveAspectRatio="none" aria-hidden="true"><defs>
<filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="b3"><feGaussianBlur stdDeviation="2.4"/></filter>
<filter id="b30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .07"/></feComponentTransfer></filter>
<radialGradient id="sky" cx=".5" cy=".3" r=".85"><stop offset="0" stop-color="${P.tint}"/><stop offset=".5" stop-color="#05070A"/><stop offset="1" stop-color="#010203"/></radialGradient>
<radialGradient id="flare" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".2" stop-color="${P.spot}" stop-opacity=".9"/><stop offset="1" stop-color="${P.spot}" stop-opacity="0"/></radialGradient>
<linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.spot}" stop-opacity=".55"/><stop offset="1" stop-color="${P.spot}" stop-opacity="0"/></linearGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140c06"/><stop offset=".35" stop-color="#3a220f"/><stop offset="1" stop-color="#110904"/></linearGradient>
<radialGradient id="floorGlow" cx=".5" cy="0" r=".7"><stop offset="0" stop-color="${P.neon}" stop-opacity=".35"/><stop offset="1" stop-color="${P.neon}" stop-opacity="0"/></radialGradient>
<radialGradient id="ball" cx=".42" cy=".3" r=".75"><stop offset="0" stop-color="#FFB35C"/><stop offset=".45" stop-color="#D2651C"/><stop offset="1" stop-color="#3A1405"/></radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".82"/></linearGradient></defs>
<rect width="1080" height="1350" fill="url(#sky)"/>
<rect width="1080" height="1350" fill="${P.tint}" opacity=".12"/>
<ellipse cx="0" cy="560" rx="380" ry="720" fill="${P.neon}" opacity=".2" filter="url(#b30)"/><ellipse cx="1080" cy="520" rx="320" ry="640" fill="${P.neon2}" opacity=".1" filter="url(#b30)"/>
<ellipse cx="80" cy="40" rx="300" ry="190" fill="url(#flare)" opacity=".55"/><ellipse cx="1000" cy="40" rx="300" ry="190" fill="url(#flare)" opacity=".55"/>
<path d="M0 330 Q 270 250 540 300 T 1080 330 L1080 520 L0 520 Z" fill="#000" opacity=".55"/>
<g opacity=".6">${Array.from({ length: 70 }, (_, i) => { const x = (i * 1080) / 70 + 4; const y = 270 + Math.sin(i * 1.7) * 18 + (i % 3) * 8; return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="7" ry="9" fill="#0a0d10"/><rect x="${(x - 9).toFixed(0)}" y="${(y + 8).toFixed(0)}" width="18" height="40" rx="6" fill="#0a0d10"/>`; }).join("")}</g>
<g opacity=".9"><polygon points="100,50 120,1100 560,1100" fill="url(#cone)" opacity=".3" filter="url(#b30)"/><polygon points="980,50 520,1100 960,1100" fill="url(#cone)" opacity=".3" filter="url(#b30)"/>
<polygon points="210,48 380,900 600,900" fill="url(#cone)" opacity=".12" filter="url(#b30)"/><polygon points="870,48 480,900 700,900" fill="url(#cone)" opacity=".12" filter="url(#b30)"/></g>
<g filter="url(#b3)">${bokeh}</g>${lamps}
<g><polygon points="-200,1350 1280,1350 1080,1040 0,1040" fill="url(#floor)"/>
${Array.from({ length: 14 }, (_, i) => `<line x1="${-200 + i * 106}" y1="1350" x2="${i * 77}" y2="1040" stroke="#000" stroke-opacity=".28" stroke-width="2"/>`).join("")}
<ellipse cx="540" cy="1050" rx="620" ry="70" fill="url(#floorGlow)"/><ellipse cx="540" cy="1300" rx="420" ry="120" fill="#FF8A1F" opacity=".35" filter="url(#b30)"/>
<path d="M120 1350 Q 540 1060 960 1350" fill="none" stroke="#F2E6D0" stroke-opacity=".18" stroke-width="5"/>
<ellipse cx="270" cy="1120" rx="170" ry="14" fill="${P.neon}" opacity=".18" filter="url(#b8)"/>
<g transform="translate(540 1500)"><circle r="300" fill="#FF9A3C" opacity=".35" filter="url(#b30)"/><circle r="270" fill="url(#ball)"/><path d="M-270 0 H270 M0 -270 V270 M-190 -190 Q 0 0 -190 190 M190 -190 Q 0 0 190 190" stroke="#1a0b03" stroke-width="7" fill="none" opacity=".85"/></g>
<rect y="1150" width="1080" height="200" fill="url(#fade)"/></g>
<rect width="1080" height="1350" filter="url(#grain)"/></svg>`;
}

/** The chrome battery, left third: cap, ring, reflective cylinder, neon glow, inner glass and 5 compartments. */
function battery(cells, rungs, P) {
  const svg = `<svg class="mv" viewBox="0 0 330 1020" preserveAspectRatio="none" aria-hidden="true"><defs>
<linearGradient id="chrome" x1="0" x2="1"><stop offset="0" stop-color="#1b1f22"/><stop offset=".08" stop-color="#8d969c"/><stop offset=".16" stop-color="#e9eef0"/><stop offset=".26" stop-color="#5d666b"/><stop offset=".5" stop-color="#222629"/><stop offset=".74" stop-color="#4a5257"/><stop offset=".86" stop-color="#d7dde0"/><stop offset=".94" stop-color="#6b7378"/><stop offset="1" stop-color="#15181a"/></linearGradient>
<linearGradient id="capg" x1="0" x2="1"><stop offset="0" stop-color="#3b4246"/><stop offset=".3" stop-color="#f4f7f8"/><stop offset=".55" stop-color="#9aa3a8"/><stop offset="1" stop-color="#2b3134"/></linearGradient>
<linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="#173a22" stop-opacity=".85"/><stop offset=".5" stop-color="#040806" stop-opacity=".78"/><stop offset="1" stop-color="#173a22" stop-opacity=".85"/></linearGradient>
<filter id="neonB" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<ellipse cx="165" cy="560" rx="200" ry="520" fill="${P.neon}" opacity=".16" filter="url(#neonB)"/>
<rect x="112" y="2" width="106" height="40" rx="10" fill="url(#capg)"/><ellipse cx="165" cy="5" rx="53" ry="6" fill="#fbfdfe" opacity=".95"/>
<rect x="44" y="34" width="242" height="62" rx="18" fill="url(#chrome)"/>${[46, 58, 70, 82].map((y) => `<line x1="50" y1="${y}" x2="280" y2="${y}" stroke="#0b0d0e" stroke-opacity=".45" stroke-width="2"/>`).join("")}
<rect x="26" y="88" width="278" height="834" rx="38" fill="url(#glass)"/>
<rect x="26" y="88" width="278" height="834" rx="38" fill="none" stroke="${P.neon}" stroke-width="8" filter="url(#neonB)"/>
<rect x="38" y="104" width="12" height="800" rx="6" fill="#fff" opacity=".22"/><rect x="282" y="104" width="6" height="800" rx="3" fill="#fff" opacity=".12"/>
<rect x="8" y="912" width="314" height="84" rx="24" fill="url(#chrome)"/>${[930, 950, 970].map((y) => `<line x1="16" y1="${y}" x2="314" y2="${y}" stroke="#0b0d0e" stroke-opacity=".35" stroke-width="2"/>`).join("")}
<rect x="8" y="912" width="314" height="84" rx="24" fill="none" stroke="${P.neon}" stroke-opacity=".7" stroke-width="3"/>
<ellipse cx="165" cy="1006" rx="170" ry="12" fill="${P.neon}" opacity=".35" filter="url(#neonB)"/></svg>`;
  return `<div class="mtr5 bat" data-meter="battery">${svg}<div class="cells">${rungs.map((r) => compartment(cells, r, rungs.length)).join("")}</div></div>`;
}

/** The chrome rocket, left third: nosecone, body, neon outline with orange rim light, fins, engine flame and smoke. */
function rocket(cells, rungs, P) {
  const svg = `<svg class="mv" viewBox="0 0 330 1020" preserveAspectRatio="none" aria-hidden="true"><defs>
<linearGradient id="hullm" x1="0" x2="1"><stop offset="0" stop-color="#1a1424"/><stop offset=".1" stop-color="#9d93b0"/><stop offset=".2" stop-color="#f1ecf8"/><stop offset=".32" stop-color="#5c5270"/><stop offset=".55" stop-color="#1e1729"/><stop offset=".78" stop-color="#4b405e"/><stop offset=".88" stop-color="#d9cfe8"/><stop offset="1" stop-color="#151020"/></linearGradient>
<linearGradient id="win" x1="0" x2="1"><stop offset="0" stop-color="#120a1e" stop-opacity=".94"/><stop offset=".5" stop-color="#07040c" stop-opacity=".86"/><stop offset="1" stop-color="#120a1e" stop-opacity=".94"/></linearGradient>
<radialGradient id="flame" cx=".5" cy=".05" r=".95"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".2" stop-color="#FFF0B3"/><stop offset=".45" stop-color="#FFAA2B"/><stop offset=".75" stop-color="#FF4D12" stop-opacity=".7"/><stop offset="1" stop-color="#8A2BE2" stop-opacity="0"/></radialGradient>
<filter id="neonM" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="finG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2a86"/><stop offset=".6" stop-color="#c2541a"/><stop offset="1" stop-color="#FFB13B"/></linearGradient>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter></defs>
<g filter="url(#soft)" opacity=".9"><circle cx="70" cy="1000" r="70" fill="#7B2CBF"/><circle cx="165" cy="1030" r="80" fill="#9D4EDD"/><circle cx="260" cy="1000" r="70" fill="#7B2CBF"/><circle cx="20" cy="1040" r="50" fill="#5A189A"/><circle cx="310" cy="1040" r="50" fill="#5A189A"/></g>
<ellipse cx="165" cy="990" rx="120" ry="170" fill="url(#flame)" filter="url(#soft)"/><ellipse cx="165" cy="950" rx="58" ry="100" fill="url(#flame)"/><ellipse cx="165" cy="915" rx="26" ry="40" fill="#FFFFFF" opacity=".9" filter="url(#soft)"/>
<path d="M40 560 L 2 760 L 2 905 L 40 840 Z M290 560 L 328 760 L 328 905 L 290 840 Z" fill="url(#finG)" stroke="${P.neon2}" stroke-width="5" filter="url(#neonM)"/>
<path d="M165 4 C 245 80 290 200 290 330 L 290 840 L 40 840 L 40 330 C 40 200 85 80 165 4 Z" fill="url(#hullm)"/>
<path d="M165 4 C 245 80 290 200 290 330 L 290 840 L 40 840 L 40 330 C 40 200 85 80 165 4 Z" fill="none" stroke="${P.neon}" stroke-width="7" filter="url(#neonM)"/>
<path d="M47 840 L 47 330 C 47 205 90 90 165 14" fill="none" stroke="${P.neon2}" stroke-width="4" opacity=".95" filter="url(#neonM)"/><path d="M283 330 L 283 840" stroke="${P.neon2}" stroke-width="3" opacity=".7" filter="url(#neonM)"/>
<rect x="110" y="840" width="110" height="44" rx="6" fill="url(#hullm)" stroke="#2a2235" stroke-width="3"/>
<path d="M165 70 C 228 130 262 220 264 330 L 264 826 L 66 826 L 66 330 C 68 220 102 130 165 70 Z" fill="url(#win)" stroke="${P.neon}" stroke-opacity=".5" stroke-width="2"/>
<circle cx="165" cy="138" r="34" fill="url(#hullm)"/><circle cx="165" cy="138" r="24" fill="#1a0b2e" stroke="${P.neon}" stroke-width="4" filter="url(#neonM)"/><circle cx="157" cy="130" r="7" fill="#fff" opacity=".7"/></svg>`;
  return `<div class="mtr5 rk" data-meter="rocket">${svg}<div class="cells">${rungs.map((r) => compartment(cells, r, rungs.length)).join("")}</div></div>`;
}

function compartment(cells, r, steps) {
  const top = r.step === steps;
  const mark = r.state === RUNG.COMPLETED ? "✓ " : r.state === RUNG.FAILED ? "✕ " : "";
  return `<div class="cp ${r.state}" data-rung="${r.state}"><span class="k">${esc(mark)}Step ${r.step}</span>${cell(cells, `ladder.m${r.step}`, `${top ? "" : "~"}${cents(r.milestoneCents)}`, "m")}<span class="t">(${top ? "Goal" : "Target"})</span></div>`;
}

function legPanel(cells, l, i, ctx) {
  const k = `leg${i + 1}`;
  if (l.placeholder) {
    return `<div class="leg ph" data-slot="${l.placeholder}"><div class="n">${i + 1}</div><div class="who">${cell(cells, `${k}.name`, V5_PLACEHOLDER.leg, "nm ph")}<div class="mt">${cell(cells, `${k}.odds`, V5_PLACEHOLDER.price, "chip dim")}${l.placeholder === "optional" ? `<span class="opt">${cell(cells, `${k}.optional`, "Optional")}</span>` : ""}</div></div><div class="rt"><span class="pk">Model win<br>probability</span>${cell(cells, `${k}.proj`, "Pending", "pv dim")}</div></div>`;
  }
  const t = teamOf(l.team.abbr, l.team.name);
  const odds = ctx.price && ctx.price.oddsFormat === "american" && american(ctx.price.price) ? cell(cells, `${k}.odds`, american(ctx.price.price), "chip odds") : l.oddsText ? cell(cells, `${k}.odds`, l.oddsText, "chip odds") : "";
  const oc = ctx.outcome ? cell(cells, `${k}.outcome`, { WIN: "Landed", LOSS: "Missed" }[ctx.outcome] ?? ctx.outcome, `oc ${ctx.outcome}`) : "";
  const flag = (l.flagText ?? []).length ? `<div class="fl" data-flag>${cell(cells, `${k}.flag`, `⚑ ${l.flagText.join(" · ")}`)}</div>` : "";
  if (l.kind === "PROP") {
    // Level A: the model's probability. Level B: research evidence (hit counts), never shown as a probability.
    const right = l.level === "A" ? `<span class="pk">${cell(cells, `${k}.level`, PROP_LEVEL.A)}</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}` : `<span class="pk">${cell(cells, `${k}.level`, PROP_LEVEL.B)}</span>${cell(cells, `${k}.evidenceBig`, l.evidence?.l10 ?? "Research", "pv ev")}<span class="pk sm">last 10</span>`;
    return `<div class="leg" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><div class="who"><span class="nm" data-fit>${cell(cells, `${k}.name`, l.player.name)}</span><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${l.home ? "vs" : "@"} ${l.opponent.abbr} · ${tipText(l.tipUtc)}`)}</div><div class="mt">${cell(cells, `${k}.line`, l.lineText, "chip line")}${odds}${oc}</div>${l.evidence ? `<div class="evl">${cell(cells, `${k}.evidence`, `Hit ${l.evidence.l10} L10 · ${l.evidence.l20} L20`)}</div>` : ""}${flag}</div><div class="rt">${right}</div></div>`;
  }
  return `<div class="leg" style="--c:${t.color};--cink:${t.ink}"><div class="n">${i + 1}</div><div class="who"><span class="nm" data-fit>${cell(cells, `${k}.name`, t.name)}</span><div class="mt"><span class="tg">${cell(cells, `${k}.team`, t.abbr)}</span>${cell(cells, `${k}.game`, `${l.home ? "vs" : "@"} ${l.opponent.abbr} · ${tipText(l.tipUtc)}`)}${odds}${oc}</div>${flag}</div><div class="rt"><span class="pk">Model win<br>probability</span>${cell(cells, `${k}.proj`, l.projectionText, "pv")}</div></div>`;
}

const CSS = (P) => `<style>
.stage,.top{display:none!important}
.content .social{position:relative;z-index:3;margin-top:auto}
.content .disclosure{position:relative;z-index:3;font:700 19px/1.2 var(--display);letter-spacing:3px;color:rgba(247,247,242,.72);text-transform:uppercase}
.v5{position:absolute;left:-64px;top:-64px;width:1080px;height:1350px;--neon:${P.neon};--neon2:${P.neon2};--g1:${P.gold1};--g2:${P.gold2};--g3:${P.gold3}}
.plate{position:absolute;inset:0;width:1080px;height:1350px}
.mtr5{position:absolute;left:16px;top:170px;width:330px;height:1020px}
.mtr5.rk{left:4px;top:96px;width:352px;height:1100px}
.mtr5 .mv{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.bat .cells{position:absolute;left:40px;right:40px;top:104px;bottom:112px;display:flex;flex-direction:column-reverse;gap:10px}
.rk .cells{position:absolute;left:74px;right:74px;top:178px;bottom:236px;display:flex;flex-direction:column-reverse;gap:10px}
.cp{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:18px;border:3px solid color-mix(in srgb,var(--neon) 80%,transparent);background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.03) 35%,rgba(0,0,0,.35));box-shadow:inset 0 2px 0 rgba(255,255,255,.3),inset 0 0 18px color-mix(in srgb,var(--neon) 25%,transparent),0 0 16px color-mix(in srgb,var(--neon) 55%,transparent);color:#EAF7EE;text-align:center;min-height:0}
.cp .k{font:900 30px/1 var(--display);letter-spacing:1px;text-transform:uppercase;color:#F5F7F2}
.cp .m{margin-top:6px;font:900 54px/1 var(--display);white-space:nowrap;background:linear-gradient(180deg,var(--g1),var(--g2) 60%,var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent}
.cp .t{margin-top:6px;font:800 21px/1 var(--display);letter-spacing:1px;text-transform:uppercase;color:rgba(245,247,242,.78)}
.rk .cp .k{font-size:25px}.rk .cp .m{font-size:44px}.rk .cp .t{font-size:17px}.rk .cp:last-child{flex:1.35;border-radius:100px 100px 16px 16px;padding-top:30px}
.cp.active{border:3px solid var(--g2);background:radial-gradient(120% 120% at 50% 40%,rgba(255,214,90,.55),rgba(150,90,0,.35) 55%,rgba(40,20,0,.6));box-shadow:0 0 0 3px rgba(255,194,26,.25),0 0 34px rgba(255,194,26,.85),inset 0 0 24px rgba(255,230,140,.5)}
.cp.active .m{background:linear-gradient(180deg,#FFFFFF,#FFE27A 50%,#FFB300);-webkit-background-clip:text;background-clip:text}
.cp.completed{border-color:var(--neon);background:linear-gradient(180deg,color-mix(in srgb,var(--neon) 70%,#fff),color-mix(in srgb,var(--neon) 85%,#000));box-shadow:0 0 24px color-mix(in srgb,var(--neon) 80%,transparent)}
.cp.completed .k,.cp.completed .t{color:#04140a}.cp.completed .m{background:none;color:#04140a;-webkit-background-clip:initial;background-clip:initial}
.cp.failed{border-color:#FF4D5E;background:linear-gradient(180deg,rgba(255,77,94,.45),rgba(90,0,10,.55));box-shadow:0 0 22px rgba(255,77,94,.7)}
.cp.failed .m{background:none;color:#FFD0D5;-webkit-background-clip:initial;background-clip:initial}
.cp.upcoming{opacity:.95}
.rt5{position:absolute;left:366px;right:22px;top:40px;bottom:470px;display:flex;flex-direction:column;align-items:stretch}
.logo5{display:block;margin:0 auto;height:98px;filter:drop-shadow(0 0 18px rgba(57,255,136,.55))}
.chip5{margin:10px auto 0;padding:10px 26px 8px;border-radius:999px;border:2px solid var(--neon);box-shadow:0 0 16px color-mix(in srgb,var(--neon) 55%,transparent),inset 0 0 10px color-mix(in srgb,var(--neon) 25%,transparent);background:rgba(4,8,6,.72);font:800 26px/1 var(--display);letter-spacing:5px;text-transform:uppercase;color:#F5F7F2;white-space:nowrap}
.title5{margin-top:10px;text-align:center;font:900 italic 108px/.92 var(--headline);-webkit-text-stroke:1.5px rgba(80,35,0,.55);text-transform:uppercase;white-space:nowrap;background:linear-gradient(180deg,var(--g1) 8%,var(--g2) 55%,var(--g3) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 16px color-mix(in srgb,var(--g2) 65%,transparent)) drop-shadow(0 5px 0 rgba(60,25,0,.85))}
.goal5{margin-top:8px;text-align:center;font:900 italic 42px/1 var(--headline);letter-spacing:1px;text-transform:uppercase;color:#F7F7F2;white-space:nowrap;text-shadow:0 3px 10px rgba(0,0,0,.8)}
.pills5>b,.pills5>span{display:inline-block}.pills5{margin:14px auto 0;display:flex;align-items:center;border-radius:999px;border:2px solid var(--neon);box-shadow:0 0 18px color-mix(in srgb,var(--neon) 50%,transparent);background:rgba(4,8,6,.78);overflow:hidden;white-space:nowrap}
.pills5>b{padding:12px 26px 9px;font:900 italic 34px/1 var(--headline);letter-spacing:1px;text-transform:uppercase;color:#1a0f00;background:linear-gradient(180deg,#FFF1A6,var(--g2));border-radius:999px;box-shadow:0 0 18px rgba(255,194,26,.6)}
.pills5>span{padding:12px 26px 9px;font:900 30px/1 var(--display);letter-spacing:3px;text-transform:uppercase;color:#F5F7F2}
.pills5>.st{border-left:2px solid rgba(255,255,255,.2)}.pills5>.st.LOST{color:#FF6B7A}.pills5 .st.HELD{color:#FFC14D}.pills5 .st.WON,.pills5 .st.COMPLETED{color:var(--neon)}.pills5 .st.FINISHED{color:#D7DEE5}
.pills5.three>b,.pills5.three>span{font-size:24px;padding:10px 14px 8px;letter-spacing:1px}
.legs5:has(>.leg:only-child){justify-content:center}
.legs5{flex:1;min-height:0;margin-top:28px;display:flex;flex-direction:column;justify-content:flex-start;gap:20px}
.leg{position:relative;display:grid;grid-template-columns:58px 1fr auto;align-items:center;gap:6px 16px;min-height:150px;padding:18px 22px 16px;border-radius:22px;border:4px solid color-mix(in srgb,var(--c) 70%,#fff 30%);background:linear-gradient(100deg,color-mix(in srgb,var(--c) 70%,rgba(6,8,10,.9)),color-mix(in srgb,var(--c) 22%,rgba(6,8,10,.94)) 60%,rgba(6,8,10,.94));box-shadow:0 0 26px color-mix(in srgb,var(--c) 80%,transparent),inset 0 2px 0 rgba(255,255,255,.25),inset 0 0 22px color-mix(in srgb,var(--c) 35%,transparent);min-width:0}
.leg .n{font:900 italic 76px/1 var(--headline);background:linear-gradient(180deg,var(--g1),var(--g2) 60%,var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent;text-align:center;padding-right:8px;border-right:2px solid rgba(255,255,255,.18)}
.leg .who{min-width:0;display:flex;flex-direction:column;gap:7px}
.leg .nm{display:block;font:900 48px/1 var(--headline);text-transform:uppercase;white-space:nowrap;overflow:hidden;color:#F7F7F2;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.leg .nm.ph{font-size:28px;line-height:1.08;white-space:normal;color:rgba(247,247,242,.92)}
.leg .mt{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;font:700 22px/1 var(--display);color:rgba(247,247,242,.86);white-space:nowrap;min-width:0}
.leg .tg{font:900 21px/1 var(--headline);padding:5px 8px 3px;border-radius:7px;background:var(--c);color:var(--cink)}
.leg .chip{font:900 22px/1 var(--display);padding:6px 10px 4px;border-radius:8px;white-space:nowrap}
.leg .chip.odds{background:#F5F7F2;color:#050706}.leg .chip.line{background:color-mix(in srgb,var(--neon) 85%,#000);color:#04140a}.leg .chip.dim{background:rgba(255,255,255,.12);color:rgba(247,247,242,.8);border:1px dashed rgba(255,255,255,.35)}
.leg .opt{font:800 15px/1 var(--display);letter-spacing:2px;text-transform:uppercase;color:rgba(247,247,242,.6)}
.leg .evl{font:800 19px/1.1 var(--display);letter-spacing:1px;color:#BFE7FF;white-space:nowrap}
.leg .fl{font:800 18px/1.15 var(--display);color:#FFD166;white-space:normal;max-height:2.4em;overflow:hidden}
.leg .rt{text-align:center;padding-left:16px;border-left:2px solid rgba(255,255,255,.18);min-width:150px}
.leg .pk{display:block;font:800 18px/1.15 var(--display);letter-spacing:1px;text-transform:uppercase;color:var(--g2)}.leg .pk.sm{font-size:13px;color:rgba(247,247,242,.7)}
.leg .pv{display:block;margin-top:4px;font:900 72px/1 var(--display);color:#F7F7F2;white-space:nowrap;text-shadow:0 0 14px rgba(255,255,255,.25)}
.leg .pv.dim{font-size:28px;color:rgba(247,247,242,.6)}.leg .pv.ev{font-size:46px;color:#BFE7FF}
.leg .oc{font:900 18px/1 var(--headline);padding:5px 8px 3px;border-radius:6px;text-transform:uppercase}.leg .oc.WIN{background:var(--neon);color:#04140a}.leg .oc.LOSS{background:#FF4D5E;color:#1a0004}
.leg.ph{border-style:dashed;--c:color-mix(in srgb,var(--neon) 55%,#2a2f35)}
.stat5{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;text-align:center}
.stat5 .k{font:900 italic 66px/1 var(--headline);text-transform:uppercase;background:linear-gradient(180deg,var(--g1),var(--g2) 60%,var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent}
.stat5 .c{font:700 28px/1.3 var(--display);color:rgba(247,247,242,.86)}
.comb5{position:absolute;left:366px;right:22px;top:892px;height:84px;display:flex;align-items:center;justify-content:center;gap:16px;border-radius:999px;border:3px solid var(--neon);background:rgba(4,8,6,.84);box-shadow:0 0 22px color-mix(in srgb,var(--neon) 55%,transparent);white-space:nowrap}
.comb5 .k{font:800 25px/1 var(--display);letter-spacing:1px;text-transform:uppercase;color:#F5F7F2}
.comb5 .v{font:900 54px/1 var(--display);text-transform:uppercase;color:var(--neon);text-shadow:0 0 14px color-mix(in srgb,var(--neon) 70%,transparent)}
.comb5 .chk{display:flex;align-items:center;gap:8px;font:900 16px/1.1 var(--display);letter-spacing:2px;text-transform:uppercase;color:var(--neon)}
.comb5 .pre{font:900 16px/1 var(--display);letter-spacing:2px;text-transform:uppercase;color:#FFC14D;padding:6px 10px 4px;border:2px solid currentColor;border-radius:999px}
.money5{position:absolute;left:366px;right:22px;top:996px;height:168px;display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:12px}
.money5>div{display:flex;flex-direction:column;justify-content:center;border-radius:20px;padding:10px 8px;text-align:center;border:2px solid rgba(255,255,255,.22);background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(4,6,8,.86));box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.money5 .k{font:800 23px/1.05 var(--display);letter-spacing:1px;text-transform:uppercase;color:rgba(247,247,242,.9)}
.money5 .v{display:block;margin-top:8px;font:900 52px/1 var(--display);color:#F7F7F2;white-space:nowrap}
.money5 .pay{border:3px solid var(--g2);background:radial-gradient(120% 140% at 50% 0%,rgba(255,200,60,.35),rgba(20,12,0,.9));box-shadow:0 0 34px rgba(255,190,30,.7)}
.money5 .pay .k{color:#FFE27A}.money5 .pay .v{font-size:60px;background:linear-gradient(180deg,#FFFFFF,#FFE27A 45%,var(--g2));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 10px rgba(255,200,50,.6))}
.money5 .pro .v{color:var(--neon);text-shadow:0 0 14px color-mix(in srgb,var(--neon) 60%,transparent)}
.money5 .v.pend{font-size:34px;text-transform:uppercase;color:rgba(247,247,242,.72)}
.money5 .pay .v.pend{font-size:36px}
.money5 .sub{margin-top:6px;font:700 16px/1.1 var(--display);letter-spacing:2px;text-transform:uppercase;color:rgba(247,247,242,.6)}
.content{justify-content:flex-end}
.content .social{margin-top:0;padding-top:0}
.rib5{position:absolute;top:0;left:0;right:0;z-index:9;text-align:center;font:900 22px/36px var(--headline);letter-spacing:.12em;color:#1a0f00;background:#FFC14D;text-transform:uppercase}
.rib5.t{background:#FF3B6B;color:#fff}
</style>`;

const CHECK = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 15.5 L13 20 L22 10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** One V5 card. `model` as bbmCardV4; legs may also be props: { kind: "PROP", player, team, opponent, home, tipUtc, lineText, oddsText?, level: "A"|"B", projectionText?, evidence: { l10, l20 } }. */
export function bbmCardV5(model, { testData = false } = {}) {
  const P = PRODUCT[model.product];
  if (!P) throw new Error(`no V5 design for ${model.product}`);
  if ((model.legs ?? []).length > RULES_V2.maxLegs) throw new Error(`${model.legs.length} legs: rules v2 take at most ${RULES_V2.maxLegs}`);
  if (!Object.values(BADGE).includes(model.badge)) throw new Error(`status ${model.badge} is not in the public vocabulary`);
  for (const l of model.legs ?? []) if (l.kind === "PROP" && l.level === "B" && l.projectionText) throw new Error("a Level B prop never carries a probability");
  const cells = {};
  const tpl = model.template === true;
  const stepWord = model.view === VIEW.COMPLETE || model.view === VIEW.FINISHED_SHORT ? `${model.rungs.filter((r) => r.state === RUNG.COMPLETED).length} of ${model.steps} won` : `Step ${model.step} of ${model.steps}`;
  const status = model.badge === BADGE.ACTIVE ? "" : `<span class="st ${String(model.badge).split(" ")[0]}">${cell(cells, "status", STATUS_WORD[model.badge] ?? model.badge)}</span>`;
  const head = `<img class="logo5" src="${logoDataUri()}" alt=""><div style="text-align:center"><span class="chip5" style="display:inline-block">${cell(cells, "chip", chipText(model.date))}</span></div><div class="title5">${esc(P.name)}</div><div class="goal5">${cell(cells, "goal", `${cents(model.baseCents)} → ${cents(model.targetCents)} challenge`)}</div><div style="text-align:center"><span class="pills5${status ? " three" : ""}" style="display:inline-flex"><b>${cell(cells, "lane", `Lane ${model.letter}`)}</b><span>${cell(cells, "step", stepWord)}</span>${status}</span></div>`;
  const meter = model.product === "moonshot" ? rocket(cells, model.rungs, P) : battery(cells, model.rungs, P);
  const outs = Object.fromEntries((model.legResults ?? []).map((r) => [r.legId, r.outcome]));
  let mid; let bottom = "";
  if ([VIEW.CARD, VIEW.WON, VIEW.BUSTED].includes(model.view) && (model.legs ?? []).length) {
    mid = `<div class="legs5">${model.legs.map((l, i) => legPanel(cells, l, i, { price: model.view === VIEW.CARD ? model.payout?.legs?.[l.legId] : null, outcome: model.view === VIEW.CARD || l.placeholder ? null : outs[l.legId] ?? "PENDING" })).join("")}</div>`;
    if (model.view === VIEW.CARD) {
      const stepTarget = model.rungs[model.step - 1]?.milestoneCents;
      const am = model.payout ? american(model.payout.combinedAmerican) : null;
      const verified = !tpl && model.payout && !model.payout.preliminary && !model.payout.fixture;
      const tag = verified ? `<span class="chk">${CHECK}${cell(cells, "price.verified", "Verified odds")}</span>` : model.payout?.preliminary ? `<span class="pre">${cell(cells, "price.preliminary", "Preliminary odds")}</span>` : "";
      bottom += `<div class="comb5"><span class="k">${esc(model.payout?.estimate ? "Combined odds (estimate)" : "Combined odds (leg product)")}</span>${cell(cells, "price.combined", am ?? V5_PLACEHOLDER.price, "v")}${tag}</div>`;
      const stake = `<div><div class="k">Tracked stake</div>${cell(cells, "money.wager", model.bankrollCents == null ? "Withheld" : cents(model.bankrollCents), "v")}</div>`;
      if (tpl || !model.payout) bottom += `<div class="money5">${stake}<div class="pay"><div class="k">Potential payout</div>${cell(cells, "money.payoutPending", V5_PLACEHOLDER.payout, "v pend")}<div class="sub">${cell(cells, "money.targetNote", `Step ${model.step} target ~${cents(stepTarget)}`)}</div></div><div><div class="k">Potential profit</div>${cell(cells, "money.profitPending", V5_PLACEHOLDER.payout, "v pend")}</div></div>`;
      else bottom += `<div class="money5">${stake}<div class="pay" data-money="payout"><div class="k">Potential payout</div>${cell(cells, "money.payout", cents(model.payout.grossCents), "v")}</div><div class="pro"><div class="k">Potential profit</div>${cell(cells, "money.profit", cents(model.payout.profitCents), "v")}</div></div>`;
    }
  } else {
    const note = model.view === VIEW.NO_ELIGIBLE_CARD ? ["No qualified card", "The lane holds its place and its tracked bankroll."] : model.view === VIEW.COMPLETE ? ["Goal reached", `${cents(model.bankrollCents)} of ${cents(model.targetCents)}`] : model.view === VIEW.FINISHED_SHORT ? ["Finished short", `${cents(model.bankrollCents)} of ${cents(model.targetCents)}`] : ["Lane busted", ""];
    mid = `<div class="stat5"><div class="k">${cell(cells, "status.note", note[0])}</div>${note[1] ? `<div class="c">${cell(cells, "status.rule", note[1])}</div>` : ""}</div>`;
  }
  const rib = [tpl ? TEMPLATE_RIBBON : null, testData ? TEST_RIBBON : null, model.payout?.fixture ? SAMPLE_PRICE_RIBBON : null].filter(Boolean);
  const ribbon = rib.length ? `<div class="rib5 ${testData && !tpl ? "t" : ""}">${esc(rib.join(" · "))}</div>` : "";
  const body = `${CSS(P)}<div class="v5 ${P.cls}">${scene(P)}${meter}<div class="rt5">${head}${mid}</div>${bottom}${ribbon}</div>`;
  const html = shell({ chip: "", body, review: false, disclosure: V5_FOOTER }).replace(/<div class="rg">[^<]*<\/div>/g, "");
  return { html, cells, laneId: model.laneId, view: model.view, badge: model.badge, template: tpl, preliminary: model.payout?.preliminary === true, testData, samplePrice: model.payout?.fixture === true, priced: model.payout != null, disclosure: V5_FOOTER, design: BBM_V5_DESIGN_VERSION };
}

const cellsIn = (html) => Object.fromEntries([...html.matchAll(/data-cell="([^"]+)">([^<]*)</g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")]));
const PRICE_TEXT = /[+−-]\d{3}\b|\bparlay\b|\bunder\b|×/i;
/** [] when a V5 card is clean. */
export function verifyBbmCardV5(card) {
  const e = [];
  const got = cellsIn(card.html);
  for (const [k, v] of Object.entries(card.cells)) if (got[k] !== String(v)) e.push(`${k}: card ${got[k]} expected ${v}`);
  for (const k of Object.keys(got)) if (!(k in card.cells)) e.push(`${k}: not validated`);
  const text = visibleText(card.html.replace(/<script>[\s\S]*?<\/script>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " "));
  for (const r of V5_REMOVED) if (r.test(text)) e.push(`removed item on image: ${text.match(r)[0]}`);
  if (!text.includes(V5_FOOTER)) e.push("the 21+ line is missing");
  if ((text.match(/\bStep \d+ of \d+\b/gi) ?? []).length > 1) e.push("the lane step is stated twice");
  if (card.template) {
    if (!text.toLowerCase().includes(TEMPLATE_RIBBON.toLowerCase())) e.push("a template without its TEMPLATE ribbon");
    if ("price.verified" in got || /verified odds/i.test(text)) e.push("a template carries VERIFIED");
    if ("money.payout" in got || "money.profit" in got) e.push("a template carries a payout or profit");
    if (card.priced) e.push("a template carries a price");
  } else if (/template preview/i.test(text)) e.push("TEMPLATE ribbon on a real card");
  if (!card.priced && "price.verified" in got) e.push("VERIFIED on unpriced content");
  // A hit rate is research evidence, never a probability: no "%" in any evidence cell.
  for (const [k, v] of Object.entries(got)) if (/\.(evidence|evidenceBig)$/.test(k) && /%/.test(v)) e.push(`${k}: a hit rate shown as a percentage`);
  const priceCells = Object.entries(got).filter(([k]) => /\.(odds|line)$|^price\./.test(k));
  let shown = text; for (const [, v] of priceCells) shown = shown.split(v).join(" ");
  shown = shown.replace(/Combined odds \((leg product|estimate)\)/gi, " ").replace(SAMPLE_PRICE_RIBBON, " ");
  if (PRICE_TEXT.test(shown)) e.push(`price text outside its cells: ${shown.match(PRICE_TEXT)[0]}`);
  if (/[—–]/.test(text)) e.push("dash on image");
  e.push(...sourceTextProblems(shown), ...statLabelProblems(shown));
  if (!card.template) {
    const verified = card.priced && !card.preliminary && !card.samplePrice;
    if (verified !== ("price.verified" in got)) e.push(verified ? "a verified price without its badge" : "a verified badge without a verified real price");
  }
  return e;
}

/** Layout problems in a real browser (same rules as V4, over V5's blocks). */
export async function bbmV5LayoutErrors(browser, cards) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const clipped = [...document.querySelectorAll("[data-cell]")].filter((e) => { const r = e.getBoundingClientRect(); const block = getComputedStyle(e).display !== "inline"; return (block && e.scrollWidth > e.clientWidth + 1) || r.right > 1080 - 10 || r.left < 10 || r.bottom > 1350 - 6; }).map((e) => `${e.dataset.cell}=${e.textContent}`);
      const rt = document.querySelector(".rt5").getBoundingClientRect();
      const blocks = [".logo5", ".chip5", ".title5", ".goal5", ".pills5", ".legs5,.stat5"].map((s) => document.querySelector(s)).filter(Boolean).map((e) => ({ s: e.className, r: e.getBoundingClientRect() }));
      const overlaps = []; for (let i = 1; i < blocks.length; i += 1) if (blocks[i].r.top < blocks[i - 1].r.bottom - 1) overlaps.push(`${blocks[i - 1].s} / ${blocks[i].s}`);
      const legs = document.querySelector(".legs5")?.getBoundingClientRect();
      const comb = document.querySelector(".comb5")?.getBoundingClientRect(); const money = document.querySelector(".money5")?.getBoundingClientRect(); const social = document.querySelector(".social")?.getBoundingClientRect();
      if (legs && comb && legs.bottom > comb.top - 6) overlaps.push("legs / combined bar");
      if (rt && comb && rt.bottom > comb.top + 2 && !legs) overlaps.push("status / combined bar");
      if (comb && money && comb.bottom > money.top - 2) overlaps.push("combined bar / money");
      if (money && social && money.bottom > social.top - 2) overlaps.push("money / footer");
      const spill = legs ? [...document.querySelectorAll(".leg")].filter((e) => { const r = e.getBoundingClientRect(); return r.top < legs.top - 1 || r.bottom > legs.bottom + 1; }).length : 0;
      const cpOut = [...document.querySelectorAll(".cp")].filter((e) => e.scrollHeight > e.clientHeight + 2).length + [...document.querySelectorAll("[data-flag]")].filter((e) => e.scrollHeight > e.clientHeight + 2).length;
      const small = [...document.querySelectorAll("[data-cell]")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.dataset.cell);
      return { clipped, overlaps, spill, cpOut, small, fit: (window.__fit?.items ?? []).filter((i) => !i.fits).map((i) => i.text), page: window.__fit?.pageOverflow };
    });
    const n = c.name ?? c.laneId;
    if (m.clipped.length) errs.push(`${n}: clipped ${m.clipped.join(" | ")}`);
    if (m.overlaps.length) errs.push(`${n}: overlap ${m.overlaps.join(", ")}`);
    if (m.spill) errs.push(`${n}: ${m.spill} leg panel(s) spill`);
    if (m.cpOut) errs.push(`${n}: ${m.cpOut} compartment(s) or flag line(s) overflow`);
    if (m.small.length) errs.push(`${n}: text under 13px ${m.small.join(", ")}`);
    if (m.fit.length || m.page) errs.push(`${n}: does not fit ${m.fit.join(" | ")}`);
  }
  await page.close();
  return errs;
}
