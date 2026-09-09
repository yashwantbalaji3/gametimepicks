/**
 * THE ONE COLOUR CSS CANNOT OWN (P251 · F13).
 *
 * `--vault-scrim` is the app's ground and lives in globals.css like every other colour on this
 * site. Two consumers cannot read it: the browser chrome's `theme-color`, and the web-app
 * manifest — both are parsed by the OS before any stylesheet exists, so neither can resolve a
 * custom property.
 *
 * Rather than let the literal reappear at each of those call sites, it is written ONCE here and
 * imported. If the ground ever changes, this file changes with globals.css and the installed app,
 * the status bar and the splash screen follow.
 */
export const OS_CHROME_GROUND = "#0B1310";
