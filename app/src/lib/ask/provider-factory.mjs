/**
 * ONE PLACE THAT KNOWS WHICH ADAPTER EXISTS.
 *
 * `selectProvider` decides WHICH provider, purely, from the environment. This turns that decision into
 * an instance. Keeping them apart matters: the decision is a unit test, the construction is a wiring
 * detail, and the endpoint, the eval harness and the dev server all get the same answer from the same
 * code instead of each re-deriving it with a ternary that can drift (§B: "do not spread OpenAI-specific
 * API calls across the application").
 *
 * Adding a third vendor should touch this file and an adapter, and nothing else.
 */
import { createAnthropicProvider, ANTHROPIC_MODEL } from "./provider-anthropic.mjs";
import { createOpenAiProvider, OPENAI_MODEL } from "./provider-openai.mjs";
import { createGeminiProvider, GEMINI_MODEL } from "./provider-gemini.mjs";
import { createFakeProvider } from "./provider-fake.mjs";

/** The model each provider uses when the environment names none. Recorded in every receipt. */
export const ASK_DEFAULT_MODEL = Object.freeze({
  anthropic: ANTHROPIC_MODEL,
  openai: OPENAI_MODEL,
  gemini: GEMINI_MODEL,
});

/**
 * @param {{provider: string, model?: string|null}} decision  from `selectProvider`
 * @param {object} env                                        process.env, read for the key only
 * @param {{diagnostics?: boolean}} [opts]
 */
export function makeProvider(decision, env = {}, opts = {}) {
  const diagnostics = Boolean(opts.diagnostics);
  const model = decision?.model || null;

  switch (decision?.provider) {
    case "fake":
      return createFakeProvider();
    case "openai":
      return createOpenAiProvider({
        apiKey: env.OPENAI_API_KEY,
        model: model ?? OPENAI_MODEL,
        diagnostics,
      });
    case "gemini":
      return createGeminiProvider({
        apiKey: env.GOOGLE_API_KEY,
        model: model ?? GEMINI_MODEL,
      });
    case "anthropic":
      return createAnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: model ?? ANTHROPIC_MODEL,
        diagnostics,
      });
    default:
      // Unreachable via `selectProvider`, which fails closed before it ever names an unknown provider.
      throw new Error(`makeProvider: unknown provider ${String(decision?.provider)}`);
  }
}
