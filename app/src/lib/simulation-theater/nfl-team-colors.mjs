/**
 * NFL TEAM COLOUR MAP (32 teams) for Simulation Theater V2 — dev prototype only (founder decision D3, approved for the
 * local prototype 2026-10-18). The theater is mounted only on the unlinked, noindex development route, which a build
 * emits only with GTP_DEV_ROUTES=1, so nothing here reaches Production.
 *
 * EVIDENCE lives OUT of runtime code, in nfl-team-colors-evidence.json beside this file (data, never imported by a
 * component): every source with its access date, the hex values observed on each, the role decision per team (primary,
 * secondary, accent: each a value an OFFICIAL source lists verbatim — the NFL.com team-page header, the league-hosted
 * club logo, or the club's own site), every change against the previous map and every derived on-field accent.
 * dev-route-colors.test.mjs recomputes all of it from that file.
 *
 * ROLES. primary = the team's primary brand colour (score bug block, end zone); secondary = the main contrasting brand
 * colour (the away team's block and end zone when the two primaries collide); accent = the official colour that carries
 * the team on the field (drive ribbon, timeline fills, scoring flash, winner outline, break-card rule). `p` / `s` in the
 * accent column mean "the same value as the primary / secondary". ink = the text colour on the primary (≥4.5:1).
 * ONE IDENTITY (founder, 2026-10-18): the accent is the PRIMARY, so a team reads as one colour on the score bug, the
 * field and the timeline, except where a founder role decision names another official colour (JAX gold, NO and PIT
 * gold, TEN red, TB's official red) or the primary cannot be told from the field surfaces (fieldDistinct: CIEDE2000
 * ΔE00 < FIELD_DISTINCT_DE00 against a turf stripe or the timeline panel: the greens GB, NYJ, PHI and the near-blacks
 * CHI, CLE, HOU, LV), where it is the secondary.
 * CONTRAST BY TREATMENT, NOT BY HUE: the official value is painted as is (no lightened or substituted colour), and every
 * team mark on the field and the timeline carries a light KEYLINE (--st-keyline, ≥3:1 on every field surface, tested),
 * the boundary WCAG 1.4.11 measures. The possession tag is a miniature score-bug block (fill, ink, keyline).
 *
 * No logos, wordmarks, helmets or uniform art: abbreviations plus colours only. Keys are `nfl:<ABBR>` so no NBA or MLB
 * abbreviation in components/team-badge.tsx (10 collide: DEN MIN MIA DAL PHI IND CLE SEA HOU ATL) can ever match.
 * Colour literals here are identity DATA (token-exception-registry.mjs "identity-data"), never theme values.
 */

import { fieldSurfaces } from "./field-geometry.mjs";

/** true since 2026-10-18: every role value is listed verbatim by an official source (nfl-team-colors-evidence.json). */
export const TEAM_COLORS_VALIDATED = true;

/** Where the evidence for every value below is recorded (read by the tests, never by a component). */
export const TEAM_COLOR_EVIDENCE = "src/lib/simulation-theater/nfl-team-colors-evidence.json";

const WHITE = "#FFFFFF";
const DARK = "#0A0705";

