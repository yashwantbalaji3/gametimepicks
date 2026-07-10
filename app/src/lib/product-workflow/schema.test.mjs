/**
 * PRODUCT-WORKFLOW SCHEMA — the safety invariants that keep paper cards off the official money record.
 *
 * Pins: valid artifacts pass; the money/exposure/public wall is enforced (officialMoneyRecordAffected,
 * realExposure, active, public); a paper card needs an approval; unsupported/odds-less legs are rejected;
 * a full-game sim can never be a driver; only whitelisted transitions are allowed; a card with a pending
 * leg can't be settled; and the parlay result logic (one loss ⇒ lost, all win ⇒ won, push/void dropped).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidWorkflowTransition, resolveCardResult,
  validateFounderReviewPreview, validateApprovalRequest, validatePaperProductCard, validatePaperSettlementEntry,
} from "./schema.ts";

const leg = () => ({
  legId: "l1", sport: "MLB", gameId: "g1", gamePk: 1, eventDate: "2026-07-09", marketKey: "run_line",
  selection: "PIT -1.5", side: "home", line: -1.5, oddsAmerican: -110, oddsBasis: "de_vigged_fair",
  impliedProbability: 0.55, source: "mlb/team-markets/2026-07-09.json",
  settlementSupported: true, settlementSource: "statsapi", productEligible: true, reasonCodes: ["settleable_statsapi"],
});
const preview = () => ({
  previewId: "pv1", productType: "bank_builder", generatedAt: "2026-07-09", slateDate: "2026-07-09",
  status: "founder_review", active: false, exposure: 0, officialMoneyRecordAffected: false, requiresFounderApproval: true, public: false,
  legs: [leg(), { ...leg(), legId: "l2", gameId: "g2" }], riskTier: "conservative",
  approvalRequirements: ["explicit founder approval"], blockedReasons: [], paperPromotionEligible: true, paperPromotionBlockedReasons: [],
  fullGameSimUsed: false, fullGameSimReason: "internal_only_not_driving_selection", dataQualitySummary: { strong: 2 },
});
const approval = () => ({
  approvalId: "ap1", previewId: "pv1", productType: "bank_builder", requestedAt: "2026-07-09", requestedBy: "Yash",
  approvalMode: "paper_only", status: "approved", approvalToken: "tok-abc", moneyGuardMd5Before: "affe6b21",
  officialMoneyRecordAffected: false, public: false,
});
const card = () => ({
  cardId: "cd1", sourcePreviewId: "pv1", approvalId: "ap1", productType: "bank_builder", createdAt: "2026-07-09", slateDate: "2026-07-09",
  status: "paper_active", paperOnly: true, active: false, realExposure: 0, officialMoneyRecordAffected: false, public: false,
  legs: [leg()], approvalSnapshot: { approvedBy: "Yash", approvedAt: "2026-07-09", approvalToken: "tok-abc" },
  settlementStatus: "pending", moneyGuardMd5AtCreation: "affe6b21",
});
const settlement = () => ({
  settlementId: "st1", cardId: "cd1", settledAt: "2026-07-09", status: "settled",
  legResults: [{ legId: "l1", status: "win", reason: "PIT covered" }], cardResult: "won", paperPnlUnits: 0.91,
  officialMoneyRecordAffected: false, public: false, moneyGuardMd5AtSettlement: "affe6b21", unsettledReasons: [],
});

test("1 · valid artifacts pass", () => {
  for (const [name, v] of [["preview", validateFounderReviewPreview(preview())], ["approval", validateApprovalRequest(approval())], ["card", validatePaperProductCard(card())], ["settlement", validatePaperSettlementEntry(settlement())]]) {
    assert.equal(v.valid, true, `${name}: ${v.errors.join("; ")}`);
  }
});

test("2 · the money/exposure/public wall is enforced everywhere", () => {
  assert.equal(validateFounderReviewPreview({ ...preview(), officialMoneyRecordAffected: true }).valid, false);
  assert.equal(validatePaperProductCard({ ...card(), realExposure: 5 }).valid, false);
  assert.equal(validatePaperProductCard({ ...card(), active: true }).valid, false);
  assert.equal(validateApprovalRequest({ ...approval(), public: true }).valid, false);
  assert.equal(validatePaperSettlementEntry({ ...settlement(), officialMoneyRecordAffected: true }).valid, false);
});

test("3 · a full-game simulation can never be a selection driver", () => {
  assert.equal(validateFounderReviewPreview({ ...preview(), fullGameSimUsed: true }).valid, false);
  assert.equal(validatePaperProductCard({ ...card(), fullGameSimDriven: true }).valid, false);
});

test("4 · a paper card cannot exist without an approval + provenance", () => {
  assert.equal(validatePaperProductCard({ ...card(), approvalId: "" }).valid, false);
  const { approvalSnapshot, ...noSnap } = card();
  assert.equal(validatePaperProductCard(noSnap).valid, false);
});

test("5 · unsupported / odds-less legs are rejected", () => {
  assert.equal(validatePaperProductCard({ ...card(), legs: [{ ...leg(), settlementSupported: false }] }).valid, false, "unsupported market");
  assert.equal(validatePaperProductCard({ ...card(), legs: [{ ...leg(), settlementSource: "none" }] }).valid, false, "no settlement source");
  const { oddsAmerican, ...noOdds } = leg();
  assert.equal(validatePaperProductCard({ ...card(), legs: [noOdds] }).valid, false, "missing odds");
});

test("6 · a WON card can't have a pending leg, but a LOST card can (a loss decides it)", () => {
  const won = { ...settlement(), legResults: [{ legId: "l1", status: "win", reason: "" }, { legId: "l2", status: "pending", reason: "not final" }], cardResult: "won", status: "settled" };
  assert.equal(validatePaperSettlementEntry(won).valid, false, "won + pending is invalid");
  // A loss decides the card even while another leg is pending — this is a valid settled/lost entry.
  const lost = { ...settlement(), legResults: [{ legId: "l1", status: "loss", reason: "" }, { legId: "l2", status: "pending", reason: "not final" }], cardResult: "lost", status: "settled", paperPnlUnits: -1 };
  assert.equal(validatePaperSettlementEntry(lost).valid, true, "lost + pending is valid (loss decides)");
});

test("7 · only whitelisted status transitions are allowed", () => {
  assert.equal(isValidWorkflowTransition("founder_review", "paper_approved"), true);
  assert.equal(isValidWorkflowTransition("paper_approved", "paper_active"), true);
  assert.equal(isValidWorkflowTransition("paper_active", "settled"), true);
  // Illegal jumps.
  assert.equal(isValidWorkflowTransition("founder_review", "paper_active"), false, "no skipping approval");
  assert.equal(isValidWorkflowTransition("no_play", "paper_active"), false);
  assert.equal(isValidWorkflowTransition("archived", "paper_active"), false, "archived is terminal");
});

test("8 · parlay result — one loss ⇒ lost (even with pending); all win ⇒ won; push/void dropped", () => {
  assert.equal(resolveCardResult([{ status: "win" }, { status: "win" }]).cardResult, "won");
  assert.equal(resolveCardResult([{ status: "win" }, { status: "loss" }, { status: "pending" }]).cardResult, "lost", "a loss decides the card even with a pending leg");
  assert.equal(resolveCardResult([{ status: "win" }, { status: "pending" }]).cardResult, "pending");
  assert.equal(resolveCardResult([{ status: "win" }, { status: "pending" }]).status, "partially_settled");
  assert.equal(resolveCardResult([{ status: "push" }, { status: "unavailable" }]).cardResult, "void", "a card of only push/void legs is void");
  assert.equal(resolveCardResult([{ status: "win" }, { status: "push" }]).cardResult, "won", "push is dropped, remaining win ⇒ won");
});
