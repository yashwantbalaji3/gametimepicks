/**
 * INJURY DESIGNATION CARRY-FORWARD — an omission is not an activation.
 *
 * ESPN's public injuries feed behaves like a rolling list of about eight hundred entries: as new
 * designations arrive, older ones fall off the end. It does not report "activated" when that
 * happens — the entry simply stops being there. Between the 2026-09-09 and 2026-09-10 captures, 27
 * blocking designations vanished with no entry at all, 25 of them long-term (Injured Reserve or
 * Suspension), and not one was ever updated to a non-blocking status. Vanishing is how the
 * feed forgets, not how it reports a recovery.
 *
 * Every consumer read the forgetting as health. Role evidence looks a player up in the current
 * file; absent means no designation, and a fresh feed with no designation classifies as
 * ACTIVE_UNCERTAIN. Tony Fields II, on Injured Reserve since 2026-08-31 — a placement that cannot
 * lift before Week 5 — read as available for Week 1 the moment he aged out of the list. The board's
 * publication gate had the same hole in CI, because the window's in-run capture overwrites the
 * file before the board builds.
 *
 * This carries such designations forward AT CAPTURE, the only place that sees both the previous
 * file and the new feed, so every consumer inherits the correction at once.
 *
 * FOUR RULES KEEP IT FROM BECOMING THE OPPOSITE ERROR:
 *   · the feed can always overrule it — if the player appears in the new feed with ANY status, the
 *     feed has spoken and nothing is carried
 *   · only LONG-TERM statuses carry (Injured Reserve, Suspension — per the contract); a game-week
 *     "Out" legitimately clears when the game is played
 *   · a carried designation ends on an EXPLICIT activation only (eligibility contract v1, R1): the feed
 *     lists the player again, or the roster capture taken at this capture — after the designation was
 *     stated — says he is "active". There is NO time-based expiry.
 *   · an undated designation is not carried; there is no evidence of how recent it is
 *
 * Carried entries are marked `carriedForward` with the moment they first went missing, so nothing
 * is ever silently restored and every carried row can be audited.
 *
 * THE WINDOW WAS THE DEFECT (INC-2026-11-08-01). Until 2026-11-09 a carried designation lapsed
 * ABSENT_DESIGNATION_CARRY_H (336 h) after it was stated. De'Von Achane's season-ending IR (stated
 * 2026-09-28) lapsed on 2026-10-12, ESPN had already dropped him, and he was published as an anytime-TD
 * candidate on 11-08. The founder's decision (PD eligibility contract v1, 11-09) is the policy change the
 * old honest-limit note asked for.
 */

import { isBlockingStatus, isLongTermStatus } from "./contract.mjs";

/** RETIRED 2026-11-09 (eligibility contract v1, R1): long-term designations no longer expire. Kept, as null, only so
 *  the capture artifact can state there is no window (`carryForward.windowHours: null`). */
export const ABSENT_DESIGNATION_CARRY_H = null;

/** athlete id → roster status type, when the roster capture is newer than `afterIso` (an activation must come after). */
function rosterActiveSince(roster) {
  const at = Date.parse(roster?.generatedAt ?? roster?.capturedAt ?? "");
  const active = new Set();
  for (const t of roster?.teams ?? []) for (const p of t?.players ?? []) {
    const type = p?.status?.type ?? p?.rosterStatusType;
    if (String(type ?? "").toLowerCase() === "active") active.add(String(p.id ?? p.providerAthleteId));
  }
  return { at, active };
}

/* Which statuses block, and which outlast a game, come from the contract's own vocabulary — the
   hand-written regex this replaces missed "Suspension" entirely (see contract.mjs). */

/**
 * Merge the new feed with long-term designations that have vanished from it.
 *
 * @param {object} o
 * @param {Array<object>} o.previousEntries  entries from the file this capture is about to replace
 * @param {Array<object>} o.currentEntries   entries normalised from the new feed
 * @param {string}        o.nowIso           the capture moment
 * @param {object|null}   [o.roster]         the roster capture taken with this one (NFL public / NBA research shape)
 * @returns {{entries: Array<object>, carried: Array<object>, skipped: Record<string, number>}}
 */