/** [abbr, primary, secondary, ink ("white" | "dark"), accent (hex, or "p" / "s"), alternate on-field colour (optional)] */
const ROWS = [
  ["ARI", "#97233F", "#000000", "white", "p"],
  ["ATL", "#A71930", "#000000", "white", "p"],
  ["BAL", "#24135F", "#000000", "white", "p"],
  ["BUF", "#00338D", "#C60C30", "white", "p"],
  ["CAR", "#0085CA", "#101820", "dark", "p"],
  ["CHI", "#0B162A", "#E64100", "white", "s"],
  ["CIN", "#FB4F14", "#000000", "dark", "p"],
  ["CLE", "#311D00", "#FF3C00", "white", "s"],
  ["DAL", "#002244", "#B0B7BC", "white", "p"],
  ["DEN", "#FC4C02", "#0A2343", "dark", "p"],
  ["DET", "#0076B6", "#B0B7BC", "white", "p"],
  ["GB", "#203731", "#FFB612", "white", "s"],
  ["HOU", "#021018", "#EB0028", "white", "s", "#0080C6"],
  ["IND", "#013369", "#A5ACAF", "white", "p"],
  ["JAX", "#006778", "#000000", "white", "#D7A22A"],
  ["KC", "#E31837", "#FFB612", "white", "p"],
  ["LAC", "#0080C6", "#FFC20E", "dark", "p"],
  ["LAR", "#003594", "#FFD100", "white", "p"],
  ["LV", "#000000", "#A5ACAF", "white", "s"],
  ["MIA", "#008E97", "#FC4C02", "dark", "p"],
  ["MIN", "#4F2683", "#FFC62F", "white", "p"],
  ["NE", "#002244", "#C60C30", "white", "p"],
  ["NO", "#000000", "#D3BC8D", "white", "s"],
  ["NYG", "#0B2265", "#A71930", "white", "p"],
  ["NYJ", "#115740", "#B1B3B6", "white", "s"],
  ["PHI", "#004851", "#A2AAAD", "white", "s"],
  ["PIT", "#000000", "#FFB612", "white", "s"],
  ["SEA", "#002244", "#69BE28", "white", "p"],
  ["SF", "#AA0000", "#B3995D", "white", "p"],
  ["TB", "#A71930", "#322F2B", "white", "#C2242B"],
  ["TEN", "#4495D2", "#001532", "dark", "#D50A0A"],
  ["WSH", "#5A1414", "#FFB612", "white", "p"],
];

