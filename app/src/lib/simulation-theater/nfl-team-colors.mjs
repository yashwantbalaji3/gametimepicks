/**
 * NFL TEAM COLOUR MAP (32 teams) for Simulation Theater V2 — PROPOSAL, NOT VALIDATED (founder decision D3).
 *
 * Values are copied from SIMULATION_THEATER_V2_ST01_REVIEW_AND_DECISIONS_2026-10-18.md §4 (= spec Appendix A).
 * Sources, accessed 2026-10-18: primary and secondary hex from teamcolorcodes.com's NFL page
 * (https://teamcolorcodes.com/nfl-team-color-codes/), cross-checked against Wikipedia `Module:Gridiron color/data`.
 * Review deviations kept: DAL secondary is silver (not navy), TB secondary pewter #34302B.
 * Per-team validation (iterations 3–4): nfl-team-colors-validation.mjs (kept out of this module so the island's bundle
 * never ships it). It records, per team, every source, the access date, official, agree and validated; it paints nothing.
 * Iteration 4 (2026-10-18) checked the 13 teams the two references disagreed on against OFFICIAL sources (NFL.com team
 * page header colours, the league-hosted club logo's fills, and the club's own site where it carries a value; no brand
 * guide PDF was reachable) and changed BAL CHI DAL HOU JAX LAR NO PIT TB TEN (SRC_OFF rows; before → after and the
 * evidence are in COLOR_CHANGES and each team's note). TEN reflects the March 2026 rebrand (Titans blue primary).
 *
 * WHILE TEAM_COLORS_VALIDATED IS FALSE THE THEATER RENDERS NEUTRAL GTP TOKENS. The only way to see these colours is a
 * clearly labelled, dev-only "preview team colours (unvalidated)" toggle on the unlinked development route.
 *
 * No logos, wordmarks, helmets or uniform art: abbreviations plus colours only. Keys are `nfl:<ABBR>` so no NBA or MLB
 * abbreviation in components/team-badge.tsx (10 collide: DEN MIN MIA DAL PHI IND CLE SEA HOU ATL) can ever match.
 * Colour literals here are identity DATA (token-exception-registry.mjs "identity-data"), never theme values.
 */

import { THEATER_TURF_MIX, turfHexes, turfSafeAccent } from "./field-geometry.mjs";

export const TEAM_COLORS_VALIDATED = false;

export const TEAM_COLOR_SOURCES = Object.freeze([
  { name: "teamcolorcodes.com — NFL team color codes", url: "https://teamcolorcodes.com/nfl-team-color-codes/", accessed: "2026-10-18", use: "primary and secondary" },
  { name: "Wikipedia — Module:Gridiron color/data", url: "https://en.wikipedia.org/wiki/Module:Gridiron_color/data", accessed: "2026-10-18", use: "cross-check" },
  { name: "NFL.com team pages (profile-header colours) and league-hosted club logo SVG fills", url: "https://www.nfl.com/teams/", accessed: "2026-10-18", use: "official check; source of the iteration-4 changes" },
  { name: "Club official websites (BAL, CAR, CHI, HOU, TB, TEN pages named in the validation rows)", url: "nfl-team-colors-validation.mjs", accessed: "2026-10-18", use: "official check where the club site carries a value" },
  { name: "GTP Simulation Theater ST-01 review §4", url: "docs/research/SIMULATION_THEATER_V2_ST01_REVIEW_AND_DECISIONS_2026-10-18.md", accessed: "2026-10-18", use: "ink and accent choice, DAL/TB deviations" },
]);

const WHITE = "#FFFFFF";
const DARK = "#0A0705";
const SRC = "teamcolorcodes.com (2026-10-18), cross-checked Wikipedia Module:Gridiron color/data";
const SRC_OFF = "official: NFL.com team page + league-hosted club logo, club site where noted (2026-10-18); replaces the teamcolorcodes.com value";

/** [abbr, primary, secondary, ink ("white" | "dark"), accent, source] — Appendix A row for row, SRC_OFF rows revised. */
const ROWS = [
  ["ARI", "#97233F", "#000000", "white", "#FFB612", SRC],
  ["ATL", "#A71930", "#000000", "white", "#A5ACAF", SRC],
  ["BAL", "#24135F", "#000000", "white", "#9E7C0C", SRC_OFF],
  ["BUF", "#00338D", "#C60C30", "white", "#C60C30", SRC],
  ["CAR", "#0085CA", "#101820", "dark", "#0085CA", SRC],
  ["CHI", "#0B162A", "#E64100", "white", "#E64100", SRC_OFF],
  ["CIN", "#FB4F14", "#000000", "dark", "#FB4F14", SRC],
  ["CLE", "#311D00", "#FF3C00", "white", "#FF3C00", SRC],
  ["DAL", "#002244", "#B0B7BC", "white", "#B0B7BC", SRC_OFF],
  ["DEN", "#FB4F14", "#002244", "dark", "#FB4F14", SRC],
  ["DET", "#0076B6", "#B0B7BC", "white", "#0076B6", SRC],
  ["GB", "#203731", "#FFB612", "white", "#FFB612", SRC],
  ["HOU", "#021018", "#EB0028", "white", "#FFFFFF", SRC_OFF],
  ["IND", "#002C5F", "#A2AAAD", "white", "#A2AAAD", SRC],
  ["JAX", "#000000", "#D7A22A", "white", "#D7A22A", SRC_OFF],
  ["KC", "#E31837", "#FFB81C", "white", "#E31837", SRC],
  ["LAC", "#0080C6", "#FFC20E", "dark", "#0080C6", SRC],
  ["LAR", "#003594", "#FFD100", "white", "#FFD100", SRC_OFF],
  ["LV", "#000000", "#A5ACAF", "white", "#A5ACAF", SRC],
  ["MIA", "#008E97", "#FC4C02", "dark", "#008E97", SRC],
  ["MIN", "#4F2683", "#FFC62F", "white", "#FFC62F", SRC],
  ["NE", "#002244", "#C60C30", "white", "#C60C30", SRC],
  ["NO", "#D3BC8D", "#000000", "dark", "#D3BC8D", SRC_OFF],
  ["NYG", "#0B2265", "#A71930", "white", "#A5ACAF", SRC],
  ["NYJ", "#125740", "#000000", "white", "#FFFFFF", SRC],
  ["PHI", "#004C54", "#A5ACAF", "white", "#A5ACAF", SRC],
  ["PIT", "#FFB612", "#000000", "dark", "#FFB612", SRC_OFF],
  ["SEA", "#002244", "#69BE28", "white", "#69BE28", SRC],
  ["SF", "#AA0000", "#B3995D", "white", "#B3995D", SRC],
  ["TB", "#A71930", "#34302B", "white", "#D50A0A", SRC_OFF],
  ["TEN", "#4495D2", "#D50A0A", "dark", "#4495D2", SRC_OFF],
  ["WSH", "#5A1414", "#FFB612", "white", "#FFB612", SRC],
];

