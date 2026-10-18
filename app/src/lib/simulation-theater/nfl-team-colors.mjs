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
 * ROLES. primary = the team's primary brand colour (score bug block, end zone, possession tag); secondary = the main
 * contrasting brand colour (block trim where it reaches 4.5:1, and the field colour where the primary cannot be told
 * from the turf); accent = the team's DECLARED FIELD COLOUR, the official colour that carries the team on the field (drive
 * ribbon, timeline fills, scoring flash, winner outline, break-card rule). `p` / `s` in the accent column mean "the same
 * value as the primary / secondary". ink = the text colour on the primary (≥4.5:1).
 * ONE IDENTITY, NEVER SWAPPED (founder, 2026-10-18): each team paints its primary on the score bug and its declared field
 * colour on the field in EVERY matchup, home or away (Buffalo is royal blue #00338D in all 62 orientations). The field
 * colour is the primary except where (1) a founder role decision names another official colour (NO and PIT gold, TB's
 * official red) or (2) the primary cannot be told from the field surfaces even with the keyline (fieldDistinct:
 * CIEDE2000 ΔE00 < FIELD_DISTINCT_DE00 against a turf stripe or the timeline panel: the greens GB, NYJ, PHI and the dark
 * CHI, CLE, HOU, LV, and the blacks NO and PIT), where it is the secondary. JAX paints teal and TEN Titans blue, their
 * primaries (iteration 6: both pass fieldDistinct).
 * CLASHES ARE TOLD APART BY NON-COLOUR CUES (WCAG 1.4.1), never by an alternative colour: when the two primaries collide
 * (CIE76 ΔE < 20) or the two field colours clash (fieldClash: also ΔE00 < 10), the AWAY side is `patterned`: a diagonal
 * keyline stripe over its own colour on the timeline segments, the drive ribbon, the end line and the score-bug bar; its
 * abbreviation on the timeline segments (where they are wide enough), as well as on the possession tag and score bug; a
 * pennant-shaped possession tag pointing the way it attacks; square ribbon ends.
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

/** [abbr, primary, secondary, ink ("white" | "dark"), field colour = accent (hex, or "p" / "s")] */
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
  ["HOU", "#021018", "#EB0028", "white", "s"],
  ["IND", "#013369", "#A5ACAF", "white", "p"],
  ["JAX", "#006778", "#000000", "white", "p"],
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
  ["TEN", "#4495D2", "#001532", "dark", "p"],
  ["WSH", "#5A1414", "#FFB612", "white", "p"],
];

/** `nfl:<ABBR>` → { abbr, primary, secondary, accent (the declared field colour), ink, inkName }. */
export const NFL_TEAM_COLORS = Object.freeze(Object.fromEntries(ROWS.map(([abbr, primary, secondary, ink, accent]) => [
  `nfl:${abbr}`,
  Object.freeze({
    abbr, primary, secondary, accent: accent === "p" ? primary : accent === "s" ? secondary : accent,
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
/** On the field the S7 rule is joined by ΔE00 < FIELD_CLASH_DE00: CIE76 calls dark pairs such as BUF royal / IND blue
 *  (ΔE00 5.9) or DAL navy / NYG blue (6.8) distinct; side by side on a dark turf they are not. */
export const FIELD_CLASH_DE00 = 10;
export const fieldClash = (a, b) => collides(a, b) || deltaE2000(a, b) < FIELD_CLASH_DE00;

/** Thresholds the palette guarantees (WCAG 2.x): text on a team block, and the keyline around every team mark. */
export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

/** Neutral GTP tokens (the dev bar's "Neutral colours" switch, and any unknown team). */
export const NEUTRAL_PALETTE = Object.freeze({
  home: Object.freeze({ fill: "var(--sport-nfl)", ink: "var(--bg)", trim: "var(--bg)", accent: "var(--sport-nfl)", accentInk: "var(--bg)", patterned: false }),
  away: Object.freeze({ fill: "var(--lava-text-muted)", ink: "var(--bg)", trim: "var(--bg)", accent: "var(--lava-text-muted)", accentInk: "var(--bg)", patterned: false }),
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
 * Why a pairing needs the away side's non-colour cues: "blocks" (the primaries collide, CIE76 ΔE < 20: score bug, end
 * zone, possession tag), "field" (the field colours clash, fieldClash), "both", or null.
 */
export function clashOf(home, away) {
  const blocks = collides(home.primary, away.primary);
  const field = fieldClash(home.accent, away.accent);
  return blocks && field ? "both" : blocks ? "blocks" : field ? "field" : null;
}

/**
 * The palette the theater paints with.
 *   - `neutral` (the dev bar's switch), or the map not validated → NEUTRAL_PALETTE, mode "neutral"
 *   - otherwise team colours, mode "team". NO COLOUR IS EVER SWAPPED: each side paints its primary on its block (`fill`,
 *     `ink`, `trim`) and its declared field colour on the field (`accent`, `accentInk` = the better ink on it), whatever
 *     the opponent. When the pairing clashes (clashOf), the AWAY side is `patterned` (stripes, abbreviation, pennant tag,
 *     square ribbon ends) and `clash` says why; the home side stays plain, so exactly one side carries the cues.
 *   - an unknown team falls back to its neutral token
 */
export function theaterPalette(homeAbbr, awayAbbr, { neutral = false } = {}) {
  if (!TEAM_COLORS_VALIDATED || neutral) return { mode: "neutral", validated: TEAM_COLORS_VALIDATED, clash: null, ...NEUTRAL_PALETTE };
  const paint = (t, patterned) => ({
    fill: t.primary, ink: t.ink, trim: blockTrim(t, t.primary, t.ink), accent: t.accent, accentInk: bestInk(t.accent), patterned,
  });
  const h = nflTeamColor(homeAbbr);
  const a = nflTeamColor(awayAbbr);
  const clash = h && a ? clashOf(h, a) : null;
  return { mode: "team", validated: true, clash, home: h ? paint(h, false) : NEUTRAL_PALETTE.home, away: a ? paint(a, clash !== null) : NEUTRAL_PALETTE.away };
}
