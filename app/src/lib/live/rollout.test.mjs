/**
 * THE ROLLOUT GATE — what a build is ALLOWED to serve, per sport.
 *
 * Stage 2 made MLB Live public and held the ESPN-backed NFL surface internal until the provider
 * posture was separately approved. That approval was granted on 2026-09-25 and Production now sets
 * `LIVE_PUBLIC_SPORTS=mlb,nfl` and `NEXT_PUBLIC_LIVE_SPORTS=mlb,nfl`.
 *
 * ⚠ NOT ONE ASSERTION BELOW CHANGED, AND NONE SHOULD. Every test here is written against an EXPLICIT
 * environment object, so what they pin is the PROPERTY — every default is closed, a typo opens
 * nothing, an unknown name is dropped, and the kill switch outranks the allowlist — not whatever
 * Production happens to be set to. ROLLOUT 4 already proved `mlb,nfl` is the documented enable path,
 * which is precisely why the enabling was a configuration change and not a code change.
 *
 * Read from both directions: MLB must work, NFL must be refused when it is not on the list, and
 * neither may be opened by forgetting a variable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SUPPORTED_SPORTS, planRequest, publicSports, upstreamUrls } from "../../../api/_live-core.mjs";
import { codeOnly, jsxElement } from "./testing/source-scan.mjs";

const APP = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

/* ───────────────────── the server gate (the one that holds) ───────────────────── */

test("ROLLOUT 1 · the default allowlist is MLB ONLY — an unset variable cannot open NFL", () => {
  assert.deepEqual(publicSports({}), ["mlb"]);
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "" }), ["mlb"]);
  // A capability list is not a permission list. NFL has an adapter and no permission.
  assert.deepEqual([...SUPPORTED_SPORTS].sort(), ["mlb", "nfl"]);
});

test("ROLLOUT 2 · ⚠ a direct request for NFL is refused in a default (production) environment", () => {
  const allowed = publicSports({});
  for (const q of [
    { sport: "nfl" },
    { sport: "NFL" },
    { sport: "nfl", event: "401872932" },
    { sport: "nfl", event: "401872932", players: "1", date: "2026-09-17" },
  ]) {
    const plan = planRequest(q, allowed);
    assert.equal(plan.ok, false, `${JSON.stringify(q)} must be refused`);
    assert.equal(plan.reason, "UNSUPPORTED_SPORT");
  }
  // MLB, in the same environment, works — otherwise this test would pass with everything broken.
  const mlb = planRequest({ sport: "mlb", event: "824307" }, allowed);
  assert.equal(mlb.ok, true);
  assert.equal(mlb.sport, "mlb");
});

test("ROLLOUT 3 · a refused sport never produces an upstream URL — ESPN is not contacted at all", () => {
  const allowed = publicSports({});
  const plan = planRequest({ sport: "nfl", event: "401872932", players: "1" }, allowed);
  assert.equal(plan.ok, false);
  // The refusal happens before any URL is built; there is no plan to hand to upstreamUrls.
  assert.equal(plan.scoreboard, undefined);
  assert.equal(plan.summary, undefined);
  // And the MLB path, in the same environment, reaches StatsAPI and only StatsAPI.
  const urls = upstreamUrls(planRequest({ sport: "mlb", event: "824307" }, allowed));
  assert.match(urls.scoreboard, /^https:\/\/statsapi\.mlb\.com\//);
  assert.equal(urls.summary, null);
  assert.equal(JSON.stringify(urls).includes("espn"), false, "no ESPN host may appear on the MLB path");
});

test("ROLLOUT 4 · the allowlist cannot be widened by a typo, and IS honoured when set deliberately", () => {
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "nfI" }), [], "a lookalike name opens nothing");
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nba,epl" }), ["mlb"], "unknown names are dropped");
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "*" }), []);
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "all" }), []);
  // The documented way to enable NFL later — proven to work, so the reversal is not a guess.
  assert.deepEqual(publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl" }), ["nfl", "mlb"].sort((a, b) => (a === "nfl" ? -1 : 1)));
  assert.equal(planRequest({ sport: "nfl" }, publicSports({ LIVE_PUBLIC_SPORTS: "mlb,nfl" })).ok, true);
});

test("ROLLOUT 5 · the kill switch still outranks the allowlist — OFF means nothing is served", () => {
  // Proven by reading the handler's order of operations: the disabled check precedes planRequest.
  const handler = read("api/live.mjs");
  const killIdx = handler.indexOf("gatewayDisabled()");
  const planIdx = handler.indexOf("planRequest(");
  assert.ok(killIdx > 0 && planIdx > 0, "both checks are present — otherwise this guard is vacuous");
  assert.ok(killIdx < planIdx, "the kill switch must be evaluated before any request is planned");
});

/* ───────────────────── the client gate (shipping half) ───────────────────── */

