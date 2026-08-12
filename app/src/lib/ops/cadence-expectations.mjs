/**
 * Committed expectations for the next scheduled cadence run (Program 163 · Release C).
 *
 * These are TOMORROW'S truths written down tonight, so the verifier can catch a contradiction
 * instead of a human remembering one. Every committed artifact class uses stamp-stripped
 * idempotent commits, so retention (no file change on an unchanged day) is allowed everywhere the
 * design discards — the acquisition proof on such days is the run's own step log.
 *
 * Reality-gated notes (never promoted here, only checked):
 *   - EPL stays PRESEASON until Aug 21 — a RESULTS flip earlier means friendlies leaked in.
 *   - NBA stays NO_RESULTS_YET until the Oct 3 preseason opener.
 *   - UFC should carry RESULTS (a trailing window with recent cards); the FIRST JOINED bouts from
 *     the Aug 11 Contender Series card are the watch — verified via the adapter, not assumed.
 */

export const CADENCE_EXPECTATIONS = Object.freeze({
  "nfl-schedule": { allowRetention: true },
  "nba-schedule": { allowRetention: true },
  "ufc-schedule": { allowRetention: true },
  "epl-fixtures": { allowRetention: true },
  "nfl-results": { state: "RESULTS", allowRetention: true, note: "the trailing window still holds the Aug 7 final, honestly quarantined for lineage; the first JOIN is the Aug 13+ watch" },
  "nba-results": { state: "NO_RESULTS_YET", allowRetention: true, note: "off-season until Oct 3" },
  "ufc-results": { state: "RESULTS", allowRetention: true, note: "trailing window holds recent cards; first joined bouts are the watch" },
  "epl-results": { state: "PRESEASON", allowRetention: true, note: "no league play before Aug 21 — a RESULTS flip tomorrow would mean friendlies leaked in" },
  "injuries-nfl": { allowRetention: true },
  "injuries-nba": { allowRetention: true },
});
