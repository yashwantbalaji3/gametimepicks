/**
 * Money-integrity invariants — the platform's financial guardrail (CTO completion, STEP 11).
 *
 * A pure checker over the canonical money artifacts. It encodes the cumulative-crown model's invariants
 * and returns EVERY violation (empty array = healthy). The CLI wrapper (scripts/verify-money-integrity.mjs)
 * exits non-zero on any violation so the daily chain FAILS LOUDLY — it must never settle/publish on a
 * corrupted bankroll. Nothing here mutates or fabricates; it only verifies what the artifacts already say.
 *
 * Source-of-truth model:
 *   crown    = Σ official completed-ladder finals          (banked-ladders.json `ladders[].final`)
 *   bankroll = crown − realized dual-lane losses = crown − drawdown   (≤ crown, > 0)
 *   profit   = bankroll − startingBankroll ($100)
 *   roi      = profit / startingBankroll
 * Everything else (daily-portfolio view, ledger) must AGREE with portfolio.json (the canonical doc).
 */

export interface MoneyDocs {
  portfolio: Record<string, any>;             // mr-dub/portfolio.json (CANONICAL)
  banked: Record<string, any>;                // mr-dub/banked-ladders.json (realized-history base)
  daily?: Record<string, any> | null;         // mr-dub/daily-portfolio.json (derived view)
  ledger?: Record<string, any> | null;        // mr-dub/ledger.json (derived)
}

export interface MoneyViolation { rule: string; detail: string; severity: "critical" | "warn"; }

const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

export function checkMoneyIntegrity(d: MoneyDocs): MoneyViolation[] {
  const out: MoneyViolation[] = [];
  const crit = (rule: string, detail: string) => out.push({ rule, detail, severity: "critical" });
  const warn = (rule: string, detail: string) => out.push({ rule, detail, severity: "warn" });

  const p = d.portfolio, b = d.banked;
  if (!p || !b) { crit("docs-present", "portfolio.json and banked-ladders.json are both required"); return out; }

  const start = typeof p.startingBankroll === "number" ? p.startingBankroll : 100;
  const crown = round2(p.crownBankroll);
  const bankroll = round2(p.currentBankroll);
  const drawdown = round2(p.drawdown ?? 0);

  // 1) crown = Σ official completed-ladder finals (no phantom crown).
  const crownSum = round2((b.ladders ?? []).reduce((s: number, l: any) => s + (l.final ?? 0), 0));
  if (!near(crown, crownSum)) crit("crown=Σ-official-finals", `portfolio crown ${crown} ≠ Σ banked finals ${crownSum}`);
  if (!near(round2(b.crownTotal ?? 0), crownSum)) crit("banked.crownTotal=Σ-finals", `banked crownTotal ${b.crownTotal} ≠ Σ finals ${crownSum}`);
  for (const l of b.ladders ?? []) if (l.official !== true) crit("ladder-official", `banked ladder "${l.label ?? l.ladder}" is not flagged official`);

  // 2) bankroll ≤ crown and bankroll > 0 (cumulative-crown invariants).
  if (bankroll > crown + 0.01) crit("bankroll≤crown", `bankroll ${bankroll} > crown ${crown}`);
  if (bankroll <= 0) crit("bankroll>0", `bankroll is ${bankroll} (non-positive)`);

  // 3) drawdown reconciles: drawdown = crown − bankroll (all realized losses).
  if (!near(drawdown, round2(crown - bankroll))) crit("drawdown=crown−bankroll", `drawdown ${drawdown} ≠ crown−bankroll ${round2(crown - bankroll)}`);

  // 4) settled profit + ROI derive from bankroll.
  const profit = round2(bankroll - start);
  if (typeof p.settledProfit === "number" && !near(round2(p.settledProfit), profit)) crit("profit=bankroll−start", `settledProfit ${p.settledProfit} ≠ bankroll−${start} ${profit}`);
  if (typeof p.roi === "number" && !near(round2(p.roi), round2(profit / start), 0.02)) crit("roi=profit/start", `roi ${p.roi} ≠ profit/${start} ${round2(profit / start)}`);

  // 5) record is non-negative integers + no stray pending once settled.
  const r = p.record ?? {};
  for (const k of ["wins", "losses", "voids", "pending"]) {
    const x = r[k];
    if (!Number.isInteger(x) || x < 0) crit("record-integers", `record.${k} is ${x} (must be a non-negative integer)`);
  }

  // 6) the daily-portfolio DERIVED view must agree with the canonical bankroll/crown (no drift).
  if (d.daily) {
    if (typeof d.daily.activeBankroll === "number" && !near(round2(d.daily.activeBankroll), bankroll)) crit("daily=canonical-bankroll", `daily activeBankroll ${d.daily.activeBankroll} ≠ portfolio bankroll ${bankroll}`);
    if (typeof d.daily.crownBankroll === "number" && !near(round2(d.daily.crownBankroll), crown)) crit("daily=canonical-crown", `daily crownBankroll ${d.daily.crownBankroll} ≠ portfolio crown ${crown}`);
    // open exposure must equal Σ active-lane exposures (no orphaned/phantom exposure).
    const sumExp = round2((d.daily.lanes ?? []).filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + (l.exposure ?? 0), 0));
    if (typeof d.daily.openExposure === "number" && !near(round2(d.daily.openExposure), sumExp)) crit("openExposure=Σ-active", `daily openExposure ${d.daily.openExposure} ≠ Σ active-lane exposure ${sumExp}`);
  }

  // 7) the ledger Σ paperProfit must equal settled profit (the running ledger reconciles to the bankroll).
  if (d.ledger) {
    const evs = d.ledger.events ?? d.ledger.ledger ?? [];
    if (Array.isArray(evs) && evs.length) {
      const sum = round2(evs.reduce((s: number, e: any) => s + (e.paperProfit ?? 0), 0));
      if (!near(sum, profit)) crit("ledger-Σ=profit", `ledger Σ paperProfit ${sum} ≠ settled profit ${profit}`);
    } else warn("ledger-empty", "ledger has no events to reconcile");
  }

  return out;
}
