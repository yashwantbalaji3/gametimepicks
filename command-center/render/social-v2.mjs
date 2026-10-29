/**
 * SOCIAL GRAPHICS V2 RENDERER — view-model (recap/social-v2.mjs) → 1080×1350 PNG. PROTOTYPE (v2.1, founder review 2).
 *
 * Reuses the existing pipeline (render-png.mjs: offline Chromium, every request aborted, logo inlined from
 * app/public/brand). Photo-free until licensed photography exists: no player images, no league or club logos, no jersey
 * numbers — team identity is the verified name, abbreviation and colours. A deterministic fit pass shrinks long names;
 * the render FAILS if any text still overflows. Same inputs and fonts → same bytes on one machine.
 *
 * PUBLIC TERMS (founder 2026-10-28) are a presentation mapping only: TERMS below is the single place social wording
 * lives. Internal names (OFFICIAL_FORECAST, forecast-of-record, frozen snapshots) are untouched; a "Prediction" here is
 * the published Official Forecast for that game, never a product pick.
 */
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";
import { escapeHtml as esc, loadChromium, pngSize } from "./render-png.mjs";

// 2.3 (founder 10-28): matchup meter, team marks inside the matchup boxes, X logo + @GameTimePicksHQ on every format,
// team-accented stat rows. A visual change is a new version: the 2.2.1 design approval does not carry over.
// 2.3.1 (founder 10-28): meter heading "Game winner estimate". 2.3.2: no estimate line in the footer either — the
// qualification (Elo provenance, accuracy not yet established) lives in the meter's evidence, not on the graphic.
// 2.3.3 (founder 10-29): the Anytime TD graphics (Top 3, Top 5 TD) lose the "if he plays · passing TDs don't count"
// subtitle; the heading is the matchup + "Anytime TD Predictions", centred. The qualification stays in the package
// evidence note (internal); availability is the founder's confirmation at approval. Other formats render as in 2.3.2.
export const SOCIAL_TEMPLATE = "gtp-social@2.3.3";
/** The one social identity printed on every graphic (shared component: socialLine in the shell). */
export const SOCIAL_HANDLE = "@GameTimePicksHQ";
const DIR = path.join(CC_ROOT, "render/templates/social-v2");
const FONTS = path.join(CC_ROOT, "render/fonts");
/** The asset manifest's version: bound into every V2.1 approval fingerprint with the template version. */
export const ASSET_MANIFEST = JSON.parse(fs.readFileSync(path.join(DIR, "asset-manifest.json"), "utf8")).manifestVersion;
const FACES = [["GTP Condensed", "BarlowCondensed-SemiBold.ttf", 600], ["GTP Condensed", "BarlowCondensed-Bold.ttf", 700], ["GTP Condensed", "BarlowCondensed-ExtraBold.ttf", 800],
  ["GTP Condensed", "BarlowCondensed-Black.ttf", 900], ["GTP Body", "Barlow-Medium.ttf", 500], ["GTP Body", "Barlow-SemiBold.ttf", 600], ["GTP Body", "Barlow-Bold.ttf", 700]];
let fontCss = null;
/** @font-face rules with the bundled OFL fonts inlined as data URIs (the page makes no request at all). */
export const fontFaces = () => (fontCss ??= FACES.map(([family, file, weight]) =>
  `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, file)).toString("base64")}) format("truetype");}`).join("\n"));
const LOGO = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(DIR, "asset-manifest.json"), "utf8"));
/** The X mark (X brand toolkit: the logo may identify an X account), drawn as a single vector path. */
export const X_MARK = `<svg class="xmark" viewBox="0 0 1200 1227" aria-hidden="true"><path fill="currentColor" d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z"/></svg>`;
/**
 * Team marks: a LICENSED logo from the asset manifest (teamLogos, each entry with its file, sha256 and rights), else a
 * monogram in the team's colours — never a hot-linked or scraped logo. Today the manifest licenses none (the repository's
 * asset audits record no licensed NBA/NFL/MLB logos), so every team shows its monogram.
 */
