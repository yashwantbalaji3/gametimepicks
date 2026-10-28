/**
 * SOCIAL GRAPHICS V2 RENDERER — nfl-social@2 view-model (recap/social-v2.mjs) → 1080×1350 PNG. PROTOTYPE.
 *
 * Reuses the existing pipeline (render-png.mjs: offline Chromium, every request aborted, logo inlined from
 * app/public/brand). Photo-free by design until licensed photography exists: no player images, no league or club
 * logos, no jersey numbers — team identity is the verified abbreviation and colours (nfl-team-colors.mjs).
 * After layout, a deterministic fit pass shrinks long names; the render FAILS if any text still overflows, so a long
 * name can never be silently clipped. Same inputs and fonts → same bytes on one machine.
 */
import fs from "node:fs";
import path from "node:path";
import { CC_ROOT, REPO_ROOT, sha256 } from "../lib/util.mjs";
import { escapeHtml as esc, loadChromium, pngSize } from "./render-png.mjs";

export const SOCIAL_TEMPLATE = "nfl-social@2";
const DIR = path.join(CC_ROOT, "render/templates/social-v2");
const LOGO = path.join(REPO_ROOT, "app/public/brand/gametime-picks-logo.png");
/** Disclosures kept on every graphic (short): model forecast, not betting advice; no affiliation implied. */
export const DISCLOSURE = "Model forecast · not betting advice · not affiliated with the NFL or its clubs";

const slab = (t) => `<div class="slab" style="--c:${esc(t.color)};--a:${esc(t.accent)};--cink:${esc(t.ink)}">
  <div class="city" data-fit>${esc(t.city)}</div><div class="nick" data-fit>${esc(t.nickname)}</div></div>`;
const mark = (o) => (o === "hit" ? "✓" : o === "miss" ? "✗" : "–");

function postgameBody(m) {
  const hit = m.result === "WIN";
  const tie = m.result === "TIE";
  const td = m.td;
  const tdHtml = td ? `<div class="panel tds">
      <div class="head"><div class="label">Anytime TD calls</div><div class="count">${td.complete ? `${td.hits} of ${td.shown} scored` : `${td.hits} scored · ${td.shown - td.decided} not graded yet`}</div></div>
      <div class="row">${td.candidates.map((c) => `<div class="td ${c.outcome === "hit" ? "hit" : c.outcome === "miss" ? "miss" : "void"}"><div class="m">${mark(c.outcome)}</div>
        <div style="min-width:0"><div class="n" data-fit>${esc(c.last)}</div><div class="p">${esc(c.team)} · ${esc(c.probabilityDisplay)}</div></div></div>`).join("")}</div></div>` : "";
  return `<div class="hero">
      <div class="side"><div class="score ${m.winner === "away" ? "" : "lose"}">${esc(m.finalAway)}</div>${slab(m.away)}</div>
      <div class="mid"><span>FINAL</span></div>
      <div class="side"><div class="score ${m.winner === "home" ? "" : "lose"}">${esc(m.finalHome)}</div>${slab(m.home)}</div>
    </div>
    <div class="panel" style="margin-top:26px">
      <div class="label">GameTimePicks pregame forecast</div>
      <div class="fc"><div class="pct">${esc(m.winProbabilityDisplay)}</div><div class="fcwho" data-fit>${esc(m.favouredTeam.nickname)}<small>to win</small></div></div>
      <div class="bar"><i style="width:${esc(m.winProbabilityDisplay)}"></i></div>
      <div class="verdict ${hit ? "hit" : "miss"}"><div class="mark">${hit ? "✓" : "✗"}</div><div><div class="t">${hit ? "Forecast correct" : tie ? "Game tied" : "Forecast missed"}</div>
        <div class="s">${hit ? `${esc(m.favouredTeam.name)} won` : tie ? "No winner to grade" : `${esc(m.favouredTeam.name)} lost`}</div></div></div>
    </div>
    ${tdHtml}
    <div class="foot">Official Forecast frozen <b>${esc(m.frozenLine)}</b><br>${esc(DISCLOSURE)}</div>`;
}

