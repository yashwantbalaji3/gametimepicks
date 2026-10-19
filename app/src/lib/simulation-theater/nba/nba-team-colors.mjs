/**
 * NBA TEAM PALETTE for the NBA Simulation Theater (development prototype only).
 *
 * NO COLOUR LITERAL LIVES HERE. The team colours are DATA in nba-team-colors.json (read with fs by loader.mjs, at build
 * time, server side) and their evidence in nba-team-colors-evidence.json; this module only does the maths, so the
 * colour-literal registry (lib/uiux/token-exception-registry.mjs, shrink-only) gains no entry. The court surfaces are
 * computed from token RGB mirrors (numbers, not literals), checked against globals.css by nba-colors.test.mjs.
 *
 * ROLES (the NFL theater's rules, adapted to a court):
 *   fill   = the primary (listed[0]): scoreboard block, card team block. ink = white or dark, whichever reads (≥ 4.5:1).
 *   trim   = the first other listed colour reaching 3:1 on the fill (the block's bar), else the ink.
 *   court  = the colour that carries the team ON THE COURT (baseline band, paint tint, three-point zone tint): the primary,
 *            unless it cannot be told from the floor (CIEDE2000 < COURT_DISTINCT_DE00 against a floor tone or the panel),
 *            then the next listed colour that can (Brooklyn's black → white).
 *   courtInk = white or dark on `court` (the abbreviation on the baseline band).
 *   tint   = `court` mixed into the floor at the highest of TINT_STEPS for which the court lines (keyline) keep ≥ 3:1 on it.
 * ONE IDENTITY, NEVER SWAPPED: when the two teams clash (primaries collide CIE76 ΔE < 20 or ΔE00 < 10, or the court colours
 * do), the AWAY side is `patterned` (striped bar, hatched paint, its abbreviation everywhere), never recoloured.
 */
import { collides, contrastRatio, deltaE2000 } from "../nfl-team-colors.mjs";

export const TEXT_MIN = 4.5;
export const UI_MIN = 3;
export const COURT_DISTINCT_DE00 = 20;
export const CLASH_DE00 = 10;
/** Paint / zone tint: percent of the team's court colour mixed into the floor, tried from high to low. */
export const TINT_STEPS = Object.freeze([70, 60, 50, 40, 30]);
/** Floor planks: percent of --vault-crown mixed into --bg (nba-theater-css.ts paints with the same numbers). */
export const FLOOR_MIX = Object.freeze({ a: 20, b: 24 });
/** Court lines: --lava-text mixed into --bg at this percent (the NFL keyline). */
export const LINE_MIX = 85;

/** Token mirrors (sRGB triples) of globals.css: --bg, --vault-crown, --lava-text, --gtp-card-elevated. Tested for drift. */
export const NBA_TOKEN_RGB = Object.freeze({
  bg: Object.freeze([10, 7, 5]), crown: Object.freeze([217, 164, 65]),
  lavaText: Object.freeze([245, 247, 246]), cardElevated: Object.freeze([24, 35, 29]),
});

const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const hexRgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
const mix = (a, b, pct) => a.map((v, i) => v * pct / 100 + b[i] * (1 - pct / 100));
export const mixHex = (a, b, pct) => toHex(mix(hexRgb(a), hexRgb(b), pct));

/** Every surface a team mark sits on: both floor tones, the panel (timeline, cards), the page. */
export function courtSurfaces() {
  const T = NBA_TOKEN_RGB;
  return Object.freeze({
    floor: [FLOOR_MIX.a, FLOOR_MIX.b].map((p) => toHex(mix(T.crown, T.bg, p))),
    panel: toHex(T.cardElevated),
    page: toHex(T.bg),
    line: toHex(mix(T.lavaText, T.bg, LINE_MIX)),
  });
}

export const courtDistinct = (hex) => {
  const s = courtSurfaces();
  return [...s.floor, s.panel].every((bg) => deltaE2000(hex, bg) >= COURT_DISTINCT_DE00);
};

