/**
 * openfootball football.json → soccer corpus rows. Public domain (CC0 1.0): https://github.com/openfootball/football.json
 *
 * Replaces football-data.co.uk as the soccer results source (founder decision 2026-09-14: football-data's terms say
 * its data is "intended for private individuals only, NOT commercial or data training products using automated
 * bots"). openfootball carries results only — no prices — so every row's `market` is null.
 *
 * Pure, so parsing is unit-tested. The capture script does the I/O.
 *
 * FORMATS SEEN (2010-11 … 2026-27): score as { ht, ft } (most rows), as a bare [home, away] array (from 2025-26),
 * as an empty object (unplayed: Ligue 1 2019-20 abandoned rounds), or absent (future fixtures). Times are "HH:MM"
 * in the league's local time, sometimes blank; a blank time is read as 15:00 local, as football-data's was.
 */

export const OPENFOOTBALL_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master";
export const OPENFOOTBALL_ATTRIBUTION = "Results: openfootball football.json (https://github.com/openfootball/football.json), public domain (CC0 1.0).";

/** Our league keys → openfootball competition code and the league's local time zone. */
export const OPENFOOTBALL_LEAGUES = Object.freeze({
  epl: { code: "en.1", timeZone: "Europe/London" },
  "ligue-1": { code: "fr.1", timeZone: "Europe/Paris" },
  laliga: { code: "es.1", timeZone: "Europe/Madrid" },
  "serie-a": { code: "it.1", timeZone: "Europe/Rome" },
  bundesliga: { code: "de.1", timeZone: "Europe/Berlin" },
});

/** The season label for a date: the season that starts in July/August of that year. */
export function seasonOfDate(isoDate) {
  const [y, m] = String(isoDate).slice(0, 7).split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** Local wall-clock "YYYY-MM-DD" + "HH:MM" in an IANA zone → ISO UTC (DST-correct). */
export function localToUtcIso(date, time, timeZone) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (!dm) return null;
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  const [hh, mm] = tm ? [Number(tm[1]), Number(tm[2])] : [15, 0];
  const wall = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hh, mm);
  const offsetAt = (instant) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(instant)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant;
  };
  const first = wall - offsetAt(wall);
  return new Date(wall - offsetAt(first)).toISOString();
}

/** The final score of a match as [home, away] integers, or null when it has none. */
export function finalScore(match) {
  const s = match?.score;
  const pair = Array.isArray(s) ? s : Array.isArray(s?.ft) ? s.ft : null;
  if (!pair || pair.length !== 2 || !pair.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return pair;
}

/* Generic club-form tokens that vary between seasons of the same club ("Aston Villa" / "Aston Villa FC"). */
const FORM_TOKENS = new Set(["fc", "afc", "cf", "sc", "ac", "as", "ss", "ssc", "us", "ud", "cd", "rc", "rcd", "sv", "cfc", "bc", "calcio", "club", "de", "del", "la", "1", "04", "05", "07", "29", "1899", "1901", "1907", "1909", "1913"]);

/**
 * A season-stable club key: diacritics folded, "&" read as "and", punctuation dropped, generic form tokens removed.
 * Two different clubs sharing a key in one season is a defect the capture refuses (checked there, not assumed).
 */
export function clubKey(name) {
  return String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((t) => t && !FORM_TOKENS.has(t)).join(" ");
}

/**
 * @param {{matches: Array<object>}} json  one openfootball season file
 * @param {{season: string, timeZone: string}} meta
 * @returns {{rows: Array<object>, skipped: {noScore: number, badDate: number}}}
 */
export function parseOpenfootball(json, { season, timeZone }) {
  const rows = [];
  const skipped = { noScore: 0, badDate: 0 };
  for (const m of json?.matches ?? []) {
    const ft = finalScore(m);
    if (!ft) { skipped.noScore += 1; continue; }
    const dateUtc = localToUtcIso(m.date, m.time, timeZone);
    if (!dateUtc) { skipped.badDate += 1; continue; }
    const [ftHome, ftAway] = ft;
    rows.push({
      season, dateUtc,
      homeSource: String(m.team1).trim(), awaySource: String(m.team2).trim(),
      ftHome, ftAway, result: ftHome > ftAway ? "H" : ftHome === ftAway ? "D" : "A",
      market: null,
    });
  }
  rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.homeSource.localeCompare(b.homeSource));
  return { rows, skipped };
}
