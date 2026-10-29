/**
 * THE CONTRACTS — the only shapes that cross a role boundary.
 *
 * Roles never talk to each other. A role receives a TaskEnvelope and returns a Contribution (one typed artifact
 * plus proposedNextSteps); the orchestrator alone decides what happens next. Every shape here is provider-neutral:
 * a Prompt Architect brief has the same fields whether a fake, a pasted ChatGPT answer or (later) an API call
 * produced it — the `seat` says which.
 *
 * Validators return { ok, errors } rather than throwing so the orchestrator can turn a bad artifact into a recorded
 * refusal instead of a crash.
 */

/** Model providers known to the contracts. Only fake and manual can run in Phase 1 (see providers/registry.mjs). */
export const PROVIDERS = Object.freeze(["fake", "manual", "anthropic", "openai", "xai"]);

/** How a role runs. `api:*` and `mcp:*` are named now so contracts never change when they are enabled. */
export const SEATS = Object.freeze([
  "fake",
  "manual:chatgpt", "manual:claude", "manual:grok",
  "api:openai", "api:anthropic", "api:xai",
  "mcp:chatgpt", "mcp:claude", "mcp:grok",
  "cli:claude-code",   // Claude Code CLI on this Mac, authenticated with the founder's subscription (M2)
  "deterministic",
]);

export const ROLE_IDS = Object.freeze([
  "chief-of-staff",
  "prompt-architect",
  "product-strategist",
  "social-strategy",
  "engineering",
  "integrity-reviewer",
  "creative-renderer",
  "publisher",
  "growth-analyst",
  "verifier",
  "social-intelligence",   // Grok (xAI): public X research with source links
  "content-strategist",    // ChatGPT (OpenAI): posts, replies, campaigns and plans from verified material
]);

export const TASK_STATUS = Object.freeze(["QUEUED", "RUNNING", "AWAITING_INPUT", "DONE", "REFUSED", "FAILED"]);

export const ARTIFACT_TYPES = Object.freeze([
  "plan",
  "engineering-brief",
  "feasibility-report",
  "content-angles",
  "strategy-note",
  "consolidated-report",
  "fact-bundle",
  "integrity-verdict",
  "media-artifact",
  "caption-set",
  "publish-bundle",
  "engineering-spec",
  "implementation-plan",
  "engineering-result",
  "verification",
  "gtp-facts",            // verified GameTimePicks facts a team workflow may cite (deterministic)
  "x-research",           // Grok: findings about public X conversations, each with source links
  "evidence-check",       // deterministic: which findings are source-linked and usable
  "content-proposals",    // ChatGPT: proposed posts / replies built on checked findings
  "content-plan",         // ChatGPT: a weekly content plan
  "content-check",        // deterministic: wording, length, number provenance of every draft
  "feasibility-review",   // Claude Code: read-only review of how to automate a plan
  "calendar-facts",       // deterministic: five-sport schedules, forecasts, results at a pinned commit + the opportunity grid
  "content-calendar-draft", // ChatGPT: picks, priorities and draft copy for grid slots
  "calendar-check",       // deterministic: the final calendar with independently derived readiness
  "post-queue",           // D1 deterministic: one day's post packages from the approved calendar (captions, graphics, checks)
]);

/** Ledger entry kinds — the action history is exactly this list, in order. */
export const LEDGER_KINDS = Object.freeze([
  "command", "plan", "task", "contribution", "refusal", "deliverable",
  "decision-request", "decision", "publish-receipt", "control", "report", "seat-change",
  "progress", "preflight", "attestation",
  "job",          // H0: a unit of work handed to a worker (requested → started → finished/failed)
  "auth",         // H0: login, step-up and session events (audit only; secrets never recorded)
  "provider-test", // provider onboarding: a connection test and its result (no credentials recorded)
  "post-status",       // D1: the founder scheduled an approved post in X (manual)
  "engagement",        // D1: numbers the founder copied from X analytics for a published post (not verified)
  "caption-edit",      // a caption edited on the Queue: a new option (E1, E2, …) checked like the rest; approves nothing
  "post-verification", // D1: a published pregame post re-checked against the forecast of record after kickoff
  "design-approval",   // V2.1: the founder approved a graphic template + asset-manifest version (never a post)
  // X Publisher V1 (orchestrator/publish-flow.mjs) — tokens and secrets are never recorded
  "publish-policy",    // dry-run / live mode and the founder's monthly spend cap (with the exact authorization words)
  "publish-pause",     // the Pause Publishing switch
  "publish-job",       // an approved post scheduled (or triggered by hand) for publishing
  "publish-job-cancel",
  "publish-attempt",   // the gate passed and a send started (the once-only claim key is recorded)
  "publish-result",    // DRY_RUN · PUBLISHED · REFUSED · FAILED_NOT_SENT · UNKNOWN · MISSED
  "publish-alert", "publish-alert-ack",
  "publish-tick",      // a scheduler tick that ran at least one job
  "publish-spend",     // X API spend outside a send (a reconcile lookup), counted against the monthly cap
  "publisher-host",    // which host may send live (local Mac or hosted); a host can only hand it away (cutover)
  // Daily queue preparation (orchestrator/publish-flow.mjs prepDue) — only the active publisher host prepares
  "queue-prep",        // the founder's setting: { enabled, timeEt "HH:MM" America/New_York, by }; no record = off
  "queue-prep-run",    // one automatic preparation (once per ET day, claim queue-prep|<date>): { date, commandId, ok, code, detail }
]);

