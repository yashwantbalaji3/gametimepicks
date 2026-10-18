/**
 * NFL TEAM COLOUR MAP · per-team validation (Simulation Theater V2, iteration 3). DATA AND CHECKS ONLY: nothing here is
 * imported by the theater's components, so it changes no paint and never ships in the island bundle. NFL only (keys are
 * the map's NFL abbreviations; no NBA/MLB map is read). No logos or brand assets: hex values only.
 *
 * Colour literals here are OBSERVED SOURCE VALUES (identity data; token-exception-registry.mjs "identity-data").
 */
import { deltaE76, nflTeamColor } from "./nfl-team-colors.mjs";

// ── per-team validation ──────────────────────────────────────────
/**
 * Two public references, both fetched 2026-10-18, compared with the map above in CIELAB (CIE76):
 *   tcc   teamcolorcodes.com, the team's own page (the "<team> Color Codes HEX" paragraph, every hex it lists)
 *   wiki  Wikipedia `Module:Gridiron color/data` (raw, revision 1380502831 of 2026-10-16), the team's CURRENT row:
 *         [background, text, border, alt background, alt text] (a table-styling module, so slot order is not "primary,
 *         secondary"; white is usually the text slot)
 * A map colour AGREES with a source when that source lists, for the same team, a colour within ΔE ≤ VALIDATION_DELTA_E.
 * A team is `validated` only when BOTH its primary and its secondary agree with BOTH sources.
 *
 * Caveats, stated rather than hidden: the map's values were originally copied from teamcolorcodes.com, so its ΔE is 0
 * by construction and the Wikipedia row is the only check that can disagree; the two sources are not guaranteed to be
 * independent of each other; team brand guides / official sites were NOT consulted (none fetched), so `validated: true`
 * means "two public references agree", not "brand-guide confirmed". TEAM_COLORS_VALIDATED stays false: the founder
 * decides (D3). Nothing here changes what the theater paints.
 */
export const VALIDATION_DELTA_E = 5;
export const VALIDATION_ACCESSED = "2026-10-18";
export const VALIDATION_SOURCES = Object.freeze({
  tcc: Object.freeze({ name: "teamcolorcodes.com (team page)", base: "https://teamcolorcodes.com/" }),
  wiki: Object.freeze({ name: "Wikipedia Module:Gridiron color/data (rev 1380502831)", url: "https://en.wikipedia.org/wiki/Module:Gridiron_color/data" }),
});