/** `nfl:<ABBR>` → { abbr, primary, secondary, accent, alt, ink, inkName }. `alt`: official alternates for an accent clash. */
export const NFL_TEAM_COLORS = Object.freeze(Object.fromEntries(ROWS.map(([abbr, primary, secondary, ink, accent, alt]) => [
  `nfl:${abbr}`,
  Object.freeze({
    abbr, primary, secondary, accent: accent === "p" ? primary : accent === "s" ? secondary : accent,
    alt: Object.freeze(alt ? [alt] : []),
    ink: ink === "white" ? WHITE : DARK, inkName: ink,
  }),
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
/** CIEDE2000 (ΔE00): CIE76 overstates differences between very dark colours, so field legibility uses this. */
export function deltaE2000(x, y) {
  const [L1, a1, b1] = hexToLab(x);
  const [L2, a2, b2] = hexToLab(y);
  const rad = Math.PI / 180;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const [p1, p2] = [[a1 * (1 + G), b1], [a2 * (1 + G), b2]];
  const [C1, C2] = [Math.hypot(...p1), Math.hypot(...p2)];
  const [h1, h2] = [p1, p2].map(([a, b]) => (Math.atan2(b, a) / rad + 360) % 360);
  let dh = C1 * C2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh * rad) / 2);
  const Lm = (L1 + L2) / 2, Cpm = (C1 + C2) / 2;
  let hm = h1 + h2;
  if (C1 * C2 !== 0) hm = (Math.abs(h1 - h2) > 180 ? hm + (hm < 360 ? 360 : -360) : hm) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -Math.sin(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad) * 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const [dL, dC] = [(L2 - L1) / SL, (C2 - C1) / SC];
  return Math.sqrt(dL ** 2 + dC ** 2 + (dH / SH) ** 2 + RT * dC * (dH / SH));
}
/** A colour can carry a team on the field when ΔE00 ≥ this against both turf stripes and the timeline panel. */
export const FIELD_DISTINCT_DE00 = 20;
export const fieldDistinct = (hex) => {
  const f = fieldSurfaces();
  return [...f.turf, f.panel].every((bg) => deltaE2000(hex, bg) >= FIELD_DISTINCT_DE00);
};

/** Spec §2.5 (S7): two colours collide when CIE76 ΔE < 20. */
export const COLLISION_DELTA_E = 20;
export const collides = (a, b) => deltaE76(a, b) < COLLISION_DELTA_E;

/** Thresholds the palette guarantees (WCAG 2.x): text on a team block, and the keyline around every team mark. */
export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

/** Neutral GTP tokens (the dev bar's "Neutral colours" switch, and any unknown team). */
export const NEUTRAL_PALETTE = Object.freeze({
  home: Object.freeze({ fill: "var(--sport-nfl)", ink: "var(--bg)", trim: "var(--bg)", accent: "var(--sport-nfl)", accentInk: "var(--bg)", hatched: false }),
  away: Object.freeze({ fill: "var(--lava-text-muted)", ink: "var(--bg)", trim: "var(--bg)", accent: "var(--lava-text-muted)", accentInk: "var(--bg)", hatched: false }),
});

/** White or the page-dark ink, whichever reads better on `fill`. */
export const bestInk = (fill) => (contrastRatio(WHITE, fill) >= contrastRatio(DARK, fill) ? WHITE : DARK);

/**
 * The trim on a team block (score bug bar, end-zone lettering): the first official colour of the team that reaches
 * TEXT_MIN on the block's fill, in the order accent → secondary → primary; otherwise the block's ink. So the Saints and
 * Steelers carry gold on black, the Titans navy on Titans blue.
 */
export function blockTrim(team, fill, ink) {
  return [team.accent, team.secondary, team.primary].find((c) => c !== fill && contrastRatio(c, fill) >= TEXT_MIN) ?? ink;
}

/**
 * The palette the theater paints with.
 *   - `neutral` (the dev bar's switch), or the map not validated → NEUTRAL_PALETTE, mode "neutral"
 *   - otherwise team colours, mode "team":
 *       blocks   home = primary; away = primary, or its SECONDARY when the primaries collide (CIE76 ΔE < 20), or its
 *                primary HATCHED when the secondary collides with the home primary too
 *       field    each side's official accent, as is (the keyline carries the 3:1, never a lightened colour); `accentInk`
 *                = the better ink on it (the current timeline segment's glyph). When the two accents collide, the away
 *                side takes the first of its primary, secondary and official alternates that no longer collides and is
 *                fieldDistinct (`accentSwap` records it); if none can, its timeline segments are hatched (`accentHatched`)
 *   - an unknown team falls back to its neutral token
 */
export function theaterPalette(homeAbbr, awayAbbr, { neutral = false } = {}) {
  if (!TEAM_COLORS_VALIDATED || neutral) return { mode: "neutral", validated: TEAM_COLORS_VALIDATED, ...NEUTRAL_PALETTE };
  const paint = (t, fill, hatched = false) => {
    const ink = fill === t.primary ? t.ink : bestInk(fill);
    return { fill, ink, trim: blockTrim(t, fill, ink), accent: t.accent, accentInk: bestInk(t.accent), hatched };
  };
  const h = nflTeamColor(homeAbbr);
  const a = nflTeamColor(awayAbbr);
  const home = h ? paint(h, h.primary) : NEUTRAL_PALETTE.home;
  let away = a ? paint(a, a.primary) : NEUTRAL_PALETTE.away;
  if (h && a && collides(h.primary, a.primary)) {
    away = collides(h.primary, a.secondary) ? paint(a, a.primary, true) : paint(a, a.secondary);
  }
  if (h && a && collides(home.accent, away.accent)) {
    const pick = [a.primary, a.secondary, ...a.alt].find((hex) => hex !== a.accent && !collides(home.accent, hex) && fieldDistinct(hex));
    away = pick ? { ...away, accent: pick, accentInk: bestInk(pick), accentSwap: pick } : { ...away, accentHatched: true };
  }
  return { mode: "team", validated: true, home, away };
}