/** `nfl:<ABBR>` → { abbr, primary, secondary, ink, accent, source }. */
export const NFL_TEAM_COLORS = Object.freeze(Object.fromEntries(ROWS.map(([abbr, primary, secondary, ink, accent, source]) => [
  `nfl:${abbr}`,
  Object.freeze({ abbr, primary, secondary, ink: ink === "white" ? WHITE : DARK, inkName: ink, accent, source }),
])));

export const nflTeamColor = (abbr) => NFL_TEAM_COLORS[`nfl:${String(abbr ?? "").toUpperCase()}`] ?? null;

// ── colour maths (WCAG 2.x contrast; CIE76 ΔE in CIELAB, D65) ─────────────────────────────────────────────────────
const hexRgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function relLuminance(hex) {
  const [r, g, b] = hexRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
export function hexToLab(hex) {
  const [r, g, b] = hexRgb(hex).map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.0;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function deltaE76(a, b) {
  const [l1, a1, b1] = hexToLab(a);
  const [l2, a2, b2] = hexToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
/** Spec §2.5 (S7): two colours collide when CIE76 ΔE < 20. */
export const COLLISION_DELTA_E = 20;
export const collides = (a, b) => deltaE76(a, b) < COLLISION_DELTA_E;

/** Neutral GTP tokens used while TEAM_COLORS_VALIDATED is false (and for unknown teams). */
export const NEUTRAL_PALETTE = Object.freeze({
  home: Object.freeze({ fill: "var(--sport-nfl)", ink: "var(--bg)", accent: "var(--sport-nfl)", hatched: false }),
  away: Object.freeze({ fill: "var(--lava-text-muted)", ink: "var(--bg)", accent: "var(--lava-text-muted)", hatched: false }),
});

/**
 * The palette the theater paints with.
 *   - unvalidated map and no explicit dev preview → NEUTRAL_PALETTE, mode "neutral"
 *   - preview (dev toggle) or validated → team colours, with the collision rule: if the primaries collide the away team
 *     uses its secondary; if that also collides with the home primary, the away end zone is hatched
 *   - an unknown team falls back to its neutral token
 */
export function theaterPalette(homeAbbr, awayAbbr, { previewUnvalidated = false } = {}) {
  if (!TEAM_COLORS_VALIDATED && !previewUnvalidated) return { mode: "neutral", validated: false, ...NEUTRAL_PALETTE };
  const h = nflTeamColor(homeAbbr);
  const a = nflTeamColor(awayAbbr);
  const home = h ? { fill: h.primary, ink: h.ink, accent: h.accent, hatched: false } : NEUTRAL_PALETTE.home;
  let away = a ? { fill: a.primary, ink: a.ink, accent: a.accent, hatched: false } : NEUTRAL_PALETTE.away;
  if (h && a && collides(h.primary, a.primary)) {
    const ink = contrastRatio(WHITE, a.secondary) >= contrastRatio(DARK, a.secondary) ? WHITE : DARK;
    away = collides(h.primary, a.secondary)
      ? { ...away, hatched: true }
      : { fill: a.secondary, ink, accent: a.accent, hatched: false };
  }
  // Accents paint ON THE TURF (ribbon, end-zone edge, timeline): each must reach 3:1 against both turf stripes (S6).
  // An accent below that is replaced by its first 5 % step toward white that reaches it; `accentBase` keeps the
  // original so the dev bar can say which accents were derived.
  const turf = turfHexes(THEATER_TURF_MIX);
  const safe = (p) => {
    if (!p.accent.startsWith("#")) return p;
    const r = turfSafeAccent(p.accent, turf, contrastRatio);
    return r.derived ? { ...p, accent: r.accent, accentBase: r.base } : p;
  };
  return { mode: TEAM_COLORS_VALIDATED ? "team" : "team-unvalidated", validated: TEAM_COLORS_VALIDATED, home: safe(home), away: safe(away) };
}
