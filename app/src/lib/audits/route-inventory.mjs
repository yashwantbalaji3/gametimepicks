/**
 * Route/capability assurance inventory — pure builder (Program 159 · Release A).
 *
 * TRUTH MODEL. Three layers reconciled: the SOURCE route tree (every page.tsx under src/app — the authority
 * on what exists), the COMMITTED OWNERSHIP TABLE below (the authority on what each route is FOR —
 * a route the table cannot explain is itself a P0 finding), and the BUILT OUTPUT when provided
 * (the authority on what actually ships). Findings come from CONTRADICTIONS between layers, each
 * fail-closed with a stable id — never from vibes about a page looking odd.
 *
 * PURE: explicit `now` + roots, stable ordering, same inputs → same bytes, no network, no clocks.
 */
import fs from "node:fs";
import path from "node:path";

export const ROUTE_INVENTORY_VERSION = 1;

/**
 * The ownership table — every route family the source tree contains must appear here.
 * classification: public | internal | redirect | archive. `redirectTo` names the stub target
 * (must be a real destination, one hop). Dynamic families carry a `family` pattern.
 */
export const ROUTE_TABLE = Object.freeze({
  "/": { classification: "public", owner: "product", purpose: "landing: simulation-first story, today hook, product cards, four-sport strip", dataOwner: "daily brief + market coverage + upcoming adapters", freshness: "build-time; freshness badges re-derive client-side" },
  "/today": { classification: "public", owner: "product", purpose: "daily command center: slate, predictions table, category picks", dataOwner: "daily brief + boards", freshness: "slate-date stamped" },
  "/simulate": { classification: "public", owner: "product", purpose: "pick a game, run its simulation report", dataOwner: "sim artifacts", freshness: "artifact generatedAt" },
  "/markets": { classification: "public", owner: "product", purpose: "Market Center: ranked disagreement list + reading key (pp, never pts)", dataOwner: "market intelligence artifacts", freshness: "capture stamps" },
  "/build": { classification: "public", owner: "product", purpose: "Advanced Builder: manual builder → suggested cards → optimizer marketplace", dataOwner: "build legs from eligible slate", freshness: "sourceDate == productDate gate" },
  "/bank-builder": { classification: "public", owner: "product", purpose: "conservative paper ladder (ONE 5-step ladder)", dataOwner: "protected locks + lanes", freshness: "product-state contract" },
  "/moonshot": { classification: "public", owner: "product", purpose: "high-volatility paper longshot lane", dataOwner: "moonshot-lane active.json", freshness: "product-state contract" },
  /*
   * One dynamic route serving every live lane's card ladder. Added because the Products rail was
   * four destinations and all four were baseball, while EPL and UFC had published ladders for days
   * that were reachable only by scrolling their sport hub. generateStaticParams enumerates only the
   * lanes with a published ladder, so a lane between slates has no page rather than an empty one.
   */
  "/cards/[sport]": { classification: "public", owner: "product", purpose: "per-sport paper card ladder — one card per price band, from real posted prices", dataOwner: "parlays/risk-ladder-<sport> artifacts", freshness: "ladder generatedAt; dated by its own slate/card" },
  "/mr-dub": { classification: "public", owner: "product", purpose: "trust center: complete paper-bankroll journey + receipts", dataOwner: "protected portfolio + ledger", freshness: "settlement cutoff shown beside current-ops marker" },
  "/results": { classification: "public", owner: "settlement", purpose: "settled track record on the canonical accounting", dataOwner: "results accounting artifacts", freshness: "settled-through date" },
  "/results/mlb": { classification: "public", owner: "settlement", purpose: "MLB settled results detail", dataOwner: "settlement artifacts", freshness: "settled-through date" },
  "/results/nba": { classification: "archive", owner: "settlement", purpose: "NBA settled archive (HISTORICAL_ONLY)", dataOwner: "frozen archive", freshness: "frozen — archive is dated by design" },
  "/results/model-audit": { classification: "public", owner: "research", purpose: "deep-dive model-performance ledger (money-independent)", dataOwner: "grading artifacts", freshness: "per-artifact" },
  "/results/parlays": { classification: "public", owner: "settlement", purpose: "parlay settlement history", dataOwner: "settlement artifacts", freshness: "settled-through date" },
  "/results/date/[date]": { classification: "public", owner: "settlement", purpose: "per-date settled slate", family: true, dataOwner: "settlement artifacts", freshness: "route param date" },
  "/mlb": { classification: "public", owner: "product", purpose: "MLB Simulation Center (the one FULL_MODEL sport)", dataOwner: "boards + sims", freshness: "board date, latest-slate eyebrow when behind" },
  "/mlb/board": { classification: "public", owner: "product", purpose: "MLB daily board", dataOwner: "boards", freshness: "board date" },
  "/mlb/board/[date]": { classification: "public", owner: "product", purpose: "MLB dated board", family: true, dataOwner: "boards", freshness: "route param date" },
  "/mlb/results": { classification: "public", owner: "settlement", purpose: "MLB results view", dataOwner: "settlement artifacts", freshness: "settled-through" },
  "/mlb/power": { classification: "public", owner: "product", purpose: "MLB power rankings view", dataOwner: "boards", freshness: "board date" },
  "/sports": { classification: "public", owner: "product", purpose: "four-sport schedules directory (Schedule only — not modelled, in words)", dataOwner: "upcoming adapters over committed captures", freshness: "absolute capture dates per section" },
  "/nfl/game/[eventId]": { classification: "public", owner: "product", purpose: "NFL per-game experimental simulation report (P177-A): projected score, win chance, total and margin distributions with percentiles, the market read side by side, a reading key and the full provenance receipt \u2014 statically generated from the committed forecast artifact, dynamicParams=false", dataOwner: "nfl/forecasts/latest.json + nfl/index.json (build-time reads)", freshness: "each report carries its own generatedAt, kickoff and lifecycle" },
  "/nfl": { classification: "public", owner: "product", purpose: "NFL hub (P169-J): real slate + finals from committed captures, market-by-market coverage table with typed states (PRIVATE_ONLY/AUTH_REQUIRED/ROLE_UNCERTAIN/NO_VAULT) — no predictions published", dataOwner: "nfl schedule/results captures (build-time reads)", freshness: "absolute capture stamps in copy" },
  "/games/[sport]/[gameId]": { classification: "public", owner: "product", purpose: "per-game report (browse-game → report)", family: true, dataOwner: "game detail artifacts", freshness: "artifact stamps" },
  "/learn": { classification: "public", owner: "product", purpose: "How It Works", dataOwner: "static copy", freshness: "static" },
  "/methodology": { classification: "public", owner: "research", purpose: "the model, in depth + coverage matrix", dataOwner: "static + coverage registry", freshness: "static" },
  "/market-guide": { classification: "public", owner: "product", purpose: "market terminology guide", dataOwner: "static copy", freshness: "static" },
  "/responsible-use": { classification: "public", owner: "product", purpose: "responsible-use commitments", dataOwner: "static copy", freshness: "static" },
  "/research": { classification: "public", owner: "research", purpose: "public research terminal (fail-closed adapter)", dataOwner: "public research contract", freshness: "contract stamps" },
  "/system-status": { classification: "public", owner: "ops", purpose: "pipeline stage status in words", dataOwner: "public research contract", freshness: "contract stamps" },
  "/about": { classification: "public", owner: "product", purpose: "what this is", dataOwner: "static copy", freshness: "static" },
  // Rewritten 2026-08-20: this said /epl "publishes nothing predictive" while the page was rendering
  // a per-fixture 1X2 table. The registry describes what a route DOES; a stale description here is a
  // false answer to the audit that reads it.
  "/epl/match/[slug]": { classification: "public", owner: "product", purpose: "Premier League per-fixture model report (P188): match-result probabilities with the two-of-three outcomes, the ten likeliest scorelines and the mass they account for, the total-goals distribution with an over/under ladder, each side's own goal curve, both-teams-to-score, clean sheets and the winning-margin distribution \u2014 every figure an exact sum over ONE Poisson score matrix, so no run count is quoted because nothing is sampled. Statically generated per priced fixture, dynamicParams=false. Carries the not-validated-out-of-sample statement ABOVE the first number; no pick, rating or price comparison anywhere", dataOwner: "soccer/epl/forecasts/latest.json via lib/sports/epl/forecast-view (build-time read)", freshness: "the artifact's own generatedAt, printed on the page" },
  "/epl": { classification: "public", owner: "product", purpose: "Premier League hub: fixtures grouped by ET day with club crests, PLUS per-fixture model forecasts (1X2, expected goals, over/under 2.5) for the fixtures that can be priced — published under an explicit 'not validated out of sample' statement, with zero matches graded and no track record claimed", dataOwner: "openfootball schedule capture + EPL Poisson forecast artifact (build-time read)", freshness: "schedule capture stamp in copy; forecasts stamped from the artifact's own generatedAt" },
  "/ufc": { classification: "archive", owner: "settlement", purpose: "settled UFC archive (the one graded card; accountability outranks minimalism) + upcoming bout SCHEDULE (P186) marked 'Schedule only — simulation pending'", dataOwner: "frozen settlement + schedule capture", freshness: "archive frozen by design; schedule carries its capture source" },
  "/launch": { classification: "internal", owner: "ops", purpose: "founder command center (pruned from public export)", dataOwner: "evidence artifacts + derived boards", freshness: "per-artifact" },
  "/ops": { classification: "internal", owner: "ops", purpose: "ops dashboard (pruned)", dataOwner: "admin status", freshness: "per-artifact" },
  "/preview/epl": { classification: "internal", owner: "research", purpose: "EPL artifact preview (pruned)", dataOwner: "epl lane artifacts", freshness: "per-artifact" },
  "/preview/june20": { classification: "internal", owner: "research", purpose: "dated preview fixture (pruned)", dataOwner: "fixtures", freshness: "frozen" },
  // Redirect stubs — every one must be ONE hop to a real destination.
  "/picks": { classification: "redirect", owner: "product", purpose: "legacy Picks Lab alias", redirectTo: "/build" },
  "/parlays": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/parlay-lab": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/mlb/parlays": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/nba/parlays": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/games": { classification: "redirect", owner: "product", purpose: "game-lab hub alias", redirectTo: "/simulate" },
  "/board": { classification: "redirect", owner: "product", purpose: "legacy board alias", redirectTo: "/mlb/board" },
  "/projections": { classification: "redirect", owner: "product", purpose: "legacy projections alias", redirectTo: "/mlb/board" },
  "/events": { classification: "redirect", owner: "product", purpose: "retired event hub", redirectTo: "/today" },
  "/trends": { classification: "redirect", owner: "product", purpose: "retired trends", redirectTo: "/results" },
  "/nba": { classification: "redirect", owner: "product", purpose: "retired NBA hub", redirectTo: "/results/nba" },
  "/nba/results": { classification: "redirect", owner: "settlement", purpose: "alias", redirectTo: "/results/nba" },
  "/nhl": { classification: "redirect", owner: "product", purpose: "retired NHL hub", redirectTo: "/" },
  "/ipl": { classification: "redirect", owner: "product", purpose: "retired IPL hub", redirectTo: "/" },
  "/goal-rush": { classification: "product", owner: "product", purpose: "Goal Rush (Premier League signature product) — NAMED AND UNBUILT. Publishes no pick: states what is captured today and which of the twelve gate stages remain, both derived from lib/products/product-readiness. Flips on its own when the stages go green", dataOwner: "derived from sport-assessments + the committed EPL fixture capture", freshness: "no freshness claim — the page makes no time-sensitive claim to be stale" },
  "/bucket-blitz": { classification: "product", owner: "product", purpose: "Bucket Blitz (NBA signature product) — NAMED AND UNBUILT. Same contract as /goal-rush: derived gate stages, captured-schedule facts, no pick", dataOwner: "derived from sport-assessments + the committed NBA schedule capture", freshness: "no freshness claim — the page makes no time-sensitive claim to be stale" },
  "/homer-nukes": { classification: "redirect", owner: "product", purpose: "retired product", redirectTo: "/results" },
  "/world-cup": { classification: "redirect", owner: "product", purpose: "closed WC destination", redirectTo: "/results" },
  "/world-cup-specials": { classification: "redirect", owner: "product", purpose: "closed WC product", redirectTo: "/results" },
});

