/**
 * GUARDRAILS (P266) — limits a person sets for themselves, checked against their own settled slips.
 *
 * WHAT THIS IS NOT: a rule the site imposes, a block, or a lecture. Nobody's stake is capped here and
 * nothing is prevented. Every limit is optional, null by default, and chosen by the person it applies
 * to; all this does is tell them where they stand against the number THEY set, in plain figures.
 *
 * An unset limit is silent. It is never treated as zero, never nagged about, and never presented as a
 * finding — a product that badgers someone for not setting a limit teaches them to ignore the panel
 * that matters when they do.
 *
 * Days are the reader's LOCAL day, because "today" means their today. The caller passes the zone.
 */

const DECIDED = new Set(["won", "lost", "push"]);
const decimalFromAmerican = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const returnedOf = (r) =>
  r.status === "won" ? (Number.isFinite(r.returned) ? r.returned : (r.stake ?? 0) * decimalFromAmerican(r.price_american ?? -110))
  : r.status === "push" ? (r.stake ?? 0)
  : 0;

/** Local calendar day of an instant, as YYYY-MM-DD. */
export function localDay(iso, timeZone = "America/New_York") {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/** Net for the slips settled within a set of local days: returned − staked. Losses are negative. */
function netForDays(rows, days, timeZone) {
  let staked = 0, returned = 0, n = 0;
  for (const r of rows) {
    if (!DECIDED.has(r.status)) continue;
    const day = localDay(r.settled_at ?? r.placed_at, timeZone);
    if (!day || !days.has(day)) continue;
    n += 1;
    staked += r.stake ?? 0;
    returned += returnedOf(r);
  }
  return { net: Math.round((returned - staked) * 100) / 100, slips: n };
}

/**
 * @param {Array<Record<string, any>>} rows      the person's own slips
 * @param {{ max_stake_per_slip?: number|null, daily_loss_limit?: number|null, monthly_loss_limit?: number|null }} limits
 * @param {{ now?: Date, timeZone?: string }} [opts]
 * @returns {Array<{id: string, state: "OK"|"APPROACHING"|"EXCEEDED", text: string, value: number, limit: number}>}
 */
export function evaluateGuardrails(rows, limits = {}, { now = new Date(), timeZone = "America/New_York" } = {}) {
  const out = [];
  const money = (v) => `$${Math.abs(v).toFixed(2)}`;
  /* 80% of a limit is worth saying out loud once; below that a person is simply inside the limit they
     chose, and a panel that speaks anyway is noise. */
  const near = (value, limit) => value >= limit * 0.8;

  const cap = limits.max_stake_per_slip;
  if (cap > 0) {
    const over = rows.filter((r) => (r.stake ?? 0) > cap);
    if (over.length) {
      const worst = Math.max(...over.map((r) => r.stake ?? 0));
      out.push({
        id: "stake-cap", state: "EXCEEDED", value: worst, limit: cap,
        text: `${over.length} slip${over.length === 1 ? "" : "s"} staked more than the ${money(cap)} you set per slip — the largest was ${money(worst)}.`,
      });
    } else {
      out.push({ id: "stake-cap", state: "OK", value: 0, limit: cap, text: `Every slip is within the ${money(cap)} you set per slip.` });
    }
  }

  const today = localDay(now.toISOString(), timeZone);
  const daily = limits.daily_loss_limit;
  if (daily > 0 && today) {
    const { net, slips } = netForDays(rows, new Set([today]), timeZone);
    const lost = net < 0 ? -net : 0;
    const state = lost >= daily ? "EXCEEDED" : near(lost, daily) ? "APPROACHING" : "OK";
    out.push({
      id: "daily-loss", state, value: lost, limit: daily,
      text: state === "OK"
        ? `Today: ${slips ? `${money(net)} across ${slips} settled` : "nothing settled yet"}, against the ${money(daily)} daily limit you set.`
        : state === "APPROACHING"
          ? `Today is ${money(lost)} down, against the ${money(daily)} daily limit you set.`
          : `Today is ${money(lost)} down — past the ${money(daily)} daily limit you set.`,
    });
  }

  const monthly = limits.monthly_loss_limit;
  if (monthly > 0 && today) {
    const month = today.slice(0, 7);
    const days = new Set(rows.map((r) => localDay(r.settled_at ?? r.placed_at, timeZone)).filter((d) => d && d.startsWith(month)));
    const { net, slips } = netForDays(rows, days, timeZone);
    const lost = net < 0 ? -net : 0;
    const state = lost >= monthly ? "EXCEEDED" : near(lost, monthly) ? "APPROACHING" : "OK";
    out.push({
      id: "monthly-loss", state, value: lost, limit: monthly,
      text: state === "OK"
        ? `This month: ${slips ? money(net) : "nothing settled yet"}, against the ${money(monthly)} monthly limit you set.`
        : state === "APPROACHING"
          ? `This month is ${money(lost)} down, against the ${money(monthly)} monthly limit you set.`
          : `This month is ${money(lost)} down — past the ${money(monthly)} monthly limit you set.`,
    });
  }

  return out;
}

/** Anything the person should see above their record, loudest first. Empty when nothing is set. */
export const guardrailAlerts = (findings) =>
  findings.filter((f) => f.state !== "OK").sort((a, b) => (a.state === "EXCEEDED" ? -1 : 1) - (b.state === "EXCEEDED" ? -1 : 1));
