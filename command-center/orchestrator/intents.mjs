/**
 * INTENT PARSING — keyword rules, deliberately boring. The Chief of Staff's plan must be predictable and
 * reviewable, so Phase 1 maps a CEO message to one of a few typed intents instead of letting a model improvise a
 * plan. Control intents (pause/resume) are founder actions and are re-checked by identity in the orchestrator.
 */
export const INTENTS = Object.freeze(["nfl-recap", "engineering-task", "pause", "resume", "status", "general"]);

export function parseIntent(text) {
  const t = String(text ?? "").toLowerCase();
  if (/^\s*(pause|stop)\b.*publish/.test(t) || /^\s*pause\b/.test(t)) return "pause";
  if (/^\s*resume\b/.test(t)) return "resume";
  if (/^\s*(status|what('s| is) (the )?status)\b/.test(t)) return "status";
  if (/\bclaude code\b/.test(t) && /\b(spec|specification|implement|implementation)\b/.test(t)) return "engineering-task";
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
  if (intent === "engineering-task") {
    return [
      { role: "prompt-architect", title: "Write the engineering spec — your ChatGPT, pasted back", artifact: "engineering-spec", seat: "manual:chatgpt" },
      { role: "engineering", title: "Plan the change, read-only — after you approve the spec (G1)", artifact: "implementation-plan", seat: "cli:claude-code", gate: "G1" },
      { role: "engineering", title: "Implement in an isolated working copy — after you approve the plan (G2)", artifact: "engineering-result", seat: "cli:claude-code", gate: "G2" },
      { role: "verifier", title: "Verify independently: diff, scope, tests, screenshots", artifact: "verification", seat: "deterministic" },
      { role: "chief-of-staff", title: "Report, then you keep or discard the change (G3)", artifact: "consolidated-report", seat: "fake", gate: "G3" },
    ];
  }
  return [
    { role: "prompt-architect", title: "Turn the request into a brief", artifact: "engineering-brief" },
    { role: "product-strategist", title: "Give a product/strategy view", artifact: "strategy-note" },
    { role: "chief-of-staff", title: "Consolidate for the CEO", artifact: "consolidated-report", after: "product-strategist" },
  ];
}
