/**
 * NFL TEAM COLOUR MAP · per-team validation (Simulation Theater V2, iterations 3–4). DATA AND CHECKS ONLY: nothing here is
 * imported by the theater's components, so it changes no paint and never ships in the island bundle. NFL only (keys are
 * the map's NFL abbreviations; no NBA/MLB map is read). No logos or brand assets are stored: hex values only (the logo
 * source below is recorded as the fill colours read from the league-hosted file, never the file itself).
 *
 * Colour literals here are OBSERVED SOURCE VALUES (identity data; token-exception-registry.mjs "identity-data").
 */
import { deltaE76, nflTeamColor } from "./nfl-team-colors.mjs";

// ── sources ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Every source was fetched 2026-10-18. Two kinds:
 *
 * REFERENCES (official: false)
 *   tcc      teamcolorcodes.com, the team's own page (the "<team> Color Codes HEX" paragraph, every hex it lists)
 *   wiki     Wikipedia `Module:Gridiron color/data` (raw, revision 1380502831 of 2026-10-16), the team's CURRENT row:
 *            [background, text, border, alt background, alt text] (a table-styling module; slot order is not a role)
 *
 * OFFICIAL (official: true) — published by the league or the club on its own domain. None is a brand-guide PDF: no
 * team's or the NFL's brand/style guide was publicly reachable (searches found none; therams.com/brand/ is password
 * protected and was not entered). NFL Football Operations publishes no colour values that could be found.
 *   nflHeader  NFL.com team page (https://www.nfl.com/teams/<slug>/): the profile header's inline CSS, overlay fill
 *              (first) and stripe fill (second) — the league's own two-colour pairing for the club
 *   nflLogo    the club logo SVG NFL.com serves (https://static.www.nfl.com/league/api/clubs/logos/<ABBR>.svg): the
 *              distinct fill/stroke colours, normalised to #RRGGBB, white omitted
 *   club       the club's own website, where it carries a club-specific value (location given per team). Most club
 *              sites share one league platform stylesheet with no club colours, so only six carry one.
 *
 * Caveats, stated rather than hidden: the map's original values were copied from tcc (ΔE 0 by construction); many wiki
 * values are byte-identical to NFL.com's (e.g. BAL #24135F, CHI #E64100, TB #322F2B), so wiki is probably derived from
 * NFL.com and is put in NFL.com's family (it never counts as a reference independent of it); NFL.com renders every black as pure #000000, including the
 * Panthers', whose own site uses #101820 — so where a club's own site gives a value, it outranks NFL.com.
 */
export const VALIDATION_DELTA_E = 5;
export const VALIDATION_ACCESSED = "2026-10-18";
export const VALIDATION_SOURCES = Object.freeze({
  tcc: Object.freeze({ name: "teamcolorcodes.com (team page)", base: "https://teamcolorcodes.com/", official: false, family: "teamcolorcodes" }),
  wiki: Object.freeze({ name: "Wikipedia Module:Gridiron color/data (rev 1380502831)", url: "https://en.wikipedia.org/wiki/Module:Gridiron_color/data", official: false, family: "nfl.com" }),
  nflHeader: Object.freeze({ name: "NFL.com team page, profile-header colours (league site CSS)", base: "https://www.nfl.com/teams/", official: true, family: "nfl.com" }),
  nflLogo: Object.freeze({ name: "NFL.com club logo SVG, fill colours (league-hosted club mark)", base: "https://static.www.nfl.com/league/api/clubs/logos/", official: true, family: "nfl.com" }),
  club: Object.freeze({ name: "club's official website", official: true, family: "club" }),
});

/**
 * THE RULE. A source AGREES with a team when it lists, for that team, a colour within ΔE ≤ VALIDATION_DELTA_E of the
 * map's primary AND one within ΔE ≤ VALIDATION_DELTA_E of the map's secondary (CIE76, CIELAB D65).
 *   official   some official source agrees
 *   agree      sources from at least two independent families agree (nflHeader, nflLogo and wiki are one family)
 *   validated  official || agree
 */
export function validationRule(sources) {
  const agreeing = sources.filter((s) => s.agree);
  const official = agreeing.some((s) => s.official);
  const agree = new Set(agreeing.map((s) => s.family)).size >= 2;
  return { official, agree, validated: official || agree };
}

// ── observed data ───────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * [abbr, team, tcc slug, tcc hexes, wiki current row, nfl.com slug, nfl.com header [overlay, stripe], nfl.com logo fills,
 *  club { url, where, listed } | null, validated, note]: observed data, not derived. `validated` is written by hand and
 *  dev-route-colors.test.mjs recomputes it from the lists with validationRule().
 */
const VALIDATION_ROWS = [
  ["ARI", "Arizona Cardinals", "arizona-cardinals-color-codes", ["#97233F","#000000","#FFB612"], ["#97233F","#FFFFFF","#000000","#FFFFFF","#97233F"], "arizona-cardinals", ["#97233F","#000000"], ["#000000","#97233F","#FFB612"], null, true, ""],
  ["ATL", "Atlanta Falcons", "atlanta-falcons-color-codes", ["#A71930","#000000","#A5ACAF"], ["#A71930","#FFFFFF","#000000","#000000","#FFFFFF"], "atlanta-falcons", ["#A71930","#000000"], ["#A5ACAF","#000000","#A71930"], null, true, ""],
  ["BAL", "Baltimore Ravens", "baltimore-ravens-color-codes", ["#241773","#000000","#9E7C0C","#C60C30"], ["#24135F","#FFFFFF","#9A7611","#000000","#FFFFFF"], "baltimore-ravens", ["#24135F","#9A7611"], ["#9A7611","#000000","#24135F","#C8102E"],
    { url: "https://www.baltimoreravens.com/", where: "homepage Storyteller widget theme, colors.primary", listed: ["#24135F"] }, true,
    "Primary changed: the club's own site, NFL.com's header and the league-hosted logo all give Ravens purple as #24135F, not tcc's #241773 (ΔE 9.8). Secondary black is in the official logo. Gold (#9A7611 officially) stays the accent; the map's #9E7C0C is ΔE 3.9 from it, so it was left."],
  ["BUF", "Buffalo Bills", "buffalo-bills-color-codes", ["#00338D","#C60C30"], ["#00338D","#FFFFFF","#C60C30","#C60C30","#FFFFFF"], "buffalo-bills", ["#00338D","#C60C30"], ["#C60C30","#00338D"], null, true, ""],
  ["CAR", "Carolina Panthers", "carolina-panthers-color-codes", ["#0085CA","#101820","#BFC0BF"], ["#000000","#FFFFFF","#0085CF","#0085CF","#000000"], "carolina-panthers", ["#0085CF","#000000"], ["#000000","#B2B4BB","#0085CF"],
    { url: "https://www.panthers.com/", where: "homepage inline CSS: --blue / --pnthrx-blue, and --ink / --num (numerals)", listed: ["#0085CA","#101820"] }, true,
    "No change. The club's own site uses #0085CA for Panther blue and #101820 for its black ink and numerals, exactly the map. NFL.com renders the black as pure #000000 (ΔE 10.4), as it does for every club."],
  ["CHI", "Chicago Bears", "chicago-bears-color-codes", ["#0B162A","#C83803"], ["#0B162A","#FFFFFF","#E64100","#E64100","#000000"], "chicago-bears", ["#0B162A","#E64100"], ["#E64100","#0B162A"],
    { url: "https://www.chicagobears.com/", where: "homepage game-strip data, primaryColor (no orange value on the club site)", listed: ["#0B162A"] }, true,
    "Secondary and accent changed #C83803 → #E64100 (ΔE 11.7): NFL.com's header and the league-hosted logo both give Bears orange as #E64100. The club site confirms navy #0B162A. #E64100 is 2.84:1 on the turf, so the theater derives its turf-safe accent."],
  ["CIN", "Cincinnati Bengals", "cincinnati-bengals-color-codes", ["#000000","#FB4F14"], ["#000000","#FFFFFF","#FB4F14","#FB4F14","#000000"], "cincinnati-bengals", ["#FB4F14","#000000"], ["#FB4F14","#000000"], null, true, ""],
  ["CLE", "Cleveland Browns", "cleveland-browns-color-codes", ["#311D00","#FF3C00","#FFFFFF"], ["#311D00","#FFFFFF","#FF3C00","#FF3C00","#000000"], "cleveland-browns", ["#FF3C00","#311D00"], ["#FF3C00","#311D00"], null, true, ""],
  ["DAL", "Dallas Cowboys", "dallas-cowboys-color-codes", ["#003594","#041E42","#869397","#7F9695","#FFFFFF"], ["#002244","#FFFFFF","#B0B7BC","#B0B7BC","#002244"], "dallas-cowboys", ["#002244","#B0B7BC"], ["#002244"], null, true,
    "Primary changed royal #003594 → navy #002244 (ΔE 40.2): the league-hosted star logo is navy #002244 and NFL.com's header pairs navy with silver; royal is a uniform trim colour, not the mark. Secondary and accent changed silver #869397 → #B0B7BC (ΔE 14.2, NFL.com header); the review's choice of silver over navy as the secondary is kept. dallascowboys.com carries no club colour value."],
  ["DEN", "Denver Broncos", "denver-broncos-color-codes", ["#FB4F14","#002244"], ["#0A2343","#FFFFFF","#FC4C02","#FC4C02","#0A2343"], "denver-broncos", ["#FC4C02","#0A2343"], ["#0066B3","#F37021"], null, true,
    "No change. tcc, wiki and NFL.com's header agree (ΔE ≤ 4.1). The league-hosted logo file is the legacy \"D\" mark (legacy blue and orange), so it does not agree and is not a contradiction of the current colours."],
  ["DET", "Detroit Lions", "detroit-lions-color-codes", ["#0076B6","#B0B7BC","#000000","#FFFFFF"], ["#0076B6","#FFFFFF","#B0B7BC","#B0B7BC","#000000"], "detroit-lions", ["#0076B6","#B0B7BC"], ["#B0B7BC","#0076B6"], null, true, ""],
  ["GB", "Green Bay Packers", "green-bay-packers-color-codes", ["#203731","#FFB612"], ["#203731","#FFFFFF","#FFB612","#FFB612","#000000"], "green-bay-packers", ["#203731","#FFB612"], ["#FFB612","#203731"], null, true, ""],
  ["HOU", "Houston Texans", "houston-texans-color-codes", ["#03202F","#A71930"], ["#021018","#FFFFFF","#EB0028","#EB0028","#FFFFFF"], "houston-texans", ["#021018","#EB0028"], ["#021018","#EB0028"],
    { url: "https://www.houstontexans.com/", where: "homepage game-theme config (home default background, stripe) and nav accent; H-Town blue in accent2", listed: ["#021018","#EB0028","#ED0028","#0080C6"] }, true,
    "Primary changed #03202F → #021018 (ΔE 9.9) and secondary #A71930 → #EB0028 (ΔE 33.1): the club's own site, NFL.com's header and the league-hosted logo all use deep steel blue #021018 and battle red #EB0028 (2024 identity). Accent stays white."],
  ["IND", "Indianapolis Colts", "indianapolis-colts-color-codes", ["#002C5F","#A2AAAD"], ["#013369","#FFFFFF","#A5ACAF","#FFFFFF","#013369"], "indianapolis-colts", ["#013369","#A5ACAF"], ["#013369"], null, true, ""],
  ["JAX", "Jacksonville Jaguars", "jacksonville-jaguars-color-codes", ["#101820","#D7A22A","#9F792C","#006778"], ["#006778","#FFFFFF","#000000","#000000","#FFFFFF"], "jacksonville-jaguars", ["#000000","#006778"], ["#000000","#D7A22A","#0A0B09","#9F792C","#006778"], null, true,
    "Primary changed #101820 → #000000 (ΔE 10.4): both league sources render Jaguars black as #000000 (logo also #0A0B09) and jaguars.com carries no value. Secondary gold #D7A22A is exactly in the league-hosted logo, so it stays; teal #006778 (NFL.com's header stripe) is also official and is the alternative, but gold is the mark's main colour after black."],
  ["KC", "Kansas City Chiefs", "kansas-city-chiefs-color-codes", ["#E31837","#FFB81C"], ["#E31837","#FFFFFF","#FFB612","#FFB612","#000000"], "kansas-city-chiefs", ["#E31837","#FFB612"], ["#000000","#E31837"], null, true, ""],
  ["LAC", "Los Angeles Chargers", "los-angeles-chargers-color-codes", ["#0080C6","#FFC20E","#FFFFFF"], ["#0080C6","#FFFFFF","#FFC20E","#FFC20E","#000000"], "los-angeles-chargers", ["#0080C6","#FFC20E"], ["#0080C6","#FFC20E"], null, true, ""],
  ["LAR", "Los Angeles Rams", "los-angeles-rams-team-colors", ["#003594","#FFA300","#FF8200","#FFD100","#FFFFFF"], ["#003594","#FFFFFF","#FFD100","#FFD100","#003594"], "los-angeles-rams", ["#003594","#FFD100"], ["#003594","#FFD100"], null, true,
    "Secondary and accent changed #FFA300 → #FFD100 (ΔE 27.3): NFL.com's header and the league-hosted logo give Sol as #FFD100; #FFA300 is a darker tone tcc also lists. Rams royal #003594 confirmed. therams.com/brand/ is password protected (not entered)."],
  ["LV", "Las Vegas Raiders", "oakland-raiders-color-codes", ["#000000","#A5ACAF"], ["#000000","#FFFFFF","#C8C7C7","#C8C7C7","#000000"], "las-vegas-raiders", ["#000000","#A5ACAF"], ["#231F20","#0A0A09","#C8C7C7"], null, true,
    "No change: NFL.com's header gives exactly #000000 and silver #A5ACAF. The league-hosted logo uses a lighter silver #C8C7C7 (ΔE 11, Wikipedia's value); the header is the league's pairing for the club, so the map keeps #A5ACAF."],
  ["MIA", "Miami Dolphins", "miami-dolphins-color-codes", ["#008E97","#FC4C02","#005778"], ["#008E97","#FFFFFF","#FC4C02","#FC4C02","#000000"], "miami-dolphins", ["#008E97","#FC4C02"], ["#FC4C02","#008E97","#005778"], null, true, ""],
  ["MIN", "Minnesota Vikings", "minnesota-vikings-color-codes", ["#4F2683","#FFC62F"], ["#4F2683","#FFFFFF","#FFC62F","#FFC62F","#000000"], "minnesota-vikings", ["#4F2683","#FFC62F"], ["#FFC62F","#E9BF9B","#000000","#4F2683"], null, true, ""],
  ["NE", "New England Patriots", "new-england-patriots-color-codes", ["#002244","#C60C30","#B0B7BC"], ["#002244","#FFFFFF","#C60C30","#C60C30","#FFFFFF"], "new-england-patriots", ["#002244","#C60C30"], ["#C60C30","#002244","#B0B7BC"], null, true, ""],
  ["NO", "New Orleans Saints", "new-orleans-saints-color-codes", ["#D3BC8D","#101820"], ["#000000","#FFFFFF","#D3BC8D","#D3BC8D","#000000"], "new-orleans-saints", ["#000000","#D3BC8D"], ["#000000","#D3BC8D"], null, true,
    "Secondary changed #101820 → #000000 (ΔE 10.4): NFL.com's header and the league-hosted logo; neworleanssaints.com carries no value. Old gold #D3BC8D confirmed. NFL.com leads with black (the home jersey); the map keeps gold as the fill (the helmet and mark), a role choice left to the founder."],
  ["NYG", "New York Giants", "new-york-giants-color-codes", ["#0B2265","#A71930","#A5ACAF"], ["#0B2265","#FFFFFF","#A71930","#A71930","#FFFFFF"], "new-york-giants", ["#0B2265","#A71930"], ["#A71930"], null, true, ""],
  ["NYJ", "New York Jets", "new-york-jets-color-codes", ["#125740","#000000","#FFFFFF"], ["#115740","#FFFFFF","#000000","#FFFFFF","#115740"], "new-york-jets", ["#115740","#B1B3B6"], ["#115740"], null, true,
    "No change; validated by tcc + wiki (ΔE ≤ 0.2). Recorded: no official source lists the map's secondary black — NFL.com's header pairs green with grey #B1B3B6 and the logo is green only. That is an omission, not an official value contradicting ours; the founder may prefer the grey."],
  ["PHI", "Philadelphia Eagles", "philadelphia-eagles-color-codes", ["#004C54","#A5ACAF","#ACC0C6","#000000","#565A5C"], ["#004851","#FFFFFF","#A2AAAD","#A2AAAD","#000000"], "philadelphia-eagles", ["#004851","#A2AAAD"], ["#004851","#000000","#A2AAAD"], null, true, ""],
  ["PIT", "Pittsburgh Steelers", "pittsburgh-steelers-color-codes", ["#FFB612","#101820","#003087","#C60C30","#A5ACAF"], ["#000000","#FFFFFF","#FFB612","#FFB612","#000000"], "pittsburgh-steelers", ["#000000","#FFB612"], ["#000000","#A5ACAF","#FFB612","#C60C30","#00539B"], null, true,
    "Secondary changed #101820 → #000000 (ΔE 10.4): NFL.com's header and the league-hosted logo; steelers.com carries no value. Gold #FFB612 confirmed. NFL.com leads with black (the home jersey); the map keeps gold as the fill, a role choice left to the founder."],
  ["SEA", "Seattle Seahawks", "seattle-seahawks-color-codes", ["#002244","#69BE28","#A5ACAF"], ["#002244","#FFFFFF","#69BE28","#69BE28","#002244"], "seattle-seahawks", ["#002244","#A5ACAF"], ["#002244","#69BE28","#A5ACAF"], null, true, ""],
  ["SF", "San Francisco 49ers", "san-francisco-49ers-team-colors", ["#AA0000","#B3995D"], ["#AA0000","#FFFFFF","#B5925D","#B5925D","#000000"], "san-francisco-49ers", ["#AA0000","#B3995D"], ["#000000","#B3995D","#AA0000"], null, true,
    "No change: NFL.com's header and the league-hosted logo give exactly #AA0000 and gold #B3995D. Wikipedia's #B5925D is ΔE 5.4 away."],
  ["TB", "Tampa Bay Buccaneers", "tampa-bay-buccaneers-team-colors", ["#D50A0A","#FF7900","#0A0A08","#B1BABF","#34302B"], ["#A71930","#FFFFFF","#322F2B","#322F2B","#FFFFFF"], "tampa-bay-buccaneers", ["#A71930","#322F2B"], ["#B1BABF","#000000","#A71930","#0A0B09","#C2242B","#DC4405"],
    { url: "https://www.buccaneers.com/", where: "club-customised nav accent --dropdown-hover-bkg-var (other clubs keep the league default)", listed: ["#A71930"] }, true,
    "Primary changed #D50A0A → #A71930 (ΔE 34.3): NFL.com's header, the league-hosted logo and buccaneers.com's own nav accent all use #A71930. Pewter #34302B is ΔE 1.0 from the official #322F2B. Accent NOT changed: #A71930 is 2.70:1 on the page (< 3:1), so the review's #D50A0A stays as the accent; the official logo's #C2242B (3.43:1) is the founder's alternative."],
  ["TEN", "Tennessee Titans", "tennessee-titans-color-codes", ["#0C2340","#4B92DB","#C8102E","#8A8D8F"], ["#4495D2","#FFFFFF","#D50A0A","#FFFFFF","#4495D2"], "tennessee-titans", ["#4495D2","#001532"], ["#D50A0A","#4495D2"],
    { url: "https://www.tennesseetitans.com/brand/", where: "brand page (March 2026 rebrand): page accent; text names Titans blue the primary home jersey, red number outlines, navy details", listed: ["#4495D2"] }, true,
    "Primary changed navy #0C2340 → Titans blue #4495D2, secondary #4B92DB → red #D50A0A, ink white → dark, accent → #4495D2. The March 2026 rebrand made Titans blue the dominant colour (club brand page and NFL.com); red is the shield logo's and the number outlines' colour (league-hosted logo). NFL.com's header pairs navy #001532 instead, the alternative secondary. tcc still lists the pre-2026 palette."],
  ["WSH", "Washington Commanders", "washington-redskins-color-codes", ["#5A1414","#FFB612"], ["#5A1414","#FFFFFF","#FFB612","#FFB612","#000000"], "washington-commanders", ["#5A1414","#FFB612"], ["#FFB612","#5A1414"], null, true, ""],
];

/**
 * The map changes this review made (before → after), each backed by the official sources in its team's row. The test
 * checks the map now holds every `after` value.
 */
export const COLOR_CHANGES = Object.freeze([
  ["BAL", "primary", "#241773", "#24135F"],
  ["CHI", "secondary", "#C83803", "#E64100"], ["CHI", "accent", "#C83803", "#E64100"],
  ["DAL", "primary", "#003594", "#002244"], ["DAL", "secondary", "#869397", "#B0B7BC"], ["DAL", "accent", "#869397", "#B0B7BC"],
  ["HOU", "primary", "#03202F", "#021018"], ["HOU", "secondary", "#A71930", "#EB0028"],
  ["JAX", "primary", "#101820", "#000000"],
  ["LAR", "secondary", "#FFA300", "#FFD100"], ["LAR", "accent", "#FFA300", "#FFD100"],
  ["NO", "secondary", "#101820", "#000000"],
  ["PIT", "secondary", "#101820", "#000000"],
  ["TB", "primary", "#D50A0A", "#A71930"],
  ["TEN", "primary", "#0C2340", "#4495D2"], ["TEN", "secondary", "#4B92DB", "#D50A0A"], ["TEN", "inkName", "white", "dark"], ["TEN", "accent", "#4B92DB", "#4495D2"],
].map(([abbr, field, before, after]) => Object.freeze({ abbr, field, before, after })));

const nearest = (hex, list) => list.reduce((b, h) => { const d = deltaE76(hex, h); return d < b.deltaE ? { hex: h, deltaE: Math.round(d * 10) / 10 } : b; }, { hex: null, deltaE: Infinity });

/** The sources of one row, each with what it lists and whether it agrees (the map's primary AND secondary within ΔE ≤ 5). */
function rowSources(row) {
  const [abbr, , slug, tcc, wiki, nflSlug, header, logo, club] = row;
  const S = VALIDATION_SOURCES;
  const list = [
    { id: "tcc", ...S.tcc, url: `${S.tcc.base}${slug}/`, listed: tcc },
    { id: "wiki", ...S.wiki, listed: wiki },
    { id: "nflHeader", ...S.nflHeader, url: `${S.nflHeader.base}${nflSlug}/`, listed: header },
    { id: "nflLogo", ...S.nflLogo, url: `${S.nflLogo.base}${abbr === "WSH" ? "WAS" : abbr}.svg`, listed: logo },
  ];
  if (club) list.push({ id: "club", ...S.club, url: club.url, where: club.where, listed: club.listed });
  const c = nflTeamColor(abbr);
  return list.map(({ base, ...s }) => {
    const primary = nearest(c.primary, s.listed);
    const secondary = nearest(c.secondary, s.listed);
    const agree = primary.deltaE <= VALIDATION_DELTA_E && secondary.deltaE <= VALIDATION_DELTA_E;
    return Object.freeze({ ...s, accessed: VALIDATION_ACCESSED, primary, secondary, agree });
  });
}

/** The comparison, recomputed from the observed source lists (dev-route-colors.test.mjs checks it matches `validated`). */
export function colorAgreement(abbr) {
  const row = VALIDATION_ROWS.find((r) => r[0] === abbr);
  if (!row || !nflTeamColor(abbr)) return null;
  const sources = rowSources(row);
  return { sources, ...validationRule(sources) };
}

/** `ABBR` → { team, sources: [{ id, name, url, accessed, official, family, listed, primary, secondary, agree }],
 *  primary, secondary, official, agree, validated, note }. */
export const TEAM_COLOR_VALIDATION = Object.freeze(Object.fromEntries(VALIDATION_ROWS.map((row) => {
  const [abbr, team, , , , , , , , validated, note] = row;
  const a = colorAgreement(abbr);
  const c = nflTeamColor(abbr);
  const agreeing = a.sources.filter((s) => s.agree).map((s) => s.id);
  return [abbr, Object.freeze({
    team,
    sources: a.sources,
    primary: { ours: c.primary },
    secondary: { ours: c.secondary },
    official: a.official,
    agree: a.agree,
    validated,
    note: note || `No change. Agreeing sources: ${agreeing.join(", ")} (ΔE ≤ 5).`,
  })];
})));
