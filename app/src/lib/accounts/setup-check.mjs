/**
 * ACCOUNTS SETUP CHECK (P266) — does the project the founder just created actually behave?
 *
 * Pure classification: each function takes what a request returned and says whether that is a pass, a
 * failure, or something the check could not determine. The script does the HTTP; this decides what the
 * answers MEAN, so every verdict — including the one that matters most — is testable without a project.
 *
 * THE ONE THAT MATTERS MOST: an anonymous client asking for other people's rows must come back EMPTY.
 * If it returns rows, row-level security is off and every reader can read every reader's bets. That is
 * a REFUSAL, not a warning, and the check says so in those words.
 */

/** A table the anon key can reach but whose rows it cannot see. 200 + [] is exactly right. */
export function classifyTableProbe(table, { status, rows, error }) {
  if (error) return { id: `table:${table}`, state: "UNKNOWN", detail: `could not ask: ${error}` };
  if (status === 404 || status === 400) {
    return { id: `table:${table}`, state: "FAIL", detail: `${table} does not exist — run db/accounts-schema.sql in the SQL editor` };
  }
  if (status === 401 || status === 403) {
    // Permission denied also proves the table is not readable; the schema's policies return empty instead.
    return { id: `table:${table}`, state: "PASS", detail: `${table} exists and refuses an anonymous reader` };
  }
  if (status !== 200) return { id: `table:${table}`, state: "UNKNOWN", detail: `${table} answered ${status}` };
  if (Array.isArray(rows) && rows.length === 0) {
    return { id: `table:${table}`, state: "PASS", detail: `${table} exists and returns nothing to an anonymous reader` };
  }
  return {
    id: `table:${table}`,
    state: "REFUSE",
    detail: `${table} RETURNED ${Array.isArray(rows) ? rows.length : "some"} ROW(S) to an anonymous reader — row-level security is not on. Every reader can read every reader's bets. Fix before anyone signs in.`,
  };
}

/** The bucket must exist and must not be public. */
export function classifyBucket({ status, bucket, error }) {
  if (error) return { id: "bucket:slips", state: "UNKNOWN", detail: `could not ask: ${error}` };
  if (status === 404) return { id: "bucket:slips", state: "FAIL", detail: "the `slips` bucket does not exist — run db/accounts-schema.sql" };
  if (status !== 200) return { id: "bucket:slips", state: "UNKNOWN", detail: `the bucket query answered ${status}` };
  if (bucket?.public === true) {
    return { id: "bucket:slips", state: "REFUSE", detail: "the `slips` bucket is PUBLIC — anyone with a URL could read a betslip image. Set it private." };
  }
  return { id: "bucket:slips", state: "PASS", detail: "the `slips` bucket exists and is private" };
}

/** The REST endpoint answering at all, with the anon key. */
export function classifyReachable({ status, error }) {
  if (error) return { id: "project", state: "FAIL", detail: `the project URL did not answer: ${error}` };
  if (status === 401) return { id: "project", state: "FAIL", detail: "the anon key was rejected — check NEXT_PUBLIC_SUPABASE_ANON_KEY" };
  if (status >= 500) return { id: "project", state: "UNKNOWN", detail: `the project answered ${status}` };
  return { id: "project", state: "PASS", detail: "the project answers and accepts the anon key" };
}

/** Presence only — a key is never printed, compared or logged. */
export function classifyReaderKey(present) {
  return present
    ? { id: "reader", state: "PASS", detail: "ANTHROPIC_API_KEY is set, so uploaded slips can be read" }
    : { id: "reader", state: "WARN", detail: "ANTHROPIC_API_KEY is not set — accounts work, but a screenshot cannot be read yet" };
}

/**
 * The overall verdict. A REFUSE outranks everything: it means the setup is unsafe, not incomplete.
 * WARN never fails the check — a missing reader key is a smaller product, not a broken one.
 */
export function summariseSetup(results) {
  const refuse = results.filter((r) => r.state === "REFUSE");
  const fail = results.filter((r) => r.state === "FAIL");
  const unknown = results.filter((r) => r.state === "UNKNOWN");
  /* A project that never answered is not "a missing table": running it against a typo'd URL reported
     a schema problem, which would have sent someone to the SQL editor to fix nothing. Name the real
     cause — the checks below it could not run at all. */
  const unreachable = fail.some((r) => r.id === "project");
  const state = refuse.length ? "UNSAFE"
    : unreachable ? "UNREACHABLE"
    : fail.length ? "INCOMPLETE"
    : unknown.length ? "UNPROVEN"
    : "READY";
  return {
    state,
    exitCode: state === "READY" ? 0 : state === "UNPROVEN" ? 2 : 1,
    headline:
      state === "UNSAFE" ? "STOP — the project is reachable but not safe to let anyone sign in to."
      : state === "UNREACHABLE" ? "The project did not answer — check the URL and the anon key before anything else; nothing below it could be tested."
      : state === "INCOMPLETE" ? "Not finished — something in the schema is missing."
      : state === "UNPROVEN" ? "Could not prove it either way — see the unknown lines."
      : "Accounts are set up correctly.",
    results,
  };
}
