import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildNflHubRoster, espnNflHeadshotUrl } from "./nfl-hub-data.ts";
import { LIVE_TRACKABLE_MARKETS } from "./adapters/espn-nfl.mjs";
import { PRODUCT_CLEARED_FAMILY_STATES } from "../products/candidate-universe.mjs";

const APP = path.resolve(new URL("../../..", import.meta.url).pathname);
const code = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
/* Pinned: this suite must not change its verdict because the day rolled over. */
const SUNDAY = "2026-09-27T15:00:00Z";

test("today's slate is the real 14 games, joined on the canonical ESPN event id", () => {
  const r = buildNflHubRoster(SUNDAY);
  assert.equal(r.etDate, "2026-09-27");
  assert.equal(r.games.length, 14, "the frozen Sunday boards carry 14 games");
  for (const g of r.games) {
    assert.match(g.providerEventId, /^\d{9}$/, `${g.matchup} must join on the ESPN numeric id, not a name`);
    /* The board file is NAMED by that id — so the join key and the artifact identity are the same
       thing, which is what makes a name-based join unnecessary. */
    assert.ok(fs.existsSync(path.join(APP, `public/data/nfl/player-board/${g.providerEventId}.json`)),
      `${g.providerEventId} must name a real board file`);
    assert.ok(g.awayTeam && g.homeTeam, "both clubs need a name");
  }
  const ids = r.games.map((g) => g.providerEventId);
  assert.equal(new Set(ids).size, 14, "no game may appear twice");
  /* The club registry must actually RESOLVE, not silently fall back to the abbreviation for
     everyone — which is what a broken registry read would look like. */
  const resolved = r.games.filter((g) => g.awayTeam !== g.awayAbbr && g.homeTeam !== g.homeAbbr);
  assert.equal(resolved.length, 14, "every club must resolve to a full name, not its abbreviation");
});

test("the Sunday-night game belongs to Sunday's slate, not Monday's", () => {
  /*
   * LAR@DEN kicks at 00:20Z on 2026-09-28. Grouping by the UTC date — the obvious implementation —
   * drops it from its own slate, and it would have reappeared on Monday as a game already played.
   * The roster groups by the ET date OF KICKOFF, so 8:20pm ET Sunday is Sunday.
   */
  const r = buildNflHubRoster(SUNDAY);
  const snf = r.games.find((g) => g.kickoffUtc === "2026-09-28T00:20:00Z");
  assert.ok(snf, "the Sunday night game must be on Sunday's slate");
  assert.equal(snf.matchup, "LAR @ DEN");
  assert.equal(r.games.at(-1).providerEventId, snf.providerEventId, "and it sorts last, by kickoff");
});

test("the roster carries NO measurement — not even a zero", () => {
  /*
   * The Phase 6 blocker: a static artifact that asserts something about the present ages into a lie.
   * A `live: 0` baked at build time is the sharpest form of it, because it looks like data.
   */
  const r = buildNflHubRoster(SUNDAY);
  for (const g of r.games) {
    for (const k of ["live", "liveValue", "score", "homeScore", "awayScore", "state", "isLive", "hasStarted", "period", "clock"]) {
      assert.equal(k in g, false, `the roster must not carry \`${k}\` — the present comes from the envelope`);
    }
    for (const p of g.trackedPredictions) {
      assert.equal("live" in p, false, "a prediction must not carry a measurement at build time");
    }
  }
  const src = code("src/lib/live/nfl-hub-data.ts");
  assert.match(src, /NO measurement field/, "and the reason must be stated where the next reader will look");
});

test("the count is the TRUE total while the list is an explicit preview", () => {
  /*
   * Today's real slate carries 788 eligible predictions. Serialising all of them is the
   * /build/custom incident — 481 legs shipped that nothing rendered. The cap is the fix; the count
   * staying honest is what stops the cap from becoming a lie.
   */
  const full = buildNflHubRoster(SUNDAY, { previewPerGame: 1000 });
  const capped = buildNflHubRoster(SUNDAY, { previewPerGame: 3 });
  const total = full.games.reduce((n, g) => n + g.trackedPredictions.length, 0);
  assert.ok(total > 700, `expected the real slate to be large, got ${total}`);
  for (let i = 0; i < capped.games.length; i++) {
    const c = capped.games[i], f = full.games[i];
    assert.ok(c.trackedPredictions.length <= 3, "the preview is capped");
    assert.equal(c.trackedPredictionCount, f.trackedPredictions.length, "the COUNT is never capped");
    assert.ok(c.trackedPredictionCount >= c.trackedPredictions.length);
  }
  assert.equal(capped.games.reduce((n, g) => n + g.trackedPredictionCount, 0), total,
    "the totals must agree — a capped count would understate the day");
});

