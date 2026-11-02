/**
 * One confirmation interface for high-risk founder actions, whichever surface asks.
 * Local: a native macOS dialog. Hosted (not built): a passkey step-up, see docs/action-confirmation-contract.md.
 * There is no opt-out. No `ask` function means no confirmation, which is a refusal.
 */
export const CONFIRMED_ACTIONS = Object.freeze({
  "hold-release": { button: "Release hold", text: "Release the founder hold? This post can then be scheduled and sent." },
  "replace-held": { button: "Replace", text: "Void this approval and replace it with the newer version? The newer version needs its own approval." },
});

/** What is being confirmed, bound to the post and its exact content. */
export function confirmationRequest(action, post) {
  const a = CONFIRMED_ACTIONS[action];
  if (!a) return null;
  const contentSha = post?.package?.contentKey ?? null;
  return { action, decisionId: post?.decisionId ?? null, contentSha, button: a.button, message: `${a.text}\n\n${post?.package?.title ?? "Unknown post"}\nVersion ${String(contentSha).slice(0, 12)}` };
}

/** @param {{ ask?: (request: object) => Promise<boolean> }} o */
export function createActionConfirmer({ ask } = {}) {
  return async function confirm(action, post) {
    const request = confirmationRequest(action, post);
    if (!request || !request.decisionId || !request.contentSha || typeof ask !== "function") return { ok: false, code: "NOT_CONFIRMED", detail: "this action can't be confirmed here" };
    let yes = false;
    try { yes = (await ask(request)) === true; } catch { yes = false; }
    return yes ? { ok: true } : { ok: false, code: "NOT_CONFIRMED", detail: "the founder confirmation was not given" };
  };
}
