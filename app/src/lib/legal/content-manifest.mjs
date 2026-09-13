/**
 * Legal content manifest + publish guard (Program 164 · Release 5).
 *
 * THE ONE RULE: unapproved legal text is structurally unable to ship as final. Any future legal
 * surface (Terms, Privacy, responsible-use) must pass canPublishLegal() with a manifest whose
 * approval receipt names a real reviewer and date — an approval can NEVER be inferred from a
 * repository commit, a draft label, or the passage of time.
 *
 * The manifest is committed data with a closed status vocabulary; the packet it governs is
 * docs/LEGAL_SECTION3_DECISION_PACKET.md (FOR REVIEW · NOT LEGAL ADVICE).
 */

export const LEGAL_MANIFEST_VERSION = 1;

export const LEGAL_STATUSES = Object.freeze(["DRAFT_FOR_REVIEW", "LEGAL_COUNSEL_REQUIRED", "APPROVED", "SUPERSEDED"]);

/** Sections a public launch requires. A missing required section blocks publication of the set. */
export const REQUIRED_SECTIONS = Object.freeze(["terms", "privacy", "responsible-use"]);

/** The current manifest: everything is pre-approval, and says so. */
export const LEGAL_CONTENT_MANIFEST = Object.freeze({
  version: 1,
  packet: "docs/LEGAL_SECTION3_DECISION_PACKET.md",
  sections: Object.freeze({
    terms: { status: "DRAFT_FOR_REVIEW", approval: null, effectiveDate: null, note: "drafted 2026-09-10 in lib/legal/texts.mjs from founder decisions 1, 3, 4, 5; open: the operator (placeholder), the governing state, the contact, and counsel review" },
    privacy: { status: "DRAFT_FOR_REVIEW", approval: null, effectiveDate: null, note: "drafted 2026-09-10 from repository facts, guard-checked against the code; open: the contact, and adviser question 10 (consent basis for the PII-free counter)" },
    "responsible-use": { status: "LEGAL_COUNSEL_REQUIRED", approval: null, effectiveDate: null, note: "mandatory-vs-advisable signposting is adviser question 8; age position is founder decision 4" },
  }),
});

/**
 * The publish gate. Returns { allowed, reasons } — total and fail-closed. `approval` must carry
 * reviewer (a named human + role), approvedOn (ISO date), and the packet version they reviewed.
 */
export function canPublishLegal(manifest, sectionId) {
  const reasons = [];
  const section = manifest?.sections?.[sectionId];
  if (!section) return { allowed: false, reasons: [`unknown legal section ${sectionId} — nothing unknown publishes`] };
  if (section.status !== "APPROVED") reasons.push(`status ${section.status} — only APPROVED publishes as final`);
  const a = section.approval;
  if (!a?.reviewer || !a?.role) reasons.push("approval must name a real reviewer and role — never inferred from a commit");
  if (!Number.isFinite(Date.parse(a?.approvedOn ?? ""))) reasons.push("approval date missing/unparseable");
  if (typeof a?.packetVersion !== "number") reasons.push("the approval must state which packet version was reviewed");
  if (!/^[a-f0-9]{12,64}$/.test(a?.contentHash ?? "")) reasons.push("the approval must carry the exact content hash reviewed — approving 'whatever is there now' is not approval");
  if (!Number.isFinite(Date.parse(section.effectiveDate ?? ""))) reasons.push("effective date required before publication");
  return { allowed: reasons.length === 0, reasons };
}

/** A launch-set check: every required section publishable, or the set is blocked with reasons. */
export function canPublishLegalSet(manifest) {
  const blocked = [];
  for (const id of REQUIRED_SECTIONS) {
    const v = canPublishLegal(manifest, id);
    if (!v.allowed) blocked.push({ section: id, reasons: v.reasons });
  }
  return { allowed: blocked.length === 0, blocked };
}

/**
 * WHAT EACH GOVERNED SECTION'S ROUTE DOES BEFORE APPROVAL (P290).
 *
 * `REQUIRED_SECTIONS` lists three sections; `LEGAL_ROUTES` in texts.mjs lists two. The prune sweep
 * derives what to withhold from `LEGAL_ROUTES`, so the third — `responsible-use` — was never
 * considered and shipped publicly while its status is `LEGAL_COUNSEL_REQUIRED`, the strongest
 * "engineering cannot decide this" status in the vocabulary. Meanwhile /terms and /privacy, marked
 * only `DRAFT_FOR_REVIEW`, were correctly withheld. The gate was inverted, by omission.
 *
 * Keeping that page public is nonetheless the RIGHT outcome, and that is the point of writing it
 * down: it carries the age guidance, the "not betting advice" and "no guarantees" disclaimers, the
 * statement that no payment is collected, and the 1-800-GAMBLER / ncpgambling.org helpline. Removing
 * it until counsel signs would strip a reader's protections to satisfy a registry. Its absence is
 * more harmful than its presence.
 *
 * So a section's pre-approval disposition is now DECLARED rather than inferred from whether someone
 * remembered to add it to a route map:
 *
 *   WITHHOLD_UNTIL_APPROVED — the section states terms the operator is bound by. Unapproved text
 *                             making a contractual claim must not be reachable at all.
 *   PUBLISH_AS_PROTECTIVE   — the section only warns, limits and signposts. Publishing it early is
 *                             safe because it asks nothing of the reader and grants nothing to us;
 *                             review sharpens the wording, it does not license the page.
 *
 * PUBLISH_AS_PROTECTIVE is not a bypass: a page carrying it must contain no contractual language,
 * and `legal-route-gating.test.mjs` asserts that against the BUILT export. If a protective page ever
 * starts saying "you agree", it has become a contract and must move to WITHHOLD_UNTIL_APPROVED.
 */
export const PRE_APPROVAL_DISPOSITION = Object.freeze({
  terms: "WITHHOLD_UNTIL_APPROVED",
  privacy: "WITHHOLD_UNTIL_APPROVED",
  "responsible-use": "PUBLISH_AS_PROTECTIVE",
});

export const DISPOSITIONS = Object.freeze(["WITHHOLD_UNTIL_APPROVED", "PUBLISH_AS_PROTECTIVE"]);

/** Language that makes a page a contract rather than a warning. Checked against rendered text. */
export const CONTRACTUAL_PHRASES = Object.freeze([
  "you agree",
  "these terms",
  "terms of service",
  "governing law",
  "binding arbitration",
  "we may terminate",
  "limitation of liability",
  "by using this site you",
]);
