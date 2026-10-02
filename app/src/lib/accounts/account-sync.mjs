/**
 * ACCOUNT SYNC — follows and saves between this browser and the reader's account (Session 9 · I1/I2).
 *
 * Pure: it decides, the panel writes. Canonical ids only (lib/follow/follow-schema.mjs, saved-schema.mjs).
 *
 * THE MERGE STRATEGY, PER TYPE — and the rule behind all of it: on first sign-in nothing on this device is
 * overwritten or deleted, and nothing in the account is either.
 *
 *   follows   UNION. A follow on either side ends up on both. Both sides are sets of canonical ids, so a
 *             union cannot lose a choice. A REMOVAL propagates only when it happened SINCE THE LAST SYNC:
 *             an id in the last-synced baseline that one side no longer holds was unfollowed there, so it
 *             is removed from the other. With no baseline (the first sign-in on a device) nothing is ever
 *             removed — an id missing from one side is simply added to it.
 *   saves     UNION. A saved forecast is an immutable snapshot of a published forecast, keyed by its id;
 *             the account keeps the snapshot so another device can show it. Same id on both sides → the
 *             device copy is kept (both are snapshots of the same published forecast; the earliest
 *             `savedAt` is the honest one). Removals propagate by the same last-synced baseline rule.
 *   style     risk / bankroll / unit — unchanged: lib/accounts/style-sync.mjs (adopt only into an empty
 *             device; otherwise both shown and the reader picks).
 *   prefs     user_preferences (sports, products, families, risk bands) lives only in the account; no device
 *             copy exists, so there is nothing to merge.
 *   bets      account only (bet_slips); never on the device, never in Mr. Dub.
 *
 * ⚠ A user's results never reach any of this: no sync decision reads a bet, a P/L or a bankroll.
 */
import { normalizeRef, refKey } from "../follow/follow-schema.mjs";

export const ACCOUNT_SYNC_VERSION = "account-sync@1";

/** A canonical id names its sport: mlb-team-*, nfl-team-*, nfl-athlete-*. Anything else is refused. */
export function sportOfEntityId(id) {
  const s = String(id ?? "");
  if (/^mlb-team-\d+$/.test(s)) return "MLB";
  if (/^nfl-(team|athlete)-\d+$/.test(s)) return "NFL";
  return null;
}

/** Device follow ref → user_follows row (minus user_id, which the writer sets). Null when not canonical. */
export function followRowOf(ref) {
  const r = normalizeRef(ref);
  if (!r) return null;
  return { kind: r.entityType, entity_id: r.id, label: r.label ?? null };
}

/** user_follows row → device follow ref, or null (a row that is not a canonical team/player is never adopted). */
export function followRefOfRow(row) {
  if (!row || !["team", "player"].includes(row.kind)) return null;
  return normalizeRef({ sport: sportOfEntityId(row.entity_id), entityType: row.kind, id: row.entity_id, ...(row.label ? { label: row.label } : {}) });
}

/** Split a two-sided diff by the last-synced baseline: missing-since-sync = removed there; otherwise added here. */
function reconcile(deviceKeys, accountKeys, lastSynced) {
  const base = lastSynced ? new Set(lastSynced) : null;
  const add = { toAccount: [], toDevice: [] }, remove = { fromAccount: [], fromDevice: [] };
  for (const k of deviceKeys) if (!accountKeys.has(k)) (base?.has(k) ? remove.fromDevice : add.toAccount).push(k);
  for (const k of accountKeys) if (!deviceKeys.has(k)) (base?.has(k) ? remove.fromAccount : add.toDevice).push(k);
  return { add, remove };
}

/**
 * @param {Array} deviceRefs   the device's canonical follow refs
 * @param {Array} accountRows  the reader's own user_follows rows
 * @param {string[]|null} lastSynced  keys present on BOTH sides after the previous sync (null = first sign-in)
 * @returns {{ toAccount: Array, toDevice: Array, removeFromAccount: Array, removeFromDevice: Array, both: number, refused: number, synced: string[] }}
 */
