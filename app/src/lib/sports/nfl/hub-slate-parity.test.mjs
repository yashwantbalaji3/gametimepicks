/**
 * Release A guards (Program 177): the NFL hub is organised around ONE slate day derived from the
 * canonical index, every simulated game on that slate opens a full report, and the hub uses the
 * shared UI owners `/mlb` already had instead of forked one-offs.
 *
 * These assert STRUCTURE and CONTRACT, not a date. Five guards in this repository broke at a UTC
 * rollover because they pinned "2026-08-13"; nothing here pins a day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const hub = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
const route = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
const card = fs.readFileSync(path.join(APP, "src/components/event-card.tsx"), "utf8");
/** The hub with its own commentary stripped — a comment explaining a removed sentence must not
 *  itself trip the guard that checks the sentence is gone. */
const hubProse = hub.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const index = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/index.json"), "utf8"));
const schedule = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule/latest.json"), "utf8"));

const etDay = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

test("the slate day is DERIVED from the canonical index, never pinned", () => {
  assert.match(hub, /index\?\.nextKickoffUtc/, "the anchor is the index's own next kickoff");
  // No hard-coded calendar day anywhere in the hub's CODE. Scanned against the comment-stripped
  // copy for the same reason it exists two assertions below: a comment recording the date of an
  // incident is documentation, not a pinned slate, and tripping on it teaches the next author to
  // delete the explanation rather than the pin. Code is held to exactly the same standard.
  const pinned = hubProse.match(/\b20\d\d-\d\d-\d\d\b/g) ?? [];
  assert.deepEqual(pinned, [], `the hub must not pin a date, found ${pinned.join(", ")}`);
  assert.ok(index.nextKickoffUtc, "the index publishes an anchor to derive from");
});

test("EVERY game on the derived slate day renders, and every simulated one opens a full report", () => {
  const slateDay = etDay(index.nextKickoffUtc);
  const slate = schedule.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED" && etDay(r.dateUtc) === slateDay);
  assert.ok(slate.length > 0, `the derived slate day ${slateDay} must contain at least one game`);

  const eventIds = new Set(index.events.map((e) => e.providerEventId));
  const simulated = slate.filter((g) => eventIds.has(g.providerEventId));
  // whatever is simulated must be reachable: the deep route static-generates from this artifact
  assert.match(route, /generateStaticParams/);
  assert.match(route, /dynamicParams = false/);
  for (const g of simulated) {
    const e = index.events.find((x) => x.providerEventId === g.providerEventId);
    assert.ok(e.projectedScore && e.winProbability && e.total,
      `${g.shortName}: a simulated game must carry a score, a win chance and a total`);
  }
  // the hub links by provider event id — the same key the route generates from
  // P183: the hub now links the SHARED experience at /games/nfl/<slug> — the same page MLB uses —
  // rather than the bespoke /nfl/game route built before NFL fed the shared contract. The intent
  // ("every simulated game opens a full report") is better served, not weakened.
  assert.match(hub, /\/games\/nfl\/\$\{g\.away\.abbr\.toLowerCase\(\)\}-vs-\$\{g\.home\.abbr\.toLowerCase\(\)\}/);
  // a game WITHOUT a simulation is stated as such rather than rendered blank
  assert.match(hub, /No simulation was published for this game/);
});

test("the hub CONSUMES canonical state and does not recompute lifecycle", () => {
  assert.match(hub, /e\?\.lifecycle === "STARTED"/, "started-ness comes from the index");
  assert.doesNotMatch(hub, /Date\.now\(\)/, "a statically exported page must not compare against build-time now");
  // counts shown in the hero come from the index's own counts block
  assert.match(hub, /index\?\.counts\?\.marketEvents/);
});

test("SHARED OWNERS · the five parity rows are closed by adoption, not by forking", () => {
  for (const [owner, mod] of [
    ["SportOverviewHero", "@/components/sport-overview-hero"],
    ["FreshnessBadge", "@/components/ui/freshness-badge"],
    ["SectionHeader", "@/components/section-header"],
    ["EventCard", "@/components/event-card"],
    ["QuickActionRail", "@/components/quick-action-rail"],
  ]) {
    assert.ok(hub.includes(`import ${owner} from "${mod}"`), `the hub must import the shared ${owner}`);
    assert.ok(new RegExp(`<${owner}[\\s>]`).test(hub), `the hub must actually render ${owner}`);
  }
  // /mlb uses the same owners — that is what makes this parity rather than coincidence
  const mlb = fs.readFileSync(path.join(APP, "src/app/mlb/page.tsx"), "utf8");
  for (const owner of ["SportOverviewHero", "FreshnessBadge", "SectionHeader", "QuickActionRail"]) {
    assert.ok(mlb.includes(owner), `/mlb is the owner of record for ${owner}`);
  }
});

test("EventCard is layout-only — it fetches nothing and decides nothing", () => {
  for (const f of ["node:fs", "process.cwd", "fetch(", "public/data"]) {
    assert.ok(!card.includes(f), `a layout card must not contain ${f}`);
  }
  assert.match(card, /interactive[\s*]+content inside a link/, "the CTA-not-wrapper decision is recorded");
});

test("the hub no longer contradicts itself about publishing simulations", () => {
  assert.ok(!/No NFL models, simulations, or picks are published/.test(hubProse),
    "the page publishes simulations; claiming otherwise is the contradiction the index exists to catch");
  assert.match(hubProse, /published as experimental and are never presented as\s+picks/);
  assert.equal(index.contradictions.length, 0, "the canonical index reports no contradiction");
});

test("LABEL DISCIPLINE survives the rebuild", () => {
  const prose = hubProse;
  for (const banned of ["lock", "best bet", "guaranteed", "profitable", "high-confidence"]) {
    assert.doesNotMatch(prose, new RegExp(`\\b${banned}\\b`, "i"), `the hub must not say "${banned}"`);
  }
  // "beat the market" appears only inside a denial
  for (const m of prose.matchAll(/beats? the (?:sportsbook )?market/gi)) {
    const before = prose.slice(Math.max(0, m.index - 60), m.index);
    assert.match(before, /\bnot\b[^.]{0,40}$|\bnever\b[^.]{0,40}$/i, `"${m[0]}" must appear only inside a denial`);
  }
});
