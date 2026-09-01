/**
 * Moonshot's state, against the four artifacts that disagreed about it.
 *
 * The public page made three false claims at once: it advertised "two independent longshot cards
 * published daily" for a product that had published nothing in fifteen days, it reported the smaller
 * of two settled counts as "lifetime", and it showed "0 Pending" while two published cards sat open
 * and ungradeable. The tests below hold each of those to the artifacts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  deriveMoonshotState,
  isPublishedCard,
  MOONSHOT_LIFECYCLE,
  MOONSHOT_HAS_SCHEDULED_GENERATOR,
  MOONSHOT_HAS_WIRED_SETTLER,
} from "./moonshot-state.mjs";

const TODAY = "2026-09-01";

/** The Aug-17 artifact's shape: two lanes, a live step-1 card each, no gamePk on any leg. */
const leg = (o = {}) => ({ participant: "Some Batter Over 1.5 Total Bases", result: null, official: null, ...o });
const card = (id, legs) => ({ cardId: id, stake: 25, result: null, legs });
const lane = (o = {}) => ({
  status: "active",
  generatedAt: "2026-08-17T14:00:00Z",
  lanes: [
    { laneId: "A", status: "active", ladder: [{ step: 1, status: "active", card: card("moonshot-2026-08-17-mlb-a", [leg(), leg(), leg()]) }, { step: 2, status: "upcoming", card: null }] },
    { laneId: "B", status: "active", ladder: [{ step: 1, status: "active", card: card("moonshot-2026-08-17-mlb-b", [leg(), leg(), leg()]) }] },
  ],
  ...o,
});
const ledger = (n = 7) => ({
  productId: "moonshot",
  results: Array.from({ length: n }, (_, i) => ({ productId: "moonshot", date: i === 0 ? "2026-06-23" : "2026-07-06", card: "Lane A (stake $25)", outcome: "lost", stake: 25, payout: 0 })),
});
const portfolio = (o = {}) => ({ status: "stopped", exposure: 0, record: { wins: 0, losses: 1, voids: 0, pending: 0 }, ...o });

const live = { today: TODAY, hasScheduledGenerator: false, hasWiredSettler: false };
const derive = (o = {}) => deriveMoonshotState({ ...live, lane: lane(), productLedger: ledger(), portfolioMoonshot: portfolio(), ...o });

/* ── THE LIVE SHAPE ───────────────────────────────────────────────────────────────────────────── */

test("THE LIVE SHAPE · open cards nothing can settle are ABANDONED, not pending", () => {
  /*
   * Calling them "pending" promises a settlement no code path can deliver: the nightly settler walks
   * a product-cards directory these cards were never registered in, and no leg carries a gamePk.
   */
  const s = derive();
  assert.equal(s.lifecycle, "ABANDONED");
  assert.equal(s.running, false);
  assert.equal(s.openCardCount, 2);
  assert.equal(s.unsettleableCardCount, 2);
  assert.equal(s.openExposure, 50);
  assert.equal(s.lastPublishedDate, "2026-08-17");
  assert.equal(s.daysSincePublished, 15);
});

test("the note states the truth and never claims daily publication", () => {
  const s = derive();
  assert.doesNotMatch(s.publicNote, /\bdaily\b/i, "the note may not claim daily publication");
  assert.match(s.publicNote, /Moonshot is not running/);
  assert.match(s.publicNote, /2026-08-17/);
  assert.match(s.publicNote, /no game identity|will not be graded/);
});

test("the self-declared status does not survive its own staleness", () => {
  // `active.json` still says "active" fifteen days on. Freshness outranks a file's opinion of itself.
  assert.match(derive().contradictions.join(" | "), /declares status "active" but was last written 15 days ago/);
});

test("TWO SETTLED COUNTS FOR ONE PRODUCT are reported, not silently reconciled", () => {
  /*
   * The portfolio block says one settled card; the product ledger holds seven from an earlier era.
   * Picking whichever number is smaller would be the same defect in a new place.
   */
  const s = derive();
  assert.equal(s.portfolioRecord.settled, 1);
  assert.equal(s.ledgerRecord.settled, 7);
  assert.equal(s.ledgerRecord.losses, 7);
  assert.equal(s.ledgerRecord.staked, 175);
  assert.equal(s.ledgerRecord.returned, 0);
  assert.match(s.contradictions.join(" | "), /two settled counts for one product/);
});

test("ZERO PENDING beside two open cards is a contradiction", () => {
  assert.match(derive().contradictions.join(" | "), /reports 0 pending while 2 published card\(s\) are still open/);
});

test("a stopped portfolio beside an active lane is a contradiction", () => {
  assert.match(derive().contradictions.join(" | "), /"stopped" while the lane artifact says "active"/);
});