const norm = (r) => (r === "" ? "/" : r);

/** Discover concrete route paths from a src/app tree. */
export function discoverRoutes(appDir) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory()) {
        if (e.name === "page.tsx") out.push(norm(prefix));
        continue;
      }
      walk(path.join(dir, e.name), `${prefix}/${e.name}`);
    }
  };
  walk(appDir, "");
  return out.sort();
}

/** Build the inventory + findings. All inputs explicit; no clocks, no network. */
export function buildRouteInventory({ now, appDir, outDir = null, navSources = [] }) {
  if (!now || !Number.isFinite(Date.parse(now))) throw new Error("buildRouteInventory: now required");
  const discovered = discoverRoutes(appDir);
  const findings = [];
  const find = (id, severity, summary, route) => {
    if (findings.some((f) => f.id === id)) return; // one card per root
    findings.push({ id, severity, summary, route, owner: "ENGINEERING", state: "OPEN" });
  };

  const routes = [];
  for (const r of discovered) {
    const entry = ROUTE_TABLE[r];
    if (!entry) { find(`route-unowned-${r}`, "P0", `active route ${r} has no owner/purpose in the table — an unexplained route is a launch blocker`, r); continue; }
    const rec = { route: r, ...entry };
    // Redirect discipline: target must be a real public/archive destination (one hop).
    if (entry.classification === "redirect") {
      const target = ROUTE_TABLE[entry.redirectTo];
      if (!target) find(`redirect-dangling-${r}`, "P0", `${r} redirects to ${entry.redirectTo}, which the table does not know`, r);
      else if (target.classification === "redirect") find(`redirect-chain-${r}`, "P1", `${r} → ${entry.redirectTo} is a redirect chain (two hops)`, r);
      else if (target.classification === "internal") find(`redirect-internal-${r}`, "P0", `${r} redirects into an internal route`, r);
    }
    // Built-output reconciliation, when an export is provided.
    if (outDir) {
      const htmlPath = r === "/" ? path.join(outDir, "index.html") : path.join(outDir, ...r.slice(1).split("/"), "index.html");
      if (entry.family) rec.built = "FAMILY (representative pages generated per fixture)";
      else {
        const built = fs.existsSync(htmlPath);
        rec.built = built;
        if (entry.classification === "internal" && built) find(`internal-exported-${r}`, "P0", `internal route ${r} exists in the public export`, r);
        if ((entry.classification === "public" || entry.classification === "archive" || entry.classification === "redirect") && !built) {
          find(`route-not-built-${r}`, "P0", `${r} is in the table as ${entry.classification} but absent from the built export`, r);
        }
      }
    } else rec.built = "UNVERIFIED (no export provided)";
    routes.push(rec);
  }
  // Inverse reconciliation: table rows whose source route vanished.
  for (const r of Object.keys(ROUTE_TABLE)) {
    if (!discovered.includes(r)) find(`table-stale-${r}`, "P1", `table entry ${r} has no source route — remove or restore`, r);
  }
  // Nav-link reconciliation: every internal href must land on a known, non-internal route.
  for (const { name, source } of navSources) {
    for (const m of source.matchAll(/href(?:=|:\s*)"(\/[^"#]*)/g)) {
      const href = norm(m[1].replace(/\/$/, ""));
      const entry = ROUTE_TABLE[href];
      if (!entry) find(`nav-unknown-${name}-${href}`, "P0", `${name} links ${href}, which the table does not know`, href);
      else if (entry.classification === "internal") find(`nav-internal-${name}-${href}`, "P0", `${name} links internal route ${href}`, href);
    }
  }

  const sev = { P0: 0, P1: 1, P2: 2, P3: 3 };
  findings.sort((a, b) => sev[a.severity] - sev[b.severity] || a.id.localeCompare(b.id));
  return {
    schemaVersion: ROUTE_INVENTORY_VERSION,
    artifact: "route-inventory",
    dataClass: "PRIVATE_AUDIT",
    generatedAt: now,
    totals: {
      routes: routes.length,
      public: routes.filter((x) => x.classification === "public").length,
      internal: routes.filter((x) => x.classification === "internal").length,
      redirects: routes.filter((x) => x.classification === "redirect").length,
      archive: routes.filter((x) => x.classification === "archive").length,
      findings: findings.length,
      p0: findings.filter((f) => f.severity === "P0").length,
    },
    routes,
    findings,
  };
}
