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
 * colour (the away team's block and end zone when the two primaries collide); accent = an official colour that carries
 * the team on the field (drive ribbon, end-zone edge, timeline fills, scoring flash, possession tag). `p` / `s` in the
 * accent column mean "the same value as the primary / secondary". ink = the text colour on the primary (≥4.5:1).
 * Where an official accent is under 3:1 on the turf, theaterPalette() paints the NEAREST legible colour to it for that
 * on-field use only (turfSafeAccent: brighten, keeping the hue, then lighten) and keeps the official value as `accentBase`, the brand reference.
 *
 * No logos, wordmarks, helmets or uniform art: abbreviations plus colours only. Keys are `nfl:<ABBR>` so no NBA or MLB
 * abbreviation in components/team-badge.tsx (10 collide: DEN MIN MIA DAL PHI IND CLE SEA HOU ATL) can ever match.
 * Colour literals here are identity DATA (token-exception-registry.mjs "identity-data"), never theme values.
 */

import { THEATER_TURF_MIX, turfHexes, turfSafeAccent } from "./field-geometry.mjs";

/** true since 2026-10-18: every role value is listed verbatim by an official source (nfl-team-colors-evidence.json). */
export const TEAM_COLORS_VALIDATED = true;

/** Where the evidence for every value below is recorded (read by the tests, never by a component). */
export const TEAM_COLOR_EVIDENCE = "src/lib/simulation-theater/nfl-team-colors-evidence.json";

const WHITE = "#FFFFFF";
const DARK = "#0A0705";

/** [abbr, primary, secondary, ink ("white" | "dark"), accent (hex, or "p" / "s"), alternate on-field colour (optional)] */
const ROWS = [
  ["ARI", "#97233F", "#000000", "white", "#FFB612"],
  ["ATL", "#A71930", "#000000", "white", "#A5ACAF"],
  ["BAL", "#24135F", "#000000", "white", "#9A7611"],
  ["BUF", "#00338D", "#C60C30", "white", "s"],
  ["CAR", "#0085CA", "#101820", "dark", "p"],
  ["CHI", "#0B162A", "#E64100", "white", "s"],
  ["CIN", "#FB4F14", "#000000", "dark", "p"],
  ["CLE", "#311D00", "#FF3C00", "white", "s"],
  ["DAL", "#002244", "#B0B7BC", "white", "s"],
  ["DEN", "#FC4C02", "#0A2343", "dark", "p"],
  ["DET", "#0076B6", "#B0B7BC", "white", "p"],
  ["GB", "#203731", "#FFB612", "white", "s"],
  ["HOU", "#021018", "#EB0028", "white", "s", "#0080C6"],
  ["IND", "#013369", "#A5ACAF", "white", "s"],
  ["JAX", "#006778", "#000000", "white", "#D7A22A"],
  ["KC", "#E31837", "#FFB612", "white", "p"],
  ["LAC", "#0080C6", "#FFC20E", "dark", "p"],
  ["LAR", "#003594", "#FFD100", "white", "s"],
  ["LV", "#000000", "#A5ACAF", "white", "s"],
  ["MIA", "#008E97", "#FC4C02", "dark", "p"],
  ["MIN", "#4F2683", "#FFC62F", "white", "s"],
  ["NE", "#002244", "#C60C30", "white", "s"],
  ["NO", "#000000", "#D3BC8D", "white", "s"],
  ["NYG", "#0B2265", "#A71930", "white", "s"],
  ["NYJ", "#115740", "#B1B3B6", "white", "s"],
  ["PHI", "#004851", "#A2AAAD", "white", "s"],
  ["PIT", "#000000", "#FFB612", "white", "s"],
  ["SEA", "#002244", "#69BE28", "white", "s"],
  ["SF", "#AA0000", "#B3995D", "white", "s"],
  ["TB", "#A71930", "#322F2B", "white", "#C2242B"],
  ["TEN", "#4495D2", "#001532", "dark", "#D50A0A"],
  ["WSH", "#5A1414", "#FFB612", "white", "s"],
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
/** Spec §2.5 (S7): two colours collide when CIE76 ΔE < 20. */
export const COLLISION_DELTA_E = 20;
export const collides = (a, b) => deltaE76(a, b) < COLLISION_DELTA_E;

/** Thresholds the palette guarantees (WCAG 2.x): text on a team block, and an on-field UI colour on turf and page. */
export const TEXT_MIN = 4.5;
export const UI_MIN = 3;
/** An accent-clash alternative is used only if making it turf-safe moves it at most this far (CIE76 ΔE) from the
 *  official value; a dark navy or brown brightened into a different-looking colour is not that team any more. */
export const SWAP_MAX_ADJUST = 35;

/** Neutral GTP tokens (the dev bar's "Neutral colours" switch, and any unknown team). */
export const NEUTRAL_PALETTE = Object.freeze({
  home: Object.freeze({ fill: "var(--sport-nfl)", ink: "var(--bg)", trim: "var(--bg)", accent: "var(--sport-nfl)", hatched: false }),
  away: Object.freeze({ fill: "var(--lava-text-muted)", ink: "var(--bg)", trim: "var(--bg)", accent: "var(--lava-text-muted)", hatched: false }),
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
 *       accents  each side's official accent, made turf-safe (≥ UI_MIN on both turf stripes, hence on the darker page);
 *                when the two on-field accents collide, the away side takes whichever of its secondary, primary and
 *                official alternates no longer collides with the smallest turf-safe adjustment, at most SWAP_MAX_ADJUST
 *                (`accentSwap` records it); if none can, the away timeline segments are hatched (`accentHatched`)
 *   - an unknown team falls back to its neutral token
 */
export function theaterPalette(homeAbbr, awayAbbr, { neutral = false } = {}) {
  if (!TEAM_COLORS_VALIDATED || neutral) return { mode: "neutral", validated: TEAM_COLORS_VALIDATED, ...NEUTRAL_PALETTE };
  const turf = turfHexes(THEATER_TURF_MIX);
  const safe = (hex) => turfSafeAccent(hex, turf, contrastRatio, UI_MIN);
  const paint = (t, fill, hatched = false) => {
    const ink = fill === t.primary ? t.ink : bestInk(fill);
    const a = safe(t.accent);
    return {
      fill, ink, trim: blockTrim(t, fill, ink), accent: a.accent, hatched,
      ...(a.derived ? { accentBase: a.base } : {}),
    };
  };
  const h = nflTeamColor(homeAbbr);
  const a = nflTeamColor(awayAbbr);
  const home = h ? paint(h, h.primary) : NEUTRAL_PALETTE.home;
  let away = a ? paint(a, a.primary) : NEUTRAL_PALETTE.away;
  if (h && a && collides(h.primary, a.primary)) {
    away = collides(h.primary, a.secondary) ? paint(a, a.primary, true) : paint(a, a.secondary);
  }
  if (h && a && collides(home.accent, away.accent)) {
    // the official alternative that needs the smallest on-field adjustment and no longer collides
    const pick = [a.secondary, a.primary, ...a.alt]
      .map((hex) => ({ hex, r: safe(hex) }))
      .filter(({ r }) => !collides(home.accent, r.accent))
      .map((c) => ({ ...c, d: deltaE76(c.hex, c.r.accent) }))
      .filter((c) => c.d <= SWAP_MAX_ADJUST)
      .sort((x, y) => x.d - y.d)[0];
    if (pick) {
      const { accentBase: _drop, ...rest } = away;
      away = { ...rest, accent: pick.r.accent, accentSwap: pick.hex, ...(pick.r.derived ? { accentBase: pick.hex } : {}) };
    } else {
      away = { ...away, accentHatched: true };
    }
  }
  return { mode: "team", validated: true, home, away };
}