test("legs with no game identity are counted and named", () => {
  const s = derive();
  assert.deepEqual(s.openCards.map((c) => c.legsWithoutGameId), [3, 3]);
  assert.match(s.contradictions.join(" | "), /6 leg\(s\) with no game identity/);
});

test("ONE RECORD PER PRODUCT · displayRecord prefers the settlement log", () => {
  /*
   * /mr-dub printed the portfolio's 0-1 directly beside the reconciled 0-7 — one surface, two records
   * for one product. Surfaces with room for a single figure now take it from here.
   */
  const s = derive();
  assert.deepEqual(
    { wins: s.displayRecord.wins, losses: s.displayRecord.losses },
    { wins: 0, losses: 7 },
  );
  assert.equal(s.displayRecord.source, "product-ledger/moonshot.json");
  // The disagreement is still reported, not resolved away.
  assert.match(s.contradictions.join(" | "), /two settled counts for one product/);
});

test("displayRecord falls back to the portfolio when no ledger exists", () => {
  const s = derive({ productLedger: null });
  assert.equal(s.displayRecord.losses, 1);
  assert.equal(s.displayRecord.source, "mr-dub/portfolio.json .moonshot");
});

test("the founder decision is NAMED, not assumed", () => {
  // Repair, pause or retire is a product decision. The module states the question.
  assert.match(derive().founderDecision, /MOONSHOT_REPAIR_PAUSE_OR_RETIRE/);
});

/* ── THE OTHER STATES ─────────────────────────────────────────────────────────────────────────── */

test("open cards a settler CAN reach are SETTLING, not abandoned", () => {
  const withIds = lane({
    lanes: [{ laneId: "A", status: "active", ladder: [{ step: 1, status: "active", card: card("c", [leg({ gamePk: 812345 })]) }] }],
  });
  const s = derive({ lane: withIds, hasWiredSettler: true });
  assert.equal(s.lifecycle, "SETTLING");
  assert.equal(s.unsettleableCardCount, 0);
  assert.match(s.publicNote, /awaiting official results/);
});

test("with a generator wired and today's card published, it is PUBLISHED", () => {
  const s = derive({
    lane: lane({ generatedAt: `${TODAY}T14:00:00Z`, lanes: [] }),
    hasScheduledGenerator: true, hasWiredSettler: true,
  });
  assert.equal(s.lifecycle, "PUBLISHED");
  assert.equal(s.running, true);
  assert.equal(s.founderDecision, null);
});

