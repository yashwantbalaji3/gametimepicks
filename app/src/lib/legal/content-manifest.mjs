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
    terms: { status: "LEGAL_COUNSEL_REQUIRED", approval: null, effectiveDate: null, note: "cannot draft final text before decisions 1-3 (entity, jurisdiction, geography)" },
    privacy: { status: "LEGAL_COUNSEL_REQUIRED", approval: null, effectiveDate: null, note: "consent basis for the PII-free counter is adviser question 10" },
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
