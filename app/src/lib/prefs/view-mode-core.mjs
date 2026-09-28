/**
 * VIEW MODE — Simple (default) or Analyst — the one canonical PRESENTATION preference.
 *
 * ── What this changes, and what it can never change ─────────────────────────────────────────────
 * It changes how MUCH a page shows: Analyst adds model detail (ranges, model state, provenance,
 * calibration) beneath what every reader sees. It never changes WHAT a number is. Both modes read the
 * same canonical owners; there is no Simple value and Analyst value of any prediction, line, live
 * measurement or result. And no warning that bears on trust (stale data, tracking unavailable,
 * grading pending, experimental / estimate labels, paused markets) is ever mode-gated.
 *
 * ── Why a sibling of reader-prefs and not a field inside it ─────────────────────────────────────
 * `gtp.prefs.v1` holds a reader's bankroll and risk tolerance and is synced to accounts
 * (lib/accounts/style-sync.mjs). A presentation choice does not belong in a betting-style record
 * that travels to an account; this one stays on the device, under its own key.
 *
 * Pure and storage-injected, so the rules are testable without a browser.
 */

export const VIEW_MODES = Object.freeze(["simple", "analyst"]);
/** New readers see Simple. */
export const DEFAULT_VIEW_MODE = "simple";
export const VIEW_MODE_STORAGE_KEY = "gtp.view.v1";
/** Same-tab broadcast so every mounted consumer follows a change at once. */
export const VIEW_MODE_CHANNEL = "gtp:view-mode";

/** An explicit allowlist: anything unrecognised — corrupt JSON, an old value, a typo — is the default. */
export function parseViewMode(raw) {
  if (typeof raw !== "string" || !raw) return DEFAULT_VIEW_MODE;
  let v = raw;
  try {
    const j = JSON.parse(raw);
    v = typeof j === "string" ? j : j && typeof j === "object" ? j.mode : null;
  } catch { /* a bare string is fine */ }
  return VIEW_MODES.includes(v) ? v : DEFAULT_VIEW_MODE;
}

/** Read from an injected Storage-like object; a throwing or absent store (private mode) is the default. */
export function readViewMode(storage) {
  try {
    return parseViewMode(storage?.getItem?.(VIEW_MODE_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

/** Write a mode; refuses anything outside the allowlist. Returns what is now stored (or would be). */
export function writeViewMode(storage, mode) {
  const clean = VIEW_MODES.includes(mode) ? mode : DEFAULT_VIEW_MODE;
  try { storage?.setItem?.(VIEW_MODE_STORAGE_KEY, JSON.stringify({ mode: clean })); } catch { /* private mode */ }
  return clean;
}
