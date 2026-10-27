/**
 * THE FAKE SEAT — deterministic stand-ins for model-written role output.
 *
 * Every artifact here is assembled from the facts the orchestrator hands in (ledger-derived numbers, gate
 * verdicts, file paths). Nothing is invented, and every contribution is marked simulated:true so the console
 * labels it "SIMULATED AGENT OUTPUT". Swapping a role to a manual or API seat replaces this text, not the
 * contract it must satisfy.
 */

const PROVIDER = { provider: "fake", model: null };

export const fakeSeat = {
  seat: "fake",
  provider: "fake",
  async run({ task, facts }) {
    const fn = BY_ROLE[task.ownerRole];
    if (!fn) throw new Error(`fake seat has no behaviour for ${task.ownerRole}`);
    return { ...PROVIDER, ...fn(facts, task) };
  },
};

const BY_ROLE = {
  "prompt-architect": (f) => ({
    artifactType: "engineering-brief",
    artifact: {
      objective: f.intent === "nfl-recap"
        ? `Produce a reviewable postgame recap draft for the most recent settled NFL slate: one branded 1080×1350 graphic and two captions, built only from the Forecast Ledger and frozen receipts.`
        : `Turn the CEO request into an executable brief: "${f.commandText}"`,
      constraints: [
        "Read only authoritative records (data/internal/forecast-ledger/v1/nfl.jsonl and the receipt each row names); never scrape public pages.",
        "Use the forecast of record frozen before kickoff; refuse withdrawn, unsettled, provisional, corrected or private-research inputs.",
        "No posting, no paid inference, no network: mock publisher only (Phase 1).",
        "No league logos, player images, odds, prices or betting language.",
      ],
      dependencies: ["Forecast Ledger (nightly-settle)", "NFL forecast receipts (nfl-event-window)", "Playwright from app/node_modules"],
      tests: [
        "Integrity gate passes the chosen game and refuses the six synthesized bad variants.",
        "Every number in each caption appears in the fact bundle.",
        "PNG is exactly 1080×1350 and re-renders to the same bytes.",
      ],
      acceptanceCriteria: [
        "One graphic, two captions, all validator checks green.",
        "A decision request bound to exact content digests.",
        "Refusals and warnings reported, not hidden.",
      ],
    },
    summary: f.intent === "nfl-recap"
      ? "Brief written: recap draft for the latest settled NFL slate, ledger-only inputs, mock publishing, explicit refusal rules."
      : "Brief written for the CEO request, with constraints and acceptance criteria.",
    proposedNextSteps: f.intent === "nfl-recap" ? [{ toRole: "engineering", why: "Check feasibility on the slate and build the draft to this brief." }] : [],
  }),

  "product-strategist": (f) => ({
    artifactType: "strategy-note",
    artifact: {
      recommendation: "Route this through the next founder checkpoint rather than acting now.",
      rationale: [
        `Request: "${f.commandText}".`,
        "Phase 1 roles cannot research the live web or competitors (no network, no paid inference).",
        "A manual ChatGPT seat can take this role today at $0 API cost: switch Product Strategist to manual:chatgpt.",
      ],
      risks: ["Strategy decisions must wait for the finalized reassessment roadmap (CP3)."],
    },
    summary: "Strategy note: recommends a manual ChatGPT seat for real analysis and flags the CP3 roadmap dependency.",
    proposedNextSteps: [],
  }),

  "engineering": (f) => (!f.chosen ? {
    artifactType: "feasibility-report",
    artifact: { slateDate: f.slateDate, ledger: f.ledger, gamesChecked: f.games.length, eligible: [], refused: f.games.map((g) => ({ eventId: g.eventId, matchup: g.matchup, reasons: g.refusals })), chosen: null },
    summary: `Checked ${f.games.length} games on ${f.slateDate}: none passed the integrity gate, so there is nothing to draft.`,
    proposedNextSteps: [],
  } : {
    artifactType: "feasibility-report",
    artifact: {
      slateDate: f.slateDate,
      ledger: f.ledger,
      gamesChecked: f.games.length,
      eligible: f.games.filter((g) => g.pass).map((g) => `${g.eventId} ${g.matchup}`),
      refused: f.games.filter((g) => !g.pass).map((g) => ({ eventId: g.eventId, matchup: g.matchup, reasons: g.refusals })),
      chosen: f.chosen,
      choiceRule: "latest kickoff on the slate (the most timely game); a ranking rule, not an opinion",
      notFeasibleNow: [
        "Live touchdowns by player: ESPN scoring plays carry no athlete ids (app/src/lib/live/adapters/espn-nfl.mjs).",
        "Served-revision (Option B) evidence is not checked offline.",
      ],
    },
    summary: `Checked ${f.games.length} games on ${f.slateDate}: ${f.games.filter((g) => g.pass).length} eligible, ${f.games.filter((g) => !g.pass).length} refused. Drafting ${f.chosen.matchup} (${f.chosen.eventId}).`,
    proposedNextSteps: [
      { toRole: "integrity-reviewer", why: `Gate ${f.chosen.eventId} before anything is rendered.` },
      { toRole: "creative-renderer", why: `Render the graphic and captions for ${f.chosen.eventId}.` },
    ],
  }),

  "social-strategy": (f) => {
    const ranked = [...f.games].filter((g) => g.pass).sort((a, b) => b.confidence - a.confidence || a.eventId.localeCompare(b.eventId));
    const topHit = ranked.find((g) => g.result === "WIN");
    const topMiss = ranked.find((g) => g.result === "LOSS");
    const angles = [
      { eventId: f.chosen.eventId, angle: `Prime-time recap: ${f.chosen.matchup}`, why: "Most recent game; draft is ready for review." },
      topHit && { eventId: topHit.eventId, angle: `Confident call that landed: ${topHit.matchup} (${topHit.pct} favourite won)`, why: "Shows a frozen forecast checked against the final." },
      topMiss && { eventId: topMiss.eventId, angle: `Transparent miss: ${topMiss.matchup} (${topMiss.pct} favourite lost)`, why: "Posting misses next to hits is the trust signal." },
    ].filter(Boolean);
    return {
      artifactType: "content-angles",
      artifact: {
        angles,
        tone: "Caption A (factual) for X: it states the result, the frozen number and the total miss in one read.",
        cadence: "At most 3 recap posts per slate; hits and misses in the same proportion as the record.",
      },
      summary: `Ranked ${angles.length} angles from ${ranked.length} eligible games; recommends caption A and pairing hits with misses.`,
      proposedNextSteps: [],
    };
  },
};