export function teamLogoOf(league, abbr) {
  const e = MANIFEST.teamLogos?.[league]?.[abbr];
  if (!e?.file || !e?.rights) return null;
  const file = path.join(REPO_ROOT, e.file);
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  if (e.sha256 && sha256(bytes) !== e.sha256) return null;
  return `data:${e.file.endsWith(".svg") ? "image/svg+xml" : "image/png"};base64,${bytes.toString("base64")}`;
}
/** WCAG contrast; text on a team colour uses the team's ink only when it reads (≥ 4.5:1), else black or white. */
const lumOf = (hex) => { const h = String(hex ?? "").replace("#", ""); if (h.length !== 6) return 0; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
const contrast = (a, b) => { const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const inkOn = (bg, ink) => (contrast(bg, ink) >= 4.5 ? ink : contrast(bg, "#050706") >= contrast(bg, "#F7F7F2") ? "#050706" : "#F7F7F2");
const mark = (t, league) => {
  const logo = t.abbr ? teamLogoOf(league, t.abbr) : null;
  return logo
    ? `<div class="mark logo" data-mark="logo"><img src="${logo}" alt=""></div>`
    : `<div class="mark mono" data-mark="monogram" style="--c:${esc(t.color ?? "#1B1F1C")};--a:${esc(t.accent ?? "#39FF88")};--cink:${esc(inkOn(t.color ?? "#1B1F1C", t.ink ?? "#F7F7F2"))}"><span data-fit>${esc(t.abbr ?? (t.nickname ?? "").slice(0, 3).toUpperCase())}</span></div>`;
};
/** The matchup meter: published shares as widths, published values (by the sport's rounding rule) as labels. */
function meterHtml(meter) {
  if (!meter) return "";
  const total = meter.segments.reduce((a, x) => a + x.share, 0);
  const teams = meter.segments.filter((x) => !["tie", "draw"].includes(x.side));
  const mid = meter.segments.find((x) => ["tie", "draw"].includes(x.side));
  return `<div class="meter" data-meter="${esc(meter.kind)}">
    <div class="meter-k">${esc(meter.label)}</div>
    <div class="meter-labels"><div class="ml l"><b>${esc(teams[0].display)}</b><span data-fit>${esc(teams[0].name)}</span></div>${mid ? `<div class="ml c"><b>${esc(mid.display)}</b><span>${esc(mid.name)}</span></div>` : ""}<div class="ml r"><b>${esc(teams[1].display)}</b><span data-fit>${esc(teams[1].name)}</span></div></div>
    <div class="meter-bar">${meter.segments.map((x) => `<i class="seg ${esc(x.side)}" data-share="${x.share}" style="width:${((100 * x.share) / total).toFixed(3)}%;--c:${esc(x.color)}"></i>`).join("")}</div>
  </div>`;
}

/** Social terminology → the canonical concept it presents (presentation layer only). */
export const TERMS = Object.freeze({
  prediction: "GameTimePicks Prediction",     // OFFICIAL_FORECAST of the game winner
  predictedWinner: "Predicted Winner",          // the published side (≥ 50%)
  mostLikelyWinner: "Most Likely Winner",       // the published side, under 50% but the single most likely outcome
  winProbability: "Win Probability",            // the published side's probability
  topTd: "Top 3 TD Predictions",                // anytime_td forecasts of record / latest published
  vsFinal: "Prediction vs. Final",
  correct: "Prediction Correct",
  missed: "Prediction Missed",
  top5Td: "Top 5 TD Predictions",
  anytimeTd: "Anytime TD Predictions",          // the TD graphics' heading (2.3.3): the market, named; no subtitle
  top5AnytimeTd: "Top 5 Anytime TD Predictions",
  top5Proj: "Top 5 Projections",
});
/**
 * The ONE public footer per sport (founder 2026-10-28, V2.2): exact text, rendered by the shell for every format. No
 * provenance, timestamps or ids on the graphic — those stay in the package evidence and the ledger.
 */
export const DISCLOSURES = Object.freeze({
  NFL: "Model projections · Not betting advice · Not affiliated with the NFL or its clubs",
  NBA: "Model projections · Not betting advice · Not affiliated with the NBA or its teams",
  MLB: "Model projections · Not betting advice · Not affiliated with MLB or its clubs",
  UFC: "Model projections · Not betting advice · Not affiliated with UFC",
  EPL: "Model projections · Not betting advice · Not affiliated with the Premier League or its clubs",
});
export const disclosureFor = (sport) => {
  const d = DISCLOSURES[sport];
  if (!d) throw new Error(`no disclosure configured for ${sport}: no graphic`);
  return d;
};
/** A player name the fit pass can re-form (never shrink alone): every name in a group shares one size. */
const pname = (name, group, forms, cls) => `<span class="pname ${cls}" data-name-group="${esc(group)}" data-forms="${esc(JSON.stringify(forms))}">${esc(forms[0])}</span>`;

const slab = (t) => `<div class="slab" style="--c:${esc(t.color)};--a:${esc(t.accent)};--cink:${esc(t.ink)}">
  <div class="city" data-fit>${esc(t.city)}</div><div class="nick" data-fit>${esc(t.nickname)}</div></div>`;
/** V2.3 matchup box: the team mark inside the box, then city and nickname. */
// a long name ("Manchester United", "Trail Blazers") wraps to two lines at one size instead of shrinking to nothing
const mbox = (t, league) => `<div class="mbox ${String(t.nickname).length > 11 ? "long" : ""}" style="--c:${esc(t.color)};--a:${esc(t.accent)};--cink:${esc(inkOn(t.color, t.ink ?? "#F7F7F2"))}">${mark(t, league)}
  <div class="mtext">${t.city ? `<div class="city" data-fit>${esc(t.city)}</div>` : ""}<div class="nick" data-fit>${esc(t.nickname)}</div></div></div>`;
const tag = (team, color, ink) => `<span class="tag" style="--c:${esc(color)};--cink:${esc(ink)}">${esc(team)}</span>`;
const pctNum = (d) => String(d).replace("%", "");
const ring = (p) => {
  const r = 230, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, Number(p)));
  return `<svg viewBox="0 0 520 520" width="520" height="520"><circle cx="260" cy="260" r="${r}" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.1)" stroke-width="26"/>
    <circle cx="260" cy="260" r="${r}" fill="none" stroke="#39FF88" stroke-width="26" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 260 260)"/></svg>`;
};

