# MLB Daily Operating Playbook

The daily launch-operations system for GameTime Picks — MLB-first, paper-only, educational.

**Non-negotiables (read before every run):**
- **Never fabricate** odds, markets, or simulations for games books have not priced. Unpriced games read
  "awaiting posted markets" — they do not get invented numbers.
- Keep **$0 official-money exposure**. Products stay in paper / review mode unless the founder gives a
  **separate, explicit** real-staking instruction. This playbook never authorizes real money on its own.
- The money md5 must stay **`affe6b21`** (`affe6b21071f2b3be96bb2774eb347c3`) on every publish. If the
  forensic audit does not read **MATHEMATICALLY PERFECT**, stop and do not publish.

Replace `<DATE>` with the real ET date in `YYYY-MM-DD` form throughout.

---

## The daily checklist

### 1. Confirm the ET date
```bash
date
```
Establish the real Eastern-time date first. Every command below keys off it. Never roll a slate to a guessed date.

### 2. One-command MLB (+ WC) refresh — credit- and money-guarded
From the **repo root**:
```bash
bash scripts/refresh_daily_products.sh --date <DATE>
```
Rolls the slate for both WC (archive) and MLB. It is credit-guarded (won't burn odds credits) and
money-md5-guarded (cannot move canonical money).

### 3. Generate the 10,000-run player-prop simulations
From **`app/`**:
```bash
npx tsx scripts/generate-mlb-game-simulations.mjs --write --date <DATE> --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```
Writes 10k sims for the games that have posted markets. Games without posted markets are left as
"awaiting posted markets" — this is expected on a partially-priced slate; re-run later in the day as books post.

### 4. Product-eligibility report
Review which simulated picks clear **both** gates before anything becomes a card:
- **Positive model-vs-market gap** — the model probability is higher than the market-implied probability.
- **Deterministic settlement** — the leg settles from the official MLB Stats API box score
  (strikeouts / total bases), with no settlement-pending ambiguity.

Only legs that clear both are eligible. Exclude World Cup legs, settlement-pending props, and any internal
full-game model output. If a slate produces no eligible legs, that is a legitimate **No Play** — do not force a card.

### 5. Author / approve the Bank Builder card (money-safe, md5-guarded)
The active review cards live in the approval artifact:
```
app/public/data/methodology/launch/dual-bank-builder-active.json
```
Promote an approved proposal with the money-guarded promoter (from **`app/`**):
```bash
node scripts/promote-bank-builder-proposal.mjs
```
Display-only card refresh for the July-21 review cards (money-safe, no bankroll change), from **`app/`**:
```bash
node scripts/refresh-review-cards-0721.mjs --apply
```
The promoter is md5-guarded — canonical money cannot move as a side effect. Both lanes may sit in review with
$0. Never approve a correlated same-game pair or a card with no model-vs-market gap.

### 6. Author / approve the Moonshot card
The active Moonshot review card lives in:
```
app/public/data/moonshot-lane/active.json
```
Same rules as Bank Builder: independent games only, deterministic settlement only, md5-guarded, $0 exposure.
Moonshot is the higher-variance lane — it is still paper/review, never real money by default.

### 7. Smoke the public routes
Open each and confirm it renders honestly (current MLB first, WC archived, products in review, no false "Live"):
```
/            /today       /simulate     /mlb          /games/mlb/<game>
/bank-builder /moonshot    /results      /world-cup    /methodology   /picks
```

### 8. Settle the prior day
Settle each prior-day leg **only** from the official MLB Stats API box score (strikeouts / total bases).
Keep **paper / internal settlement separated from the official record** — the official 19-14 record moves only
through approved cards, never from an ad-hoc paper settle. Settlement-pending props are not counted as losses.

### 9. Gates before publish (all must pass)
```bash
# Types — from app/
npx tsc --noEmit

# Test suite — from app/
npx tsx --test $(find src -name '*.test.mjs')

# Forensic money audit — must print "MATHEMATICALLY PERFECT"
npx tsx app/scripts/forensic-money-audit.mjs

# Health check — must print "HEALTHY"
npx tsx app/scripts/health-check.mjs --today <DATE>

# Production build — from app/
cd app && npm run build
```
Publish only if types pass, the suite is green, the forensic audit reads **MATHEMATICALLY PERFECT**, the health
check reads **HEALTHY**, and the build succeeds. If the money md5 is anything other than `affe6b21`, **do not publish**.

---

## Quick reference

| Step | Working dir | Command |
|---|---|---|
| Date | any | `date` |
| Refresh | repo root | `bash scripts/refresh_daily_products.sh --date <DATE>` |
| Sims | `app/` | `npx tsx scripts/generate-mlb-game-simulations.mjs --write --date <DATE> --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"` |
| Card refresh | `app/` | `node scripts/refresh-review-cards-0721.mjs --apply` |
| BB promote | `app/` | `node scripts/promote-bank-builder-proposal.mjs` |
| Types | `app/` | `npx tsc --noEmit` |
| Suite | `app/` | `npx tsx --test $(find src -name '*.test.mjs')` |
| Forensic | repo root | `npx tsx app/scripts/forensic-money-audit.mjs` |
| Health | repo root | `npx tsx app/scripts/health-check.mjs --today <DATE>` |
| Build | `app/` | `cd app && npm run build` |

**Approval artifacts:** Bank Builder `app/public/data/methodology/launch/dual-bank-builder-active.json` ·
Moonshot `app/public/data/moonshot-lane/active.json` — both md5-guarded.
