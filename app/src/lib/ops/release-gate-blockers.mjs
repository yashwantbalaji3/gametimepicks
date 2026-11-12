/**
 * RELEASE GATE · WHICH IN-PROGRESS RUNS ACTUALLY CONFLICT WITH A MERGE (proposal, founder review; not wired into the gate).
 * PURE: no I/O.
 *
 * Today's v1 gate (~/gtp-evidence/bin/release_gate.sh) refuses while ANY workflow other than deploy-flush is in progress.
 * On 2026-11-12 that held a green #1335 for hours: nfl-pregame-free-refresh waits INSIDE its job from its T-375 horizon
 * to the T-55 inactives pass (timeout 355 min), and it never writes the repository. Its only effect is dispatching
 * nfl-event-window, which is the real writer and appears as its own in-progress run.
 *
 * A workflow is a NON-WRITER only when ALL of these hold; anything else BLOCKS (fail closed):
 *   1. it declares `contents:` and every declaration is `read`. No declaration means the repository's default token
 *      permission, which may be write, so it blocks; `write-all` blocks;
 *   2. it never commits, pushes or merges (`git commit`, `git push`, `gh pr merge`);
 *   3. it uses no secret token other than GITHUB_TOKEN. A personal token could push whatever `contents:` says.
 * A run whose workflow name matches no committed workflow file BLOCKS. The existing deploy-flush exemption is unchanged.
 * Dispatching writers is allowed: a dispatched writer is a separate run, and the gate blocks on it.
 */

export const GATE_EXEMPT = Object.freeze(["deploy-flush"]); // unchanged from release_gate.sh v1

const strip = (text) => String(text ?? "").replace(/^\s*#.*$/gm, "").replace(/\s+#.*$/gm, "");

/** The workflow's `name:` (top-level). */
export function workflowName(text) {
  const m = /^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(strip(text));
  return m ? m[1].trim() : null;
}

/** { name, writer, reasons } for one workflow file's text. */
export function classifyWorkflow(text) {
  const t = strip(text);
  const reasons = [];
  const contents = [...t.matchAll(/^\s*contents:\s*([a-z-]+)/gm)].map((m) => m[1]);
  if (/permissions:\s*write-all/.test(t)) reasons.push("PERMISSIONS_WRITE_ALL");
  if (!contents.length) reasons.push("NO_CONTENTS_DECLARATION");
  if (contents.some((c) => c !== "read")) reasons.push("CONTENTS_WRITE");
  if (/\bgit\s+(push|commit)\b|\bgh\s+pr\s+merge\b/.test(t)) reasons.push("COMMITS_OR_PUSHES");
  const tokens = [...t.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).filter((s) => /TOKEN|PAT/.test(s) && s !== "GITHUB_TOKEN");
  if (tokens.length) reasons.push(`SECRET_TOKEN:${[...new Set(tokens)].join(",")}`);
  return { name: workflowName(text), writer: reasons.length > 0, reasons };
}

/**
 * The in-progress runs that must block a merge.
 * @param {string[]} inProgressNames   workflowName of each in-progress run (gh run list --status in_progress)
 * @param {Map<string, {writer: boolean, reasons: string[]}>} byName  classifyWorkflow of every committed workflow, by name
 */
export function blockingRuns(inProgressNames, byName) {
  const out = [];
  for (const n of inProgressNames) {
    if (GATE_EXEMPT.includes(n)) continue;
    const c = byName.get(n);
    if (!c) out.push({ name: n, reasons: ["UNKNOWN_WORKFLOW"] });
    else if (c.writer) out.push({ name: n, reasons: c.reasons });
  }
  return out;
}
