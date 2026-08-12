/**
 * Shared-blocker registry — the ONE list of launch blockers that are not sport work
 * (Program 164 · Release 1). Consumed by /launch; never exported publicly.
 *
 * THE DEDUP LAW, PROMOTED: these seven issues used to surface as vague recurring lines ("needs
 * key", "needs legal") across sports and programs. Each now exists EXACTLY ONCE, with the
 * engineering state verified against the actual code, the founder's residual action reduced to
 * exact fields, and a binary acceptance the founder can run without interpreting the repository.
 *
 * States (closed; disjoint from board/ledger vocabularies):
 *   ENGINEERING_IN_PROGRESS      repository work remains before the founder can act
 *   ENGINEERING_READY_FOR_FOUNDER everything around the missing input is built, tested, fail-closed
 *   FOUNDER_ACTION_PROVIDED      the founder supplied values; verification not yet run
 *   VERIFYING                    post-action acceptance in progress
 *   CLOSED                       real post-action receipt exists (never from a mock or a schema)
 *   BLOCKED_EXTERNAL             an external decision (rights/terms) gates everything
 *   LEGAL_COUNSEL_REQUIRED       a qualified reviewer must answer; engineering cannot
 *
 * SECRETS DISCIPLINE: `requiredValues` names variables and formats ONLY. No real value may ever
 * appear here, in tests, in /launch, or in any artifact — validation is presence/shape only.
 */

export const SHARED_BLOCKERS_VERSION = 1;

export const BLOCKER_STATES = Object.freeze([
  "ENGINEERING_IN_PROGRESS", "ENGINEERING_READY_FOR_FOUNDER", "FOUNDER_ACTION_PROVIDED",
  "VERIFYING", "CLOSED", "BLOCKED_EXTERNAL", "LEGAL_COUNSEL_REQUIRED",
]);

