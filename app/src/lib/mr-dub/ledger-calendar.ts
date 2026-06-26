/**
 * Ledger calendar model — PRESENTATION ONLY. Transforms the canonical `daily-summary.json` days into a
 * month-grid calendar + a few derived "feel" stats (streak, best/worst day, high-water mark, rolling ROI).
 *
 * It NEVER recomputes or mutates money: every figure is read straight from the settled daily-summary
 * (which itself derives from the canonical ledger). This is a view transform, not an accounting source.
 */

export interface LedgerEvent {
  eventId?: string; category?: string; type?: string; laneId?: string; step?: number;
  paperStake?: number; paperReturn?: number; paperProfit?: number; status?: string; result?: string;
  combinedAmerican?: number; legs?: any[]; notes?: string; date?: string;
}
export interface LedgerDay {
  date: string; pl: number; opening: number; closing: number;
  wins: number; losses: number; voids: number; pending: number;
  staked: number; returned: number; events: LedgerEvent[];
}

export type DayResult = "win" | "loss" | "flat" | "none";

export interface CalCell {
  date: string | null;     // ISO date, or null for a padding cell
  dayNum: number | null;   // 1..31, or null
  inMonth: boolean;
  day: LedgerDay | null;   // the settled day, if any
  result: DayResult;
  products: string[];      // distinct product categories that settled this day (for icon dots)
}

export interface CalMonth { key: string; label: string; year: number; month: number; weeks: CalCell[][] }

export interface CalStats {
  currentStreak: { kind: "W" | "L" | "none"; len: number };
  bestDay: { date: string; pl: number } | null;
  worstDay: { date: string; pl: number } | null;
  largestWin: number; largestLoss: number;
  highWaterMark: number; currentBankroll: number; startingBankroll: number;
  totalPl: number; roiMultiple: number;
  settledDays: number; winDays: number; lossDays: number;
  recoveredToHighWater: boolean; // current bankroll back at (or above) the high-water mark
}

/** Map a ledger event category → a short product code + glyph for the calendar dots / drawer. */
export const PRODUCT_META: Record<string, { code: string; glyph: string; label: string }> = {
  bank_builder: { code: "BB", glyph: "🏦", label: "Bank Builder" },
  moonshot: { code: "MS", glyph: "🌙", label: "Moonshot" },
  wc_specials: { code: "WC", glyph: "⚽", label: "WC Specials" },
  specials: { code: "WC", glyph: "⚽", label: "WC Specials" },
  homer_nukes: { code: "HR", glyph: "⚾", label: "Homer Nukes" },
  mlb: { code: "HR", glyph: "⚾", label: "Homer Nukes" },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const dow = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-indexed
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayResult(pl: number): DayResult { return pl > 0 ? "win" : pl < 0 ? "loss" : "flat"; }

function productsForDay(d: LedgerDay): string[] {
  const set = new Set<string>();
  for (const e of d.events ?? []) if (e.category) set.add(e.category);
  return [...set];
}

export function buildLedgerCalendar(days: LedgerDay[], startingBankroll = 100): { months: CalMonth[]; stats: CalStats } {
  const sorted = [...(days ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((d) => [d.date, d]));

  // Build a calendar grid for every (year, month) that has at least one settled day.
  const monthKeys = [...new Set(sorted.map((d) => d.date.slice(0, 7)))].sort();
  const months: CalMonth[] = monthKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const first = `${key}-01`;
    const lead = dow(first); // 0=Sun .. 6=Sat — Sunday-first grid
    const total = daysInMonth(year, month);
    const cells: CalCell[] = [];
    for (let i = 0; i < lead; i++) cells.push({ date: null, dayNum: null, inMonth: false, day: null, result: "none", products: [] });
    for (let dn = 1; dn <= total; dn++) {
      const iso = `${key}-${String(dn).padStart(2, "0")}`;
      const day = byDate.get(iso) ?? null;
      cells.push({ date: iso, dayNum: dn, inMonth: true, day, result: day ? dayResult(day.pl) : "none", products: day ? productsForDay(day) : [] });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, dayNum: null, inMonth: false, day: null, result: "none", products: [] });
    const weeks: CalCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { key, label: `${MONTHS[month - 1]} ${year}`, year, month, weeks };
  });

  // Derived "feel" stats — presentation only, straight off the settled days.
  const settled = sorted.filter((d) => d.wins + d.losses + d.voids > 0 || d.pl !== 0);
  const winDays = settled.filter((d) => d.pl > 0).length;
  const lossDays = settled.filter((d) => d.pl < 0).length;
  const bestDay = sorted.length ? sorted.reduce((b, d) => (d.pl > (b?.pl ?? -Infinity) ? { date: d.date, pl: round2(d.pl) } : b), null as CalStats["bestDay"]) : null;
  const worstDay = sorted.length ? sorted.reduce((w, d) => (d.pl < (w?.pl ?? Infinity) ? { date: d.date, pl: round2(d.pl) } : w), null as CalStats["worstDay"]) : null;
  const highWaterMark = sorted.length ? round2(Math.max(...sorted.map((d) => d.closing))) : startingBankroll;
  const currentBankroll = sorted.length ? round2(sorted[sorted.length - 1].closing) : startingBankroll;
  const totalPl = round2(sorted.reduce((s, d) => s + d.pl, 0));

  // Current streak: walk the SETTLED days from newest backward while the sign holds (skip flat days).
  let currentStreak: CalStats["currentStreak"] = { kind: "none", len: 0 };
  for (let i = settled.length - 1; i >= 0; i--) {
    const sign = settled[i].pl > 0 ? "W" : settled[i].pl < 0 ? "L" : null;
    if (sign === null) continue;
    if (currentStreak.kind === "none") currentStreak = { kind: sign, len: 1 };
    else if (currentStreak.kind === sign) currentStreak = { kind: sign, len: currentStreak.len + 1 };
    else break;
  }

  return {
    months,
    stats: {
      currentStreak,
      bestDay, worstDay,
      largestWin: bestDay && bestDay.pl > 0 ? bestDay.pl : 0,
      largestLoss: worstDay && worstDay.pl < 0 ? worstDay.pl : 0,
      highWaterMark, currentBankroll, startingBankroll,
      totalPl, roiMultiple: round2(totalPl / startingBankroll),
      settledDays: settled.length, winDays, lossDays,
      recoveredToHighWater: currentBankroll >= highWaterMark - 0.01,
    },
  };
}
