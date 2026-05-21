"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Unified sport section sub-nav. One component, one visual rhythm, for
 * NBA, MLB, NHL and IPL. Replaces the four per-sport tab files so the
 * "Overview · Model Board · Power Board · Parlays · Results" pattern
 * is identical across sports.
 *
 * Each sport gets its own /<sport>/* prefix. Legacy NBA URLs (/board,
 * /parlay-lab) keep their "active" highlight thanks to the legacyHrefs
 * list, so bookmarks don't break.
 */
export type SportKey = "nba" | "mlb" | "nhl" | "ipl";

const SPORT_LABEL: Record<SportKey, string> = {
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ipl: "IPL",
};

const LEGACY_HREFS: Partial<Record<SportKey, Partial<Record<string, string[]>>>> = {
  nba: {
    "/nba/board": ["/board"],
    "/nba/parlays": ["/parlay-lab"],
  },
};

interface TabSpec {
  slug: "" | "board" | "power" | "parlays" | "results";
  label: string;
  /** When true, matches the exact pathname (used for the Overview tab
   *  so /<sport> doesn't also light up when on /<sport>/board). */
  exact?: boolean;
}

// Results was removed from sport subtabs (May 18 navigation refactor).
// All model-audit content now lives at the centralized /results hub
// scoped via /results/<sport> and /results/date/<date>. Sport overview
// pages still surface a small audit CTA so users can jump to their
// sport's audit, but the per-sport "Results" subtab is gone.
const TABS: TabSpec[] = [
  { slug: "", label: "Overview", exact: true },
  { slug: "board", label: "Model Board" },
  { slug: "power", label: "Power Board" },
  { slug: "parlays", label: "Parlays" },
];

/**
 * NOTE — May 21 simplification (PR #74):
 *   The legacy per-sport sub-tab strip ("Overview · Model Board ·
 *   Power Board · Parlays") has been removed from the visible UI.
 *   It made every sport page feel like an internal dashboard, and
 *   the primary global nav (Home · Projections · Parlay Lab · Results
 *   · About) covers every destination users actually need.
 *
 *   The component intentionally renders nothing now. The export +
 *   `sport` prop are preserved so the 21 existing import sites
 *   compile without churn — a follow-up PR can clean those imports
 *   when we touch each page for other reasons.
 *
 *   Legacy URLs (/nba/board, /nba/power, /nba/parlays, etc.) keep
 *   working — they're just no longer surfaced via the in-page tab
 *   strip.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SportSectionTabs(_props: { sport: SportKey }) {
  return null;
}

// Legacy variables kept module-local so the original implementation
// can be restored if needed without bringing back the imports.
void SPORT_LABEL;
void LEGACY_HREFS;
void TABS;
void Link;
void usePathname;
