# Paper Product Operator Runbook

**How to operate the internal, paper-only product workflow — safely.** Paper cards are **NOT** public
cards and **NOT** official-money cards. Nothing here can change the official 19-14 record, the bankroll,
exposure, or the public site. Every step is money-md5-guarded. See
[PRODUCT_LEDGER_SEPARATION_AND_PAPER_CARD_POLICY.md](PRODUCT_LEDGER_SEPARATION_AND_PAPER_CARD_POLICY.md).

> ⚠️ **Paper cards are internal + paper-only.** `active:false`, `realExposure:0`,
> `officialMoneyRecordAffected:false`, `public:false`. They live under `data/internal/product-cards/**`
> and are never web-served. Paper P/L is in *units*, never dollars, and never touches bankroll.

Run everything from the `app/` directory. `<date>` is `YYYY-MM-DD`.

## 1. Daily ops summary (read-only)

```bash
npx tsx scripts/run-daily-product-ops-summary.mjs --date <date>            # print only
npx tsx scripts/run-daily-product-ops-summary.mjs --date <date> --write-summary   # + data/internal/ops/…
```
Shows money md5 + record (read-only), promotable previews, pending approvals, pending settlements, the
full-game-sim verdict (non-driving), and a recommended action.

## 2. Inspect previews

```bash
cat ../data/internal/product-previews/bank-builder/<date>.json
cat ../data/internal/product-previews/moonshot/<date>.json
```
Promotable ⇔ `status:"founder_review"` and `paperPromotionEligible:true`. If `no_play`, do not force a
card — regenerate with `npx tsx scripts/build-founder-review-previews.mjs --date <date> --write` and
re-check.

## 3. Promote a preview to a paper card (explicit founder approval REQUIRED)

```bash
npx tsx scripts/promote-founder-review-to-paper-card.mjs \
  --product bank_builder \            # or: moonshot | longshot
  --date <date> \
  --approve-founder-review \          # REQUIRED — refuses without it
  --approved-by "Your Name / approval context" \   # REQUIRED
  --approval-note "..." \
  --write
```
Writes `data/internal/product-cards/{paper,approvals}/<slug>/<date>/…`. Idempotent (content-hash cardId;
rerun ⇒ `SKIPPED`, `--force` to rewrite). Refuses a `no_play`/non-promotable preview or any unsupported /
odds-less leg. Odds are **de-vigged fair** (not a book price).

## 4. Settle paper cards

```bash
npx tsx scripts/settle-paper-product-cards.mjs --date <date> --write        # committed finals only
npx tsx scripts/settle-paper-product-cards.mjs --date <date> --fetch-final --write   # + live StatsAPI finals
```
Writes `data/internal/product-cards/settlements/<slug>/<date>/<cardId>.json`. Coverage: MLB team markets
(committed linescore), MLB player props (committed `settled_leans.jsonl`), soccer (committed WC FT
finals). Anything uncommitted stays **pending** (a live slate is all-pending until finals commit).

## 5. Interpret leg + card outcomes

| leg status | meaning |
|---|---|
| `win` / `loss` | graded from an official final |
| `push` | landed on the line (dropped from the parlay) |
| `pending` | not final / not committed yet — **NOT a loss** |
| `unavailable` | DNP / null actual (dropped) — **NOT a loss** |

Card: one `loss` ⇒ **lost**; all `win` ⇒ **won**; any `pending` (no loss) ⇒ **pending**; only push/void ⇒
**void**. `paperPnlUnits` is 0 while pending; it is **paper units**, never dollars.

## 6. Confirm the money wall held

```bash
md5 -q public/data/mr-dub/portfolio.json        # must be affe6b21071f2b3be96bb2774eb347c3
npx tsx scripts/forensic-money-audit.mjs        # must be MATHEMATICALLY PERFECT
npx tsx scripts/health-check.mjs --today <date>  # must be HEALTHY
```
Each workflow script also prints `money md5 … (unchanged)`; if it ever differs, **STOP** and investigate.

## 7. Confirm internal-only

```bash
find out -type f 2>/dev/null | grep -i product-cards   # must be empty after a build
```
Paper cards / approvals / settlements / ops summaries are all under `data/internal/` — never in the
static export, never on `/results`, never imported by public code (test-enforced).

## 8. Recover from a failed promotion

Promotion refuses (exit ≠ 0, `REFUSED`) when: an approval flag is missing, the preview is not
`founder_review`, a leg is unsupported / odds-less, or the payload fails schema validation. Fix the cause
(regenerate the preview, pick a promotable product) and re-run — nothing partial is written on refusal.

## 9. What this workflow will NEVER do

Activate a real-money card · create exposure · change the 19-14 record / bankroll / crown · write a money
artifact · render on the public site · let the full-game simulation pick a leg · grade a non-final game ·
score pending/unavailable as a loss · fabricate a final, actual, or outcome.
