/**
 * football-data.co.uk CSV → corpus rows (P257). Pure, so parsing and de-vigging are unit-tested.
 *
 * Columns MOVE between seasons (PSCH is column 74 in 2022-23 and 99 in 2025-26), so everything is read
 * by header name. Kickoff times are UK local; they are converted to UTC through Europe/London so the
 * walk-forward "strictly before" rule compares real instants.
 *
 * WHAT IS STORED: results, and the de-vigged MARKET-AVERAGE CLOSING probabilities (AvgCH/AvgCD/AvgCA,
 * AvgC>2.5/AvgC<2.5) — present in every season, unlike Pinnacle's, which the 2026-27 files lack. The
 * raw bookmaker prices are never committed (public repository); only our normalised derivation is.
 */

/** Minimal CSV line split (football-data files carry no quoted commas). */
function cells(line) { return line.replace(/\r$/, "").split(","); }

/** UK-local "dd/mm/yy(yy)" + "HH:MM" → ISO UTC. */
export function londonToUtcIso(dateStr, timeStr) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(dateStr ?? "").trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(String(timeStr ?? "").trim()) ? timeStr.trim().split(":").map(Number) : [15, 0];
  const guess = Date.UTC(year, Number(m[2]) - 1, Number(m[1]), hh, mm);
  // Offset of Europe/London at that instant (0 in winter, +60 in summer).
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const asLondon = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (asLondon - guess)).toISOString();
}

/** Proportional de-vig of decimal odds. Returns null unless every price is a real number > 1. */
export function devig(prices) {
  const p = prices.map(Number);
  if (!p.every((x) => Number.isFinite(x) && x > 1)) return null;
  const inv = p.map((x) => 1 / x);
  const s = inv.reduce((a, b) => a + b, 0);
  return { probs: inv.map((x) => Number((x / s).toFixed(4))), overround: Number((s - 1).toFixed(4)) };
}

/**
 * @param {string} csv
 * @param {{season:string}} meta  our season label, e.g. "2024-25"
 * @returns {{rows:Array<object>, skipped:{noResult:number, badDate:number}}}
 */
export function parseFootballData(csv, { season }) {
  const lines = String(csv ?? "").replace(/^﻿/, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: { noResult: 0, badDate: 0 } };
  const head = cells(lines[0]);
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const get = (c, name) => (ix[name] == null ? undefined : c[ix[name]]);
  const rows = [];
  const skipped = { noResult: 0, badDate: 0 };
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const ftHome = Number.parseInt(get(c, "FTHG"), 10), ftAway = Number.parseInt(get(c, "FTAG"), 10);
    if (!Number.isInteger(ftHome) || !Number.isInteger(ftAway)) { skipped.noResult += 1; continue; }
    const dateUtc = londonToUtcIso(get(c, "Date"), get(c, "Time"));
    if (!dateUtc) { skipped.badDate += 1; continue; }
    const close1x2 = devig([get(c, "AvgCH"), get(c, "AvgCD"), get(c, "AvgCA")]);
    const closeTot = devig([get(c, "AvgC>2.5"), get(c, "AvgC<2.5")]);
    rows.push({
      season, dateUtc,
      home: String(get(c, "HomeTeam")).trim(), away: String(get(c, "AwayTeam")).trim(),
      ftHome, ftAway, result: ftHome > ftAway ? "H" : ftHome === ftAway ? "D" : "A",
      market: {
        source: "football-data.co.uk market-average closing, de-vigged",
        close1x2: close1x2 ? { home: close1x2.probs[0], draw: close1x2.probs[1], away: close1x2.probs[2], overround: close1x2.overround } : null,
        closeOver25: closeTot ? { over: closeTot.probs[0], under: closeTot.probs[1], overround: closeTot.overround } : null,
      },
    });
  }
  rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  return { rows, skipped };
}
