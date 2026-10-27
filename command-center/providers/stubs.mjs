/**
 * PAID SEATS — named, typed, and deliberately unable to run.
 *
 * `api:openai`, `api:anthropic` and `api:xai` exist so every contract, role card and ledger record already speaks
 * about them, and so switching a role to one later is configuration rather than a schema change. In Phase 1 they
 * contain NO network code: run() refuses with SEAT_NOT_ENABLED. Enabling them is checkpoint CP5 (provider choice,
 * account funding, a non-zero GTP_CC_BUDGET_USD) and comes with its own adapter modelled on
 * app/src/lib/ask/provider.mjs.
 *
 * `mcp:*` seats are the opposite direction — the founder's ChatGPT / Claude.ai / Grok app calling our tools — and
 * need a public HTTPS MCP server (Phase 3). They refuse the same way.
 */
import { REASON } from "../contracts/index.mjs";

export const STUB_SEATS = Object.freeze({
  "api:openai": { provider: "openai", enabledAt: "CP5", note: "OpenAI API — billed separately from ChatGPT Plus" },
  "api:anthropic": { provider: "anthropic", enabledAt: "CP5", note: "Claude API — billed separately from Claude plans" },
  "api:xai": { provider: "xai", enabledAt: "CP5", note: "xAI API — X Search tool billed per call" },
  "mcp:chatgpt": { provider: "openai", enabledAt: "Phase 3", note: "ChatGPT write tools need Business/Enterprise/Edu (help center)" },
  "mcp:claude": { provider: "anthropic", enabledAt: "Phase 3", note: "Claude.ai custom connectors (remote MCP, beta)" },
  "mcp:grok": { provider: "xai", enabledAt: "Phase 3", note: "Grok custom connectors (public HTTPS)" },
});

export function stubSeat(seat) {
  const meta = STUB_SEATS[seat];
  return {
    seat,
    provider: meta.provider,
    async run() {
      const err = new Error(`${seat} is not enabled (${meta.enabledAt}): ${meta.note}`);
      err.code = REASON.SEAT_NOT_ENABLED;
      throw err;
    },
  };
}
