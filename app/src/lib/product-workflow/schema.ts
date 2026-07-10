/**
 * PRODUCT-WORKFLOW SCHEMA — the strict, PURE shape + validators for moving an internal candidate leg
 * through founder review into a PAPER-ONLY product card, with the official money record fully walled off.
 *
 * The whole point is a set of HONESTY + SAFETY invariants the validators refuse to let pass:
 *   • no artifact may claim `officialMoneyRecordAffected: true`,
 *   • no artifact may carry `realExposure > 0`,
 *   • a paper card may not be `active: true` (that word is reserved for real-money activation, which this
 *     layer never does),
 *   • a paper card requires a founder approval reference,
 *   • a settlement entry may not grade a non-final event,
 *   • every leg must be settlement-supported + carry odds,
 *   • a full-game simulation may NEVER be a selection driver,
 *   • only whitelisted status transitions are allowed.
 *
 * No io, no money, no product-card activation. Extensionless imports (tsc TS5097).
 */
import type { Sport, SettlementSource } from "../multi-sport/candidate-leg";

// ── State machine ─────────────────────────────────────────────────────────────────────────────────
export type WorkflowStatus =
  | "no_play"
  | "watchlist"
  | "founder_review"
  | "paper_approved"
  | "paper_active"
  | "settled"
  | "voided"
  | "rejected"
  | "archived";

export type ProductType = "bank_builder" | "moonshot" | "longshot";
export type RiskTier = "conservative" | "balanced" | "aggressive" | "longshot";
export type CardResult = "won" | "lost" | "push" | "void" | "pending";
export type SettlementCardStatus = "pending" | "partially_settled" | "settled" | "voided";

/** Allowed transitions. `paper_active` is PAPER-ONLY + internal — it never implies real exposure. */
export const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  no_play: ["watchlist", "archived"],
  watchlist: ["founder_review", "no_play", "archived"],
  founder_review: ["paper_approved", "rejected", "no_play", "archived"],
  paper_approved: ["paper_active", "rejected", "archived"],
  paper_active: ["settled", "voided", "archived"],
  settled: ["archived"],
  voided: ["archived"],
  rejected: ["archived"],
  archived: [],
};

export function isValidWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return (WORKFLOW_TRANSITIONS[from] ?? []).includes(to);
}

// ── Leg ───────────────────────────────────────────────────────────────────────────────────────────
/** A leg as it flows through the workflow. `oddsAmerican` is de-vigged/fair unless a book price exists. */
export interface WorkflowLeg {
  legId: string;
  sport: Sport;
  league?: string;
  gameId: string;
  gamePk?: number;
  eventDate: string;
  marketKey: string;
  selection: string;
  side?: string;
  line?: number;
  oddsAmerican: number;
  oddsBasis: "book" | "de_vigged_fair";
  impliedProbability?: number;
  /** ONLY when artifact-backed — never fabricated. */
  modelProbability?: number;
  edgePct?: number;
  source: string;
  settlementSupported: boolean;
  settlementSource: SettlementSource;
  productEligible: boolean;
  reasonCodes: string[];
}

// ── Artifacts ───────────────────────────────────────────────────────────────────────────────────────
export interface FounderReviewPreview {
  previewId: string;
  productType: ProductType;
  generatedAt: string;
  slateDate: string;
  status: "founder_review" | "no_play";
  active: false;
  exposure: 0;
  officialMoneyRecordAffected: false;
  requiresFounderApproval: true;
  public: false;
  legs: WorkflowLeg[];
  combinedOddsAmerican?: number;
  /** ONLY if honest/artifact-backed. */
  estimatedProbability?: number;
  riskTier: RiskTier;
  noPlayReason?: string;
  approvalRequirements: string[];
  blockedReasons: string[];
  paperPromotionEligible: boolean;
  paperPromotionBlockedReasons: string[];
  fullGameSimUsed: false;
  fullGameSimReason: string;
  dataQualitySummary: Record<string, number>;
}

export interface ApprovalRequest {
  approvalId: string;
  previewId: string;
  productType: ProductType;
  requestedAt: string;
  requestedBy: string;
  approvalMode: "paper_only";
  status: "pending" | "approved" | "rejected" | "expired";
  approvalToken: string;
  approvalNotes?: string;
  moneyGuardMd5Before: string;
  officialMoneyRecordAffected: false;
  public: false;
  /** Optional PAPER stake units for tracking only — never real exposure. */
  maxPaperStakeUnits?: number;
}

