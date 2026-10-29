/**
 * gtp-social@2.3.3 (founder 10-29): the Anytime TD graphics carry no "if he plays · passing TDs don't count" subtitle;
 * the heading is the matchup + "Anytime TD Predictions". With the qualifier gone from the image, eligibility is enforced
 * in data: OUT/DOUBTFUL/INACTIVE never shown, QUESTIONABLE → NEEDS_VERIFICATION, and a designation that appears after
 * the draft voids the availability confirmation. NBA formats are unchanged apart from the version.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "../lib/util.mjs";
import { gitDataSource, dirDataSource } from "../recap/multisport-facts.mjs";
import { touchdowns, nbaPregame, nbaPlayers } from "../recap/social-v2.mjs";
import { socialHtml, renderSocial, SOCIAL_TEMPLATE, SOCIAL_HANDLE, DISCLOSURES, TERMS } from "../render/social-v2.mjs";
import { tempDir } from "./helpers.mjs";

const TNF = "047c7f686b85"; // origin/main 2026-10-29: CAR @ GB player board generated 16:04Z
const SLATE = "40a79bf98b6c"; // the Oct 28 NBA lane
const has = (c) => { try { execFileSync("git", ["cat-file", "-e", `${c}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } };
const visibleText = (html) => html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>|<[^>]+>|data:image\/png;base64,[A-Za-z0-9+/=]+/g, " ").replace(/\s+/g, " ");
const QUALIFIER = /if he plays|passing tds? don.?t count/i;

test("version: gtp-social@2.3.3 (a new design approval is needed)", () => {
  assert.equal(SOCIAL_TEMPLATE, "gtp-social@2.3.3");
  assert.equal(TERMS.anytimeTd, "Anytime TD Predictions");
});

test("CAR @ GB Top 3 TD: matchup + 'Anytime TD Predictions' heading, no qualifier subtitle, real numbers, brand footer", { skip: has(TNF) ? false : "commit missing", timeout: 120_000 }, async () => {
  const m = touchdowns({ src: gitDataSource(REPO_ROOT, TNF), eventId: "401873023", mode: "pregame", now: "2026-10-29T17:00:00Z" });
  assert.ok(m.ok, m.reason);
  assert.deepEqual(m.candidates.map((c) => `${c.name} ${c.probabilityDisplay}`), ["Chuba Hubbard 54.9%", "Josh Jacobs 46.4%", "Christian Watson 39.5%"]);
  const html = socialHtml(m);
  const text = visibleText(html);
  assert.doesNotMatch(text, QUALIFIER);
  assert.match(html, /<div class="tdhead" data-head="matchup"><span class="tag"[^>]*>CAR<\/span><span class="at">@<\/span><span class="tag"[^>]*>GB<\/span><\/div>/);
  assert.match(text, /Anytime TD Predictions/);
  assert.match(text, /54\.9%[\s\S]*TD PROBABILITY/);
  assert.ok(html.includes(SOCIAL_HANDLE) && html.includes(DISCLOSURES.NFL));
  const r = await renderSocial(m, { outFile: path.join(tempDir(), "td.png") });
  assert.deepEqual([r.width, r.height, r.template], [1080, 1350, "gtp-social@2.3.3"]);
  assert.ok(r.fit.every((f) => f.fits));
});

test("Top 5 TD board: 'Top 5 Anytime TD Predictions', no qualifier subtitle; non-TD boards keep their sub", () => {
  const td = { format: "top5", league: "NFL", isTd: true, title: "Sunday's slate", slateLine: "Sun, Nov 1", week: 9, rows: [] };
  const proj = { ...td, isTd: false };
  assert.doesNotMatch(visibleText(socialHtml(td)), QUALIFIER);
  assert.match(visibleText(socialHtml(td)), /Top 5 Anytime TD Predictions/);
  assert.match(visibleText(socialHtml(proj)), /Projected median for the game/);
});

test("eligibility without the on-image qualifier: OUT/DOUBTFUL/INACTIVE never shown; QUESTIONABLE needs verification and is flagged", () => {
  const root = tempDir("gtp-cc-td233-");
  const board = (players) => {
    fs.mkdirSync(path.join(root, "app/public/data/nfl/player-board"), { recursive: true });
    fs.writeFileSync(path.join(root, "app/public/data/nfl/player-board/9.json"), JSON.stringify({ kickoffUtc: "2026-11-01T18:00Z", matchup: "CAR @ GB", generatedAt: "2026-10-31T12:00:00Z",
      families: { anytime_td: { state: "PUBLISHED" } }, players: players.map(([name, team, participation, p]) => ({ name, team, participation, markets: { anytime_td: { probability: p } } })) }));
    return dirDataSource(root);
  };
  const now = "2026-10-31T13:00:00Z";
  const m = touchdowns({ src: board([["Al Out", "GB", "OUT", 0.7], ["Bo Doubt", "GB", "DOUBTFUL", 0.65], ["Cy Inact", "CAR", "INACTIVE", 0.6], ["Di Quest", "CAR", "QUESTIONABLE", 0.5], ["Ed Role", "GB", "AVAILABLE_ROLE_UNCERTAIN", 0.4], ["Fi Role", "CAR", "AVAILABLE_ROLE_UNCERTAIN", 0.3]]), eventId: "9", mode: "pregame", now });
  assert.deepEqual(m.candidates.map((c) => c.name), ["Di Quest", "Ed Role", "Fi Role"]);
  assert.equal(m.status, "NEEDS_VERIFICATION");
  assert.deepEqual(m.reasons, ["Di Quest is QUESTIONABLE"]);
  const text = visibleText(socialHtml(m));
  assert.match(text, /QUESTIONABLE/, "a QUESTIONABLE candidate is flagged on the image, never shown as unconditional");
  for (const n of ["OUT", "Doubt", "Inact"]) assert.doesNotMatch(text, new RegExp(`\\b${n}\\b`));
  const clean = touchdowns({ src: board([["Ed Role", "GB", "AVAILABLE_ROLE_UNCERTAIN", 0.4], ["Fi Role", "CAR", "AVAILABLE_ROLE_UNCERTAIN", 0.3]]), eventId: "9", mode: "pregame", now });
  assert.equal(clean.status, "READY");
  assert.doesNotMatch(visibleText(socialHtml(clean)), /QUESTIONABLE/);
});

test("NBA game graphics: no 2.3.3 TD markup (their pixels are unchanged; only the version moved)", { skip: has(SLATE) ? false : "commit missing" }, () => {
  const src = gitDataSource(REPO_ROOT, SLATE);
  for (const m of [nbaPregame({ src, eventId: "401909881", date: "2026-10-28" }), nbaPlayers({ src, eventId: "401909881", date: "2026-10-28" })]) {
    const body = socialHtml(m).replace(/<style>[\s\S]*?<\/style>/, "");
    assert.ok(!/tdhead|tdkick/.test(body), m.format);
  }
});
