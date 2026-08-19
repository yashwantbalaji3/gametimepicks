/**
 * OPERATOR VIEW OF THE UI/UX AUDIT — Program 185, Release I.
 *
 * The charter asks the console to "render the UI/UX route matrix, drift counts, migration progress
 * and screenshots/evidence references here so an operator can understand remaining work without
 * reading code or handoff prose". That is the whole contract of this file, and it is the reason it
 * DERIVES rather than describes: every number comes from data/internal/uiux/baseline.json, which is
 * emitted by scripts/uiux/baseline.mjs and committed alongside the migration that moved it.
 *
 * A hand-typed percentage on an operator console is worse than no console — it is the same drift
 * the audit exists to measure, wearing a dashboard's clothes. So nothing here is written down: if
 * the artifact is missing the section says so and renders no figures, which is the honest answer
 * when the evidence is absent.
 *
 * PRIVATE. Read only by /launch, which is host-protected, noindex/no-store and pruned from the
 * public export.
 */
import fs from "node:fs";
import path from "node:path";

/** The committed artifact, or null. Never a fabricated shape. */
export function readUiuxBaseline(repoRoot = path.join(process.cwd(), "..")) {
  const f = path.join(repoRoot, "data", "internal", "uiux", "baseline.json");
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    return raw && raw.artifact === "uiux-baseline" ? raw : null;
  } catch {
    return null;                                   // absent or unreadable → the caller says so
  }
}

/**
 * The P184 measurement this programme started from. Held here as the ONLY hard-coded numbers in the
 * file, because a delta needs a fixed origin and that origin is a historical fact rather than a
 * current claim. Every "now" figure beside them is read from the artifact.
 */
export const P184_BASELINE = Object.freeze({
  rawColorLiterals: 1616, filesWithRawColors: 266, semanticTokensDeclared: 143, deadLinks: 1,
  measuredAt: "2026-08-18", commit: "eeff42d61",
});

/** Operator view: counts, deltas, and what is left — all derived. */
export function buildUiuxEvidence(baseline = readUiuxBaseline()) {
  /* ONE shape, always. A union return would make every consumer narrow before reading a figure,
     and the first consumer that forgets is how a dashboard starts rendering `undefined`. */
  const EMPTY = {
    available: false,
    note: "data/internal/uiux/baseline.json is missing or unreadable. Run `node app/scripts/uiux/baseline.mjs` and commit the artifact — no figures are shown rather than guessed.",
    generatedAt: null,
    literals: { baseline: P184_BASELINE.rawColorLiterals, now: null, removed: null, pctRemoved: null, files: null, tokens: null, tokensAdded: null },
    classes: [],
    routeMatrix: { total: null, exported: null, redirects: 0, internalPruned: 0, internalRoutes: [], deadLinks: 0, deadLinkTargets: [], orphans: 0, navSources: null, navOffContract: 0 },
    queue: [],
    motion: { keyframes: null, componentsWithMotion: null, reducedMotionBlocks: null },
    components: { total: null, singleCallSite: null },
    evidenceRefs: [],
  };
  if (!baseline) return EMPTY;
  const ds = baseline.designSystem ?? {};
  const routes = baseline.routes ?? {};
  const nav = baseline.navigation ?? {};

  /* The split matters more than the total. Only themeDrift is migratable, and only the reachable
     half of it is worth an operator's attention — the rest is either a team's own brand colour, a
     mask alpha stop, character art, or a component no route can reach. */
  const classes = [
    { key: "themeDriftReachable", label: "Theme drift · on live routes", value: ds.themeDriftReachable, action: "MIGRATE" },
    { key: "themeDriftUnreachable", label: "Theme drift · unreachable components", value: ds.themeDriftUnreachable, action: "ADJUDICATE — retire or rewire, not recolour" },
    { key: "identityData", label: "Identity data (team/club colours)", value: ds.identityData, action: "NEVER MIGRATE" },
    { key: "maskStops", label: "Mask alpha stops", value: ds.maskStops, action: "NOT A COLOUR" },
    { key: "illustrationArt", label: "Illustration art (SVG fills)", value: ds.illustrationArt, action: "NOT THEMEABLE" },
  ].filter((c) => typeof c.value === "number");

  const now = ds.rawColorLiterals;
  const removed = typeof now === "number" ? P184_BASELINE.rawColorLiterals - now : null;

  return {
    ...EMPTY,
    available: true,
    note: null,
    generatedAt: baseline.generatedAt ?? null,
    literals: {
      baseline: P184_BASELINE.rawColorLiterals,
      now,
      removed,
      pctRemoved: removed != null && P184_BASELINE.rawColorLiterals > 0
        ? Math.round((removed / P184_BASELINE.rawColorLiterals) * 1000) / 10
        : null,
      files: ds.filesWithRawColors ?? null,
      tokens: ds.semanticTokensDeclared ?? null,
      tokensAdded: typeof ds.semanticTokensDeclared === "number"
        ? ds.semanticTokensDeclared - P184_BASELINE.semanticTokensDeclared : null,
    },
    classes,
    routeMatrix: {
      total: routes.total ?? null,
      exported: routes.exported ?? null,
      redirects: (routes.redirects ?? []).length,
      internalPruned: (routes.notExported ?? []).length,
      internalRoutes: routes.notExported ?? [],
      deadLinks: (nav.deadLinks ?? []).length,
      deadLinkTargets: nav.deadLinks ?? [],
      orphans: (nav.orphanRoutes ?? []).length,
      navSources: nav.sources ?? null,
      navOffContract: (nav.sourcesNotUsingSharedMetadata ?? []).length,
    },
    /* The ranked remaining work, already filtered to reachable files by the scanner. */
    queue: (ds.migrationQueue ?? []).slice(0, 10).map((r) => ({ file: r.file, drift: r.themeDrift })),
    motion: {
      keyframes: baseline.motion?.keyframes ?? null,
      componentsWithMotion: baseline.motion?.componentsWithMotion ?? null,
      reducedMotionBlocks: baseline.motion?.reducedMotionBlocks ?? null,
    },
    components: {
      total: baseline.components?.total ?? null,
      singleCallSite: baseline.components?.singleCallSite ?? null,
    },
    /* Where the narrative evidence lives. Referenced, never inlined — the console shows figures, the
       artifact carries the reasoning. */
    evidenceRefs: [
      "data/internal/uiux/P185-RELEASE-B.md — per-release audit, findings and open items",
      "app/scripts/uiux/baseline.mjs — the scanner every figure above is emitted by",
      "app/src/lib/uiux/token-ratchet.test.mjs — the shrink-only ceilings, pinned per class",
      "app/e2e/p185-shell.spec.ts, p185-product-viewports.spec.ts, p185-color-mix.spec.ts — viewport and engine guards",
    ],
  };
}
