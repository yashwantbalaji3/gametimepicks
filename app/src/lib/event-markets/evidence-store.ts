/**
 * EVIDENCE STORE contract (Phase 12) — the first internal evidence-store foundation for event markets. Defines the
 * validity rules + storage conventions for EvidenceItems. NO item is valid without publishedAt AND capturedAt. Does
 * NOT ingest broad unverified social rumors as facts — a social_unverified item is retained but flagged low-trust
 * and cannot be treated as established. Pure + deterministic (a provenance hash is computed from stable fields). No
 * network, no modeling. Storage is internal only.
 */
import crypto from "node:crypto";
import type { EvidenceItem } from "./types";

/** Internal storage layout (paths relative to data/internal/event-markets/). Raw is preserved separately from normalized. */
export const EVIDENCE_STORE_LAYOUT = {
  raw: "evidence/raw/<marketId>/<evidenceId>.json", // exactly as received (provenance)
  normalized: "evidence/normalized/<marketId>/<evidenceId>.json", // schema-validated EvidenceItem
  marketLinks: "evidence/links/<marketId>.json", // marketId -> [evidenceId] index
  sourceReliability: "evidence/source-reliability.json", // the ReliabilityConfig
  entityAliases: "evidence/entity-aliases.json", // alias -> canonical entityId
  superseded: "evidence/superseded/<marketId>.json", // retracted/contradicted evidence (never deleted)
} as const;

export interface EvidenceValidation {
  valid: boolean;
  reasons: string[];
  provenanceHash: string | null;
}

/** A stable provenance hash over the fields that identify the evidence (not our capture-time metadata alone). */
export function provenanceHash(e: Pick<EvidenceItem, "marketId" | "source" | "sourceUrl" | "publishedAt" | "claim">): string {
  const basis = JSON.stringify({ marketId: e.marketId, source: e.source, sourceUrl: e.sourceUrl ?? null, publishedAt: e.publishedAt ?? null, claim: (e.claim || "").toLowerCase().replace(/\s+/g, " ").trim() });
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

/** Validate an EvidenceItem against the store's hard rules. */
export function validateEvidence(e: Partial<EvidenceItem>): EvidenceValidation {
  const reasons: string[] = [];
  if (!e.evidenceId) reasons.push("missing evidenceId");
  if (!e.marketId) reasons.push("missing marketId");
  if (!e.source) reasons.push("missing source");
  if (!e.publishedAt) reasons.push("missing publishedAt (an untimed claim is not usable evidence)");
  if (!e.capturedAt) reasons.push("missing capturedAt (no provenance)");
  if (e.publishedAt && e.capturedAt && Number.isFinite(Date.parse(e.publishedAt)) && Number.isFinite(Date.parse(e.capturedAt)) && Date.parse(e.capturedAt) < Date.parse(e.publishedAt)) {
    reasons.push("captured before it was published (impossible provenance)");
  }
  if (!Array.isArray(e.entities) || e.entities.length === 0) reasons.push("no entities referenced");
  if (!e.claim) reasons.push("missing normalizedClaim");
  if (typeof e.confidence !== "number" || e.confidence < 0 || e.confidence > 1) reasons.push("confidence must be 0..1");
  if (!e.reliabilityTier) reasons.push("missing sourceReliabilityTier");
  if (e.expiresAt === undefined) reasons.push("missing expiresAt / decay policy (may be null but must be present)");
  const valid = reasons.length === 0;
  return { valid, reasons, provenanceHash: valid ? provenanceHash(e as EvidenceItem) : null };
}

/** Is this item usable as ESTABLISHED evidence (not merely a retained low-trust rumor)? */
export function isEstablishedEvidence(e: EvidenceItem): boolean {
  return validateEvidence(e).valid && e.reliabilityTier !== "social_unverified";
}