/** Refusal / reason codes shared by the orchestrator, the integrity gate and the publisher. */
export const REASON = Object.freeze({
  LOOP_GUARD: "LOOP_GUARD",
  TASK_CAP: "TASK_CAP",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  SEAT_NOT_ENABLED: "SEAT_NOT_ENABLED",
  NOT_FOUNDER: "NOT_FOUNDER",
  PAUSED: "PAUSED",
  APPROVAL_MISSING: "APPROVAL_MISSING",
  APPROVAL_DIGEST_MISMATCH: "APPROVAL_DIGEST_MISMATCH",
  DELEGATION_NOT_ALLOWED: "DELEGATION_NOT_ALLOWED",
  // integrity gate
  RECEIPT_MISSING: "RECEIPT_MISSING",
  RECEIPT_MISMATCH: "RECEIPT_MISMATCH",
  POST_START_REVISION: "POST_START_REVISION",
  NOT_PUBLISHED: "NOT_PUBLISHED",
  WITHDRAWN: "WITHDRAWN",
  NOT_SETTLED: "NOT_SETTLED",
  NOT_CANONICAL: "NOT_CANONICAL",
  CORRECTED_RESULT: "CORRECTED_RESULT",
  PRIVATE_SOURCE: "PRIVATE_SOURCE",
  FAMILY_NOT_CLEARED: "FAMILY_NOT_CLEARED",
  MISSING_CLAIM: "MISSING_CLAIM",
  // caption validator
  UNTRACEABLE_NUMBER: "UNTRACEABLE_NUMBER",
  FORBIDDEN_TERM: "FORBIDDEN_TERM",
  URL_IN_CAPTION: "URL_IN_CAPTION",
  MISS_NOT_DISCLOSED: "MISS_NOT_DISCLOSED",
  MISSING_FORECAST_WORD: "MISSING_FORECAST_WORD",
  TOO_LONG: "TOO_LONG",
  RETIRED_PHRASE: "RETIRED_PHRASE",
  // engineering (M2)
  BILLING_NOT_CONFIRMED: "BILLING_NOT_CONFIRMED",
  SUBSCRIPTION_AUTH_NOT_CONFIRMED: "SUBSCRIPTION_AUTH_NOT_CONFIRMED",
  SPEC_CONTRACT_INVALID: "SPEC_CONTRACT_INVALID",
  SPEC_NOT_REAL: "SPEC_NOT_REAL",
  PLAN_OUT_OF_SCOPE: "PLAN_OUT_OF_SCOPE",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  GATE_ORDER: "GATE_ORDER",
  RUN_FAILED: "RUN_FAILED",
  RUN_TIMEOUT: "RUN_TIMEOUT",
  RUN_CANCELLED: "RUN_CANCELLED",
  USAGE_CAP: "USAGE_CAP",
});

const isStr = (v) => typeof v === "string" && v.length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function check(rules) {
  const errors = rules.filter(([ok]) => !ok).map(([, msg]) => msg);
  return { ok: errors.length === 0, errors };
}

/**
 * @typedef {object} TaskEnvelope
 * @property {string} taskId
 * @property {string} commandId
 * @property {string|null} parentTaskId
 * @property {number} hop                 1 for a task the Chief of Staff planned; +1 per delegation
 * @property {string} ownerRole
 * @property {string} seat
 * @property {string} title
 * @property {string} inputDigest
 * @property {string} expectedArtifactType
 * @property {string[]} acceptanceCriteria
 * @property {{tokens:number, usd:number}} budget
 */
export function validateTaskEnvelope(t) {
  return check([
    [isStr(t?.taskId), "taskId"],
    [isStr(t?.commandId), "commandId"],
    [t?.parentTaskId === null || isStr(t?.parentTaskId), "parentTaskId"],
    [Number.isInteger(t?.hop) && t.hop >= 1, "hop"],
    [ROLE_IDS.includes(t?.ownerRole), "ownerRole"],
    [SEATS.includes(t?.seat), "seat"],
    [isStr(t?.title), "title"],
    [isStr(t?.inputDigest), "inputDigest"],
    [ARTIFACT_TYPES.includes(t?.expectedArtifactType), "expectedArtifactType"],
    [Array.isArray(t?.acceptanceCriteria) && t.acceptanceCriteria.length > 0, "acceptanceCriteria"],
    [isNum(t?.budget?.tokens) && isNum(t?.budget?.usd), "budget"],
  ]);
}