/** [abbr, team, tcc page slug, tcc hexes (as listed), wiki current row, validated, note]: observed data, not derived. */
const VALIDATION_ROWS = [
  ["ARI", "Arizona Cardinals", "arizona-cardinals-color-codes", ["#97233F","#000000","#FFB612"], ["#97233F","#FFFFFF","#000000","#FFFFFF","#97233F"], true, ""],
  ["ATL", "Atlanta Falcons", "atlanta-falcons-color-codes", ["#A71930","#000000","#A5ACAF"], ["#A71930","#FFFFFF","#000000","#000000","#FFFFFF"], true, ""],
  ["BAL", "Baltimore Ravens", "baltimore-ravens-color-codes", ["#241773","#000000","#9E7C0C","#C60C30"], ["#24135F","#FFFFFF","#9A7611","#000000","#FFFFFF"], false, "primary #241773: Wikipedia's nearest is #24135F (ΔE 9.8)"],
  ["BUF", "Buffalo Bills", "buffalo-bills-color-codes", ["#00338D","#C60C30"], ["#00338D","#FFFFFF","#C60C30","#C60C30","#FFFFFF"], true, ""],
  ["CAR", "Carolina Panthers", "carolina-panthers-color-codes", ["#0085CA","#101820","#BFC0BF"], ["#000000","#FFFFFF","#0085CF","#0085CF","#000000"], false, "secondary #101820: Wikipedia's nearest is #000000 (ΔE 10.4)"],
  ["CHI", "Chicago Bears", "chicago-bears-color-codes", ["#0B162A","#C83803"], ["#0B162A","#FFFFFF","#E64100","#E64100","#000000"], false, "secondary #C83803: Wikipedia's nearest is #E64100 (ΔE 11.7)"],
  ["CIN", "Cincinnati Bengals", "cincinnati-bengals-color-codes", ["#000000","#FB4F14"], ["#000000","#FFFFFF","#FB4F14","#FB4F14","#000000"], true, ""],
  ["CLE", "Cleveland Browns", "cleveland-browns-color-codes", ["#311D00","#FF3C00","#FFFFFF"], ["#311D00","#FFFFFF","#FF3C00","#FF3C00","#000000"], true, ""],
  ["DAL", "Dallas Cowboys", "dallas-cowboys-color-codes", ["#003594","#041E42","#869397","#7F9695","#FFFFFF"], ["#002244","#FFFFFF","#B0B7BC","#B0B7BC","#002244"], false, "primary #003594: Wikipedia's nearest is #002244 (ΔE 40.2); secondary #869397: Wikipedia's nearest is #B0B7BC (ΔE 14.2)"],
  ["DEN", "Denver Broncos", "denver-broncos-color-codes", ["#FB4F14","#002244"], ["#0A2343","#FFFFFF","#FC4C02","#FC4C02","#0A2343"], true, ""],
  ["DET", "Detroit Lions", "detroit-lions-color-codes", ["#0076B6","#B0B7BC","#000000","#FFFFFF"], ["#0076B6","#FFFFFF","#B0B7BC","#B0B7BC","#000000"], true, ""],
  ["GB", "Green Bay Packers", "green-bay-packers-color-codes", ["#203731","#FFB612"], ["#203731","#FFFFFF","#FFB612","#FFB612","#000000"], true, ""],
  ["HOU", "Houston Texans", "houston-texans-color-codes", ["#03202F","#A71930"], ["#021018","#FFFFFF","#EB0028","#EB0028","#FFFFFF"], false, "primary #03202F: Wikipedia's nearest is #021018 (ΔE 9.9); secondary #A71930: Wikipedia's nearest is #EB0028 (ΔE 33.1)"],
  ["IND", "Indianapolis Colts", "indianapolis-colts-color-codes", ["#002C5F","#A2AAAD"], ["#013369","#FFFFFF","#A5ACAF","#FFFFFF","#013369"], true, ""],
  ["JAX", "Jacksonville Jaguars", "jacksonville-jaguars-color-codes", ["#101820","#D7A22A","#9F792C","#006778"], ["#006778","#FFFFFF","#000000","#000000","#FFFFFF"], false, "primary #101820: Wikipedia's nearest is #000000 (ΔE 10.4); secondary #D7A22A: Wikipedia's nearest is #FFFFFF (ΔE 72.1)"],
  ["KC", "Kansas City Chiefs", "kansas-city-chiefs-color-codes", ["#E31837","#FFB81C"], ["#E31837","#FFFFFF","#FFB612","#FFB612","#000000"], true, ""],
  ["LAC", "Los Angeles Chargers", "los-angeles-chargers-color-codes", ["#0080C6","#FFC20E","#FFFFFF"], ["#0080C6","#FFFFFF","#FFC20E","#FFC20E","#000000"], true, ""],
  ["LAR", "Los Angeles Rams", "los-angeles-rams-team-colors", ["#003594","#FFA300","#FF8200","#FFD100","#FFFFFF"], ["#003594","#FFFFFF","#FFD100","#FFD100","#003594"], false, "secondary #FFA300: Wikipedia's nearest is #FFD100 (ΔE 27.3)"],
  ["LV", "Las Vegas Raiders", "oakland-raiders-color-codes", ["#000000","#A5ACAF"], ["#000000","#FFFFFF","#C8C7C7","#C8C7C7","#000000"], false, "secondary #A5ACAF: Wikipedia's nearest is #C8C7C7 (ΔE 11)"],
  ["MIA", "Miami Dolphins", "miami-dolphins-color-codes", ["#008E97","#FC4C02","#005778"], ["#008E97","#FFFFFF","#FC4C02","#FC4C02","#000000"], true, ""],
  ["MIN", "Minnesota Vikings", "minnesota-vikings-color-codes", ["#4F2683","#FFC62F"], ["#4F2683","#FFFFFF","#FFC62F","#FFC62F","#000000"], true, ""],
  ["NE", "New England Patriots", "new-england-patriots-color-codes", ["#002244","#C60C30","#B0B7BC"], ["#002244","#FFFFFF","#C60C30","#C60C30","#FFFFFF"], true, ""],
  ["NO", "New Orleans Saints", "new-orleans-saints-color-codes", ["#D3BC8D","#101820"], ["#000000","#FFFFFF","#D3BC8D","#D3BC8D","#000000"], false, "secondary #101820: Wikipedia's nearest is #000000 (ΔE 10.4)"],
  ["NYG", "New York Giants", "new-york-giants-color-codes", ["#0B2265","#A71930","#A5ACAF"], ["#0B2265","#FFFFFF","#A71930","#A71930","#FFFFFF"], true, ""],
  ["NYJ", "New York Jets", "new-york-jets-color-codes", ["#125740","#000000","#FFFFFF"], ["#115740","#FFFFFF","#000000","#FFFFFF","#115740"], true, ""],
  ["PHI", "Philadelphia Eagles", "philadelphia-eagles-color-codes", ["#004C54","#A5ACAF","#ACC0C6","#000000","#565A5C"], ["#004851","#FFFFFF","#A2AAAD","#A2AAAD","#000000"], true, ""],
  ["PIT", "Pittsburgh Steelers", "pittsburgh-steelers-color-codes", ["#FFB612","#101820","#003087","#C60C30","#A5ACAF"], ["#000000","#FFFFFF","#FFB612","#FFB612","#000000"], false, "secondary #101820: Wikipedia's nearest is #000000 (ΔE 10.4)"],
  ["SEA", "Seattle Seahawks", "seattle-seahawks-color-codes", ["#002244","#69BE28","#A5ACAF"], ["#002244","#FFFFFF","#69BE28","#69BE28","#002244"], true, ""],
  ["SF", "San Francisco 49ers", "san-francisco-49ers-team-colors", ["#AA0000","#B3995D"], ["#AA0000","#FFFFFF","#B5925D","#B5925D","#000000"], false, "secondary #B3995D: Wikipedia's nearest is #B5925D (ΔE 5.4)"],
  ["TB", "Tampa Bay Buccaneers", "tampa-bay-buccaneers-team-colors", ["#D50A0A","#FF7900","#0A0A08","#B1BABF","#34302B"], ["#A71930","#FFFFFF","#322F2B","#322F2B","#FFFFFF"], false, "primary #D50A0A: Wikipedia's nearest is #A71930 (ΔE 34.3)"],
  ["TEN", "Tennessee Titans", "tennessee-titans-color-codes", ["#0C2340","#4B92DB","#C8102E","#8A8D8F"], ["#4495D2","#FFFFFF","#D50A0A","#FFFFFF","#4495D2"], false, "primary #0C2340: Wikipedia's nearest is #4495D2 (ΔE 49.7); secondary #4B92DB: Wikipedia's nearest is #4495D2 (ΔE 8)"],
  ["WSH", "Washington Commanders", "washington-redskins-color-codes", ["#5A1414","#FFB612"], ["#5A1414","#FFFFFF","#FFB612","#FFB612","#000000"], true, ""],
];