export const SHARED_BLOCKERS = Object.freeze([
  {
    id: "blocker-odds",
    title: "Merged odds / no-vig capture (one key unlocks four sports)",
    owner: "FOUNDER",
    affects: ["nfl", "nba", "epl", "ufc"],
    unlocks: "no-vig market comparison — the last missing shadow input for NFL (READY_EXCEPT_ODDS) and one of several for NBA/EPL/UFC",
    engineeringState: "ENGINEERING_READY_FOR_FOUNDER",
    engineeringEvidence: "lib/sports/odds/snapshot-contract (provider-neutral, no-vig with the vig visible, fail-closed secret shapes, population-exact validation) + four-sport sanitized fixtures + scripts/ops/odds-canary.mjs (dry-run default, authorization flag, ceiling 5 + floor 50, single sport/market, redacted, self-leak-scanned) — P164 Release 2; refusals proven as real subprocesses",
    founderAction: "confirm The Odds API plan covers NFL/NBA/EPL/UFC market reads within existing credits, then authorize ONE canary run (single sport, single event, hard credit ceiling)",
    requiredValues: [
      { name: "ODDS_API_KEY", format: "existing repository-CI secret — already set for MLB; NO new secret needed", where: "GitHub Actions secrets (already present)", neverShare: "the key value itself — never in chat, commits, or logs" },
      { name: "canary authorization", format: "a yes plus the sport to canary first (recommended: NFL, the sport odds alone unlocks)", where: "reply in chat — authorization is a decision, not a secret", neverShare: "nothing sensitive in this half" },
    ],
    risk: "credits are billable: the canary is authorization-gated with a hard ceiling and dry-run default; without it, four sports simply keep their odds gap",
    acceptanceCommand: "npx tsx scripts/ops/odds-canary.mjs --sport nfl --max-credits 5 --authorized (dry-run first without --authorized: zero credits)",
    rollback: "unset nothing — the canary writes to a quarantined path; delete the snapshot and the state returns to BLOCKED_EXTERNAL",
  },
  {
    id: "blocker-nba-lineup-rights",
    title: "NBA official-lineup source rights decision",
    owner: "FOUNDER",
    affects: ["nba"],
    unlocks: "the lineups half of NBA's injuriesLineups input — the last non-odds gap for NBA shadow readiness",
    engineeringState: "ENGINEERING_READY_FOR_FOUNDER",
    engineeringEvidence: "free sources REJECTED with probe receipts (docs/NBA_LINEUP_SOURCE_EVALUATION.md); the six-class lineup contract is committed and any licensed adapter must pass lineupShadowEligibility (P163-B)",
    founderAction: "decide the source path: (a) review NBA.com official-lineup terms for permitted use, (b) evaluate a licensed data feed, or (c) defer — NBA proceeds without lineups and the model card carries the limitation",
    requiredValues: [
      { name: "source decision", format: "one of: nba-com-terms-reviewed | licensed-feed:<vendor> | defer", where: "reply in chat; if a licensed feed, credentials go to CI secrets later via their own card", neverShare: "any credentials until the engineering card for the chosen path exists" },
    ],
    risk: "a rights-uncertain feed stays BLOCKED_EXTERNAL by rule — scraping or assuming terms is never an option; deferring costs model precision, not correctness",
    acceptanceCommand: "after decision: the adapter's first bounded pre-event capture must pass lineupShadowEligibility with provably pre-start timestamps",
    rollback: "defer is always available; nothing ships until the contract passes",
  },
  {
    id: "blocker-support",
    title: "Support destination (footer entry stays hidden until real)",
    owner: "FOUNDER",
    affects: ["shared"],
    unlocks: "the public support entry point + a beta prerequisite",
    engineeringState: "ENGINEERING_READY_FOR_FOUNDER",
    engineeringEvidence: "fail-closed since P137 and verified this program: NOT_CONFIGURED renders nothing, placeholders and partial config are rejected loudly, no SLA is ever invented (lib/support/support-config)",
    founderAction: "choose the destination and response expectation you will actually staff",
    requiredValues: [
      { name: "GTP_SUPPORT_DESTINATION", format: "mailto:you@yourdomain OR an https helpdesk URL (placeholders like noreply/test@ are auto-rejected)", where: "Vercel project env (production)", neverShare: "nothing here is secret — but do not set it until the inbox is really monitored" },
      { name: "GTP_SUPPORT_OWNER", format: "the human or rota answering it", where: "Vercel project env", neverShare: "—" },
      { name: "GTP_SUPPORT_RESPONSE", format: "the exact response expectation to publish (e.g. \"we read everything within 2 business days\")", where: "Vercel project env", neverShare: "—" },
    ],
    risk: "zero product risk while unset (nothing renders); the only risk is publishing a promise nobody staffs — which is why the value IS the decision",
    acceptanceCommand: "set the three values → redeploy → the footer entry appears with your exact wording → send one real message and receive it",
    rollback: "unset the variables; the entry point disappears on the next build",
  },
  {
    id: "blocker-analytics",
    title: "Analytics activation (privacy-preserving, kill-switched)",
    owner: "FOUNDER",
    affects: ["shared"],
    unlocks: "measurement for launch decisions (activation, route coverage, comprehension) — currently NOTHING is measured",
    engineeringState: "ENGINEERING_READY_FOR_FOUNDER",
    engineeringEvidence: "full event contract + forbidden-property rejection + NOOP sink verified: with the flag unset, nothing leaves the browser (lib/analytics; privacy basis §7 signed; staging payloads inspected in P092-095)",
    founderAction: "stand up the approved first-party collector endpoint and flip the two public (non-secret) build variables",
    requiredValues: [
      { name: "NEXT_PUBLIC_ANALYTICS_ENABLED", format: "1 (kill switch: unset/0 = hard off, no code change)", where: "Vercel project env (public build var — not a secret)", neverShare: "—" },
      { name: "NEXT_PUBLIC_ANALYTICS_ENDPOINT", format: "https URL of the approved first-party /api/collect endpoint", where: "Vercel project env (public by nature — it ships in the bundle)", neverShare: "any collector-side write token stays server-side, never in NEXT_PUBLIC_*" },
    ],
    risk: "privacy posture is already encoded (no PII, no selections, forbidden properties fail tests); the residual risk is collector hosting cost/ownership",
    acceptanceCommand: "preview deploy → consent/no-consent smoke → one allowed event visible at the collector → forbidden-property test still red-fails locally → production flip",
    rollback: "unset NEXT_PUBLIC_ANALYTICS_ENABLED — hard off on the next build",
  },
  {
    id: "blocker-legal-section3",
    title: "Legal: five founder business decisions + counsel review",
    owner: "FOUNDER",
    affects: ["shared"],
    unlocks: "public Terms/Privacy/responsible-use pages; a beta prerequisite",
    engineeringState: "ENGINEERING_READY_FOR_FOUNDER",
    engineeringEvidence: "docs/LEGAL_SECTION3_DECISION_PACKET.md (11 numbered items: 5 founder decisions with conservative recommendations + 6 verbatim LEGAL_COUNSEL_REQUIRED questions) + lib/legal/content-manifest publish guard — unapproved text is structurally unable to ship as final; approval = named reviewer + role + date + packet version, never inferred from a commit (P164 Release 5)",
    founderAction: "answer the five business decisions (entity, jurisdiction, audience geography, age floor, audience framing), then book the counsel review for the adviser questions",
    requiredValues: [
      { name: "section-3 answers", format: "five short answers, numbered 1-5, in the founder's words", where: "reply in chat or a note in docs/ — these are business facts, not secrets", neverShare: "—" },
      { name: "counsel review", format: "reviewer identity/role + approval date when it happens", where: "recorded in the legal content manifest on approval", neverShare: "counsel correspondence stays outside the repository" },
    ],
    risk: "publishing legal text without review is the one unrecoverable class here — the publish guard makes unapproved text structurally unable to ship as final",
    acceptanceCommand: "after answers: the packet regenerates with decisions filled; after counsel: the manifest records approval and the content gate flips",
    rollback: "unapproved drafts remain FOR REVIEW and unpublished by the guard",
  },
  {
    id: "blocker-beta-cohort",
    title: "Private beta cohort (roster never enters the repository)",
    owner: "FOUNDER",
    affects: ["shared"],
    unlocks: "the private beta itself",
    engineeringState: "ENGINEERING_READY_FOR_FOUNDER",
    engineeringEvidence: "lib/beta/access: PII structurally refused (email-shaped values + roster-like fields fail validation anywhere in the object), deny-by-default access with revocation-wins, and the invitation prerequisite gate that blocks until support is CONFIGURED, the legal set is publishable, and analytics is explicitly decided — P164 Release 6, on top of the existing operating docs",
    founderAction: "choose cohort size (contract recommends 8), access option, start window, and sourcing channel — and hold the roster OUTSIDE git",
    requiredValues: [
      { name: "cohort decision", format: "size + start window + access option (allowlist recommended) + sourcing channel", where: "reply in chat; the roster itself goes to the access provider directly, never the repository", neverShare: "participant names/emails — no PII in git, tickets, logs, or artifacts, ever" },
    ],
    risk: "inviting before support/legal/analytics prerequisites pass burns testers on a broken loop — the prerequisite gate blocks invitation generation until they hold",
    acceptanceCommand: "prerequisites gate green → synthetic-account access test → revocation test → founder go/no-go",
    rollback: "deny-by-default: removing the allowlist entry revokes access",
  },
  {
    id: "blocker-admin-access",
    title: "Secure founder access to /launch (no public exposure)",
    owner: "FOUNDER",
    affects: ["shared"],
    unlocks: "the founder reading the command center without a local checkout",
    engineeringState: "ENGINEERING_READY_FOR_FOUNDER",
    engineeringEvidence: "docs/ADMIN_ACCESS_DECISION.md (recommended: host-level protection on a separate internal deployment; URL-hiding and client prompts named insufficient) + lib/admin/access-contract (deny-by-default on every missing input, session expiry, noindex/no-store headers) with synthetic fixtures — P164 Release 7; public pruning unchanged and still gate-proven",
    founderAction: "choose the hosting/auth option from the decision record (recommended: a separate password-protected preview deployment with server-side auth), then authorize its setup",
    requiredValues: [
      { name: "hosting/auth choice", format: "one of the decision record's options", where: "reply in chat", neverShare: "any auth secret goes to the hosting provider's env, never chat or git" },
    ],
    risk: "the failure mode this prevents: casually exposing the internal build — a URL nobody knows is not security; deny-by-default with server-side auth is the bar",
    acceptanceCommand: "unauthenticated request → deny; authenticated → /launch renders; public production /launch still 404",
    rollback: "tear down the private deployment; the public site never carried it",
  },
]);

/** Dependency-ordered founder actions with effort estimates — the one-screen sheet. */
export function founderActionSheet() {
  const order = ["blocker-legal-section3", "blocker-support", "blocker-analytics", "blocker-beta-cohort", "blocker-odds", "blocker-nba-lineup-rights", "blocker-admin-access"];
  const effort = {
    "blocker-legal-section3": "15 min (answers) + a counsel session",
    "blocker-support": "10 min once the inbox exists",
    "blocker-analytics": "30-60 min (collector hosting) + 5 min of env vars",
    "blocker-beta-cohort": "20 min of decisions; roster handling stays outside git",
    "blocker-odds": "5 min (plan check + one authorization)",
    "blocker-nba-lineup-rights": "20-40 min of terms reading, or one word: defer",
    "blocker-admin-access": "20 min with the recommended option",
  };
  return order.map((id) => {
    const b = SHARED_BLOCKERS.find((x) => x.id === id);
    return { id: b.id, title: b.title, state: b.engineeringState, founderEffort: effort[id], action: b.founderAction, values: b.requiredValues, acceptance: b.acceptanceCommand };
  });
}
