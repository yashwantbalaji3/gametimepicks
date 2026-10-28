/**
 * HOME · "Latest results <date>" (Housekeeping 10-22). The rule moved to the ONE settled-through owner,
 * lib/results/settled-through.mjs (P0 U1), so Home, the global header chip and every product page read the
 * same accessor. Re-exported here so existing imports keep resolving to that one implementation.
 */
export { isSettledRecordCell, newestSettledDate } from "../results/settled-through.mjs";
