/**
 * PROGRAM 184 · PHASE 0 — the mechanical baseline.
 *
 * The charter's first rule is that the baseline must be MEASURED, and that every count in the audit
 * must reconcile to the actual application. So this discovers the state rather than describing it:
 * routes from the tree and the built export, navigation from the shared metadata and each shell,
 * component variants from call sites, design-token drift from raw values in source, and motion from
 * real animation declarations.
 *
 * Everything here is read-only and deterministic. It writes ONE artifact
 * (data/internal/uiux/baseline.json) which the audit is then derived from — a hand-written
 * percentage in a report is exactly the drift the charter forbids.
 *
 * PRIVATE by construction: it inventories internal routes and admin surfaces, so it writes under
 * data/internal/ and nothing here is exported to the public site.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const SRC = path.join(APP, "src");
const OUT = path.join(REPO, "data", "internal", "uiux");

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());

/** Every file under a directory, filtered by extension. */
function walk(dir, exts, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, exts, acc); }
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}
const rel = (p) => path.relative(APP, p);
/* Comments describe what a file refuses to do, in the same words as the thing refused. Scanning them
   as if they were code is the denial trap this repo has hit repeatedly. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── 1 · ROUTES ──────────────────────────────────────────────────────────────────────────────────
/*
 * Discovered from page.tsx files, then reconciled against the BUILT export. A route that exists in
 * source but not in out/ is pruned or failed; one in out/ but not in source is stale output. Both
 * are findings, and neither is visible from either side alone.
 */