test("ROLLOUT 6 · the client defaults to MLB only and reads the flag as a LITERAL", () => {
  const client = read("src/lib/live/client.ts");
  assert.match(client, /NEXT_PUBLIC_LIVE_SPORTS/);
  assert.match(client, /\?\s*\["mlb"\]|\["mlb"\]/, "the default list is MLB");
  // ⚠ Next inlines only a literal process.env.NEXT_PUBLIC_* member expression.
  assert.equal(/process\.env\[/.test(codeOnly(client)), false, "a computed read compiles to undefined in the browser");
});

test("ROLLOUT 7 · every live surface gates on liveReadyFor(sport), not on the master flag alone", () => {
  for (const rel of ["src/components/live/live-panel.tsx", "src/components/live/use-live-event.ts"]) {
    const body = read(rel);
    assert.match(body, /liveReadyFor\(\s*sport\s*\)/, `${rel} must gate per sport`);
    // A surviving bare liveEnabled() would render an NFL panel the gateway then refuses.
    assert.equal(/\bliveEnabled\(\)/.test(body), false, `${rel} still uses the sport-blind gate`);
  }
});

test("ROLLOUT 8 · the MLB game page mounts Live for MLB only, and passes no NFL props", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  // Scoped to the LivePanel element itself. `sport={detail.sport}` is correct on other components
  // on this page and would be a rollout defect here, so a whole-file scan would be the wrong guard.
  const el = jsxElement(page, "LivePanel");
  assert.ok(el, "the panel is mounted — otherwise this guard proves nothing");
  assert.match(el, /sport="mlb"/, "mounted explicitly as MLB — never from a variable sport key");
  assert.equal(/sport=\{/.test(el), false, "a computed sport could mount NFL from this page");
  assert.equal(/playerBoard=/.test(el), false, "no player board is passed — MLB publishes no per-player range");
  assert.match(page, /detail\.sport === "mlb"/, "the node itself is MLB-gated");
});

test("ROLLOUT 9 · ⚠ MLB totals stay PAUSED on the public page — no combined total reaches Live", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  // The page hands the panel ONLY the projection, which omits totalRuns by construction.
  assert.match(page, /projectMlbForecast\(/);
  assert.equal(/mlbForecast=\{detail\.fullGameSim\}/.test(page), false,
    "handing the raw artifact would carry totalRuns and its full distribution into the live module");
});

test("ROLLOUT 10 · the Live nav entry exists, is truthful about scope, and resolves", () => {
  /*
   * ⚠ THIS RULE CHANGED BY FOUNDER DECISION, and the guard changed WITH it rather than being
   * deleted. Stage 2 forbade a /live nav entry because the route did not exist; v1.1.1 ships the
   * hub and approves the entry. What must never change is the claim it makes: the label may not
   * promise sports the server allowlist will refuse.
   */
  const nav = read("src/lib/navigation.ts");
  assert.ok(nav.length > 400, "navigation.ts was read — otherwise this scan proves nothing");
  assert.match(nav, /href: "\/live"/, "the Live destination exists");
  // Truthful scope: the note says MLB, because NFL Live is internal-only.
  const entry = /\{ href: "\/live"[^}]*\}/.exec(nav);
  assert.ok(entry, "the Live entry parses");
  assert.match(entry[0], /note: "MLB/, "the nav must not imply sports the allowlist refuses");
  assert.equal(/nfl|epl|ufc/i.test(entry[0]), false, "the Live entry must not name an unavailable sport");

  /*
   * ⚠ RAIL + FOOTER, not the thumb bar. P243 charter E fixes the primaries at FIVE and requires the
   * same set on every surface; making Live a sixth is a founder product decision, not a side effect
   * of shipping the route. Phones still reach it — the Menu sheet derives rail-minus-bar.
   */
  assert.match(entry[0], /surfaces: \["rail", "footer"\]/, "Live must not silently become a sixth primary");

  // It points at a route that actually exists in source.
  assert.ok(fs.existsSync(path.join(APP, "src/app/live/page.tsx")), "/live has a real page");
  // And the route is registered with the inventory owner rather than smuggled in.
  assert.match(read("src/lib/audits/route-inventory.mjs"), /"\/live": \{ classification: "public"/);
});

test("ROLLOUT 11 · the frozen-at stamp is rendered in ET, never as a raw ISO instant", () => {
  // Caught in QA: the game page passed the artifact's `generatedAt` straight through and the page
  // published "Forecast frozen at 2026-09-16T01:35:10.000Z". Formatting now lives in the panel, so
  // no caller can reintroduce it by forgetting.
  const panel = read("src/components/live/live-panel.tsx");
  assert.match(panel, /function frozenStamp/, "the panel owns the formatting");
  assert.match(panel, /timeZone: "America\/New_York"/);
  assert.match(panel, /frozenStamp\(forecastGeneratedAt\)/, "the note renders the formatted value");

  for (const rel of ["src/components/game/game-detail-page.tsx", "src/app/preview/live/page.tsx"]) {
    const el = jsxElement(read(rel), "LivePanel");
    if (!el) continue;
    assert.equal(/forecastGeneratedAt=\{[^}]*etStamp/.test(el), false,
      `${rel} pre-formats the stamp — the panel already does, and two formatters drift`);
  }
});

/* ───────────── NFL ENABLED 2026-09-25 — and every default stays closed ───────────── */

test("ROLLOUT 12 · the CLIENT predicate is the zero-request gate, and it is closed by default", async () => {
  /*
   * The founder enabled NFL live on 2026-09-25 by setting LIVE_PUBLIC_SPORTS and
   * NEXT_PUBLIC_LIVE_SPORTS to `mlb,nfl` in Production. Nothing above changed: every assertion in
   * this file is written against an EXPLICIT env object, so "the default is closed" is still the
   * property being tested, and ROLLOUT 4 already proved `mlb,nfl` is the documented enable path.
   *
   * What was missing was the client half of "zero provider requests when the flag is off".
   * ROLLOUT 3 proves the GATEWAY builds no upstream URL for a refused sport. This proves the browser
   * never asks in the first place — `useLiveEvent` evaluates `liveReadyFor(sport)` BEFORE its first
   * fetch, so a build with NFL off costs nothing rather than costing a refusal per reader.
   *
   * Read behaviourally, against the real module, by moving the environment it reads.
   */
  const { liveReadyFor, liveSportEnabled } = await import("./client.ts");
  const saved = { en: process.env.NEXT_PUBLIC_LIVE_ENABLED, sp: process.env.NEXT_PUBLIC_LIVE_SPORTS };
  try {
    process.env.NEXT_PUBLIC_LIVE_ENABLED = "1";

    delete process.env.NEXT_PUBLIC_LIVE_SPORTS;
    assert.equal(liveSportEnabled("mlb"), true, "unset still means MLB");
    assert.equal(liveReadyFor("nfl"), false, "unset must NOT open NFL — the default is closed");

    process.env.NEXT_PUBLIC_LIVE_SPORTS = "";
    assert.equal(liveReadyFor("nfl"), false, "empty is not a wildcard");

    process.env.NEXT_PUBLIC_LIVE_SPORTS = "mlb";
    assert.equal(liveReadyFor("nfl"), false, "MLB-only means NFL asks for nothing");
    assert.equal(liveReadyFor("mlb"), true);

    // The deliberate setting now live in Production.
    process.env.NEXT_PUBLIC_LIVE_SPORTS = "mlb,nfl";
    assert.equal(liveReadyFor("nfl"), true, "and the approved setting does open it");
    assert.equal(liveReadyFor("mlb"), true, "without closing MLB");

    // The master kill switch still outranks the allowlist on the client too.
    process.env.NEXT_PUBLIC_LIVE_ENABLED = "0";
    assert.equal(liveReadyFor("nfl"), false, "OFF means nothing is fetched, whatever the allowlist says");
    assert.equal(liveReadyFor("mlb"), false);
  } finally {
    if (saved.en === undefined) delete process.env.NEXT_PUBLIC_LIVE_ENABLED; else process.env.NEXT_PUBLIC_LIVE_ENABLED = saved.en;
    if (saved.sp === undefined) delete process.env.NEXT_PUBLIC_LIVE_SPORTS; else process.env.NEXT_PUBLIC_LIVE_SPORTS = saved.sp;
  }
});

test("ROLLOUT 13 · the gate is evaluated BEFORE the first fetch, not after it", () => {
  /*
   * A predicate that is only consulted after the request has gone out is not a cost gate. Read as an
   * ordering fact about the hook: the effect that starts polling returns early on `liveReadyFor`, and
   * the only `fetch(` in the module sits inside `poll`, which that effect is the sole first caller of.
   */
  const hook = read("src/components/live/use-live-event.ts");
  const body = codeOnly(hook);

  const gateIdx = body.indexOf("if (!liveReadyFor(sport) || !eventId) {");
  const startIdx = body.indexOf("void poll();");
  assert.ok(gateIdx > 0 && startIdx > 0, "both the gate and the first poll are present — otherwise vacuous");
  assert.ok(gateIdx < startIdx, "the gate must precede the first poll");

  // Exactly one fetch in the module, and it is inside poll — not at module scope or in an effect.
  const fetches = body.match(/\bfetch\(/g) || [];
  assert.equal(fetches.length, 1, `the hook must own exactly one fetch call site, found ${fetches.length}`);
  const pollIdx = body.indexOf("const poll = useCallback");
  assert.ok(pollIdx > 0 && body.indexOf("fetch(") > pollIdx, "the fetch lives inside poll");
});
