/**
 * THE MANUAL SEAT — a role played by the founder's own ChatGPT, Claude or Grok subscription, by copy and paste.
 *
 * run() does not call anything. It returns a ready-to-paste prompt that states the role, the task, the facts it may
 * use and the exact JSON shape the answer must take. The founder pastes the answer back; parseManualAnswer() pulls
 * the first ```json block out and validates it against the same contract a fake or API seat must meet. A paste
 * that does not meet the contract is still recorded — with contractValid:false and the errors — because hiding a
 * contribution would be worse than showing a malformed one.
 *
 * Cost: $0 of API spend. It is not a claim that the subscription permits automation; a human does every step.
 */
import { validateEngineeringBrief } from "../contracts/index.mjs";

const SHAPES = {
  "engineering-brief": {
    example: { objective: "", constraints: [""], dependencies: [""], tests: [""], acceptanceCriteria: [""] },
    validate: validateEngineeringBrief,
  },
  "strategy-note": {
    example: { recommendation: "", rationale: [""], risks: [""] },
    validate: (a) => ({ ok: typeof a?.recommendation === "string", errors: typeof a?.recommendation === "string" ? [] : ["recommendation"] }),
  },
  "content-angles": {
    example: { angles: [{ eventId: "", angle: "", why: "" }], tone: "" },
    validate: (a) => ({ ok: Array.isArray(a?.angles), errors: Array.isArray(a?.angles) ? [] : ["angles"] }),
  },
};

const APP_NAMES = { "manual:chatgpt": "ChatGPT", "manual:claude": "Claude", "manual:grok": "Grok" };
const PROVIDER_OF = { "manual:chatgpt": "openai", "manual:claude": "anthropic", "manual:grok": "xai" };

export function manualSeat(seat) {
  return {
    seat,
    provider: "manual",
    app: APP_NAMES[seat],
    upstreamProvider: PROVIDER_OF[seat],
    async run({ task, roleTitle, facts }) {
      const shape = SHAPES[task.expectedArtifactType];
      const prompt = [
        `You are the ${roleTitle} for GameTimePicks, a sports forecasting site. You are one member of a team; the`,
        `founder (CEO) will read your answer next to the other roles' answers.`,
        ``,
        `TASK: ${task.title}`,
        `ACCEPTANCE CRITERIA:`,
        ...task.acceptanceCriteria.map((c) => `- ${c}`),
        ``,
        `FACTS YOU MAY USE (do not add numbers that are not here):`,
        JSON.stringify(facts, null, 2),
        ``,
        `RULES: no betting advice, no "lock"/"guaranteed"/"pick" language, never invent results or probabilities.`,
        ``,
        `Answer with ONE fenced \`\`\`json block in exactly this shape, then nothing else:`,
        "```json",
        JSON.stringify(shape?.example ?? {}, null, 2),
        "```",
      ].join("\n");
      return { awaitingInput: true, prompt };
    },
  };
}

/** Parse a pasted answer. Returns { artifact, contractValid, errors }. */
export function parseManualAnswer(text, artifactType) {
  const match = /```json\s*([\s\S]*?)```/i.exec(String(text ?? ""));
  if (!match) return { artifact: { raw: String(text ?? "") }, contractValid: false, errors: ["no ```json block found"] };
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (e) {
    return { artifact: { raw: String(text) }, contractValid: false, errors: [`invalid JSON: ${e.message}`] };
  }
  const v = SHAPES[artifactType]?.validate(parsed) ?? { ok: true, errors: [] };
  return { artifact: parsed, contractValid: v.ok, errors: v.errors };
}
