/**
 * NBA ROWS FOR THE SITE SEARCH INDEX (overnight 2026-10-28 · W3).
 *
 * The index held 1,332 rows and not one NBA name: "Celtics", "Lakers" and "Tatum" found nothing while the NBA Official
 * Forecast published player projections every night.
 *
 * NBA has no team or player pages. So every row opens the page that DOES name them — the dated projections page
 * (/nba/projections/<date>/) of the newest committed slate they appear on — and its subtitle says that is where it goes.
 *
 * The source is the committed public lane (public/data/nba/experimental-public/<date>.json), read by the rule the page
 * owner uses to generate those routes (components/nba/experimental-lane.tsx · committedLaneDates): the lane switch is
 * on, the file parses, carries the lane schema and names its own date. A player is indexed because a published slate
 * projects him (players.away / players.home) — never because a roster or the lane's "unavailable" list names him.
 * Rows carry no number.
 *
 * Pure apart from reading `laneDir`; the switches are passed in so a test can turn them off.
 */
import fs from "node:fs";
import path from "node:path";

const DATED = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** "Oct 27" — the slate's own calendar date, never the reader's clock. */
export const nbaSlateDay = (date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));

export const nbaProjectionsHref = (date) => `/nba/projections/${date}/`;

/** Committed, schema-valid dated slates, ascending — the dates /nba/projections/[date] generates. */
export function nbaCommittedSlates(laneDir, { enabled, schema }) {
  if (!enabled || !fs.existsSync(laneDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(laneDir).sort()) {
    const date = DATED.exec(name)?.[1];
    if (!date) continue;
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(laneDir, name), "utf8")); } catch { snap = null; }
    if (snap?.schema === schema && snap.date === date && Array.isArray(snap.games)) out.push({ date, snap });
  }
  return out;
}

/**
 * Rows for the index, in the generator's own shape: { kind, label, sub, href, terms } (a team also carries `abbr`).
 * Subtitles stay short — about 320 players on eight slates is the index's largest new block, and the file has a 260 KB
 * fetch-on-demand budget (src/lib/search/index.test.mjs).
 */
export function nbaSearchRows(laneDir, { enabled, schema }) {
  const slates = nbaCommittedSlates(laneDir, { enabled, schema });
  const rows = [];
  /* Newest slate wins: walk newest → oldest and keep the first sighting of each team and each player. */
  const teams = new Map();
  const players = new Map();
  for (const { date, snap } of [...slates].reverse()) {
    for (const g of snap.games) {
      for (const side of ["away", "home"]) {
        const t = g?.[side];
        if (t?.name && !teams.has(t.name)) teams.set(t.name, { abbr: t.abbr ?? null, date });
        for (const p of g?.players?.[side] ?? []) {
          if (!p?.name || !p.providerAthleteId || players.has(p.providerAthleteId)) continue;
          players.set(p.providerAthleteId, { name: p.name, team: t?.abbr ?? null, date });
        }
      }
    }
  }
  const newest = slates.at(-1);
  for (const g of newest?.snap.games ?? []) {
    if (!g?.away?.name || !g?.home?.name) continue;
    rows.push({
      kind: "event", label: `${g.away.name} @ ${g.home.name}`, sub: `NBA · ${nbaSlateDay(newest.date)} · player projections`,
      href: nbaProjectionsHref(newest.date), terms: [g.away.abbr, g.home.abbr, "nba", "basketball"].filter(Boolean),
    });
  }
  for (const [name, t] of teams) {
    rows.push({
      kind: "team", label: name, abbr: t.abbr, sub: `NBA · no team page · opens ${nbaSlateDay(t.date)} projections`,
      href: nbaProjectionsHref(t.date), terms: ["nba", "basketball"],
    });
  }
  for (const p of players.values()) {
    rows.push({
      kind: "player", label: p.name, sub: `NBA · ${p.team ? `${p.team} · ` : ""}opens ${nbaSlateDay(p.date)} projections`,
      href: nbaProjectionsHref(p.date), terms: [p.team, "nba"].filter(Boolean),
    });
  }
  return rows;
}
