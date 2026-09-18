/**
 * ASK GAMETIME ENDPOINT — the network half. Every decision it makes was already made in
 * `_ask-core.mjs`; this file fetches, streams and cleans up.
 *
 * WHY A FUNCTION AND NOT A PAGE. The site is a static export, and it stays one. Vercel deploys
 * project-root `api/*.mjs` as functions independently of the Next build — `live.mjs`, `collect.mjs`,
 * `slip-read.mjs` and two crons already run this way and are verified in production. Ask is additive:
 * nothing about the export changes to add it, and if this endpoint is down the entire website still
 * works (§54, §86).
 *
 * THE KEY NEVER LEAVES THE SERVER. It is read from `process.env` inside this handler, passed to one
 * adapter, and never logged, echoed into an error body, returned, or prefixed `NEXT_PUBLIC`. A
 * negative build test asserts it is absent from the client bundle, because "we did not put it there"
 * is a claim and "it is not in the output" is a measurement.
 *
 * STREAMING WITHOUT STREAMING A LIE (§52). Status and tool events stream as they happen, so the page
 * feels alive. The ANSWER is emitted only after it has passed the grounding verifier. Streaming an
 * unverified number and retracting it afterwards is worse than a slightly later answer: the reader has
 * already read the number.
 */
import {
  askAuditLine,
  askDisabled,
  clientKeyFrom,
  decideAsk,
  makeRateLimiter,
} from "./_ask-core.mjs";
import { ASK_BUDGET, ASK_ERROR } from "../src/lib/ask/contract.mjs";
import { makeAskLoader, originFetchText, resolveAssetOrigin } from "../src/lib/ask/loader.mjs";
import { originLiveFetch } from "../src/lib/ask/tools/live.mjs";
import { createAnthropicProvider } from "../src/lib/ask/provider-anthropic.mjs";
import { createFakeProvider } from "../src/lib/ask/provider-fake.mjs";
import { runAskTurn } from "../src/lib/ask/engine.mjs";
import { redact } from "../src/lib/ask/provider.mjs";

/*
 * ONE LOADER PER WARM INSTANCE, so the published assets are memoised across turns. They are public and
 * immutable between deploys, so caching them is free correctness; the per-turn BUDGET is separate and
 * is reset for every request, which is what stops one conversation walking the whole asset tree.
 */
let loader = null;
const limiter = makeRateLimiter();

