/**
 * COST MODEL — incremental cost of coordinated workflows per day, from explicit assumptions.
 *
 *   node command-center/orchestration/cost-model.mjs           # table for 5 / 25 / 100 workflows a day
 *
 * PRICES are list prices read from the providers' official pages on 2026-11-03 (USD per million tokens; X Search per
 * post fetched). They are inputs, not facts the loop relies on — re-check them before any purchase.
 * Everything under ASSUMED is an estimate, not a measurement: there has been no live call to measure.
 */
export const PRICES = Object.freeze({
  "gpt-6-luna": { in: 0.1, out: 0.5 }, // developers.openai.com/api/docs/pricing
  "gpt-6.1-sol": { in: 2, out: 10 },
  "gpt-6-astra": { in: 10, out: 50 },
  "grok-4.3": { in: 1.25, out: 2.5 }, // docs.x.ai/docs/models
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 }, // claude-api reference (cached 2026-10-06)
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  xSearchPerPost: 5 / 1000, // docs.x.ai/developers/tools/x-search
});

/** ASSUMED token sizes per call and how often each call happens per workflow (after cost-first routing). */
export const ASSUMED = Object.freeze({
  evaluation: { inTok: 5000, outTok: 2500, perWorkflow: 1.0 }, // low-risk work closed by our own checks skips it (~30%)
  plan: { inTok: 3000, outTok: 2500, perWorkflow: 0.3 }, // most requests arrive as direct briefs
  strongReview: { inTok: 6000, outTok: 3000, perWorkflow: 0.2 }, // high-risk share
  research: { inTok: 3000, outTok: 2000, posts: 20, perWorkflow: 0.2 },
  engineering: { inTok: 200_000, cachedShare: 0.8, outTok: 15_000, perWorkflow: 1.0 }, // one headless Claude Code task
  retryFactor: 1.15,
});

const call = (p, inTok, outTok, cachedShare = 0) => ((inTok * (1 - cachedShare) * p.in + inTok * cachedShare * (p.cacheRead ?? p.in) + outTok * p.out) / 1e6);

export const CONFIGS = Object.freeze({
  "lowest (Claude on the founder's subscription)": { evaluator: "gpt-6-luna", strong: "gpt-6.1-sol", planner: "gpt-6-luna", engineering: null },
  "low (Claude API, Sonnet)": { evaluator: "gpt-6-luna", strong: "gpt-6.1-sol", planner: "gpt-6-luna", engineering: "claude-sonnet-5-5" },
  "higher quality (Claude API, Opus)": { evaluator: "gpt-6.1-sol", strong: "gpt-6-astra", planner: "gpt-6.1-sol", engineering: "claude-opus-5-5" },
});

/** USD per workflow for one configuration, itemised. */
export function perWorkflow(cfg, a = ASSUMED, P = PRICES) {
  const items = {
    evaluation: a.evaluation.perWorkflow * call(P[cfg.evaluator], a.evaluation.inTok, a.evaluation.outTok),
    plan: a.plan.perWorkflow * call(P[cfg.planner], a.plan.inTok, a.plan.outTok),
    strongReview: a.strongReview.perWorkflow * call(P[cfg.strong], a.strongReview.inTok, a.strongReview.outTok),
    research: a.research.perWorkflow * (call(P["grok-4.3"], a.research.inTok, a.research.outTok) + a.research.posts * P.xSearchPerPost),
    engineering: cfg.engineering ? a.engineering.perWorkflow * call(P[cfg.engineering], a.engineering.inTok, a.engineering.outTok, a.engineering.cachedShare) : 0,
  };
  const subtotal = Object.values(items).reduce((x, y) => x + y, 0);
  return { items, total: subtotal * a.retryFactor };
}

export function scenarios(perDay = [5, 25, 100]) {
  return Object.entries(CONFIGS).map(([name, cfg]) => {
    const w = perWorkflow(cfg);
    return { name, perWorkflowUsd: w.total, items: w.items, days: perDay.map((n) => ({ perDay: n, dailyUsd: n * w.total, monthlyUsd: 30 * n * w.total })) };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const s of scenarios()) {
    console.log(`\n${s.name}: $${s.perWorkflowUsd.toFixed(4)} per workflow (ASSUMED sizes, list prices)`);
    for (const [k, v] of Object.entries(s.items)) console.log(`  ${k.padEnd(13)} $${v.toFixed(4)}`);
    for (const d of s.days) console.log(`  ${String(d.perDay).padStart(3)}/day  $${d.dailyUsd.toFixed(2)}/day  $${d.monthlyUsd.toFixed(2)}/month`);
  }
}