export interface PaperProductCard {
  cardId: string;
  sourcePreviewId: string;
  approvalId: string;
  productType: ProductType;
  createdAt: string;
  slateDate: string;
  status: "paper_active";
  paperOnly: true;
  /** Reserved for REAL-money exposure — always false in this layer. */
  active: false;
  realExposure: 0;
  paperStakeUnits?: number;
  officialMoneyRecordAffected: false;
  public: false;
  legs: WorkflowLeg[];
  combinedOddsAmerican?: number;
  approvalSnapshot: { approvedBy: string; approvedAt: string; approvalNotes?: string; approvalToken: string };
  settlementStatus: SettlementCardStatus;
  moneyGuardMd5AtCreation: string;
}

export interface PaperLegResult {
  legId: string;
  status: "win" | "loss" | "push" | "pending" | "unavailable";
  actual?: number;
  line?: number;
  reason: string;
}

export interface PaperSettlementEntry {
  settlementId: string;
  cardId: string;
  settledAt: string;
  status: SettlementCardStatus;
  legResults: PaperLegResult[];
  cardResult: CardResult;
  paperPnlUnits: number;
  officialMoneyRecordAffected: false;
  public: false;
  moneyGuardMd5AtSettlement: string;
  unsettledReasons: string[];
}

export interface ValidationResult { valid: boolean; errors: string[]; warnings: string[] }

// ── Shared invariants ───────────────────────────────────────────────────────────────────────────────
const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** The money/exposure/public wall — every workflow artifact must satisfy it. */
function checkMoneyWall(a: Record<string, unknown>, errors: string[]): void {
  if (a.officialMoneyRecordAffected !== false) errors.push("officialMoneyRecordAffected must be false");
  if ("realExposure" in a && a.realExposure !== 0) errors.push("realExposure must be 0 (paper-only)");
  if ("exposure" in a && a.exposure !== 0) errors.push("exposure must be 0 (paper-only)");
  if (a.public !== false) errors.push("public must be false (internal-only)");
  // A full-game simulation may never drive selection.
  if (a.fullGameSimUsed === true || a.fullGameSimDriven === true) errors.push("full-game simulation must NOT drive selection (fullGameSimUsed/fullGameSimDriven true)");
}

/** A leg is valid only when it is settlement-supported and carries real odds + a line where required. */
function checkLeg(leg: WorkflowLeg, i: number, errors: string[]): void {
  const at = `leg[${i}]`;
  if (!isStr(leg.legId)) errors.push(`${at}.legId required`);
  if (!isStr(leg.gameId)) errors.push(`${at}.gameId required`);
  if (!isStr(leg.marketKey)) errors.push(`${at}.marketKey required`);
  if (!isStr(leg.selection)) errors.push(`${at}.selection required`);
  if (!isNum(leg.oddsAmerican)) errors.push(`${at}.oddsAmerican required (never fabricated — de-vigged fair or book)`);
  if (leg.settlementSupported !== true) errors.push(`${at} is not settlement-supported — cannot be on a paper card`);
  if (leg.settlementSource === "none") errors.push(`${at}.settlementSource is none — not gradeable`);
  if (leg.productEligible !== true) errors.push(`${at} is not productEligible`);
  // modelProbability / edgePct may only appear together with a real source (artifact-backed).
  if (leg.modelProbability !== undefined && !isStr(leg.source)) errors.push(`${at}.modelProbability present without a source (artifact-backed only)`);
}

