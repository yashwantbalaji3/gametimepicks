/**
 * promote-founder-review-to-paper-card.mjs — the ONE approval-gated step that turns an internal
 * `founder_review` preview into a PAPER-ONLY product card. It refuses to run without an explicit founder
 * approval flag, writes ONLY to internal ledger paths, never touches the official money record, and is
 * idempotent (the cardId is a content hash — rerunning does not duplicate a card).
 *
 * SAFETY: money md5 is snapshotted before + after and MUST match; the preview + approval + card are all
 * validated by the pure product-workflow schema (rejects active:true / realExposure>0 /
 * officialMoneyRecordAffected:true / unsupported legs / full-game-sim as a driver / missing odds).
 *
 * Usage (paper-only; nothing runs without BOTH approval flags):
 *   npx tsx scripts/promote-founder-review-to-paper-card.mjs \
 *     --product bank_builder --date 2026-07-09 \
 *     --approve-founder-review --approved-by "Yash" --approval-note "reviewed 07-09 BB" [--write] [--force]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateFounderReviewPreview, validateApprovalRequest, validatePaperProductCard } from "../src/lib/product-workflow/schema.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const MONEY_FILES = [path.join(APP, "public", "data", "mr-dub", "portfolio.json"), path.join(APP, "public", "data", "mr-dub", "banked-ladders.json")];
const PRODUCT_SLUG = { bank_builder: "bank-builder", moonshot: "moonshot", longshot: "longshot" };

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const has = (name) => process.argv.includes(name);
const shortHash = (s) => crypto.createHash("md5").update(s).digest("hex").slice(0, 12);
const moneyMd5 = () => crypto.createHash("md5").update(MONEY_FILES.map((f) => (fs.existsSync(f) ? fs.readFileSync(f) : Buffer.alloc(0))).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0))).digest("hex");

function fail(msg) { console.error(`[promote] REFUSED — ${msg}`); process.exit(1); }

function main() {
  const productType = arg("--product");
  const date = arg("--date");
  const previewPath = arg("--preview");
  const approvedBy = arg("--approved-by");
  const approvalNote = arg("--approval-note") ?? undefined;
  const write = has("--write");
  const force = has("--force");

  // ── Approval gate: refuse without the explicit flag AND an approver. ──
  if (!has("--approve-founder-review")) fail("missing --approve-founder-review (explicit founder approval is required)");
  if (!approvedBy) fail("missing --approved-by <founder> (an approval must name the approver)");
  if (!productType || !PRODUCT_SLUG[productType]) fail(`--product must be one of ${Object.keys(PRODUCT_SLUG).join("|")}`);
  if (!date && !previewPath) fail("provide --date YYYY-MM-DD or --preview <path>");

  const resolvedPreviewPath = previewPath ?? path.join(REPO, "data", "internal", "product-previews", PRODUCT_SLUG[productType], `${date}.json`);
  if (!fs.existsSync(resolvedPreviewPath)) fail(`preview not found: ${path.relative(REPO, resolvedPreviewPath)}`);
  const preview = JSON.parse(fs.readFileSync(resolvedPreviewPath, "utf8"));
  const slateDate = preview.slateDate ?? preview.date ?? date;

  // ── Preview must be a promotable founder_review. ──
  if (preview.status !== "founder_review") fail(`preview status is "${preview.status}" — only founder_review is promotable (no_play/watchlist cannot be promoted)`);
  if (preview.paperPromotionEligible === false) fail(`preview is not paper-promotion eligible: ${(preview.paperPromotionBlockedReasons || []).join("; ")}`);
  const pv = validateFounderReviewPreview(preview);
  if (!pv.valid) fail(`preview failed schema validation: ${pv.errors.join("; ")}`);

  // ── Build the approval + paper card (deterministic ids ⇒ idempotent). ──
  const legs = preview.legs;
  const legSig = legs.map((l) => l.legId).join(",");
  const cardId = `${PRODUCT_SLUG[productType]}-${slateDate}-${shortHash(`${productType}|${slateDate}|${legSig}`)}`;
  const approvalId = `ap-${shortHash(`approval|${productType}|${slateDate}|${approvedBy}|${legSig}`)}`;
  const approvalToken = shortHash(`token|${approvalId}|${approvedBy}|${slateDate}`);
  const md5Before = moneyMd5();

  const approval = {
    approvalId, previewId: preview.previewId ?? `${productType}-${slateDate}`, productType,
    requestedAt: slateDate, requestedBy: approvedBy, approvalMode: "paper_only", status: "approved",
    approvalToken, approvalNotes: approvalNote, moneyGuardMd5Before: md5Before,
    officialMoneyRecordAffected: false, public: false,
  };
  const card = {
    cardId, sourcePreviewId: approval.previewId, approvalId, productType,
    createdAt: slateDate, slateDate, status: "paper_active", paperOnly: true, active: false,
    realExposure: 0, officialMoneyRecordAffected: false, public: false,
    legs, combinedOddsAmerican: preview.combinedOddsAmerican ?? preview.combinedAmerican,
    approvalSnapshot: { approvedBy, approvedAt: slateDate, approvalNotes: approvalNote, approvalToken },
    settlementStatus: "pending", moneyGuardMd5AtCreation: md5Before,
  };

  const av = validateApprovalRequest(approval);
  if (!av.valid) fail(`approval failed schema validation: ${av.errors.join("; ")}`);
  const cv = validatePaperProductCard(card);
  if (!cv.valid) fail(`paper card failed schema validation: ${cv.errors.join("; ")}`);

  // --out-root lets a test target a tmp dir; defaults to the repo (prod behavior unchanged). Money + the
  // preview are still read from the real repo — only the card/approval WRITE target is redirected.
  const outRoot = arg("--out-root") ?? REPO;
  const cardPath = path.join(outRoot, "data", "internal", "product-cards", "paper", PRODUCT_SLUG[productType], slateDate, `${cardId}.json`);
  const apprPath = path.join(outRoot, "data", "internal", "product-cards", "approvals", PRODUCT_SLUG[productType], slateDate, `${approvalId}.json`);
  const exists = fs.existsSync(cardPath);

  let action = "DRY-RUN";
  if (write) {
    if (exists && !force) {
      action = "SKIPPED (card already exists — idempotent; pass --force to rewrite)";
    } else {
      fs.mkdirSync(path.dirname(cardPath), { recursive: true }); fs.writeFileSync(cardPath, JSON.stringify(card, null, 2) + "\n");
      fs.mkdirSync(path.dirname(apprPath), { recursive: true }); fs.writeFileSync(apprPath, JSON.stringify(approval, null, 2) + "\n");
      action = "WROTE";
    }
  }

  // ── Money guard: this script must NEVER move money. ──
  const md5After = moneyMd5();
  if (md5After !== md5Before) fail(`OFFICIAL MONEY MD5 CHANGED (${md5Before} → ${md5After}) — aborting, investigate immediately`);

  console.log(`[promote] ${action} · ${productType} ${slateDate} · card ${cardId} · ${legs.length} legs · approvedBy ${approvedBy}`);
  console.log(`  paper-only: active=false exposure/realExposure=0 officialMoneyRecordAffected=false · money md5 ${md5After} (unchanged)`);
  if (!write) console.log("  (dry run — pass --write to persist to data/internal/product-cards)");
  console.log(`  card:     ${path.relative(REPO, cardPath)}`);
  console.log(`  approval: ${path.relative(REPO, apprPath)}`);
}

main();
