/**
 * V2.3: the matchup meter (sources, eligibility, outcome semantics, rounding, proportions), team marks (licensed or
 * monogram), the X identity on every format, contrast, the combined NBA game post (caption style, availability hold,
 * what the approval binds) and the source boundary (no Simulation Theater, the website's own NBA accessor).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO_ROOT, CC_ROOT, digestOf } from "../lib/util.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import * as v2 from "../recap/social-v2.mjs";
import { nbaMeter, nflMeter, soccerMeter, winnerLabelFromShares, siteNbaAccessor, barColor } from "../recap/probability-meter.mjs";
import { socialHtml, renderSocial, SOCIAL_HANDLE, SOCIAL_TEMPLATE, DISCLOSURES, teamLogoOf, inkOn } from "../render/social-v2.mjs";
import { nbaPregamePackage, nbaPlayersPackage, nbaGamePackage } from "../contracts/social-packages.mjs";
import { sealPackage, publishBundleOf, checkCaption, xLength } from "../contracts/post-queue.mjs";
import { tempDir } from "./helpers.mjs";

const SLATE = "40a79bf98b6c"; // origin/main 2026-10-28 12:06 PM ET: the Oct 28 NBA lane, published WITH the Elo estimate
const has = (c) => { try { execFileSync("git", ["cat-file", "-e", `${c}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } };
const skip = has(SLATE) ? false : "slate commit missing";
const lane = (src, d) => JSON.parse(src.read(`app/public/data/nba/experimental-public/${d}.json`));

test("NBA meter: exactly the website's accessor view at the same commit; label never 'probability'; refused slates show none", { skip }, async () => {
  const src = gitDataSource(REPO_ROOT, SLATE);
  const acc = await siteNbaAccessor(src);
  assert.equal(acc.ELO_WIN_PROBABILITY_LABEL, "Elo-derived game-winner estimate");
  for (const g of lane(src, "2026-10-28").games) {
    const view = acc.eloWinProbabilityOf(g);
    const m = await nbaMeter({ src, game: g, away: { name: g.away.name }, home: { name: g.home.name } });
    assert.ok(view && m, `${g.away.abbr}@${g.home.abbr} is published with the estimate`);
    assert.deepEqual(m.segments.map((s) => s.display), [`${view.awayPct}%`, `${view.homePct}%`], "the site's own rounding");
    assert.deepEqual(m.segments.map((s) => s.share), [view.away, view.home], "the receipt's own numbers as widths");
    assert.equal(m.label, "Game winner estimate", "the one heading (founder 2.3.1)");
    assert.equal(m.provenance.sourceLabel, "Elo-derived game-winner estimate", "the source's own classification is kept in the evidence");
    assert.equal(m.footnote, "Model estimate · Historical accuracy not yet established", "kept in the evidence (not drawn since 2.3.2)");
    assert.equal(m.provenance.qualification, "Not an independently validated probability · accuracy not yet established");
    assert.doesNotMatch(`${m.label} ${m.footnote}`, /\bprobability\b/i, "never called a probability");
    assert.equal(m.provenance.receiptPayloadSha256, g.receipt.payloadSha256);
  }
  // Oct 23 was published WITHOUT the field: the accessor refuses, so the graphic shows the winner only
  const old = lane(src, "2026-10-23").games[0];
  assert.equal(await nbaMeter({ src, game: old, away: { name: "a" }, home: { name: "b" } }), null);
  const m = await v2.withNbaMeter(v2.nbaPregame({ src, eventId: old.providerEventId, date: "2026-10-23" }), { src, date: "2026-10-23" });
  assert.equal(m.meter, null);
  const html = socialHtml(m);
  assert.doesNotMatch(html, /data-meter=/, "no meter");
  const visibleText = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>|<[^>]+>/g, " ");
  assert.doesNotMatch(visibleText, /\d%/, "no percentage anywhere a viewer can see");
  // tampered provenance is refused by the accessor (never shown)
  const g = structuredClone(lane(src, "2026-10-28").games[0]);
  g.elo.winProbability.provenance.receiptPayloadSha256 = "0".repeat(64);
  assert.equal(await nbaMeter({ src, game: g, away: { name: "a" }, home: { name: "b" } }), null);
});

test("NFL meter: three published outcomes from the verified frozen version, tie kept, one decimal, proportional", { skip }, () => {
  const src = gitDataSource(REPO_ROOT, SLATE);
  const m = v2.pregameWinner({ src, eventId: "401873023", now: "2026-10-28T16:30:00Z" });
  assert.ok(m.ok, m.reason);
  assert.deepEqual(m.meter.segments.map((s) => [s.side, s.display]), [["away", "33.5%"], ["tie", "2.7%"], ["home", "63.8%"]]);
  assert.ok(Math.abs(m.meter.segments.reduce((a, s) => a + s.share, 0) - 1) < 0.002, "exhaustive");
  assert.equal(m.winProbabilityDisplay, "63.8%", "agrees with the verified side's display");
  const html = socialHtml(m);
  const widths = [...html.matchAll(/class="seg (\w+)" data-share="([\d.]+)" style="width:([\d.]+)%/g)].map((x) => [x[1], Number(x[3])]);
  assert.deepEqual(widths.map((w) => w[0]), ["away", "tie", "home"]);
  assert.ok(Math.abs(widths.reduce((a, w) => a + w[1], 0) - 100) < 0.01);
  assert.ok(Math.abs(widths[2][1] - 63.762) < 0.05, "the bar is the published share, not the rounded label");
  // numbers that don't hold together are never drawn
  assert.equal(nflMeter({ winProbability: { home: 0.7, away: 0.4, tieMass: 0 }, favoured: "home", away: {}, home: {} }), null);
  assert.equal(nflMeter({ winProbability: { home: 0.4, away: 0.57, tieMass: 0.03 }, favoured: "home", away: {}, home: {} }), null, "disagrees with the published side");
});

test("soccer: home / draw / away never forced to two outcomes; draw on top → Most Likely Result; labels follow the rule", () => {
  const t = (name) => ({ name, accent: "#39FF88", color: "#123A2A" });
  const m = soccerMeter({ probs: { home: 0.31, draw: 0.38, away: 0.31 }, home: t("Home FC"), away: t("Away FC") });
  assert.deepEqual(m.segments.map((s) => s.side), ["home", "draw", "away"]);
  assert.equal(winnerLabelFromShares(m, "home"), null, "a team that isn't the top outcome gets no winner label");
  assert.equal(soccerMeter({ probs: { home: 0.5, draw: 0.3, away: 0.3 }, home: t("a"), away: t("b") }), null, "doesn't sum to one");
  assert.equal(winnerLabelFromShares(soccerMeter({ probs: { home: 0.62, draw: 0.22, away: 0.16 }, home: t("a"), away: t("b") }), "home"), "Predicted Winner");
  assert.equal(winnerLabelFromShares(soccerMeter({ probs: { home: 0.38, draw: 0.25, away: 0.37 }, home: t("a"), away: t("b") }), "home"), "Most Likely Winner");
  const src = gitDataSource(REPO_ROOT, has(SLATE) ? SLATE : "HEAD");
  const rows = JSON.parse(src.read("app/public/data/soccer/epl/forecasts/latest.json") ?? '{"rows":[]}').rows;
  if (rows.length) {
    const e = v2.soccerPregame({ src, eventId: rows[0].eventId });
    assert.ok(e.ok, e.reason);
    assert.equal(e.meter.kind, "three");
    assert.equal(socialHtml(e).split(DISCLOSURES.EPL).length - 1, 1);
  }
});

test("every format: one X identity line with exactly @GameTimePicksHQ above one disclosure; no overlap; team marks never hot-linked", { skip, timeout: 300_000 }, async () => {
  assert.equal(SOCIAL_HANDLE, "@GameTimePicksHQ");
  assert.equal(SOCIAL_TEMPLATE, "gtp-social@2.3.2");
  const src = gitDataSource(REPO_ROOT, SLATE);
  const g = lane(src, "2026-10-28").games[0];
  const models = [
    await v2.withNbaMeter(v2.nbaPregame({ src, eventId: g.providerEventId, date: "2026-10-28" }), { src, date: "2026-10-28" }),
    v2.nbaPlayers({ src, eventId: g.providerEventId, date: "2026-10-28" }),
    v2.pregameWinner({ src, eventId: "401873023", now: "2026-10-28T16:30:00Z" }),
    v2.touchdowns({ src, eventId: "401873023", mode: "pregame", now: "2026-10-28T16:30:00Z" }),
    v2.nbaFinal({ src, eventId: "401909877" }),
    v2.designSpecimen({ league: "UFC", away: { abbr: "RED", name: "Red", nickname: "Fighter A" }, home: { abbr: "BLU", name: "Blue", nickname: "Fighter B" } }),
  ];
  const dir = tempDir();
  for (const m of models) {
    assert.ok(m.ok, m.reason);
    const html = socialHtml(m);
    assert.equal((html.match(/class="social"/g) ?? []).length, 1, m.format);
    assert.equal((html.match(/@GameTimePicksHQ/g) ?? []).length, 2, "the handle (text + data attribute) once");
    assert.match(html, /class="xmark"/);
    // 2.3.2: no qualification line on the graphic (panel or footer); it stays in the meter's evidence
    assert.doesNotMatch(html, /class="meter-note"|class="estimate-note"|Historical accuracy/);
    if (m.meter) assert.match(html, />Game winner estimate</);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/, "no remote image of any kind");
    const r = await renderSocial(m, { outFile: path.join(dir, `${m.format}.png`) });
    assert.equal(`${r.width}x${r.height}`, "1080x1350");
  }
  // team marks: no licensed logo in the manifest today → monogram, never a broken image
  assert.equal(teamLogoOf("NBA", "MIA"), null);
  const html = socialHtml(models[0]);
  assert.equal((html.match(/data-mark="monogram"/g) ?? []).length, 2);
  const manifest = JSON.parse(fs.readFileSync(path.join(CC_ROOT, "render/templates/social-v2/asset-manifest.json"), "utf8"));
  assert.deepEqual(Object.values(manifest.teamLogos).filter((v) => typeof v === "object").map((v) => Object.keys(v).length), [0, 0, 0, 0], "no logo is listed without a licence");
});

test("contrast: text on every NBA and NFL team colour reads at 4.5:1 or better; bar colours are visible on the dark stage", async () => {
  const lum = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(1).slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const NFL = "ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WSH".split(" ");
  const NBA = "ATL BOS BKN CHA CHI CLE DAL DEN DET GS HOU IND LAC LAL MEM MIA MIL MIN NO NY OKC ORL PHI PHX POR SAC SA TOR UTAH WSH".split(" ");
  const teams = [...NFL.map((a) => v2.teamOf(a, `${a} Team`)), ...NBA.map((a) => v2.nbaTeamOf(a, `${a} Team`))];
  assert.equal(teams.length, 62);
  for (const t of teams) {
    assert.ok(ratio(t.color, inkOn(t.color, t.ink)) >= 4.5, `${t.abbr} ${t.color}`);
    assert.ok(lum(barColor(t)) >= 0.02 || barColor(t) === t.accent, `${t.abbr} bar visible`);
  }
});

test("combined game post: founder caption style, traceable numbers, availability hold, and the approval binds event, version, both images, time", { skip }, async () => {
  const src = gitDataSource(REPO_ROOT, SLATE);
  const date = "2026-10-28";
  const g = lane(src, date).games[0];
  const extra = { template: SOCIAL_TEMPLATE, assetManifest: "x", dataCommit: SLATE };
  const media = (p, f, sha) => ({ ...p, media: { file: f, sha256: sha, width: 1080, height: 1350 } });
  const pre = media(nbaPregamePackage({ date, m: await v2.withNbaMeter(v2.nbaPregame({ src, eventId: g.providerEventId, date }), { src, date }), extra, laneDate: date }), "a.png", "1".repeat(64));
  const pl = media(nbaPlayersPackage({ date, m: v2.nbaPlayers({ src, eventId: g.providerEventId, date }), extra, laneDate: date }), "b.png", "2".repeat(64));
  const game = sealPackage(nbaGamePackage({ date, pre, players: pl, extra, laneDate: date }));
  assert.equal(game.status, "READY", game.reasons.join("; "));
  assert.match(game.captions[0].text, /^🏀 Miami Heat vs Atlanta Hawks tonight!\n\nOur model picks Atlanta to win\.\n\nTwo players to watch:\n🔥 Bam Adebayo: 14\.3 PTS \| 8\.8 REB \| 3\.5 AST\n🔥 Jalen Johnson: 14\.2 PTS \| 6\.5 REB \| 3\.7 AST\n\nFull predictions below 👇$/);
  assert.ok(game.captions.every((c) => c.check.ok && xLength(c.text) <= 280), JSON.stringify(game.captions.map((c) => c.check)));
  assert.ok(game.claims.some((c) => c.key === "meter.away") && game.claims.some((c) => c.key === "meter.home"), "the meter's numbers are claims");
  const b = game.captions[0].publishBundle;
  assert.equal(b.eventId, g.providerEventId);
  assert.deepEqual(b.forecastVersion, { frozenAt: g.frozenAt, receiptPayloadSha256: g.receipt.payloadSha256 });
  assert.equal(b.requestedPublishAt, "2026-10-28T22:15:00.000Z");
  assert.ok(b.mediaSetSha256);
  const moved = sealPackage({ ...nbaGamePackage({ date, pre, players: pl, extra, laneDate: date }), forecastVersion: { ...game.forecastVersion, frozenAt: "2026-10-28T17:00:00Z" } });
  assert.notEqual(digestOf(moved.captions[0].publishBundle), game.captions[0].digest, "a new forecast version is a new fingerprint");
  // a featured player with an injury designation holds the post for confirmation (never silently swapped)
  const pl2 = { ...pl, featured: [{ ...pl.featured[0], verify: "Bam Adebayo is listed Day-To-Day: confirm he is playing before approving" }, pl.featured[1]] };
  const held = nbaGamePackage({ date, pre, players: pl2, extra, laneDate: date });
  assert.equal(held.status, "NEEDS_VERIFICATION");
  assert.deepEqual(held.availabilityCheck, ["Bam Adebayo is listed Day-To-Day: confirm he is playing before approving"]);
});

test("caption wording: the founder's 'Our model picks <team> to win' passes; 'picks' stays forbidden everywhere else", () => {
  const pkg = { claims: [], label: {} };
  assert.ok(checkCaption("🏀 Heat vs Hawks tonight!\n\nOur model picks Atlanta to win.", pkg).ok);
  for (const bad of ["Our picks for tonight", "Free picks below", "Our model picks are in"]) assert.equal(checkCaption(bad, pkg).ok, false, bad);
});

test("source boundary: the meter never reads Simulation Theater, a market price or an unpublished field", () => {
  for (const f of ["recap/probability-meter.mjs", "recap/social-v2.mjs"]) {
    const code = fs.readFileSync(path.join(CC_ROOT, f), "utf8");
    // the only Theater-folder imports allowed are the evidence-backed TEAM COLOUR modules (colours, not outcomes)
    const theaterImports = [...code.matchAll(/from "([^"]*simulation-theater[^"]*)"/g)].map((x) => x[1]);
    assert.ok(theaterImports.every((p) => /nfl-team-colors\.mjs$|nba-team-colors\.mjs$/.test(p)), `${f}: ${theaterImports}`);
    assert.doesNotMatch(code.replace(/^import .*$/gm, ""), /possession|playback|state-at|odds|market(Price|Line)|simulat(ed|ion) (result|score|outcome)/i, f);
  }
  const meter = fs.readFileSync(path.join(CC_ROOT, "recap/probability-meter.mjs"), "utf8");
  assert.match(meter, /app\/src\/lib\/sports\/nba\/elo-win-probability\.mjs/, "NBA goes through the website's own accessor");
});
