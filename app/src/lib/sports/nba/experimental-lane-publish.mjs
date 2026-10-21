/**
 * NBA EXPERIMENTAL PUBLIC LANE · PUBLISH DECISION (automation of build-nba-experimental-public.mjs). PURE, no I/O.
 *
 * The lane (#1146, preregistration §13) shows one slate's frozen pre-tip v0.1 medians + Elo side. It is a Vercel build
 * input (app/public/data/nba/experimental-public/**), so the automation publishes AT MOST ONCE PER SLATE and only a
 * snapshot that is final:
 *
 *   HOLD     some scheduled game of the slate has neither a frozen v0.1 receipt nor has tipped — publishing now would
 *            mean a second publish (a second Production build) when it freezes. Postponed / cancelled rows don't count.
 *   PUBLISH  every scheduled game is frozen or has already tipped (a tipped game without a receipt can never get one:
 *            planRun refuses post-tip forecasts; it is absent from the snapshot and reported in `unfrozen`), the committed day file is
 *            absent, and every game re-derives from its receipt (the caller runs snapshotMatchesSource; any failure
 *            REFUSES the whole run).
 *   NOOP     the committed day file already holds the same snapshot (ignoring `generatedAt`).
 *   REFUSE   the committed day file exists and DIFFERS — a published slate is never rewritten by automation; a human
 *            decides. Also: no v0.1 file, or a snapshot that fails re-derivation.
 *
 * `latest.json` follows the newest slate only: it is written when this slate's date ≥ the date latest.json holds, so
 * a late re-run for an older slate never rolls the page back.
 */

export const PUBLISH = Object.freeze({ HOLD: "HOLD", PUBLISH: "PUBLISH", NOOP: "NOOP", REFUSE: "REFUSE" });
export const INACTIVE_STATUSES = Object.freeze(["STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_CANCELLED", "STATUS_SUSPENDED"]);

/** The snapshot without the fields that change on every rebuild of the same frozen inputs. */
export function comparableSnapshot(snap) {
  if (!snap) return null;
  const { generatedAt: _g, ...rest } = snap;
  return JSON.stringify(rest);
}

/**
 * @param {object} o
 * @param {string} o.date                 slate ET date (YYYY-MM-DD)
 * @param {object[]} o.scheduleRows       schedule rows ({providerEventId, dateUtc, statusRaw})
 * @param {(iso: string) => string} o.etDateOf
 * @param {object|null} o.forecastDoc     committed v0.1 forecasts day file
 * @param {string} o.now                  ISO instant of this run
 * @param {object|null} o.snapshot        buildExperimentalSnapshot(...) output for this run (null when no forecastDoc)
 * @param {boolean} o.rederivesOk         every snapshot game passed snapshotMatchesSource
 * @param {object|null} o.committedDay    the committed experimental-public/<date>.json, if any
 * @param {object|null} o.committedLatest the committed experimental-public/latest.json, if any
 * @returns {{ action: string, reason: string, pending: string[], unfrozen: string[], writeDay: boolean, writeLatest: boolean }}
 */
export function decidePublish({ date, scheduleRows, etDateOf, forecastDoc, now, snapshot, rederivesOk, committedDay = null, committedLatest = null }) {
  const out = (action, reason, extra = {}) => ({ action, reason, pending: [], unfrozen: [], writeDay: false, writeLatest: false, ...extra });
  if (!forecastDoc) return out(PUBLISH.HOLD, `no committed v0.1 forecast file for ${date} yet`);
  if (forecastDoc.family !== "v0.1") return out(PUBLISH.REFUSE, `forecast file family is ${JSON.stringify(forecastDoc.family)}, not v0.1`);
  const nowMs = Date.parse(now);
  const frozen = new Set((forecastDoc.games ?? []).map((g) => String(g.providerEventId)));
  const seen = new Set();
  const pending = [];
  const inactive = new Set();
  for (const r of scheduleRows ?? []) {
    if (!r?.providerEventId || !r?.dateUtc || etDateOf(r.dateUtc) !== date) continue;
    const id = String(r.providerEventId);
    if (seen.has(id)) continue;
    seen.add(id);
    if (INACTIVE_STATUSES.includes(r.statusRaw)) { inactive.add(id); continue; }
    if (frozen.has(id)) continue;
    if (Date.parse(r.dateUtc) <= nowMs) continue; // tipped without a receipt: final as excluded
    pending.push(id);
  }
  if (!seen.size) return out(PUBLISH.HOLD, `no scheduled games for ${date}`);
  const unfrozen = [...seen].filter((id) => !frozen.has(id) && !inactive.has(id) && !pending.includes(id));
  if (pending.length) return out(PUBLISH.HOLD, `${pending.length} game(s) not frozen yet: ${pending.join(", ")}`, { pending });
  if (!snapshot || !rederivesOk) return out(PUBLISH.REFUSE, "the snapshot does not re-derive from its receipts");
  if (!snapshot.games?.length) return out(PUBLISH.HOLD, `no publishable (receipt-verified pre-tip) game for ${date}`);
  const latestDate = committedLatest?.date ?? null;
  const writeLatest = latestDate == null || date >= latestDate;
  if (committedDay) {
    if (comparableSnapshot(committedDay) === comparableSnapshot(snapshot)) {
      // the day file is final; only latest.json may still lag (e.g. a run that wrote the day file but lost the race)
      const latestStale = writeLatest && comparableSnapshot(committedLatest) !== comparableSnapshot(committedDay);
      return latestStale
        ? out(PUBLISH.PUBLISH, `day file final; latest.json points at ${latestDate ?? "nothing"}`, { writeLatest: true })
        : out(PUBLISH.NOOP, `experimental-public/${date}.json already holds this snapshot`);
    }
    return out(PUBLISH.REFUSE, `experimental-public/${date}.json is already published and differs — automation never rewrites a published slate`);
  }
  return out(PUBLISH.PUBLISH, `every game of ${date} is frozen or tipped (${snapshot.games.length} published, ${snapshot.excluded?.length ?? 0} excluded, ${unfrozen.length} never frozen)`, { writeDay: true, writeLatest, unfrozen });
}