/**
 * @typedef {object} Contribution
 * @property {string} taskId
 * @property {string} role
 * @property {string} seat
 * @property {string} provider
 * @property {string|null} model
 * @property {string} artifactType
 * @property {object} artifact
 * @property {string} summary
 * @property {{tokensIn:number, tokensOut:number, usd:number}} cost
 * @property {Array<{label:string, ref:string}>} evidence
 * @property {Array<{toRole:string, why:string}>} proposedNextSteps
 * @property {boolean} simulated        true when no model produced the text (fake seat)
 */
export function validateContribution(c) {
  return check([
    [isStr(c?.taskId), "taskId"],
    [ROLE_IDS.includes(c?.role), "role"],
    [SEATS.includes(c?.seat), "seat"],
    [PROVIDERS.includes(c?.provider) || c?.provider === "deterministic", "provider"],
    [ARTIFACT_TYPES.includes(c?.artifactType), "artifactType"],
    [c?.artifact && typeof c.artifact === "object", "artifact"],
    [isStr(c?.summary), "summary"],
    [isNum(c?.cost?.usd) && isNum(c?.cost?.tokensIn) && isNum(c?.cost?.tokensOut), "cost"],
    [Array.isArray(c?.evidence), "evidence"],
    [Array.isArray(c?.proposedNextSteps), "proposedNextSteps"],
    [typeof c?.simulated === "boolean", "simulated"],
  ]);
}

/** Engineering brief — the Prompt Architect's output, identical whichever seat wrote it. */
export function validateEngineeringBrief(b) {
  return check([
    [isStr(b?.objective), "objective"],
    [Array.isArray(b?.constraints) && b.constraints.length > 0, "constraints"],
    [Array.isArray(b?.dependencies), "dependencies"],
    [Array.isArray(b?.tests), "tests"],
    [Array.isArray(b?.acceptanceCriteria) && b.acceptanceCriteria.length > 0, "acceptanceCriteria"],
  ]);
}

/**
 * @typedef {object} Claim
 * @property {string} key       e.g. "winProbability.favourite"
 * @property {string|number} value
 * @property {string} display   exactly how the claim may be printed
 * @property {string} family    the ledger family the claim comes from
 * @property {{path:string, sha256:string, forecastId?:string}} evidenceRef
 */
export function validateFactBundle(b) {
  return check([
    [b?.schema === "gtp.cc.fact-bundle@1", "schema"],
    [isStr(b?.eventId), "eventId"],
    [isStr(b?.sport), "sport"],
    [Array.isArray(b?.claims) && b.claims.length > 0, "claims"],
    [(b?.claims ?? []).every((c) => isStr(c.key) && isStr(c.display) && isStr(c.evidenceRef?.path) && isStr(c.evidenceRef?.sha256)), "claims[].evidenceRef"],
    [isStr(b?.sources?.ledger?.sha256), "sources.ledger"],
  ]);
}

export function validateCaptionSet(s) {
  return check([
    [Array.isArray(s?.variants) && s.variants.length === 2, "variants (exactly 2)"],
    [(s?.variants ?? []).every((v) => isStr(v.id) && isStr(v.text) && isStr(v.tone)), "variants[]"],
    [isStr(s?.factBundleDigest), "factBundleDigest"],
  ]);
}

/**
 * @typedef {object} PublishBundle   immutable once a decision is requested; the approval binds `digest`
 * @property {string} candidateId
 * @property {string} channel        "x" | "instagram" | "tiktok" — Phase 1 publishes only through the mock
 * @property {string} accountId
 * @property {string} factBundleDigest
 * @property {string} mediaDigest
 * @property {string} captionDigest
 * @property {string} captionId
 * @property {string} contentKind
 * @property {string} snapshotId
 */
export function validatePublishBundle(p) {
  return check([
    [isStr(p?.candidateId), "candidateId"],
    [["x", "instagram", "tiktok"].includes(p?.channel), "channel"],
    [isStr(p?.accountId), "accountId"],
    [isStr(p?.factBundleDigest) && isStr(p?.mediaDigest) && isStr(p?.captionDigest), "digests"],
    [isStr(p?.captionId), "captionId"],
    [isStr(p?.contentKind), "contentKind"],
    [isStr(p?.snapshotId), "snapshotId"],
  ]);
}

/** The idempotency key the spec requires: (platform, account, eventId, contentKind, snapshotId). */
export const publishIdempotencyKey = (p) => ["publish", p.channel, p.accountId, p.candidateId, p.contentKind, p.snapshotId].join("|");
