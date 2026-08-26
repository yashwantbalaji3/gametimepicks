/**
 * TOKEN EXCEPTION REGISTRY (P210 · Release A) — the complete, machine-readable account of every
 * colour literal that remains in source after the F8 migration. The guard
 * (token-exception-registry.test.mjs) rescans source with the shared scanner and fails if a
 * literal appears in a file this registry does not cover, or a covered file exceeds its pinned
 * maximum. Maxima are SHRINK-ONLY: lower them with the migration that earns it; never raise one.
 *
 * Every entry carries owner, rationale and the condition under which it is removed. A broad
 * allowlist is not closure — files are listed individually.
 */

export const TOKEN_EXCEPTIONS = Object.freeze([
  {
    id: "token-definitions",
    owner: "design-system",
    rationale: "globals.css is where the semantic tokens are DEFINED — literals live here so components never need them.",
    removal: "never (this is the source of truth)",
    files: { "src/app/globals.css": 628 },
  },
  {
    id: "identity-data",
    owner: "sport-operations",
    rationale: "Team/club brand colours are identity DATA, not theme drift (P207 contract). Re-theming them would misrepresent real organisations.",
    removal: "never (identity by contract)",
    files: { "src/components/team-badge.tsx": 68, "src/components/cricket-team-badge.tsx": 21 },
  },
  {
    id: "sport-accent-palette",
    owner: "design-system",
    rationale: "The per-sport accent/gradient source getSportIdentity derives from — sport personality data the theme registry reads.",
    removal: "fold into semantic sport tokens when the sport-theme registry absorbs gradients",
    files: { "src/lib/sport-identity.ts": 15 },
  },
  {
    id: "illustration-art",
    owner: "design-system",
    rationale: "Hand-drawn SVG portrait/art fills (skin, fabric, metal) — not themeable surfaces.",
    removal: "never while the artwork ships",
    files: { "src/components/mr-dub/mr-dub-avatar.tsx": 5 },
  },
  {
    id: "chart-series",
    owner: "design-system",
    rationale: "Data-visualization series/ramp colours, some with runtime-computed alpha — series distinction is the point.",
    removal: "adopt a chart-palette token set with the next chart redesign",
    files: {
      "src/components/mr-dub/flagship/analytics-charts.tsx": 4,
      "src/components/mr-dub/master-ledger-section.tsx": 4,
      "src/components/game/probability-bar.tsx": 2,
      "src/lib/mlb/confidence.ts": 2,
      "src/components/risk-section-spread.tsx": 1,
      "src/lib/products/registry.ts": 1,
    },
  },
  {
    id: "wc-archive-palette",
    owner: "product",
    rationale: "Archived 2026 World Cup surfaces keep their era's palette; the competition is complete and its pages are historical evidence.",
    removal: "when the WC archive surfaces retire",
    files: {
      "src/components/bank-builder/world-cup-flex-card.tsx": 8,
      "src/components/game/soccer-simulation-report-v2.tsx": 2,
      "src/components/world-cup/game-script-card.tsx": 2,
      "src/components/game/wc-simulation-result-summary.tsx": 1,
      "src/components/world-cup/knockout-pick-board.tsx": 1,
      "src/components/specials/world-cup-specials-tracker.tsx": 1,
      "src/components/game/report-v2-shell.tsx": 1,
    },
  },
  {
    id: "internal-console",
    owner: "operations",
    rationale: "Operator-only surfaces (pruned from the public export) with trading-ledger reds/ambers.",
    removal: "map when the console gets its own token pass",
    files: { "src/app/launch/page.tsx": 1, "src/app/ops/adoption-panel.tsx": 1, "src/components/launch/board-filters.tsx": 2 },
  },
  {
    id: "component-local-tints",
    owner: "design-system",
    rationale: "Single-component status washes and one-off accents pending semantic promotion; each maps to a token the next time its component is redesigned.",
    removal: "shrink to zero as components are touched (shrink-only maxima enforce the direction)",
    files: {
      "src/components/parlays/bank-builder-preview-panel.tsx": 6,
      "src/components/date-status-header.tsx": 5,
      "src/components/sport-overview-hero.tsx": 4,
      "src/components/custom-parlay-grade-card.tsx": 3,
      "src/components/bank-builder/cross-lane-correlation-badge.tsx": 2,
      "src/components/mlb/props-board.tsx": 2,
      "src/components/specials/daily-specials-section.tsx": 2,
      "src/app/methodology/page.tsx": 1,
      "src/components/home/event-spotlight.tsx": 1,
      "src/components/mlb/mlb-quick-jump.tsx": 1,
      "src/components/mr-dub/flagship/flagship-dashboard.tsx": 1,
      "src/components/mr-dub/ledger-calendar.tsx": 1,
      "src/components/no-games-today.tsx": 1,
      "src/components/odds-ticker-rail.tsx": 1,
      "src/components/player-avatar.tsx": 1,
      "src/components/power-board-shell.tsx": 1,
      "src/components/projections-experience.tsx": 1,
      "src/components/simulation-coverage-matrix.tsx": 1,
      "src/components/today/status-modules.tsx": 1,
      "src/components/ui/team-mark.tsx": 1,
    },
  },
]);

/** file → max, flattened for the guard. */
export function exceptionCeilings() {
  const out = new Map();
  for (const e of TOKEN_EXCEPTIONS) for (const [f, max] of Object.entries(e.files)) out.set(f, { max, entry: e.id });
  return out;
}
