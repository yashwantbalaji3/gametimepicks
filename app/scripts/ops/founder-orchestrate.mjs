/**
 * Founder-response orchestrator — read-only, dry-run only (Program 165 · Release A).
 *
 * Reads a non-secret response file, validates it against the schema, and prints per blocker:
 * the mechanical state transition, the safe next steps, and any missing external configuration.
 * IT MUTATES NOTHING — not the registry, not the environment, not any external service. Registry
 * state changes happen as reviewed commits after real responses; paid or external actions happen
 * only through each blocker's own guarded path with its own authorization.
 *
 * Usage: npx tsx scripts/ops/founder-orchestrate.mjs docs/founder-response.template.json
 */
import fs from "node:fs";

import { validateFounderResponse, transitionFor } from "../../src/lib/launch/founder-response.mjs";
import { SHARED_BLOCKERS } from "../../src/lib/launch/shared-blockers.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: founder-orchestrate.mjs <response.json>"); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const v = validateFounderResponse(doc);
if (!v.valid) {
  console.log("RESPONSE REFUSED:");
  for (const e of v.errors) console.log(`  ✕ ${e}`);
  process.exit(2);
}

/** Safe next steps per blocker+choice. Nothing here executes; it tells the human what runs next. */
const NEXT = {
  "blocker-legal-section3": {
    ANSWERS_PROVIDED_SEE_DECISIONS: ["record the five answers as a dated edit in docs/LEGAL_SECTION3_DECISION_PACKET.md", "book the counsel session for items 6-11", "approval later lands in the manifest with reviewer + role + date + packet version + content hash"],
    DEFER_LEGAL: ["legal set stays unpublishable by the guard; beta invitations stay blocked — honest and reversible"],
  },
  "blocker-support": {
    DEDICATED_MONITORED_INBOX: ["create/confirm the monitored inbox OUTSIDE this repo", "set GTP_SUPPORT_DESTINATION/OWNER/RESPONSE in the Vercel dashboard", "re-run this orchestrator with externalConfigurationComplete:true", "then: build → footer entry renders your exact wording → one real delivery test you approve"],
    EXISTING_HELPDESK_URL: ["same as the inbox path with an https destination"],
    TEMPORARY_FOUNDER_INBOX: ["same path; note the staffing owner is you until changed"],
    DEFER_BETA: ["support stays hidden (fail-closed); beta invitations stay blocked"],
  },
  "blocker-analytics": {
    FIRST_PARTY_COLLECTOR: ["stand up the collector per docs/ANALYTICS_COLLECTOR_SPEC.md (outside this repo)", "set NEXT_PUBLIC_ANALYTICS_ENABLED=1 + NEXT_PUBLIC_ANALYTICS_ENDPOINT in the Vercel dashboard", "then: preview consent smoke → one allowed event at the collector → production flip; kill switch = unset the flag"],
    DEFER_ANALYTICS: ["NOOP stands; nothing is measured — an explicit deferral satisfies the beta prerequisite gate's decision requirement"],
  },
  "blocker-beta-cohort": {
    COHORT_APPROVED_SEE_DETAILS: ["prerequisite gate must be green first (support + legal + analytics decision)", "roster goes to the access provider directly — never git", "synthetic access + revocation tests run before any real invitation"],
    DEFER_BETA_COHORT: ["nothing invites; deny-by-default stands"],
  },
  "blocker-odds": {
    AUTHORIZE_ONE_NFL_CANARY_MAX_5: ["dry-run first (zero credits): npx tsx scripts/ops/odds-canary.mjs --sport nfl", "then ONCE, with this recorded authorization: npx tsx scripts/ops/odds-canary.mjs --sport nfl --max-credits 5 --authorized", "then the snapshot validates + leak-scans and NFL's shadow gates re-run — other sports do NOT auto-promote"],
    DEFER_ODDS: ["four sports keep their odds gap; nothing calls, nothing spends"],
    CHANGE_PROVIDER_PLAN: ["plan change happens in the provider dashboard; re-answer when done"],
  },
  "blocker-nba-lineup-rights": {
    "nba-com-terms-reviewed": ["record the terms-review outcome; an approved registry entry + one bounded pre-event capture (when reality supplies a lineup) are the next receipts"],
    "licensed-feed": ["vendor named — credentials go to CI secrets via their own card; the adapter must pass lineupShadowEligibility"],
    defer: ["NBA proceeds without lineups; the model card carries the limitation — honest and reversible"],
  },
  "blocker-admin-access": {
    OPTION_1_PROTECTED_INTERNAL_DEPLOYMENT: ["create the second project + enable host protection per docs/ADMIN_ACCESS_DECISION.md (dashboard only)", "then: npx tsx scripts/ops/verify-admin-access.mjs --url <private-url> proves deny/auth/noindex + public still 404"],
    OPTION_2_ZERO_TRUST_PROXY: ["heavier path — the ADR's tradeoffs apply; same verifier afterwards"],
    OPTION_3_LOCAL_ONLY: ["status quo; costs founder time, leaks nothing"],
  },
};

console.log("FOUNDER RESPONSE — VALID. Transitions and safe next steps (nothing executed):\n");
for (const b of SHARED_BLOCKERS) {
  const answer = doc.answers[b.id];
  const t = transitionFor(b.id, answer);
  const normalized = typeof answer.choice === "string" && answer.choice.startsWith("licensed-feed:") ? "licensed-feed" : answer.choice;
  console.log(`■ ${b.id} → ${t.state}`);
  console.log(`  choice: ${answer.choice}${answer.externalConfigurationComplete === true ? " · external configuration REPORTED complete" : ""}`);
  console.log(`  ${t.note}`);
  for (const step of NEXT[b.id]?.[normalized] ?? []) console.log(`  → ${step}`);
  console.log("");
}
console.log("Nothing was mutated. Registry transitions land as a reviewed commit; CLOSED needs each blocker's real acceptance receipt.");
