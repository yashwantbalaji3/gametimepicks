/**
 * ROLE CARDS (machine-readable). The prose cards beside this file explain each role; this table is what the
 * orchestrator enforces. Missions come from the existing roster (agents/<role>/mission.md) — this does not create a
 * second roster, it makes nine of those roles executable.
 */
export const ROLES = Object.freeze({
  "chief-of-staff": {
    title: "Chief of Staff",
    mission: "agents/README.md (VP of Product & Operations)",
    produces: ["plan", "consolidated-report"],
    defaultSeat: "fake",
    seatOptions: ["fake"],
    budget: { tokens: 8000, usd: 0 },
    tools: ["ledger.read"],
  },
  "prompt-architect": {
    title: "Prompt Architect",
    mission: "agents/product-manager/mission.md",
    produces: ["engineering-brief"],
    defaultSeat: "fake",
    seatOptions: ["fake", "manual:chatgpt", "manual:claude"],
    budget: { tokens: 6000, usd: 0 },
    tools: [],
  },
  "product-strategist": {
    title: "Product Strategist",
    mission: "agents/product-manager/mission.md",
    produces: ["strategy-note"],
    defaultSeat: "fake",
    seatOptions: ["fake", "manual:chatgpt"],
    budget: { tokens: 6000, usd: 0 },
    tools: [],
  },
  "social-strategy": {
    title: "Social Strategy",
    mission: "agents/social-media-head/mission.md",
    produces: ["content-angles"],
    defaultSeat: "fake",
    seatOptions: ["fake", "manual:chatgpt", "manual:grok"],
    budget: { tokens: 6000, usd: 0 },
    tools: ["candidates.read"],
  },
  "engineering": {
    title: "Engineering",
    mission: "agents/data-engineer/mission.md",
    produces: ["feasibility-report"],
    defaultSeat: "fake",
    seatOptions: ["fake"],
    budget: { tokens: 6000, usd: 0 },
    tools: ["repo.facts", "recap.pipeline"],
  },
  "integrity-reviewer": {
    title: "Integrity Reviewer",
    mission: "agents/qa-engineer/mission.md",
    produces: ["integrity-verdict"],
    defaultSeat: "deterministic",
    seatOptions: ["deterministic"],
    budget: { tokens: 0, usd: 0 },
    tools: ["recap.gate"],
  },
  "creative-renderer": {
    title: "Creative Renderer",
    mission: "agents/visual-systems-designer/mission.md",
    produces: ["media-artifact"],
    defaultSeat: "deterministic",
    seatOptions: ["deterministic"],
    budget: { tokens: 0, usd: 0 },
    tools: ["render.png"],
  },
  "publisher": {
    title: "Publisher",
    mission: "agents/x-twitter-manager/mission.md",
    produces: ["publish-bundle"],
    defaultSeat: "deterministic",
    seatOptions: ["deterministic"],
    budget: { tokens: 0, usd: 0 },
    tools: ["publisher.mock"],
  },
  "growth-analyst": {
    title: "Growth Analyst",
    mission: "agents/content-analyst/mission.md",
    produces: ["strategy-note"],
    defaultSeat: "fake",
    seatOptions: ["fake"],
    budget: { tokens: 4000, usd: 0 },
    tools: ["ledger.read"],
  },
});

export const roleTitle = (id) => ROLES[id]?.title ?? id;