function postgameBody(m) {
  const hit = m.result === "WIN";
  const tie = m.result === "TIE";
  const td = m.td && m.td.complete ? m.td : null; // only a completely graded cohort is shown (founder 2026-10-28)
  const tdHtml = td ? `<div class="panel tds">
      <div class="head"><div class="label">${esc(TERMS.topTd)}</div><div class="count">${td.hits} of ${td.shown} scored</div></div>
      <div class="row">${td.candidates.map((c) => `<div class="td ${c.outcome}"><div class="m">${c.outcome === "hit" ? "✓" : "✗"}</div>
        <div style="min-width:0">${pname(c.last, "td-chips", [c.last], "chip")}<div class="p">${esc(c.team)} · ${esc(c.probabilityDisplay)}</div></div></div>`).join("")}</div></div>` : "";
  return `<div class="kicker">${esc(TERMS.vsFinal)}</div>
    <div class="hero">
      <div class="side"><div class="score ${m.winner === "away" ? "" : "lose"}">${esc(m.finalAway)}</div>${slab(m.away)}</div>
      <div class="mid"><span>FINAL</span></div>
      <div class="side"><div class="score ${m.winner === "home" ? "" : "lose"}">${esc(m.finalHome)}</div>${slab(m.home)}</div>
    </div>
    <div class="banner ${hit ? "hit" : "miss"}"><div class="mark">${hit ? "✓" : "✗"}</div><div class="t">${tie ? "Game tied" : hit ? esc(TERMS.correct) : esc(TERMS.missed)}</div></div>
    <div class="recall"><span class="k">${esc(m.winnerLabel ?? TERMS.predictedWinner)}</span><span class="w">${esc(m.favouredTeam.nickname)}</span><span class="v">${esc(m.winProbabilityDisplay)}</span><span class="k">${esc(TERMS.winProbability)}</span></div>
    ${tdHtml}
`;
}

function pregameBody(m) {
  const lg = m.league ?? "NFL";
  // soccer is written home v away; NFL / NBA away @ home
  const [a, b, sep] = lg === "EPL" ? [m.home, m.away, "v"] : [m.away, m.home, "@"];
  return `<div class="kicker">${esc(TERMS.prediction)}</div>
    <div class="matchup">${mbox(a, lg)}<div class="vs2">${sep}</div>${mbox(b, lg)}</div>
    ${meterHtml(m.meter)}
    <div class="winner2"><div class="k">${esc(m.winnerLabel ?? TERMS.predictedWinner)}</div>${slab(m.favouredTeam)}</div>
    <div class="strip"><div><b data-fit>${esc(m.kickoffDay)}</b><span>Kickoff ${esc(m.kickoffTime)}</span></div>${m.venue ? `<div><b data-fit>${esc(m.venue)}</b><span>Venue</span></div>` : ""}</div>`;
}