export function canonicalAbbr(data, abbr) {
  const a = String(abbr ?? "").toUpperCase();
  return data?.aliases?.[a] ?? a;
}

/** { abbr, name, listed, primary, secondary } or null. Accepts ESPN abbreviations (NY, SA, GS, NO, UTAH, WSH). */
export function nbaTeamColor(data, abbr) {
  const a = canonicalAbbr(data, abbr);
  const t = data?.teams?.[a];
  if (!t || !Array.isArray(t.listed) || t.listed.length < 2) return null;
  return { abbr: a, name: t.name, listed: [...t.listed], primary: t.listed[0], secondary: t.listed[1] };
}

export function bestInk(data, fill) {
  const { white, dark } = data.inks;
  return contrastRatio(white, fill) >= contrastRatio(dark, fill) ? white : dark;
}

export function blockTrim(team, fill, ink) {
  return team.listed.find((c) => c.toUpperCase() !== fill.toUpperCase() && contrastRatio(c, fill) >= UI_MIN) ?? ink;
}

export function courtColour(team) {
  return team.listed.find((c) => courtDistinct(c)) ?? team.primary;
}

/** The team tint on the floor, and the percentage used: the highest step keeping the court lines ≥ 3:1 on it. */
export function paintTint(hex) {
  const s = courtSurfaces();
  for (const pct of TINT_STEPS) {
    const tint = mixHex(hex, s.floor[0], pct);
    if (contrastRatio(s.line, tint) >= UI_MIN) return { tint, pct };
  }
  const pct = TINT_STEPS[TINT_STEPS.length - 1];
  return { tint: mixHex(hex, s.floor[0], pct), pct };
}

export const clashes = (a, b) => collides(a, b) || deltaE2000(a, b) < CLASH_DE00;

export function clashOf(home, away) {
  const blocks = clashes(home.primary, away.primary);
  const court = clashes(courtColour(home), courtColour(away));
  return blocks && court ? "both" : blocks ? "blocks" : court ? "court" : null;
}

/** Neutral GTP tokens: the "neutral colours" switch, an unknown team, or no colour data. */
export const NEUTRAL_NBA_PALETTE = Object.freeze({
  home: Object.freeze({ fill: "var(--sport-nba, var(--lava-heat))", ink: "var(--bg)", trim: "var(--bg)", court: "var(--lava-heat)", courtInk: "var(--bg)", tint: "color-mix(in srgb, var(--lava-heat) 30%, var(--st-floor-a))", patterned: false }),
  away: Object.freeze({ fill: "var(--lava-text-muted)", ink: "var(--bg)", trim: "var(--bg)", court: "var(--lava-text-muted)", courtInk: "var(--bg)", tint: "color-mix(in srgb, var(--lava-text-muted) 30%, var(--st-floor-a))", patterned: false }),
});

/**
 * The palette the NBA theater paints with. Plain strings only (hex from the data, or var(...) for neutral), so it can be
 * computed on the server and passed to the client island as props.
 */
export function nbaPalette(data, homeAbbr, awayAbbr, { neutral = false } = {}) {
  if (neutral || !data) return { mode: "neutral", status: data?.status ?? "none", clash: null, ...NEUTRAL_NBA_PALETTE };
  const h = nbaTeamColor(data, homeAbbr);
  const a = nbaTeamColor(data, awayAbbr);
  const clash = h && a ? clashOf(h, a) : null;
  const paint = (t, patterned) => {
    const ink = bestInk(data, t.primary);
    const court = courtColour(t);
    const { tint, pct } = paintTint(court);
    return { fill: t.primary, ink, trim: blockTrim(t, t.primary, ink), court, courtInk: bestInk(data, court), tint, tintPct: pct, patterned };
  };
  return {
    mode: "team",
    status: data.status,
    clash,
    home: h ? paint(h, false) : NEUTRAL_NBA_PALETTE.home,
    away: a ? paint(a, clash !== null) : NEUTRAL_NBA_PALETTE.away,
  };
}
