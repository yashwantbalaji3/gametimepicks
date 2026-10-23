/**
 * PUBLIC SIGN-IN / SIGN-UP ENTRY GATE (founder decision 2026-10-23: "hide public sign-in and sign-up entry points for
 * now", independent audit 2026-10-23 F03 / A-T03).
 *
 * The email sign-in form and the newsletter form invited visitors to hand over an email address while /privacy and
 * /terms are not published. Until approved notices exist, every PUBLIC invitation to sign in, register or subscribe is
 * hidden. Nothing is deleted: the Supabase project, the auth flows, existing accounts and any session already signed
 * in on a device keep working (a signed-in person still reaches their record at /account), and public forecasts,
 * simulations and Results never depend on an account.
 *
 * Reversible by configuration, no code change: set NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN=1 in the build environment (only
 * after the founder approves the published notices). The read is LITERAL on purpose: Next inlines
 * process.env.NEXT_PUBLIC_* into client bundles only where it appears literally.
 */
export const PUBLIC_SIGNUP_OPEN = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN === "1";

/** What a signed-out visitor sees on /account while the gate is closed. Names no environment variable. */
export const SIGNUP_CLOSED_NOTICE = "New sign-ins are paused while our privacy notice and terms are finalised.";
export const SIGNUP_CLOSED_DETAIL =
  "Everything else on GameTime Picks works without an account: Official Forecasts, Game Simulations, Top Boards and Historical Results. If you were already signed in on this device, you still are.";