test("liveTrackable is the adapter's own map, so a rail is never offered for an unmeasurable stat", () => {
  /*
   * A biconditional, not a copy. If someone adds a family to the hub without teaching the adapter to
   * measure it, this fails — which is the only thing that stops a rail with nothing to put in it.
   */
  const r = buildNflHubRoster(SUNDAY, { previewPerGame: 1000 });
  const seen = new Map();
  for (const g of r.games) for (const p of g.trackedPredictions) seen.set(p.market, p.liveTrackable);
  assert.ok(seen.size >= 4, `expected several families, saw ${[...seen.keys()].join(",")}`);
  for (const [market, trackable] of seen) {
    assert.equal(trackable, LIVE_TRACKABLE_MARKETS.includes(market),
      `${market}: liveTrackable must equal adapter membership`);
  }
  assert.equal(seen.get("anytime_td"), false, "no feed states the scorer by id, so ATD gets no rail");
  assert.equal(LIVE_TRACKABLE_MARKETS.includes("player_pass_yds"), false,
    "passing yards is a P318 STOP family and must not be live-mapped");
});

test("only promoted families reach the hub, via the allowlist that already owns that decision", () => {
  const r = buildNflHubRoster(SUNDAY, { previewPerGame: 1000 });
  /* Read the boards directly and confirm the hub's set is exactly the cleared set. */
  const dir = path.join(APP, "public/data/nfl/player-board");
  const cleared = new Set(), withheld = new Set();
  for (const g of r.games) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, `${g.providerEventId}.json`), "utf8"));
    for (const [fam, meta] of Object.entries(b.families ?? {})) {
      (PRODUCT_CLEARED_FAMILY_STATES.has(meta.state) ? cleared : withheld).add(fam);
    }
  }
  const shown = new Set();
  for (const g of r.games) for (const p of g.trackedPredictions) shown.add(p.market);
  assert.ok(withheld.size > 0, "the fixture must contain unpromoted families or this proves nothing");
  for (const fam of shown) assert.ok(cleared.has(fam), `${fam} reached the hub without being promoted`);
  for (const fam of withheld) {
    if (!cleared.has(fam)) assert.equal(shown.has(fam), false, `${fam} is withheld and must not appear`);
  }
});

test("the hub states no outcome before canonical settlement, and no touchdown claim at all", () => {
  const src = code("src/components/live/nfl-live-hub.tsx");
  const rendered = [...src.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]).join(" ");
  for (const banned of [/\bHIT\b/, /\bMISS\b/, /\bWIN\b/, /\bLOSS\b/, /CASHED/i]) {
    assert.doesNotMatch(rendered, banned, "a win/loss word must not be rendered by the live hub");
  }
  /* The three allowed live statements, and nothing stronger. */
  assert.match(src, /Currently above line/);
  assert.match(src, /Currently below line/);
  assert.match(src, /At line/);
  /* A provider FINAL must stop at grading pending. */
  assert.match(src, /Final — grading pending/);
  /* And the touchdown claim is withheld rather than assumed. */
  assert.doesNotMatch(rendered, /NO TD YET/i, "the hub has no per-player TD evidence, so it must not claim one");
  assert.match(src, /makes NO claim about\n \* {3}whether a touchdown has happened|NO claim about/,
    "and the reason must be documented");
});

test("an absent score renders as an em dash, never as a zero", () => {
  const src = code("src/components/live/nfl-live-hub.tsx");
  assert.match(src, /score === null \? "—" : score/, "a missing score is an em dash");
  /* And the LIVE stat slot must disappear rather than render a zero. */
  assert.match(src, /if \(value === null\) return null;/, "an absent stat renders nothing at all");
  assert.match(src, /live !== null \? <Stat label="Live"/, "the LIVE slot is gated on a real measurement");
});

test("a provider failure keeps the last known state and never regresses a live game to PRE", () => {
  const src = code("src/components/live/nfl-live-hub.tsx");
  assert.match(src, /Live data temporarily unavailable/);
  assert.match(src, /Showing last known state/);
  assert.match(src, /Last observed: \$\{lastObservedAt\}/);
  assert.match(src, /onClick=\{retry\}/, "§9 requires a Retry that does not reload the page");
  /* The load-bearing part: the lifecycle is told the feed was REFUSED, without which a started game
     renders as merely scheduled. */
  assert.match(src, /feedState: unavailable \? "REFUSED" : "NOT_ASKED"/);
  const hook = code("src/components/live/use-live-slate.ts");
  assert.match(hook, /lastObservedAt: fetchedAt/, "the observed instant must be the last SUCCESS, not the refusal");
});