export function carryForwardDesignations({ previousEntries = [], currentEntries = [], nowIso, roster = null } = {}) {
  const nowMs = Date.parse(nowIso ?? "");
  if (!Number.isFinite(nowMs)) throw new Error("carryForwardDesignations: nowIso required");

  const current = Array.isArray(currentEntries) ? currentEntries : [];
  const seen = new Set(current.map((e) => String(e?.athleteId ?? "")).filter(Boolean));
  const carried = [];
  // Diagnostics count BLOCKING designations only, so the numbers describe decisions, not noise.
  const skipped = { spokenInFeed: 0, gameWeekOut: 0, activatedByRoster: 0, undated: 0 };
  const ros = rosterActiveSince(roster);

  for (const e of Array.isArray(previousEntries) ? previousEntries : []) {
    const id = String(e?.athleteId ?? "");
    const status = String(e?.status ?? "");
    if (!id || !isBlockingStatus(status)) continue;
    if (seen.has(id)) { skipped.spokenInFeed += 1; continue; } // the feed has spoken — it wins
    if (!isLongTermStatus(status)) { skipped.gameWeekOut += 1; continue; }
    const stated = Date.parse(e?.statedAt ?? "");
    if (!Number.isFinite(stated)) { skipped.undated += 1; continue; }
    // R1: the only way out is an explicit activation — a roster capture AFTER the designation saying active
    if (ros.active.has(id) && Number.isFinite(ros.at) && ros.at > stated) { skipped.activatedByRoster += 1; continue; }
    carried.push({ ...e, carriedForward: true, absentFromFeedSince: e.absentFromFeedSince ?? nowIso });
    seen.add(id); // never carry the same athlete twice
  }

  return { entries: [...current, ...carried], carried, skipped };
}

/**
 * Rebuild what the carry WOULD have remembered, from the committed history of the injuries file.
 *
 * The carry-forward only shipped on 2026-09-10, so designations that aged out of ESPN's rolling list
 * before then were already gone from the committed file — 55 Injured Reserve placements still inside
 * the window, some missing since 2026-08-31. Git kept every capture, so the memory exists; it just was
 * never consulted.
 *
 * Deliberately a thin wrapper: it builds the "previous" set from each absent athlete's LAST KNOWN
 * entry and hands it to carryForwardDesignations, so a backfilled row obeys exactly the same four
 * rules as a live carry. Last-known wins — a player later re-listed as Questionable and then dropped
 * is not resurrected as Injured Reserve.
 *
 * @param {object} o
 * @param {Array<{generatedAt:string, entries:Array<object>}>} o.captures  oldest → newest; the last is current
 * @param {string} o.nowIso
 */
export function recoverFromHistory({ captures = [], nowIso, roster = null } = {}) {
  const list = (Array.isArray(captures) ? captures : []).filter((c) => c && Array.isArray(c.entries));
  if (!list.length) return { entries: [], carried: [], skipped: { spokenInFeed: 0, gameWeekOut: 0, activatedByRoster: 0, undated: 0 } };
  const current = list[list.length - 1];
  const lastSeen = new Map();
  list.forEach((c, i) => { for (const e of c.entries) if (e?.athleteId != null) lastSeen.set(String(e.athleteId), { entry: e, idx: i }); });
  const currentIds = new Set(current.entries.map((e) => String(e?.athleteId ?? "")));
  const previousEntries = [];
  for (const [id, { entry, idx }] of lastSeen) {
    if (currentIds.has(id)) continue;
    // The first capture after its last appearance is when the feed forgot it.
    const firstMissing = list[idx + 1]?.generatedAt ?? null;
    previousEntries.push({ ...entry, absentFromFeedSince: entry.absentFromFeedSince ?? firstMissing });
  }
  return carryForwardDesignations({ previousEntries, currentEntries: current.entries, nowIso, roster });
}
