/**
 * POST-BUILD · the PUBLIC NBA Theater (/nba/simulation/<id>/) in a FLAG-ON export — activation checklist §6, founder
 * decision 2026-10-21 (docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md). Modelled on
 * ../../public-theater-export.test.mjs (NFL).
 *
 * Reads app/out/ (so scripts/ci/run-suite.mjs sorts this file into the post-build phase):
 *   flag ON  (both acts: NBA_THEATER_PUBLIC_ENABLED === true AND GTP_NBA_THEATER_PUBLIC=1 in the environment that built
 *            out/): every published page carries the founder's labels; NO §5 private marker anywhere except the three
 *            allowlisted ones (engine id, playback schema, data-nbp- attributes), and those only in the route's own
 *            output and its static chunks; no page outside the route loads a marker-bearing chunk.
 *   flag OFF the route is pruned (out/nba/simulation/ absent) — export-boundary.test.mjs scans the rest.
 * The scanner is mutation-tested against a planted export below, so it cannot pass by not looking.
 *
 * Local flag-ON run (release owner / coordinator, holding the shared build lock; the constant is flipped LOCALLY and
 * never committed — the flip is the release owner's own reviewed commit):
 *   GTP_NBA_THEATER_PUBLIC=1 npm run build && GTP_NBA_THEATER_PUBLIC=1 npx tsx --test src/lib/simulation-theater/nba/possession/public-theater-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NBA_PRIVATE_MARKERS, NBA_THEATER_FLAG_ON_ALLOWLIST, SETTLED_PAGE_MARKER, scanFlagOnTheaterExport } from "../export-boundary.mjs";
import { NBA_PUBLIC_THEATER_PLACEHOLDER } from "./public-route.mjs";
import { ENGINE_IDENTITY, OFFICIAL_PANEL_TITLE, POSSESSION_BANNER, ROLE_C_NOTE, WITHHELD } from "./labels.mjs";

const APP = process.cwd();
const OUT = path.join(APP, "out");
const SIM = path.join(OUT, "nba", "simulation");
const BUILT = fs.existsSync(path.join(OUT, "index.html"));
const FLAG_ON = process.env.GTP_NBA_THEATER_PUBLIC === "1";
/** What every published page must print (founder's required labelling + the official panel's withheld states). */
// founder directive 2026-10-23 public readiness: the engine is identified by name + id (ENGINE_IDENTITY), replacing the
// superseded role C label as the required on-page identity
const REQUIRED = [ENGINE_IDENTITY, ...ROLE_C_NOTE, POSSESSION_BANNER, OFFICIAL_PANEL_TITLE, WITHHELD];
/** What every SETTLED page (a past slate's game, overnight W7 2026-10-28) must print: the archived note and the official
 *  forecast's title and disclosure (components/nba/settled-simulation.tsx; literals, as this post-build file reads no TSX). */
const SETTLED_REQUIRED = ["Game Simulation archived", "shown on game day only", "GameTimePicks Official Forecast", "Not a betting recommendation"];
const scan = (dir) => scanFlagOnTheaterExport(dir, { required: REQUIRED, placeholder: NBA_PUBLIC_THEATER_PLACEHOLDER, settledRequired: SETTLED_REQUIRED });