function touchdownsBody(m) {
  const graded = Boolean(m.showResults);
  // columns 2 · 1 · 3 so the top prediction sits in the centre
  const order = [m.candidates[1], m.candidates[0], m.candidates[2]].filter(Boolean);
  // 2.3.3: the matchup in its team colours over the prediction type, centred; no qualifying subtitle on the image
  const t = (x) => `<span class="tag" style="--c:${esc(x.color)};--cink:${esc(inkOn(x.color, x.ink ?? "#F7F7F2"))}">${esc(x.abbr)}</span>`;
  return `<div class="tdhead" data-head="matchup">${t(m.away)}<span class="at">@</span>${t(m.home)}</div>
    <div class="kicker tdkick" data-fit>${esc(TERMS.anytimeTd)}</div>
    <div class="feat" style="grid-template-columns:${order.map((c) => (c.rank === 1 ? "1.16fr" : "1fr")).join(" ")}">${order.map((c) => `<div class="pcol r${c.rank}" style="--c:${esc(c.accent)}">
        <div class="bign">${c.rank}</div>
        <div class="rk">#${c.rank}</div>
        ${pname(c.first || " ", "td-first", [c.first || " "], "feature-first")}${pname(c.last, "td-last", [c.last], "feature")}
        <div class="tm">${tag(c.team, c.color, c.ink)}</div>
        <div class="pv">${esc(c.probabilityDisplay)}</div><div class="pl">TD PROBABILITY</div>
        ${String(c.participation).toUpperCase() === "QUESTIONABLE" ? `<div class="fl"><span class="flag" style="font:700 20px/1 var(--display);letter-spacing:3px;padding:7px 10px 4px;border-radius:6px;border:1px solid rgba(255,178,63,.7);color:var(--miss)">QUESTIONABLE</span></div>` : ""}
        ${graded ? `<div class="rs ${c.outcome}">${c.outcome === "hit" ? "✓ SCORED" : c.outcome === "miss" ? "✗ NO TD" : "NOT GRADED"}</div>` : ""}
      </div>`).join("")}</div>
`;
}

function top5Body(m) {
  return `<div class="kicker" data-fit>${esc(m.isTd ? TERMS.top5AnytimeTd : TERMS.top5Proj)}</div>
    <div class="title" style="font-size:84px;margin-top:14px">${esc(m.title)}</div>
    ${m.isTd ? "" : `<div class="sub" data-fit>Projected median for the game</div>`}
    <div class="t5">${m.rows.map((r) => `<div class="t5row r${r.rank}" style="--c:${esc(r.accent)}">
        <div class="n">${r.rank}</div>
        <div style="min-width:0">${pname(r.name, "board", r.nameForms ?? [r.name], "board")}<div class="sb">${tag(r.team, r.color, r.ink)}<span>vs ${esc(r.opponent)} · ${esc(r.kickoffShort)}</span></div></div>
        <div class="v"><b>${esc(r.valueDisplay)}</b><span>${esc(r.unit)}</span></div></div>`).join("")}</div>
`;
}

function nbaPregameBody(m) {
  return `<div class="kicker">${esc(TERMS.prediction)}</div>
    <div class="matchup">${mbox(m.away, "NBA")}<div class="vs2">@</div>${mbox(m.home, "NBA")}</div>
    ${meterHtml(m.meter)}
    <div class="winner2 ${m.meter ? "" : "solo"}"><div class="k">${esc(m.winnerLabel ?? TERMS.predictedWinner)}</div>${slab(m.favouredTeam)}</div>
    <div class="strip"><div><b data-fit>${esc(m.tipDay)}</b><span>Tip-off</span></div><div><b data-fit>${esc(m.tipTime)}</b><span>Eastern time</span></div></div>`;
}