function pregameBody(m) {
  return `<div class="hero pre"><div class="side">${slab(m.away)}</div><div class="mid"><span>@</span></div><div class="side">${slab(m.home)}</div></div>
    <div class="big"><div class="k">GameTimePicks forecast</div><div class="num">${esc(m.winProbabilityDisplay)}</div>
      <div class="win" data-fit>${esc(m.favouredTeam.nickname)} to win<small>${esc(m.favouredTeam.name)}</small></div>
      <div class="bar"><i style="width:${esc(m.winProbabilityDisplay)}"></i></div></div>
    <div class="foot">${esc(m.stamp)} · frozen <b>${esc(m.frozenLine)}</b><br>${esc(DISCLOSURE)}</div>`;
}

function touchdownsBody(m) {
  const graded = Boolean(m.showResults);
  return `<div class="title">Top 3 <em>TD</em> candidates</div>
    <div class="sub" data-fit>${esc(m.away.abbr)} @ ${esc(m.home.abbr)} · anytime touchdown</div>
    <div class="cands">${m.candidates.map((c) => `<div class="cand r${c.rank} ${graded ? `res-${c.outcome}` : ""}" style="--c:${esc(c.accent)}">
        <div class="rank">${c.rank}</div>
        <div class="who"><div class="first" data-fit>${esc(c.first)}</div><div class="last" data-fit>${esc(c.last)}</div>
          <div class="meta"><span class="tag" style="--c:${esc(c.color)};--cink:${esc(c.ink)}">${esc(c.team)}</span>${String(c.participation).toUpperCase() === "QUESTIONABLE" ? `<span class="flag">QUESTIONABLE</span>` : ""}</div></div>
        <div class="prob"><b>${esc(c.probabilityDisplay)}</b><span>TD CHANCE</span>${graded ? `<div class="res ${c.outcome === "hit" ? "hit" : "miss"}">${c.outcome === "hit" ? "✓ SCORED" : c.outcome === "miss" ? "✗ NO TD" : "NOT GRADED"}</div>` : ""}</div>
      </div>`).join("")}</div>
    <div class="foot">Model chance to score a TD if he plays · passing TDs don't count · not a guarantee<br>
      ${m.mode === "record" ? "Published before kickoff" : "Latest published"} <b>${esc(m.frozenLine)}</b> · not betting advice · not affiliated with the NFL or its clubs</div>`;
}

const BODIES = { postgame: postgameBody, "pregame-winner": pregameBody, touchdowns: touchdownsBody };

export function socialHtml(m) {
  const body = BODIES[m.format];
  if (!body) throw new Error(`no nfl-social@2 body for ${m.format}`);
  const css = fs.readFileSync(path.join(DIR, "social-v2.css"), "utf8");
  const logo = `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`;
  const chip = m.format === "postgame" ? `NFL${m.week ? ` · Week ${m.week}` : ""} · Final`
    : `NFL${m.week ? ` · Week ${m.week}` : ""} · ${m.kickoffLine}`;
  const slots = {
    rawCss: css, rawVars: `--ca:${esc(m.away.accent)};--cb:${esc(m.home.accent)}`, ghostA: m.away.abbr, ghostB: m.home.abbr,
    logoDataUri: logo, chip, rawBody: body(m),
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
    const fit = await page.evaluate(() => window.__fit);
    const bad = fit.items.filter((i) => !i.fits);
    if (bad.length || fit.pageOverflow) throw new Error(`text does not fit: ${bad.map((b) => b.text).join(" | ") || "page overflow"}`);
    const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, png);
    return { template: SOCIAL_TEMPLATE, format: m.format, file: path.basename(outFile), ...pngSize(png), sha256: sha256(png), htmlSha256: sha256(html), fit: fit.items };
  } finally {
    await browser.close();
  }
}