test("flag ON: every published page carries the founder's labels; only the allowlisted markers, only on the route and its chunks", { skip: !BUILT ? "no export at app/out (run the build first)" : !FLAG_ON ? "flag OFF build (GTP_NBA_THEATER_PUBLIC not 1)" : false }, () => {
  // The placeholder never ships, in any build (prune-internal-routes.mjs).
  assert.equal(fs.existsSync(path.join(SIM, NBA_PUBLIC_THEATER_PLACEHOLDER)), false, "the inert placeholder page is pruned");
  if (!fs.existsSync(SIM)) {
    // Between slates (the build's ET slate has no stored runs yet) a flag-ON export legitimately has NO Theater page —
    // but the [eventId] route chunk is still emitted, so the base leak scan and the stray-chunk rule still apply.
    const r0 = scan(OUT);
    assert.deepEqual(r0.leaks, [], "between slates: no §5 private marker outside the allowlist");
    assert.deepEqual(r0.strayChunks, [], "between slates: no non-Theater page loads a chunk carrying the Theater markers");
    console.log("# NBA theater ON: between slates — no /nba/simulation/<id>/ page in this export (placeholder pruned)");
    return;
  }
  const r = scan(OUT);
  assert.ok(r.pages.length + r.settledPages.length > 0, "out/nba/simulation/ exists but carries no game page");
  assert.deepEqual(r.leaks, [], "no §5 private marker outside the allowlist, its route and its chunks");
  assert.deepEqual(r.missing, [], "every Theater page carries the role C label, the five-point note, the banner and the official panel; every settled page the archived note and the official forecast");
  assert.deepEqual(r.settledLeaks, [], "a settled page carries no Theater marker at all (no engine, no playback, no island)");
  if (r.pages.length) assert.ok(r.markerChunks.length > 0, "the island's chunk carries its data attributes — the scan is looking");
  for (const id of r.settledPages) assert.match(fs.readFileSync(path.join(SIM, id, "index.html"), "utf8"), /<meta name="robots" content="noindex/, `${id}: settled page kept out of search like the family`);
  assert.deepEqual(r.strayChunks, [], "no page outside /nba/simulation/ loads a chunk carrying the Theater markers");
  for (const id of r.pages) {
    const html = fs.readFileSync(path.join(SIM, id, "index.html"), "utf8");
    assert.match(html, /<meta name="robots" content="noindex/, `${id}: kept out of search until the release owner publishes it`);
    // the Theater's own visible text (the site navigation's "Live" scores link is global chrome, not this game)
    const open = html.indexOf("data-nbp-theater");
    assert.ok(open > 0, `${id}: the Theater is server-rendered`);
    const at = html.indexOf(">", open) + 1; // visible text only: start after the Theater's opening tag (attributes are not text)
    const theater = html.slice(at, html.indexOf("</main>", at) > 0 ? html.indexOf("</main>", at) : undefined).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(theater.replace(/NOT A REAL OR LIVE GAME/g, "").replace(/overtime is rarer than in real games/g, ""), /\blive\b|\breal game|happening now/i, `${id}: nothing in the Theater implies a live or real game`);
  }
  console.log(`# NBA theater ON: ${r.pages.length} page(s) labelled, ${r.settledPages.length} settled page(s), ${r.files} files scanned, ${r.markerChunks.length} island chunk(s)`);
});

test("flag OFF: the public route is pruned from the export", { skip: !BUILT ? "no export at app/out (run the build first)" : FLAG_ON ? "flag ON build" : false }, () => {
  assert.equal(fs.existsSync(SIM), false, "out/nba/simulation/ must not survive a flag-OFF build");
});

test("flag-ON scanner: a clean planted export passes; each planted defect is caught", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-theater-on-"));
  const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  const page = `<html><head><meta name="robots" content="noindex"><script src="/_next/static/chunks/island-1.js"></script></head><body>${REQUIRED.join(" ")} nba-possession-sim-v0 <div data-nbp-banner></div></body></html>`;
  put("index.html", `<html><script src="/_next/static/chunks/main.js"></script></html>`);
  put("nba/simulation/401909088/index.html", page);
  put("nba/simulation/401909088/index.txt", '"schema":"nba-possession-playback@1"');
  put(`nba/simulation/${NBA_PUBLIC_THEATER_PLACEHOLDER}/index.html`, "<html>404</html>");
  put("_next/static/chunks/island-1.js", 'e.setAttribute("data-nbp-run","x")');
  put("_next/static/chunks/main.js", "console.log(1)");
  const settled = `<html><head><meta name="robots" content="noindex"><script src="/_next/static/chunks/main.js"></script></head><body><article ${SETTLED_PAGE_MARKER}="401909070">${SETTLED_REQUIRED.join(" ")}</article></body></html>`;
  put("nba/simulation/401909070/index.html", settled);
  put("nba/simulation/401909070/index.txt", '"official":"frozen"');
  const clean = scan(dir);
  assert.deepEqual([clean.pages, clean.settledPages, clean.leaks, clean.missing, clean.settledLeaks, clean.strayChunks], [["401909088"], ["401909070"], [], [], [], []]);
  assert.deepEqual(clean.markerChunks, ["/_next/static/chunks/island-1.js"]);

  // a settled page missing its archived note; carrying the engine id or a playback marker; loading the island chunk
  put("nba/simulation/401909070/index.html", settled.replace("Game Simulation archived", ""));
  assert.deepEqual(scan(dir).missing, [{ page: "401909070", missing: "Game Simulation archived" }]);
  for (const m of NBA_THEATER_FLAG_ON_ALLOWLIST) {
    put("nba/simulation/401909070/index.html", settled.replace("</article>", ` ${m}</article>`));
    assert.deepEqual(scan(dir).settledLeaks, [{ page: "401909070", file: "index.html", marker: m }], `a settled page may not carry ${m}`);
  }
  /* A settled page is a page of the same route, and a static export attaches the route's client chunks to all of its
     pages: loading the island chunk is tolerated (unused weight, a recorded follow-up). What it may never do is SHOW the
     Theater — its own HTML stays clean (settledLeaks) and it keeps the settled labels. */
  put("nba/simulation/401909070/index.html", settled.replace("main.js", "island-1.js"));
  const routeChunk = scan(dir);
  assert.deepEqual([routeChunk.strayChunks, routeChunk.settledLeaks, routeChunk.missing], [[], [], []]);
  // a Theater page without the settled marker is held to the Theater's labels, never the settled ones
  put("nba/simulation/401909070/index.html", settled.replace(`${SETTLED_PAGE_MARKER}="401909070"`, ""));
  assert.ok(scan(dir).missing.some((x) => x.page === "401909070" && x.missing === ENGINE_IDENTITY));
  put("nba/simulation/401909070/index.html", settled);

  // a label missing from a page
  put("nba/simulation/401909089/index.html", page.replace(ROLE_C_NOTE[3], ""));
  assert.deepEqual(scan(dir).missing, [{ page: "401909089", missing: ROLE_C_NOTE[3] }]);
  fs.rmSync(path.join(dir, "nba/simulation/401909089"), { recursive: true });
  // an allowlisted marker on a page outside the route
  put("nba/index.html", "<html>nba-possession-sim-v0</html>");
  assert.deepEqual(scan(dir).leaks.map((l) => [l.file, l.marker]), [["nba/index.html", "nba-possession-sim-v0"]]);
  fs.rmSync(path.join(dir, "nba/index.html"));
  // a never-allowed marker on the route itself
  for (const m of NBA_PRIVATE_MARKERS.filter((x) => !NBA_THEATER_FLAG_ON_ALLOWLIST.includes(x))) {
    put("nba/simulation/401909088/index.txt", `"path":"${m}"`);
    assert.ok(scan(dir).leaks.some((l) => l.marker === m), `the route may never carry ${m}`);
  }
  put("nba/simulation/401909088/index.txt", '"schema":"nba-possession-playback@1"');
  // another page loading the island chunk
  put("index.html", `<html><script src="/_next/static/chunks/island-1.js"></script></html>`);
  assert.deepEqual(scan(dir).strayChunks, [{ page: "index.html", chunk: "/_next/static/chunks/island-1.js" }]);
  fs.rmSync(dir, { recursive: true, force: true });
});