function nbaFinalBody(m) {
  return `<div class="kicker">Final score</div>
    <div class="hero">
      <div class="side"><div class="score ${m.winner === "away" ? "" : "lose"}" style="font-size:250px">${esc(m.finalAway)}</div>${slab(m.away)}</div>
      <div class="mid"><span>FINAL</span></div>
      <div class="side"><div class="score ${m.winner === "home" ? "" : "lose"}" style="font-size:250px">${esc(m.finalHome)}</div>${slab(m.home)}</div>
    </div>
    <div class="sub" style="margin-top:34px">${esc(m.dateLine)}</div>
`;
}

function nbaPlayersBody(m) {
  const col = (t, ps) => `<div class="lcol" style="--c:${esc(t.accent)}"><div class="lhead">${mark(t, "NBA")}<h3 data-fit>${esc(t.nickname)}</h3></div>
    <div class="lrow hd"><span>PLAYER</span><span>PTS</span><span>REB</span><span>AST</span></div>
    ${ps.map((p) => `<div class="lrow">${pname(p.fullName ?? p.name, "table", p.nameForms ?? [p.fullName ?? p.name], "table")}<b class="pts">${esc(p.pts)}</b><b>${esc(p.reb)}</b><b>${esc(p.ast)}</b></div>`).join("")}</div>`;
  return `<div class="kicker">Projected stat lines</div>
    <div class="sub" data-fit>${esc(m.away.abbr)} @ ${esc(m.home.abbr)}</div>
    <div class="lines">${col(m.away, m.awayPlayers)}${col(m.home, m.homePlayers)}</div>
`;
}

const BODIES = {
  "nba-players": nbaPlayersBody, postgame: postgameBody, "pregame-winner": pregameBody, touchdowns: touchdownsBody, top5: top5Body, "nba-pregame": nbaPregameBody, "nba-final": nbaFinalBody };

function chipOf(m) {
  const lg = m.league ?? "NFL";
  if (m.format === "postgame" || m.format === "nba-final") return `${lg}${m.week ? ` · Week ${m.week}` : ""} · Final`;
  if (m.format === "top5") return `NFL${m.week ? ` · Week ${m.week}` : ""} · ${m.slateLine}`;
  if (lg === "EPL") return `Premier League${m.matchweek ? ` · Matchweek ${m.matchweek}` : ""} · ${m.kickoffLine}`;
  return `${lg}${m.week ? ` · Week ${m.week}` : ""} · ${m.kickoffLine ?? m.tipLine}`;
}

export function socialHtml(m) {
  const body = BODIES[m.format];
  if (!body) throw new Error(`no social body for ${m.format}`);
  const css = `${fontFaces()}\n${fs.readFileSync(path.join(DIR, "social-v2.css"), "utf8")}`;
  const logo = `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`;
  const res = m.format === "postgame" ? (m.result === "WIN" ? "res-hit" : m.result === "LOSS" ? "res-miss" : "") : "";
  const slots = {
    rawCss: css, rawVars: `--ca:${esc(m.away?.accent ?? "#12B865")};--cb:${esc(m.home?.accent ?? "#12B865")}`, ghostA: m.away?.abbr ?? "", ghostB: m.home?.abbr ?? "",
    logoDataUri: logo, chip: chipOf(m), rawBody: body(m), rawBodyClass: `${res} fmt-${m.format}`.trim(), disclosure: disclosureFor(m.league ?? "NFL"),
    rawSocial: `<div class="social" data-handle="${esc(SOCIAL_HANDLE)}">${X_MARK}<span>${esc(SOCIAL_HANDLE)}</span></div>`,
  };
  return fs.readFileSync(path.join(DIR, "shell.html"), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in slots)) throw new Error(`slot {{${k}}} has no value`);
    return k.startsWith("raw") || k === "logoDataUri" ? slots[k] : esc(slots[k]);
  });
}

/** Render one view-model. Refuses (throws) when any text overflows after fitting. */
export async function renderSocial(m, { outFile }) {
  const html = socialHtml(m);
  const browser = await loadChromium().launch({ args: ["--disable-background-networking", "--no-first-run", "--font-render-hinting=none"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const fit = await page.evaluate(() => window.__fit);
    const bad = fit.items.filter((i) => !i.fits);
    if (bad.length || fit.pageOverflow) throw new Error(`text does not fit: ${bad.map((b) => b.text).join(" | ") || "page overflow"}`);
    const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, png);
    return { template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST, format: m.format, file: path.basename(outFile), ...pngSize(png), sha256: sha256(png), htmlSha256: sha256(html), fit: fit.items };
  } finally {
    await browser.close();
  }
}