export function planFollowSync(deviceRefs, accountRows, lastSynced = null) {
  const device = new Map();
  let refused = 0;
  for (const ref of deviceRefs ?? []) { const r = normalizeRef(ref); if (r) device.set(refKey(r), r); else refused += 1; }
  const account = new Map();
  for (const row of accountRows ?? []) { const r = followRefOfRow(row); if (r) account.set(refKey(r), r); else refused += 1; }
  const { add, remove } = reconcile(new Set(device.keys()), new Set(account.keys()), lastSynced);
  const both = [...device.keys()].filter((k) => account.has(k));
  return {
    toAccount: add.toAccount.map((k) => followRowOf(device.get(k))),
    toDevice: add.toDevice.map((k) => account.get(k)),
    removeFromAccount: remove.fromAccount.map((k) => unfollowRow(account.get(k))),
    removeFromDevice: remove.fromDevice.map((k) => device.get(k)),
    both: both.length, refused,
    synced: [...both, ...add.toAccount, ...add.toDevice].sort(),
  };
}

/** The explicit unfollow, as the row filter to delete. Never derived from a missing row. */
export function unfollowRow(ref) {
  const row = followRowOf(ref);
  return row ? { kind: row.kind, entity_id: row.entity_id } : null;
}

const MAX_SNAPSHOT_BYTES = 8_000;

/** Device saved forecast → saved_items row. The snapshot is the public forecast as saved; bounded. */
export function savedRowOf(item) {
  if (!item || typeof item.id !== "string" || !item.id) return null;
  const snapshot = JSON.stringify(item);
  if (snapshot.length > MAX_SNAPSHOT_BYTES) return null;
  return { kind: "official_forecast", ref: item.id, snapshot: JSON.parse(snapshot) };
}

/**
 * @param {Array} deviceItems   saved forecasts on this device
 * @param {Array} accountRows   the reader's own saved_items rows
 * @param {(raw:any)=>any|null} validate  the saved-schema validator; an account snapshot that fails it is refused
 * @param {string[]|null} [lastSynced]  ids on BOTH sides after the previous sync (null = first sign-in)
 */
export function planSavedSync(deviceItems, accountRows, validate = (x) => x, lastSynced = null) {
  const device = new Map((deviceItems ?? []).filter((i) => i?.id).map((i) => [i.id, i]));
  const account = new Map();
  let refused = 0;
  for (const row of accountRows ?? []) {
    if (row?.kind !== "official_forecast" || !row.ref) { refused += 1; continue; }
    const item = row.snapshot ? validate(row.snapshot) : null;
    if (!item || item.id !== row.ref) { refused += 1; continue; }
    account.set(row.ref, item);
  }
  const { add, remove } = reconcile(new Set(device.keys()), new Set(account.keys()), lastSynced);
  const both = [...device.keys()].filter((id) => account.has(id));
  return {
    toAccount: add.toAccount.map((id) => savedRowOf(device.get(id))).filter(Boolean),
    toDevice: add.toDevice.map((id) => account.get(id)),
    removeFromAccount: remove.fromAccount.map((id) => ({ kind: "official_forecast", ref: id })),
    removeFromDevice: remove.fromDevice.map((id) => device.get(id)),
    both: both.length, refused,
    synced: [...both, ...add.toAccount, ...add.toDevice].sort(),
  };
}

/** Plain English for what a sync did — shown to the reader, never silent. */
export function describeSync(follow, saved) {
  const parts = [];
  if (follow.toAccount.length) parts.push(`${follow.toAccount.length} follow${follow.toAccount.length === 1 ? "" : "s"} from this browser saved to your account`);
  if (follow.toDevice.length) parts.push(`${follow.toDevice.length} follow${follow.toDevice.length === 1 ? "" : "s"} from your account added here`);
  if (saved.toAccount.length) parts.push(`${saved.toAccount.length} saved forecast${saved.toAccount.length === 1 ? "" : "s"} copied to your account`);
  if (saved.toDevice.length) parts.push(`${saved.toDevice.length} saved forecast${saved.toDevice.length === 1 ? "" : "s"} from your account added here`);
  const removed = (follow.removeFromAccount?.length ?? 0) + (follow.removeFromDevice?.length ?? 0) + (saved.removeFromAccount?.length ?? 0) + (saved.removeFromDevice?.length ?? 0);
  if (removed) parts.push(`${removed} item${removed === 1 ? "" : "s"} you removed since the last sync removed on the other side too`);
  return parts.length ? `${parts.join("; ")}.` : "This browser and your account already match.";
}
