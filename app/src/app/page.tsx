/**
 * Root route `/` — the product front door. Under static export (output: "export") `/` IS the "Today"
 * command center, but it now leads with a 30-second clarity layer (HomeHero) so a first-time visitor
 * instantly understands what GameTimePicks is: a FREE, PAPER-ONLY sports model that shows every pick,
 * every result, and every dollar of its $100 → ~$19K paper run. The full Today board renders directly
 * below, unchanged.
 *
 * Money values are NOT recomputed or hardcoded here — they come from the SAME canonical artifacts the
 * Today board and AchievementBanner already read (`buildDailyPortfolio` for the live paper bankroll,
 * `crownLadderSummary` + `portfolio.json` for the record / profit / peak / completed-ladder count).
 * `metadata` is re-exported from the Today page so the route's head stays identical.
 */
import path from "node:path";
import fs from "node:fs";

import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { buildDailyPortfolio } from "@/lib/mr-dub/daily-portfolio";
import { crownLadderSummary } from "@/lib/bank-builder/crown-summary";
import HomeHero from "@/components/home-hero";
import TodayPage, { metadata } from "./today/page";

export { metadata };

const usd0 = (n: number) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PICKS_ANCHOR = "todays-board";

export default function HomePage() {
  const dataRoot = path.join(process.cwd(), "public", "data");
  // Frame on the same presented slate the Today board uses, so figures line up with the board below.
  const today = currentSlateDate() ?? currentEtDate();

  // CANONICAL money — identical sources to the Today board / AchievementBanner; never recomputed here.
  // `activeBankroll` is portfolio.currentBankroll (the live paper bankroll, e.g. $19,765.40).
  const dailyPortfolio = buildDailyPortfolio(dataRoot, new Date().toISOString(), today);
  const crown = crownLadderSummary(dataRoot);

  // Record / realized profit / peak / completed-ladder count come straight from the canonical portfolio
  // artifact (the very fields AchievementBanner surfaces). Fail closed to nulls — never invent a number.
  let recordLabel = crown?.recordLabel ?? null;
  let profitLabel: string | null = null;
  let peakLabel: string | null = null;
  let completedLadders: number | null = crown ? 1 : null;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dataRoot, "mr-dub", "portfolio.json"), "utf8"));
    if (p.record && typeof p.record.wins === "number" && typeof p.record.losses === "number") {
      recordLabel = `${p.record.wins}–${p.record.losses}`;
    }
    // Realized paper profit — same canonical figure AchievementBanner uses (settledProfit, else derived).
    const profit = p.settledProfit ?? ((p.currentBankroll ?? 100) - (p.startingBankroll ?? 100));
    if (typeof profit === "number") profitLabel = usd0(profit);
    const peak = p.highWaterMark ?? p.peakBankroll;
    if (typeof peak === "number") peakLabel = usd0(peak);
    const official = (p.completedLadders ?? []).filter((l: { official?: boolean }) => l.official);
    if (official.length) completedLadders = official.length;
  } catch {
    /* fail closed → hero omits any figure it cannot source canonically */
  }

  const bankrollLabel = usd2(dailyPortfolio.activeBankroll);

  return (
    <>
      {/* Clarity layer — the 30-second story. Sits ABOVE the existing Today board (rendered below). */}
      <div className="vault-page-shell px-4 sm:px-8 pt-8 sm:pt-12 pb-0 overflow-x-hidden">
        <HomeHero
          bankrollLabel={bankrollLabel}
          profitLabel={profitLabel ?? bankrollLabel}
          recordLabel={recordLabel ?? "—"}
          peakLabel={peakLabel}
          completedLadders={completedLadders}
          picksAnchorId={PICKS_ANCHOR}
        />
      </div>
      {/* The full Today command center — flagship products, what's-live, Bank Builder, etc. Unchanged.
          The hero's primary CTA scrolls here; scroll-margin keeps the anchor clear of the sticky nav. */}
      <div id={PICKS_ANCHOR} style={{ scrollMarginTop: 72 }}>
        <TodayPage />
      </div>
    </>
  );
}