const nearest = (hex, list) => list.reduce((b, h) => { const d = deltaE76(hex, h); return d < b.deltaE ? { hex: h, deltaE: Math.round(d * 10) / 10 } : b; }, { hex: null, deltaE: Infinity });

/** The comparison, recomputed from the observed source lists (dev-route-colors.test.mjs checks it matches `validated`). */
export function colorAgreement(abbr) {
  const row = VALIDATION_ROWS.find((r) => r[0] === abbr);
  const c = nflTeamColor(abbr);
  if (!row || !c) return null;
  const [, , , tcc, wiki] = row;
  const role = (hex) => {
    const t = nearest(hex, tcc);
    const w = nearest(hex, wiki);
    return { ours: hex, tcc: t, wiki: w, agree: t.deltaE <= VALIDATION_DELTA_E && w.deltaE <= VALIDATION_DELTA_E };
  };
  const primary = role(c.primary);
  const secondary = role(c.secondary);
  return { primary, secondary, agree: primary.agree && secondary.agree };
}

/** `ABBR` → { team, sources: [{ name, url, accessed, listed }], primary, secondary, agree, validated, note }. */
export const TEAM_COLOR_VALIDATION = Object.freeze(Object.fromEntries(VALIDATION_ROWS.map(([abbr, team, slug, tcc, wiki, validated, note]) => {
  const a = colorAgreement(abbr);
  return [abbr, Object.freeze({
    team,
    sources: [
      { name: VALIDATION_SOURCES.tcc.name, url: `${VALIDATION_SOURCES.tcc.base}${slug}/`, accessed: VALIDATION_ACCESSED, listed: tcc },
      { name: VALIDATION_SOURCES.wiki.name, url: VALIDATION_SOURCES.wiki.url, accessed: VALIDATION_ACCESSED, listed: wiki },
    ],
    primary: a.primary,
    secondary: a.secondary,
    agree: a.agree,
    validated,
    note: note || "Both sources list the primary and the secondary (ΔE ≤ 5). Brand guide not consulted.",
  })];
})));