export default async function handler(req, res) {
  const bodyText = typeof req.body === "string" ? req.body : req.body ? JSON.stringify(req.body) : "";
  const body = typeof req.body === "string" ? safeParse(req.body) : req.body ?? null;

  const decision = decideAsk({
    env: process.env,
    method: req.method,
    body,
    bodyBytes: Buffer.byteLength(bodyText ?? ""),
  });

  if (!decision.proceed) {
    console.log(askAuditLine(decision));
    res.setHeader("Cache-Control", "no-store");
    return res.status(decision.status).json({ ok: false, code: decision.code, reason: decision.reason });
  }

  const gate = limiter.check(clientKeyFrom(req.headers ?? {}));
  if (!gate.ok) {
    console.log(askAuditLine({ proceed: false, status: 429, code: gate.code, reason: gate.reason }));
    res.setHeader("Retry-After", String(gate.retryAfterSeconds));
    res.setHeader("Cache-Control", "no-store");
    return res.status(429).json({ ok: false, code: ASK_ERROR.RATE_LIMITED, reason: "too many questions just now — give it a moment", retryAfterSeconds: gate.retryAfterSeconds });
  }

  const origin = resolveAssetOrigin(process.env, req.headers?.host);
  if (!origin) {
    gate.release();
    return res.status(503).json({ ok: false, code: ASK_ERROR.ASSET_UNAVAILABLE, reason: "Ask GameTime cannot reach its own data right now" });
  }

  loader ??= makeAskLoader(originFetchText(origin));

  /*
   * Upstream error detail is forwarded in PREVIEW and DEVELOPMENT only. Production serves strangers
   * and has no operator reading the response; preview is where someone is actively debugging.
   */
  const isProd = String(process.env.VERCEL_ENV ?? "").toLowerCase() === "production";
  const provider = decision.provider === "fake"
    ? createFakeProvider()
    : createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, diagnostics: !isProd });

  /*
   * ABORT IS WIRED THROUGH. A reader pressing Stop closes the response, which fires `close` here,
   * which aborts the provider request in flight. Without this the model call keeps running and
   * billing while its answer is discarded (§139).
   */
  const controller = new AbortController();
  let clientGone = false;
  /*
   * ⚠ WATCH THE RESPONSE, NOT THE REQUEST. `req` is the incoming stream, and it emits `close` once the
   * BODY HAS BEEN READ — which for a POST is immediately, long before the answer exists. Aborting on
   * that would cancel the provider call on every single turn. `res` closes when the client actually
   * goes away, which is the event this is for.
   */
  res.on?.("close", () => {
    if (res.writableEnded) return; // a normal completed response closes too
    clientGone = true;
    controller.abort();
  });

  const stream = wantsStream(req);
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
  } else {
    res.setHeader("Cache-Control", "no-store");
  }

  const send = (event) => {
    if (!stream || clientGone) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      clientGone = true;
    }
  };

  try {
    const result = await runAskTurn(decision.request, {
      provider,
      turn: loader.beginTurn(),
      now: () => new Date(),
      liveFetch: originLiveFetch(origin),
      signal: controller.signal,
      /*
       * SAFE STATUS EVENTS ONLY (§96). "Checking Game Finder…" — never the tool's arguments, never a
       * plan, never anything resembling reasoning. The status line tells a reader the system is
       * working; it does not narrate how.
       */
      onEvent: (e) => {
        if (e.type === "status" || e.type === "tool_start") send({ type: "status", text: e.text });
        else if (e.type === "tool_complete") send({ type: "tool_complete", tool: e.tool, status: e.status });
      },
    });

    console.log(askAuditLine(decision, result.receipt ?? {}, result.providerStatus ? { providerStatus: result.providerStatus, providerType: result.providerType ?? null } : {}));

    if (!result.ok) {
      /*
       * THE UPSTREAM STATUS IS DIAGNOSTIC, NOT SECRET. A canary that can only say "provider error"
       * cannot distinguish a bad key (401) from a wrong model (404) from a rate limit (429), which
       * turns a five-second fix into an afternoon. The numeric status names no key and carries no
       * content; the upstream BODY is still never echoed.
       */
      const payload = { ok: false, code: result.code, reason: reasonFor(result.code) };
      if (result.providerStatus) payload.providerStatus = result.providerStatus;
      if (result.providerType) payload.providerType = result.providerType;
      if (result.providerExplain) payload.providerExplain = result.providerExplain;
      /*
       * The refusal detail names WHAT was refused — the tool the model invented, the argument it
       * passed. That is a name the model produced, not a secret, and without it "UNKNOWN_TOOL" tells
       * an operator nothing about which tool to teach it about.
       */
      if (!isProd && result.detail) payload.detail = result.detail;
      if (stream) { send({ type: "error", ...payload }); send({ type: "done" }); return res.end(); }
      return res.status(502).json(payload);
    }

    const payload = {
      ok: true,
      intent: result.intent,
      clarification: Boolean(result.clarification),
      verified: result.verified !== false,
      answer: result.answer,
      evidence: result.evidence ?? null,
      entities: result.entities ?? [],
      /*
       * TOKEN COUNTS AND TIMINGS, so cost is MEASURED rather than asserted. They describe this turn's
       * own consumption and name nothing about the reader; the canary needs them to report a real
       * per-turn cost, and a reader who looks at them learns only what their own question cost.
       */
      usage: {
        inputTokens: result.receipt?.inputTokens ?? 0,
        outputTokens: result.receipt?.outputTokens ?? 0,
        plannerMs: result.receipt?.plannerMs ?? 0,
        toolsMs: result.receipt?.toolsMs ?? 0,
        writerMs: result.receipt?.writerMs ?? 0,
        model: result.receipt?.model ?? null,
        planningPasses: result.receipt?.planningPasses ?? 1,
        verifier: result.receipt?.verifierStatus ?? null,
        /* Why a rejected answer was rejected — non-production only, like the other diagnostics. */
        ...(isProd ? {} : { verifierViolations: result.receipt?.verifierViolations ?? null, rejectedAnswer: result.receipt?.rejectedAnswer ?? null }),
      },
    };

    if (stream) {
      send({ type: "answer", ...payload });
      send({ type: "done" });
      return res.end();
    }
    return res.status(200).json(payload);
  } catch (e) {
    // Redacted, truncated, and never the raw message: the strings that leak a key are by definition
    // the ones nobody expected to contain one.
    console.log(JSON.stringify({ ask: "failed", message: redact(e?.message) }));
    if (stream) { send({ type: "error", ok: false, code: ASK_ERROR.PROVIDER_ERROR, reason: reasonFor(ASK_ERROR.PROVIDER_ERROR) }); send({ type: "done" }); return res.end(); }
    return res.status(500).json({ ok: false, code: ASK_ERROR.PROVIDER_ERROR, reason: reasonFor(ASK_ERROR.PROVIDER_ERROR) });
  } finally {
    gate.release();
  }
}

/** Reader-facing copy for a refusal. Distinct per cause, because the recovery differs (§155). */
function reasonFor(code) {
  return {
    [ASK_ERROR.PROVIDER_ERROR]: "Ask GameTime is temporarily unavailable. The rest of the site is unaffected.",
    [ASK_ERROR.PROVIDER_TIMEOUT]: "That took too long. Try asking again, or open Research Lab directly.",
    [ASK_ERROR.MALFORMED_PLAN]: "I could not work out how to answer that. Try rephrasing it.",
    [ASK_ERROR.UNKNOWN_TOOL]: "I could not answer that with the tools I have.",
    [ASK_ERROR.BUDGET_EXCEEDED]: "That question needed more steps than I can take at once. Try asking it in parts.",
    [ASK_ERROR.RATE_LIMITED]: "Too many questions just now — give it a moment.",
  }[code] ?? "Ask GameTime could not answer that right now.";
}

const wantsStream = (req) =>
  String(req.headers?.accept ?? "").includes("text/event-stream") || req.query?.stream === "1";

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export { askDisabled, ASK_BUDGET };