test("with a generator wired but no card today, it is STALE — not silently fine", () => {
  const s = derive({ lane: lane({ lanes: [] }), hasScheduledGenerator: true, hasWiredSettler: true });
  assert.equal(s.lifecycle, "STALE");
  assert.match(s.publicNote, /today's has not been produced/);
});

test("nothing open and nothing generating is NOT_GENERATING", () => {
  const s = derive({ lane: lane({ lanes: [] }) });
  assert.equal(s.lifecycle, "NOT_GENERATING");
  assert.doesNotMatch(s.publicNote, /\bdaily\b/i);
});

test("an older single-ladder artifact still yields its open cards", () => {
  // Pre-lanes artifacts carry one top-level ladder; the shape changed, the obligation did not.
  const s = derive({ lane: { status: "active", generatedAt: "2026-08-17T14:00:00Z", ladder: [{ step: 1, status: "active", card: card("old", [leg()]) }] } });
  assert.equal(s.openCardCount, 1);
});

test("REFUSAL · with no artifacts at all the state is UNKNOWN, never healthy", () => {
  const s = deriveMoonshotState({ ...live, lane: null, productLedger: null, portfolioMoonshot: null });
  assert.equal(s.lifecycle, "UNKNOWN");
  assert.equal(s.running, false);
  assert.ok(MOONSHOT_LIFECYCLE.includes(s.lifecycle));
});

test("AN EMPTY SHELL IS NOT A LIVE CARD", () => {
  /*
   * The daily portfolio synthesizes two Moonshot placeholders for every date, so a bare
   * `product === "moonshot"` filter is true on every day the site has ever rendered — a liveness test
   * that can never be false. It lit "Day 1 · LIVE" and promised overnight settlement for nothing.
   */
  assert.equal(isPublishedCard({ product: "moonshot", status: "awaiting", legs: [] }), false);
  assert.equal(isPublishedCard({ product: "moonshot", legs: undefined }), false);
  assert.equal(isPublishedCard(null), false);
  assert.equal(isPublishedCard({ product: "moonshot", legs: [{ participant: "x" }] }), true);
});

test("LIVE · the daily portfolio really does synthesize empty Moonshot shells for any date", () => {
  // Pins the reason the predicate exists: if this stops being true, the workaround can be revisited.
  const dp = fs.readFileSync(path.join(process.cwd(), "src/lib/mr-dub/daily-portfolio.ts"), "utf8");
  assert.match(dp, /moonshot/i, "daily-portfolio no longer mentions moonshot — re-check the liveness predicate");
});

/* ── AGAINST THE LIVE TREE ────────────────────────────────────────────────────────────────────── */

const REPO = path.join(process.cwd(), "..");

test("LIVE · the declared generator constant matches the workflow directory", () => {
  /*
   * The fact the whole state turns on. `activate-moonshot-candidates.mjs` is referenced by no
   * workflow; `lineup-aware-refresh.yml` can place a card but is dispatch-only, its World Cup cron
   * having expired and been removed. If either changes, this fails rather than letting the page's
   * note quietly go stale.
   */
  const wf = path.join(REPO, ".github", "workflows");
  if (!fs.existsSync(wf)) return;
  const files = fs.readdirSync(wf).filter((f) => f.endsWith(".yml"));

  const generators = files.filter((f) => fs.readFileSync(path.join(wf, f), "utf8").includes("activate-moonshot-candidates"));
  assert.deepEqual(generators, [], `a workflow now generates Moonshot (${generators.join(", ")})`);

  const laf = path.join(wf, "lineup-aware-refresh.yml");
  if (fs.existsSync(laf)) {
    const src = fs.readFileSync(laf, "utf8").replace(/^\s*#.*$/gm, "");
    assert.ok(!/^\s*schedule:/m.test(src), "lineup-aware-refresh is scheduled again — Moonshot may now publish on a cron");
  }
  assert.equal(MOONSHOT_HAS_SCHEDULED_GENERATOR, false, "the constant must match the tree above");
});

test("LIVE · the declared settler constant matches what nightly-settle can reach", () => {
  /*
   * `settle-paper-product-cards.mjs` walks `data/internal/product-cards/`. The Aug-17 lane cards were
   * never registered there, so the settler has never seen them. If that directory appears, the
   * constant and this guard need revisiting together.
   */
  const cards = path.join(process.cwd(), "public", "data", "internal", "product-cards");
  const registered = fs.existsSync(cards) && fs.readdirSync(cards).length > 0;
  assert.equal(registered, false, "product cards now exist — re-check whether Moonshot's open cards are reachable");
  assert.equal(MOONSHOT_HAS_WIRED_SETTLER, false, "the constant must match the tree above");
});

test("LIVE · no public surface claims Moonshot publishes daily", () => {
  /*
   * The defect itself, pinned at the surface. It scans RENDERED COPY ONLY: the first version of this
   * guard read whole files and then failed on the docblock that quotes the old claim to explain it —
   * a comment describing a defect is not the defect, and a guard that cannot tell them apart pushes
   * you to delete the explanation.
   *
   * If a generator is ever wired, revisit this deliberately rather than editing the copy back in.
   */
  const CLAIM = /\b(?:cards?|longshots?)\b[^.\n]{0,40}\bdaily\b|\bdaily\b[^.\n]{0,20}\b(?:cards?|longshots?)\b/i;
  const blank = (m) => m.replace(/[^\n]/g, " ");
  const src = path.join(process.cwd(), "src");
  const offenders = [];

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const raw = fs.readFileSync(full, "utf8");
      if (!/moonshot/i.test(raw) && !/moonshot/i.test(path.relative(src, full))) continue;
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
      code.split("\n").forEach((line, i) => {
        /* Only a line that is itself about Moonshot — this file scans every surface that mentions the
           product, and an unrelated "daily cards" elsewhere in such a file is not this defect. */
        if (CLAIM.test(line) && /moonshot|longshot/i.test(line)) {
          offenders.push(`${path.relative(src, full)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
  };
  walk(src);
  assert.deepEqual(offenders, [], `these claim daily Moonshot publication:\n  ${offenders.join("\n  ")}`);
});

test("LIVE · the real artifacts still derive to ABANDONED", () => {
  // The end-to-end read, so a change to any of the three artifacts surfaces here.
  const DATA = path.join(process.cwd(), "public", "data");
  const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, p), "utf8")); } catch { return null; } };
  const laneDoc = read("moonshot-lane/active.json");
  if (!laneDoc) return;

  const s = deriveMoonshotState({
    lane: laneDoc,
    productLedger: read("product-ledger/moonshot.json"),
    portfolioMoonshot: read("mr-dub/portfolio.json")?.moonshot ?? null,
    hasScheduledGenerator: MOONSHOT_HAS_SCHEDULED_GENERATOR,
    hasWiredSettler: MOONSHOT_HAS_WIRED_SETTLER,
    today: TODAY,
  });
  assert.equal(s.lifecycle, "ABANDONED");
  assert.equal(s.openCardCount, 2);
  assert.ok(s.contradictions.length >= 3, `expected the known contradictions, got ${s.contradictions.length}`);
});