const pageFiles = walk(path.join(SRC, "app"), ["page.tsx"]);
const routes = pageFiles.map((f) => {
  const routePath = "/" + path.relative(path.join(SRC, "app"), path.dirname(f)).split(path.sep).filter(Boolean).join("/");
  const src = fs.readFileSync(f, "utf8");
  const body = stripComments(src);
  const dynamic = /\[.*\]/.test(routePath);
  const exported = fs.existsSync(path.join(APP, "out", routePath === "/" ? "" : routePath, "index.html"));
  return {
    route: routePath === "/" ? "/" : routePath,
    file: rel(f),
    dynamic,
    exportedHtml: exported,
    isRedirect: /ClientRedirect|redirect\(/.test(body),
    noindex: /robots:\s*\{[^}]*index:\s*false/.test(body),
    hasMetadata: /export const metadata/.test(body),
    clientComponent: /^"use client"/m.test(src),
    lines: src.split("\n").length,
  };
});

// ── 2 · NAVIGATION SOURCES ──────────────────────────────────────────────────────────────────────
/*
 * Every surface that can move a user. The charter's requirement is that desktop, tablet and mobile
 * are PRESENTATIONS OF THE SAME information architecture, so the first thing to measure is whether
 * they derive from shared metadata or each hardcode their own list.
 */
const navFiles = walk(SRC, [".tsx"]).filter((f) => /nav|rail|footer|menu|breadcrumb|command/i.test(path.basename(f)));
const navSources = navFiles.map((f) => {
  const body = stripComments(fs.readFileSync(f, "utf8"));
  const hrefs = [...body.matchAll(/href=\{?["'`](\/[^"'`{}\s]*)["'`]/g)].map((m) => m[1]);
  return {
    file: rel(f),
    importsSharedNav: /from\s+["'][^"']*nav(?:igation)?["']|NAV_ITEMS|navItems/.test(body),
    hardcodedHrefs: [...new Set(hrefs)].length,
    hrefs: [...new Set(hrefs)],
  };
});

/**
 * Every internal link anywhere in the app, so orphans and dead links can be computed.
 *
 * Three forms, because a first pass that only matched JSX `href=` reported 23 orphans and almost
 * all were wrong: the canonical nav declares `href: "/epl"` as an object PROPERTY in a .ts file,
 * the signature-product registry does the same, and pages pass targets through props with other
 * names (`scheduleHref="/epl"`). An orphan list that names live, linked routes is worse than none —
 * it invites someone to delete a reachable page.
 */
const allTsx = walk(SRC, [".tsx"]).filter((f) => !/\.test\./.test(f));
/* Tests are excluded: a fixture href like "/totally-made-up" is the POINT of a route-guard test, and
   counting it as a dead link means the audit reports a defect that is a passing test. */
const allSource = walk(SRC, [".tsx", ".ts", ".mjs"]).filter((f) => !/\.test\./.test(f));
const linkTargets = new Map();
const noteLink = (t) => {
  const k = t.replace(/\/$/, "") || "/";
  if (k.includes("$")) return;                    // a template-literal fragment, not a route
  linkTargets.set(k, (linkTargets.get(k) ?? 0) + 1);
};
for (const f of allSource) {
  const body = stripComments(fs.readFileSync(f, "utf8"));
  for (const m of body.matchAll(/(?:href|to|[A-Za-z]+Href)=\{?["'`](\/[^"'`{}\s#?]*)/g)) noteLink(m[1]);   // JSX attribute
  for (const m of body.matchAll(/(?:href|to|[A-Za-z]*[Hh]ref)\s*:\s*["'`](\/[^"'`{}\s#?]*)/g)) noteLink(m[1]); // object property
  for (const m of body.matchAll(/(?:push|replace)\(\s*["'`](\/[^"'`{}\s#?]*)/g)) noteLink(m[1]);            // router.push
}
const routeSet = new Set(routes.map((r) => r.route));
/*
 * A REDIRECT is supposed to have no inbound links — it exists so an old URL someone bookmarked
 * still resolves. Counting redirects as orphans reported four defects that were all correct
 * behaviour, and the remedy an orphan list invites is deletion.
 */
const orphans = routes
  .filter((r) => !r.dynamic && r.route !== "/" && !r.isRedirect && !linkTargets.has(r.route))
  .map((r) => r.route);
const deadLinks = [...linkTargets.keys()]
  .filter((t) => !routeSet.has(t) && !t.startsWith("/data/") && !t.startsWith("/brand/") && !t.startsWith("/api/") && !/\.[a-z]{2,4}$/.test(t))
  // A dynamic family covers its children, so /games/mlb/x is not dead because /games/[sport]/[slug] exists.
  .filter((t) => !routes.some((r) => r.dynamic && new RegExp("^" + r.route.replace(/\[[^\]]+\]/g, "[^/]+") + "$").test(t)));

// ── 3 · DESIGN-TOKEN DRIFT ──────────────────────────────────────────────────────────────────────
/*
 * The charter asks for a COUNT of drift, then a ratchet that only shrinks. Raw hex/rgb literals in
 * components are the measurable form: a component consuming a semantic token can be re-themed, and
 * one carrying #1A0E06 cannot.
 *
 * P185 — THE SCANNER WAS WRONG A THIRD TIME, in the same way it was wrong about routes. A flat
 * count of every hex in every .tsx ranked four files as the worst offenders. Checked against the
 * boundaries below, two of the four should never be migrated at all:
 *
 *   IDENTITY DATA is not drift. team-badge.tsx ranked #1 with 72 literals, of which 68 are the
 *   Yankees' navy and the Dodgers' blue. #003087 is a FACT ABOUT THE YANKEES, not a theme value.
 *   Migrating it to a semantic token destroys team identity — the migration the flat count invites
 *   is actively wrong, the same way the first orphan list invited deleting live routes.
 *
 *   ROUTE REACH decides what is worth migrating. dual-ladder-board.tsx (44) and
 *   bank-builder-preview-panel.tsx (35) are unreachable from any route: DualLadderBoard was
 *   deliberately removed from /bank-builder and a test asserts it stays removed. Migrating them
 *   lowers the number and changes nothing a user can see. The charter ranks by literal count x
 *   route reach x user visibility, so reach has to be measured, not assumed.
 *
 *   MASK STOPS are not colours. `mask-image: radial-gradient(..., #000 25%, transparent 80%)` uses
 *   #000 as an alpha stop. There is no theme in which that black should follow the brand.
 *
 * So the count is split three ways. All three are reported and ratcheted; none can be made to
 * disappear by moving a literal from one class to another, because the classes are all pinned.
 */
const componentFiles = walk(SRC, [".tsx"]);

/* Reachability: which files a route can actually pull in. Imports are followed from every route
   entrypoint. A component nobody can reach is not user-visible, whatever its literal count. */
const resolveImport = (from, spec) => {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
  else return null;
  for (const c of [base + ".tsx", base + ".ts", path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
    if (fs.existsSync(c)) return path.normalize(c);
  }
  return null;
};
const importGraph = new Map();
for (const f of allSource) {
  const body = stripComments(fs.readFileSync(f, "utf8"));
  const out = new Set();
  for (const m of body.matchAll(/from\s+["']([^"']+)["']/g)) { const r = resolveImport(f, m[1]); if (r) out.add(r); }
  for (const m of body.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) { const r = resolveImport(f, m[1]); if (r) out.add(r); }
  importGraph.set(path.normalize(f), out);
}
const routeRoots = allSource.filter((f) => /[\\/]app[\\/].*(page|layout|template|not-found|error)\.tsx$/.test(f)).map((f) => path.normalize(f));
const reachable = new Set();
{
  const stack = [...routeRoots];
  while (stack.length) {
    const f = stack.pop();
    if (reachable.has(f)) continue;
    reachable.add(f);
    for (const n of importGraph.get(f) ?? []) if (!reachable.has(n)) stack.push(n);
  }
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+\s*,/g;
/* A line that assigns a brand colour to a team/club key. The keys are the identity registry's own
   field names, so this cannot drift away from what the registry actually declares. */
const IDENTITY_LINE = /\b(primary|secondary|ink|bg|fg|border)\s*:\s*["'`]#/;
const MASK_LINE = /[Mm]ask[Ii]mage|mask-image/;
/*
 * ILLUSTRATION ART is not drift either — the fourth boundary, found the same way as the first
 * three. mr-dub-avatar.tsx is a first-party inline-SVG character mark: #f2d3a8 is a skin tone,
 * #3a2a1a is hair, #f4f6f8 is a lab coat. An SVG presentation attribute carrying a raw hex is a
 * DRAWING INSTRUCTION. Migrating it to a semantic token recolours the mascot — the same category of
 * wrong as theming the Yankees' navy. Art that should follow the theme uses currentColor or a var
 * already, so this rule does not capture it.
 */
const ART_ATTR = /(?:fill|stroke|stopColor|stop-color|flood-color|lighting-color)=["'`]#/;

let themeDrift = 0, identityData = 0, maskStops = 0, illustrationArt = 0, unreachableDrift = 0;
const rawColorByFile = [];
for (const f of componentFiles) {
  const body = stripComments(fs.readFileSync(f, "utf8"));
  let drift = 0, ident = 0, mask = 0, art = 0;
  for (const line of body.split("\n")) {
    const hits = (line.match(COLOR) ?? []).length;
    if (!hits) continue;
    if (IDENTITY_LINE.test(line)) ident += hits;
    else if (MASK_LINE.test(line)) mask += hits;
    else if (ART_ATTR.test(line)) art += hits;
    else drift += hits;
  }
  if (!(drift || ident || mask || art)) continue;
  const reach = reachable.has(path.normalize(f));
  themeDrift += drift; identityData += ident; maskStops += mask; illustrationArt += art;
  if (!reach) unreachableDrift += drift;
  rawColorByFile.push({ file: rel(f), rawColors: drift + ident + mask + art, themeDrift: drift, identityData: ident, maskStops: mask, illustrationArt: art, routeReachable: reach });
}
const rawColorHits = themeDrift + identityData + maskStops + illustrationArt;
rawColorByFile.sort((a, b) => b.themeDrift - a.themeDrift);
/* What migration should actually target, in the charter's own ranking: drift, on a live route. */
const migrationQueue = rawColorByFile.filter((r) => r.routeReachable && r.themeDrift > 0).slice(0, 20);

/** The semantic tokens that DO exist, from globals.css. */
const globals = (() => { try { return fs.readFileSync(path.join(SRC, "app", "globals.css"), "utf8"); } catch { return ""; } })();
const tokens = [...new Set([...globals.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((m) => m[1]))];

// ── 4 · COMPONENT CENSUS ────────────────────────────────────────────────────────────────────────
const components = walk(path.join(SRC, "components"), [".tsx"]).map((f) => {
  const name = path.basename(f, ".tsx");
  const body = stripComments(fs.readFileSync(f, "utf8"));
  // Call sites: how many files import it. A component with one call site is a candidate for
  // consolidation; one with many is canonical whether or not anyone declared it so.
  const importers = allTsx.filter((o) => o !== f && new RegExp(`from\\s+["'][^"']*${name}["']`).test(fs.readFileSync(o, "utf8"))).length;
  return { file: rel(f), name, importers, lines: body.split("\n").length, clientComponent: /^"use client"/m.test(fs.readFileSync(f, "utf8")) };
});

// ── 5 · MOTION CENSUS ───────────────────────────────────────────────────────────────────────────
const motionKeyframes = [...new Set([...globals.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))];
const reducedMotionBlocks = (globals.match(/prefers-reduced-motion/g) ?? []).length;
const animatedComponents = componentFiles.filter((f) => /animation:|transition:|@keyframes|animate-/.test(stripComments(fs.readFileSync(f, "utf8")))).length;

// ── 6 · WRITE ───────────────────────────────────────────────────────────────────────────────────
const baseline = {
  schemaVersion: 1,
  artifact: "uiux-baseline",
  program: "P184",
  dataClass: "PRIVATE_INTERNAL",
  generatedAt: NOW,
  routes: {
    total: routes.length,
    dynamic: routes.filter((r) => r.dynamic).length,
    exported: routes.filter((r) => r.exportedHtml).length,
    notExported: routes.filter((r) => !r.exportedHtml && !r.dynamic).map((r) => r.route),
    redirects: routes.filter((r) => r.isRedirect).map((r) => r.route),
    noindex: routes.filter((r) => r.noindex).map((r) => r.route),
    missingMetadata: routes.filter((r) => !r.hasMetadata && !r.isRedirect).map((r) => r.route),
    all: routes,
  },
  navigation: {
    sources: navSources.length,
    sourcesNotUsingSharedMetadata: navSources.filter((n) => !n.importsSharedNav && n.hardcodedHrefs > 2).map((n) => n.file),
    orphanRoutes: orphans,
    deadLinks,
    detail: navSources,
  },
  designSystem: {
    semanticTokensDeclared: tokens.length,
    rawColorLiterals: rawColorHits,
    filesWithRawColors: rawColorByFile.length,
    /* The three classes. Only themeDrift is migratable; the other two are pinned so a literal
       cannot be reclassified to make a ceiling fall. */
    themeDrift,
    identityData,
    maskStops,
    illustrationArt,
    themeDriftUnreachable: unreachableDrift,
    themeDriftReachable: themeDrift - unreachableDrift,
    migrationQueue,
    worstOffenders: rawColorByFile.slice(0, 15),
  },
  components: {
    total: components.length,
    singleCallSite: components.filter((c) => c.importers <= 1).length,
    clientComponents: components.filter((c) => c.clientComponent).length,
    all: components.sort((a, b) => b.importers - a.importers),
  },
  motion: {
    keyframes: motionKeyframes.length,
    keyframeNames: motionKeyframes,
    reducedMotionBlocks,
    componentsWithMotion: animatedComponents,
  },
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "baseline.json"), JSON.stringify(baseline, null, 1) + "\n");

console.log(`P184 baseline · ${NOW}`);
console.log(`  routes            ${baseline.routes.total} (${baseline.routes.dynamic} dynamic, ${baseline.routes.exported} exported, ${baseline.routes.redirects.length} redirects)`);
console.log(`  not exported      ${baseline.routes.notExported.length}${baseline.routes.notExported.length ? ": " + baseline.routes.notExported.slice(0, 6).join(", ") : ""}`);
console.log(`  nav sources       ${baseline.navigation.sources} (${baseline.navigation.sourcesNotUsingSharedMetadata.length} not on shared metadata)`);
console.log(`  orphan routes     ${orphans.length}${orphans.length ? ": " + orphans.slice(0, 8).join(", ") : ""}`);
console.log(`  dead links        ${deadLinks.length}${deadLinks.length ? ": " + deadLinks.slice(0, 8).join(", ") : ""}`);
console.log(`  semantic tokens   ${tokens.length}`);
console.log(`  raw colour hits   ${rawColorHits} across ${rawColorByFile.length} files`);
console.log(`    theme drift     ${themeDrift} (${themeDrift - unreachableDrift} on live routes, ${unreachableDrift} unreachable)`);
console.log(`    identity data   ${identityData} (team/club brand colours — NOT drift)`);
console.log(`    mask stops      ${maskStops} (alpha stops — NOT colours)`);
console.log(`    illustration    ${illustrationArt} (SVG art fills — NOT themeable)`);
console.log(`  components        ${components.length} (${baseline.components.singleCallSite} with <=1 call site)`);
console.log(`  motion            ${motionKeyframes.length} keyframes, ${reducedMotionBlocks} reduced-motion blocks, ${animatedComponents} components with motion`);
