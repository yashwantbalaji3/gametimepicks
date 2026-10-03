/**
 * BETA FEEDBACK — the in-site form's contract (Session 9 · I6). Pure: validates what a tester typed and
 * builds the ONE row the browser may insert (beta_feedback, own-row RLS, insert requires the invite).
 *
 * Identity is the tester's auth id (set from the session by the writer, never typed). The founder reads
 * feedback in the Supabase dashboard; no client ever reads another tester's rows (proved live by
 * db/rls-live/two-account-isolation.sql). Minimal by design: no email, no device fingerprint, no free-form
 * contact field — and the form tells testers not to paste personal or account details.
 */
export const FEEDBACK_KINDS = Object.freeze(["bug", "wrong_data", "confusing", "idea", "other"]);
export const FEEDBACK_SEVERITIES = Object.freeze(["blocker", "major", "minor", "idea"]);
export const FEEDBACK_SPORTS = Object.freeze(["mlb", "nfl", "nba", "ufc", "soccer"]);
export const FEEDBACK_PRODUCTS = Object.freeze(["bank-builder", "moonshot", "suggested-parlays", "build", "ask", "results", "live", "mr_dub", "account", "other"]);
export const LIMITS = Object.freeze({ actual: 2000, expected: 1000, route: 200 });

/** A same-site path only: a pasted URL to elsewhere, a query string or a fragment never travels in a report. */
export function cleanRoute(raw) {
  const s = String(raw ?? "").trim();
  const m = /^(?:https?:\/\/[^/]+)?(\/[A-Za-z0-9/_\-.]*)/.exec(s);
  return m ? m[1].slice(0, LIMITS.route) : "/";
}

/**
 * @param {{route?:string, sport?:string, product?:string, kind?:string, severity?:string, actual?:string, expected?:string}} input
 * @returns {{ ok: true, row: object } | { ok: false, errors: string[] }}
 */
export function buildFeedbackRow(input, { userId } = {}) {
  const errors = [];
  if (!userId) errors.push("Sign in first — feedback is tied to your tester account so we can follow up privately.");
  const actual = String(input?.actual ?? "").trim();
  const expected = String(input?.expected ?? "").trim();
  const kind = String(input?.kind ?? "");
  const severity = String(input?.severity ?? "minor");
  const sport = input?.sport ? String(input.sport) : null;
  const product = input?.product ? String(input.product) : null;
  if (!actual) errors.push("Tell us what happened.");
  if (actual.length > LIMITS.actual) errors.push(`Keep "what happened" under ${LIMITS.actual} characters.`);
  if (expected.length > LIMITS.expected) errors.push(`Keep "what you expected" under ${LIMITS.expected} characters.`);
  if (!FEEDBACK_KINDS.includes(kind)) errors.push("Pick a type.");
  if (!FEEDBACK_SEVERITIES.includes(severity)) errors.push("Pick a severity.");
  if (sport && !FEEDBACK_SPORTS.includes(sport)) errors.push("Unknown sport.");
  if (product && !FEEDBACK_PRODUCTS.includes(product)) errors.push("Unknown product.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    row: { user_id: userId, route: cleanRoute(input.route), sport, product, kind, severity, actual, expected: expected || null },
  };
}