// ── Validators ────────────────────────────────────────────────────────────────────────────────────
export function validateFounderReviewPreview(a: Partial<FounderReviewPreview> | null | undefined): ValidationResult {
  const errors: string[] = []; const warnings: string[] = [];
  if (!a || typeof a !== "object") return { valid: false, errors: ["preview is not an object"], warnings };
  if (!isStr(a.previewId)) errors.push("previewId required");
  if (a.status !== "founder_review" && a.status !== "no_play") errors.push('status must be "founder_review" | "no_play"');
  if (a.active !== false) errors.push("active must be false");
  if (a.requiresFounderApproval !== true) errors.push("requiresFounderApproval must be true");
  if (a.fullGameSimUsed !== false) errors.push("fullGameSimUsed must be false");
  checkMoneyWall(a as Record<string, unknown>, errors);
  // A founder_review preview must carry at least one settleable leg; no_play carries none.
  if (a.status === "founder_review") {
    if (!Array.isArray(a.legs) || a.legs.length === 0) errors.push("founder_review preview must have ≥1 leg");
    else a.legs.forEach((l, i) => checkLeg(l, i, errors));
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validateApprovalRequest(a: Partial<ApprovalRequest> | null | undefined): ValidationResult {
  const errors: string[] = []; const warnings: string[] = [];
  if (!a || typeof a !== "object") return { valid: false, errors: ["approval is not an object"], warnings };
  if (!isStr(a.approvalId)) errors.push("approvalId required");
  if (!isStr(a.previewId)) errors.push("previewId required");
  if (!isStr(a.requestedBy)) errors.push("requestedBy required (who approved)");
  if (a.approvalMode !== "paper_only") errors.push('approvalMode must be "paper_only"');
  if (!["pending", "approved", "rejected", "expired"].includes(a.status as string)) errors.push("status invalid");
  if (a.status === "approved" && !isStr(a.approvalToken)) errors.push("an approved request needs an approvalToken");
  if (!isStr(a.moneyGuardMd5Before)) errors.push("moneyGuardMd5Before required (money-guard snapshot)");
  checkMoneyWall(a as Record<string, unknown>, errors);
  if (a.maxPaperStakeUnits !== undefined && !(isNum(a.maxPaperStakeUnits) && a.maxPaperStakeUnits >= 0)) errors.push("maxPaperStakeUnits must be a non-negative number when present");
  return { valid: errors.length === 0, errors, warnings };
}

export function validatePaperProductCard(a: Partial<PaperProductCard> | null | undefined): ValidationResult {
  const errors: string[] = []; const warnings: string[] = [];
  if (!a || typeof a !== "object") return { valid: false, errors: ["card is not an object"], warnings };
  if (!isStr(a.cardId)) errors.push("cardId required");
  if (!isStr(a.sourcePreviewId)) errors.push("sourcePreviewId required");
  if (!isStr(a.approvalId)) errors.push("approvalId required — a paper card cannot exist without an approval");
  if (a.status !== "paper_active") errors.push('status must be "paper_active"');
  if (a.paperOnly !== true) errors.push("paperOnly must be true");
  if (a.active !== false) errors.push("active must be false (paper card never implies real-money activation)");
  checkMoneyWall(a as Record<string, unknown>, errors);
  if (!a.approvalSnapshot || !isStr(a.approvalSnapshot.approvedBy) || !isStr(a.approvalSnapshot.approvalToken)) errors.push("approvalSnapshot.{approvedBy,approvalToken} required (founder-approval provenance)");
  if (!isStr(a.moneyGuardMd5AtCreation)) errors.push("moneyGuardMd5AtCreation required");
  if (!Array.isArray(a.legs) || a.legs.length === 0) errors.push("a paper card must have ≥1 leg");
  else a.legs.forEach((l, i) => checkLeg(l, i, errors));
  return { valid: errors.length === 0, errors, warnings };
}

export function validatePaperSettlementEntry(a: Partial<PaperSettlementEntry> | null | undefined): ValidationResult {
  const errors: string[] = []; const warnings: string[] = [];
  if (!a || typeof a !== "object") return { valid: false, errors: ["settlement is not an object"], warnings };
  if (!isStr(a.settlementId)) errors.push("settlementId required");
  if (!isStr(a.cardId)) errors.push("cardId required");
  if (!["won", "lost", "push", "void", "pending"].includes(a.cardResult as string)) errors.push("cardResult invalid");
  if (!["pending", "partially_settled", "settled", "voided"].includes(a.status as string)) errors.push("status invalid");
  if (!isNum(a.paperPnlUnits)) errors.push("paperPnlUnits must be a number (paper units only)");
  if (!isStr(a.moneyGuardMd5AtSettlement)) errors.push("moneyGuardMd5AtSettlement required");
  checkMoneyWall(a as Record<string, unknown>, errors);
  if (!Array.isArray(a.legResults)) errors.push("legResults must be an array");
  else {
    for (const [i, r] of a.legResults.entries()) {
      if (!["win", "loss", "push", "pending", "unavailable"].includes(r.status)) errors.push(`legResults[${i}].status invalid`);
    }
    // A settled/won/lost card cannot still contain pending legs (that is a partial settlement).
    const hasPending = a.legResults.some((r) => r.status === "pending");
    if (hasPending && (a.cardResult === "won" || a.status === "settled")) errors.push("a card with a pending leg cannot be settled/won");
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Resolve a parlay card result from its leg results. One LOSS ⇒ lost (decided even with pending legs).
 * All WIN ⇒ won. Any PENDING (and no loss) ⇒ pending. Push/void/unavailable legs are DROPPED from the
 * parlay (standard book behavior) — a card of only push/void legs is a `void`.
 */
export function resolveCardResult(legResults: PaperLegResult[]): { cardResult: CardResult; status: SettlementCardStatus } {
  if (legResults.some((r) => r.status === "loss")) return { cardResult: "lost", status: "settled" };
  if (legResults.some((r) => r.status === "pending")) return { cardResult: "pending", status: legResults.some((r) => r.status === "win") ? "partially_settled" : "pending" };
  const live = legResults.filter((r) => r.status === "win"); // push/unavailable dropped
  if (live.length === 0) return { cardResult: "void", status: "voided" };
  return { cardResult: "won", status: "settled" };
}
