/**
 * TESTS ONLY — an empty coverage registry for archived-slate regressions about card MECHANICS.
 *
 * The June 2026 slates these tests replay built MLB and Mixed cards from MLB player-prop legs that the registry
 * later demoted to market context. Under the committed registry those legs are (correctly) never eligible, so the
 * mechanics those tests pin — combined-odds bands, leg identity, mixed WC + MLB cards — would have nothing to run on.
 * Passing this as `loadTodaySlate`'s `coverageOverride` keeps the mechanics covered. It never reaches a page: the
 * eligibility rule itself is pinned against the committed registry in slate-leg-eligibility.test.mjs.
 */
export const ARCHIVE_MECHANICS_COVERAGE = Object.freeze({ markets: [] });
