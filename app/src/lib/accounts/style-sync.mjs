/**
 * STYLE SYNC (P267) — one stated style, whether it lives in a browser or in an account.
 *
 * The reader's style (risk tolerance, paper bankroll, percent per card) has always lived in their
 * browser, because before accounts there was nowhere else honest to put it. An account gives it a
 * second home, and two homes is exactly how a preference quietly becomes wrong: sign in on a phone
 * and the phone's blank defaults overwrite the desk's numbers, or the account's stale numbers
 * overwrite what the reader just typed.
 *
 * So nothing here overwrites anything silently, with ONE exception that cannot lose information: a
 * device that has stated no style at all adopts the account's. Every other case is shown to the
 * reader with both numbers visible and a button per direction. This module only decides WHICH of
 * those situations is true; the panel renders it and the reader chooses.
 *
 * A style is a filter and some arithmetic — never a recommendation. See lib/prefs/reader-prefs.ts
 * for the line this whole feature stays on.
 */

const RISKS = new Set(["low", "medium", "high", "longshot"]);
const UNIT_MIN = 1;
const UNIT_MAX = 10;

/** The same normalisation on both sides, so "differ" can never mean "one of them is 2 and the other is 2.0". */
export function normaliseStyle(raw) {
  const src = raw ?? {};
  const bankrollRaw = Number(src.bankroll);
  const unitRaw = Number(src.unitPct ?? src.unit_pct);
  const risk = RISKS.has(src.risk) ? src.risk : null;
  const bankroll = Number.isFinite(bankrollRaw) && bankrollRaw > 0 ? Math.round(bankrollRaw * 100) / 100 : null;
  const unitPct = Number.isFinite(unitRaw) ? Math.min(UNIT_MAX, Math.max(UNIT_MIN, Math.round(unitRaw))) : 2;
  return { risk, bankroll, unitPct };
}

/**
 * Has the reader actually said anything?
 *
 * The percent per card is deliberately NOT part of this. It has a default of 2 that every reader
 * carries without ever touching the control, so treating it as a statement would make an untouched
 * browser look like it held a considered style — and that phantom style would then be offered to
 * overwrite the real one in the account.
 */
export const styleStated = (s) => s.risk != null || s.bankroll != null;

export const sameStyle = (a, b) => a.risk === b.risk && a.bankroll === b.bankroll && a.unitPct === b.unitPct;

/**
 * @param {Record<string, any>|null} profileRow  the reader's own profiles row, or null if none yet
 * @param {Record<string, any>|null} devicePrefs the browser-local prefs
 * @returns {{state: "NEITHER"|"DEVICE_ONLY"|"ACCOUNT_ONLY"|"MATCH"|"DIFFER",
 *            account: {risk: string|null, bankroll: number|null, unitPct: number},
 *            device: {risk: string|null, bankroll: number|null, unitPct: number},
 *            autoAdopt: boolean, text: string}}
 */
export function decideStyleSync(profileRow, devicePrefs) {
  const account = normaliseStyle(profileRow);
  const device = normaliseStyle(devicePrefs);
  const hasAccount = styleStated(account);
  const hasDevice = styleStated(device);

  if (!hasAccount && !hasDevice) {
    return {
      state: "NEITHER", account, device, autoAdopt: false,
      text: "You have not stated a style yet. Set one in the Parlay Center and it will be saved to your account too.",
    };
  }
  if (hasDevice && !hasAccount) {
    return {
      state: "DEVICE_ONLY", account, device, autoAdopt: false,
      text: "This browser has a style your account does not. Save it and it will follow you to your other devices.",
    };
  }
  if (hasAccount && !hasDevice) {
    /* The only silent write in this module, and it destroys nothing: this browser held no stated
       style, so adopting the account's cannot overwrite a choice the reader made here. */
    return {
      state: "ACCOUNT_ONLY", account, device, autoAdopt: true,
      text: "Your saved style is now in use on this device.",
    };
  }
  if (sameStyle(account, device)) {
    return { state: "MATCH", account, device, autoAdopt: false, text: "Your saved style and this browser agree." };
  }
  return {
    state: "DIFFER", account, device, autoAdopt: false,
    text: "This browser and your account hold different styles. Pick the one you want to keep — nothing changes until you do.",
  };
}

/** Plain English for one side, for putting both in front of the reader before they choose. */
export function describeStyle(s) {
  if (!styleStated(s)) return "nothing stated";
  const parts = [];
  if (s.risk) parts.push({ low: "lower risk", medium: "medium risk", high: "higher risk", longshot: "longshots" }[s.risk]);
  if (s.bankroll != null) parts.push(`$${s.bankroll.toFixed(2)} paper bankroll at ${s.unitPct}% a card`);
  return parts.join(", ");
}

/** The columns a save touches — and no others, so a style save can never write a limit or a slip. */
export const styleColumns = (s) => ({ risk: s.risk, bankroll: s.bankroll, unit_pct: s.unitPct });
