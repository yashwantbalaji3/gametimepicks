/**
 * INTENT PARSING — keyword rules, deliberately boring. The Chief of Staff's plan must be predictable and
 * reviewable, so Phase 1 maps a CEO message to one of a few typed intents instead of letting a model improvise a
 * plan. Control intents (pause/resume) are founder actions and are re-checked by identity in the orchestrator.
 */
export const INTENTS = Object.freeze(["nfl-recap", "pause", "resume", "status", "general"]);

export function parseIntent(text) {
  const t = String(text ?? "").toLowerCase();
  if (/^\s*(pause|stop)\b.*publish/.test(t) || /^\s*pause\b/.test(t)) return "pause";
  if (/^\s*resume\b/.test(t)) return "resume";
  if (/^\s*(status|what('s| is) (the )?status)\b/.test(t)) return "status";
  if (/\b(recap|postgame|post-game|last night|results?)\b/.test(t) && /\b(nfl|football|games?)\b/.test(t)) return "nfl-recap";
  return "general";
}

/** The visible plan for each work intent: who does what, in what order, and why. */
export function planFor(intent) {
  if (intent === "nfl-recap") {
    return [
      { role: "prompt-architect", title: "Write the engineering brief for the recap", artifact: "engineering-brief" },
      { role: "engineering", title: "Check the slate and build the draft (via the brief)", artifact: "feasibility-report", via: "prompt-architect" },
      { role: "social-strategy", title: "Rank content angles and recommend a caption", artifact: "content-angles", after: "engineering" },
      { role: "chief-of-staff", title: "Consolidate and raise decisions for the CEO", artifact: "consolidated-report", after: "social-strategy" },
    ];
  }
  return [
    { role: "prompt-architect", title: "Turn the request into a brief", artifact: "engineering-brief" },
    { role: "product-strategist", title: "Give a product/strategy view", artifact: "strategy-note" },
    { role: "chief-of-staff", title: "Consolidate for the CEO", artifact: "consolidated-report", after: "product-strategist" },
  ];
}
