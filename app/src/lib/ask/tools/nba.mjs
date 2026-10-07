/**
 * ASK · NBA SCHEDULE AND FINALS (2026-10-05, NBA audit X3) — "who won Heat–Raptors?", "when do the Celtics play?".
 *
 * Reads the daily Ask projection of the NBA schedule capture and the write-once finals record (the same files the
 * /nba/ pages read). FACTS ONLY: GameTime publishes no NBA forecast, and this tool has no field that could carry one —
 * no probability, no line, no pick, no projected score. A game missing from the finals record is pending, never a loss.
 *
 * A team is named in the user's words and matched here, against the NBA teams in the record: full name ("Boston
 * Celtics"), tricode ("BOS") or the name without its city ("Celtics", "Trail Blazers"). A word that names several
 * teams, or none, is a question back to the user — never a guess.
 */
import { ASK_ERROR, ASK_STATUS, askAssetPath } from "../contract.mjs";

const NBA_LINK = { id: "nba", label: "NBA", href: "/nba/" };

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Every team the text could mean: exact full name or abbreviation; else a whole-word ending of the full name
 * ("Celtics", "Trail Blazers"); else a name whose nickname ends the text ("Los Angeles Clippers" → "LA Clippers").
 */
export function matchNbaTeams(text, teams) {
  const q = fold(text);
  if (!q) return [];
  const exact = teams.filter((t) => fold(t.name) === q || (t.abbrs ?? []).some((a) => fold(a) === q));
  if (exact.length) return exact;
  const ending = teams.filter((t) => fold(t.name).endsWith(` ${q}`));
  if (ending.length) return ending;
  return teams.filter((t) => q.endsWith(` ${fold(t.name).split(" ").at(-1)}`));
}

const involves = (name) => (g) => g.away.name === name || g.home.name === name;

/**
 * @param {{ team?: string, opponent?: string, date?: string, show?: "finals"|"schedule"|"both", limit?: number }} args
 */
export async function getNbaGames(args, ctx) {
  const loaded = await ctx.turn.load(askAssetPath.nba());
  if (!loaded?.ok) return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE };
  const doc = loaded.json;
  if (doc?.available !== true) {
    return { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.NOT_PUBLISHED, detail: "no NBA schedule or finals record is published in this build", links: [NBA_LINK] };
  }
  const teams = doc.teams ?? [];
  const pick = (text, role) => {
    if (!text) return { ok: true, name: null };
    const m = matchNbaTeams(text, teams);
    if (m.length === 1) return { ok: true, name: m[0].name };
    return {
      ok: false,
      envelope: m.length
        ? { status: ASK_STATUS.PARTIAL, error: ASK_ERROR.AMBIGUOUS_ENTITY, detail: `"${text}" could be more than one NBA team`, candidates: m.slice(0, 6).map((t) => t.name), links: [NBA_LINK] }
        : { status: ASK_STATUS.UNSUPPORTED, error: ASK_ERROR.ENTITY_NOT_FOUND, detail: `no NBA team called "${text}" is in GameTime's NBA ${role === "team" ? "schedule or finals" : "record"}`, links: [NBA_LINK] },
    };
  };
  const team = pick(args.team, "team");
  if (!team.ok) return team.envelope;
  const opp = pick(args.opponent, "opponent");
  if (!opp.ok) return opp.envelope;

  const show = args.show ?? "both";
  const limit = args.limit ?? 5;
  const filter = (list) => {
    let out = list;
    if (team.name) out = out.filter(involves(team.name));
    if (opp.name) out = out.filter(involves(opp.name));
    if (args.date) out = out.filter((g) => g.dateEt === args.date);
    return out;
  };
  /* "Upcoming" is relative to the product date, not the capture: a scheduled game whose ET day has passed and has no
     recorded final is PENDING (listed with the finals, as not yet recorded), never upcoming and never a loss. */
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ctx.now ? ctx.now() : new Date());
  const scheduledAll = filter(doc.schedule ?? []);
  const finals = show === "schedule" ? [] : filter(doc.finals ?? []);
  const pending = show === "schedule" ? [] : scheduledAll.filter((g) => g.dateEt < today).reverse();
  const upcoming = show === "finals" ? [] : scheduledAll.filter((g) => g.dateEt >= today);
  return {
    status: ASK_STATUS.OK,
    team: team.name ?? null,
    opponent: opp.name ?? null,
    date: args.date ?? null,
    show,
    season: doc.season ?? null,
    finalsMatched: finals.length,
    scheduledMatched: upcoming.length,
    finals: finals.slice(0, limit),
    pendingMatched: pending.length,
    pending: pending.slice(0, limit),
    scheduled: upcoming.slice(0, limit),
    scheduleAsOf: doc.scheduleAsOf ?? null,
    finalsAsOf: doc.finalsAsOf ?? null,
    links: [NBA_LINK],
  };
}
