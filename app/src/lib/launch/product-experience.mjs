/**
 * PRODUCT EXPERIENCE evidence (P208 · Release I) — the operator's view of the public IA and the
 * P208 program state, DERIVED from the owners:
 *
 *   · the nav contract from src/lib/navigation.ts (the same list every surface renders — /launch
 *     must never hand-keep a second information architecture);
 *   · findings + journeys from the committed Phase-0 artifact (data/internal/uiux/p208-findings.json),
 *     including per-finding resolution stamps once releases close them;
 *   · payload budgets from the one budgets module the page-weight guard enforces;
 *   · screenshot sets by listing data/internal/uiux/p208-*.
 *
 * Server-only; fail-closed (absent artifact → available:false with the reason, never a guess).
 */
import fs from "node:fs";
import path from "node:path";
import { NAV_DESTINATIONS, destinationsFor } from "../navigation.ts";
import { BUDGET_KB } from "../uiux/page-weight-budgets.mjs";

const REPO = () => path.join(process.cwd(), "..");

export function readP208Findings(repoRoot = REPO()) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "internal", "uiux", "p208-findings.json"), "utf8"));
    return raw && raw.program === 208 ? raw : null;
  } catch {
    return null;
  }
}

export function buildProductExperience(findings = readP208Findings()) {
  const primaries = NAV_DESTINATIONS.filter((d) => d.group === "now").map((d) => ({
    label: d.label, href: d.href, surfaces: d.surfaces.length,
  }));
  const surfaces = ["top", "rail", "mobile", "footer"].map((s) => ({
    surface: s, destinations: destinationsFor(s).length,
  }));
  const screenshotSets = (() => {
    try {
      return fs.readdirSync(path.join(REPO(), "data", "internal", "uiux"))
        .filter((n) => n.startsWith("p208-")).sort();
    } catch {
      return [];
    }
  })();
  const sev = (s) => (findings?.findings ?? []).filter((f) => f.sev.startsWith(s));
  return {
    available: findings != null,
    note: findings == null ? "data/internal/uiux/p208-findings.json missing/unreadable — no figures are shown rather than guessed." : null,
    primaries,
    surfaces,
    findings: (findings?.findings ?? []).map((f) => ({
      id: f.id, sev: f.sev, surface: f.surface, resolvedBy: f.resolvedBy ?? null,
      finding: String(f.finding).slice(0, 140),
    })),
    open: {
      p0: sev("P0").filter((f) => !f.resolvedBy).length,
      p1: sev("P1").filter((f) => !f.resolvedBy).length,
      p2: sev("P2").filter((f) => !f.resolvedBy).length,
    },
    journeys: findings?.journeys ?? [],
    budgets: Object.entries(BUDGET_KB).map(([route, kb]) => ({ route, kb })),
    screenshotSets,
  };
}
