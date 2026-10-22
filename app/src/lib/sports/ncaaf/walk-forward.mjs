/**
 * NCAAF · leakage-safe walk-forward runner (MODEL_EVALUATION_PROTOCOL.md §1). PRIVATE_RESEARCH.
 *
 * Corpus rows are grouped by slate day (America/New_York date) in chronological order. For each slate day the
 * model is told the date, asked to forecast EVERY game on it, and only then shown that day's results. A model
 * therefore never sees a same-day or later outcome when it forecasts, whatever order games finished in. The
 * runner hands `observe` only rows from the slate just forecast, and refuses rows that go backwards in time.
 *
 * Model interface (models.mjs):
 *   beginSlate(slateDate, season)   — season transitions, decay; no outcomes
 *   predict(row) → forecast          — must not read row.homeScore / row.awayScore
 *   observe(rows, forecasts)         — the slate's outcomes, after all of its forecasts were taken
 */

/** Rows grouped by slateDate, ascending; within a day by startUtc then eventId (deterministic). */
export function slates(rows) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.slateDate)) by.set(r.slateDate, []); by.get(r.slateDate).push(r); }
  return [...by.keys()].sort().map((d) => ({
    slateDate: d,
    rows: by.get(d).sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.eventId.localeCompare(b.eventId)),
  }));
}

/**
 * The fields a model may see at predict time. Outcomes are stripped so a model bug cannot read them —
 * this is the mechanical half of the as-of rule.
 */
export function pregameView(row) {
  const { homeScore, awayScore, overtimePeriods, ...visible } = row;
  return visible;
}

/**
 * Run `model` over `rows`; returns one forecast record per row for which `keep(row)` is true.
 * `until` (optional, YYYY-MM-DD) stops after the last slate day ≤ until.
 */
export function walkForward(model, rows, { keep = () => true, until = null } = {}) {
  const out = [];
  let last = null;
  for (const { slateDate, rows: day } of slates(rows)) {
    if (until && slateDate > until) break;
    if (last !== null && slateDate <= last) throw new Error(`walkForward: slate ${slateDate} is not after ${last}`);
    last = slateDate;
    model.beginSlate(slateDate, day[0].season);
    const forecasts = day.map((r) => model.predict(pregameView(r)));
    model.observe(day, forecasts);
    day.forEach((r, i) => {
      if (!keep(r)) return;
      const f = forecasts[i];
      out.push({
        eventId: r.eventId, season: r.season, week: r.week, seasonType: r.seasonType, slateDate,
        pairing: r.pairing, neutralSite: r.neutralSite, conferenceGame: r.conferenceGame,
        cluster: `${r.season}-${r.seasonType}-${String(r.week).padStart(3, "0")}`,
        homeWin: r.homeScore > r.awayScore ? 1 : 0,
        margin: r.homeScore - r.awayScore,
        total: r.homeScore + r.awayScore,
        ...f,
      });
    });
  }
  return out;
}