/* ── portraits (v1.2 follow-up) ──────────────────────────────────────────────────────────────── */

test("a portrait comes from the CANONICAL id or not at all — never from a name", () => {
  /*
   * The whole risk of this feature in one test. A portrait resolved by name-matching puts the wrong
   * face beside a prediction, and there is no acceptable rate of that. So the id must match the
   * exact board shape and anything else returns null.
   */
  assert.equal(
    espnNflHeadshotUrl("nfl-athlete-4430878"),
    "https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/4430878.png&w=96&h=96",
  );
  for (const bad of [
    null, undefined, "", "Jaxon Smith-Njigba", "nfl-athlete-", "nfl-athlete-abc",
    "nfl-athlete-4430878x", "mlb-person-12345", "4430878", "nfl-athlete-44 30878",
  ]) {
    assert.equal(espnNflHeadshotUrl(bad), null, `${JSON.stringify(bad)} must not resolve a portrait`);
  }
});

test("the portrait goes through the COMBINER, not the raw headshot path", () => {
  /*
   * Measured, not assumed: the raw path ignores w/h and serves 266,360 bytes; the combiner returns
   * the same image at 96px for 11,343. Across the slate that is ~8 MB against ~340 KB, on phones.
   */
  const url = espnNflHeadshotUrl("nfl-athlete-4430878");
  assert.match(url, /\/combiner\/i\?img=/, "the raw path cannot be resized and must not be used");
  assert.match(url, /[?&]w=96(&|$)/);
  assert.match(url, /[?&]h=96(&|$)/);
});

test("every prediction on today's real slate resolves a portrait from its id", () => {
  const r = buildNflHubRoster(SUNDAY, { previewPerGame: 1000 });
  const players = [...new Map(r.games.flatMap((g) => g.trackedPredictions).map((p) => [p.playerId, p])).values()];
  assert.ok(players.length > 200, `expected a large player set, got ${players.length}`);
  const unresolved = players.filter((p) => p.portraitUrl === null);
  /* Not a coverage assertion — a shape one. Every board id is `nfl-athlete-<digits>`, so any null
     here means the id shape changed upstream and the portrait silently disappeared. */
  assert.deepEqual(unresolved.map((p) => p.playerId), [], "a board id that stopped resolving is a regression, not a gap");
  for (const p of players) assert.ok(p.portraitUrl.includes(p.playerId.replace("nfl-athlete-", "")),
    `${p.player}: the url must carry that player's OWN id`);
});

test("the row renders the portrait from photoUrl and keeps a clean fallback", () => {
  const src = code("src/components/live/nfl-live-hub.tsx");
  assert.match(src, /photoUrl=\{p\.portraitUrl\}/, "the row passes the resolved url, it does not build one");
  assert.match(src, /playerName=\{p\.player\}/);
  assert.match(src, /sport="nfl"/);
  /* The component must not be handed an id to derive a URL from: that path is the 266 KB one. */
  assert.equal(/playerId=\{/.test(src), false, "passing playerId would bypass the combiner url");
  /* And the fixture must exercise BOTH treatments, or the fallback is never actually looked at. */
  const fx = fs.readFileSync(path.join(APP, "src/app/preview/live-nfl-states/page.tsx"), "utf8");
  assert.match(fx, /portraitUrl: null/, "the fixture must include a portrait-less row");
  assert.ok((fx.match(/portraitUrl: "https/g) ?? []).length >= 2, "and at least two with portraits");
});

test("the portrait is compact on a phone and larger on desktop", () => {
  const css = fs.readFileSync(path.join(APP, "src/app/globals.css"), "utf8");
  const block = css.slice(css.indexOf(".gtp-live-portrait"));
  assert.match(block, /width: 28px !important/, "compact beside the name on a phone");
  assert.match(block, /@media \(min-width: 640px\)[\s\S]{0,200}width: 36px !important/, "slightly larger from sm up");
  /* ⚠ !important is load-bearing here: PlayerAvatar sets width/height INLINE, which otherwise wins. */
  assert.match(css, /sizes itself with INLINE width\/height/, "the reason must be stated, not rediscovered");
});
