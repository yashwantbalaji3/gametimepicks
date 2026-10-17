# Decision package 3: Ask GameTime spend controls (F-3, FD-4, P-23, O-12)

**Prepared:** Sat 2026-10-17, about 01:25–02:30Z, by a read-only Claude Code session.
- Code was read at `origin/main` = `8433d82bd9`.
- No paid call was made, no env var was read and no configuration was changed.

**Production requests in this pass.** None of them can reach the model provider:
- `GET /api/ask/`, twice, at 01:22:54Z (the second was an unintended duplicate). Both returned **405** `{"code":"METHOD_NOT_ALLOWED","reason":"POST only"}` with `cache-control: no-store`.
- `POST /api/ask/` with body `{"messages":[]}`, once, at 01:27:32Z. It returned **400** `{"code":"MALFORMED_REQUEST","reason":"no messages"}`.

**What these prove** (order of checks in `app/api/_ask-core.mjs` `decideAsk`, lines 87–104):
1. method (405);
2. kill switch (503 `FEATURE_DISABLED`);
3. provider and key configured (503 `PROVIDER_NOT_CONFIGURED`);
4. size (413);
5. body (400).

The provider is only *selected* (a config check) inside `decideAsk`. It is invoked later, in `ask.mjs`, after the limiter. So the 400 shows that, **in Production, Ask is ENABLED (`ASK_GAMETIME_ENABLED` is set to an enabling value) and a provider key is configured**, at zero cost.

It does **not** show which provider: see §3, the fallback risk.

---

## 1. Controls that exist in the app (verified statically)

| Control | Where | What it actually limits | Real cap? |
|---|---|---|---|
| **Kill switch** `ASK_GAMETIME_ENABLED` | `app/api/_ask-core.mjs:31-34`, read per request at `ask.mjs:48-53` | **Off only when** the value is unset, `""`, `"0"` or `"false"`. Any other value (`"off"`, `"no"`, `"FALSE"`, `" 0"`) **enables** it. Off means 503 `FEATURE_DISABLED` before any provider work | Yes. **It needs a new deployment to take effect** (Vercel binds env vars per deployment). See §4 |
| **Rate limit** | `makeRateLimiter`, `_ask-core.mjs:47-79`; limits in `app/src/lib/ask/contract.mjs:95-101` | 12 turns / 60 s and 2 concurrent per client. The client key is a hash of the first `x-forwarded-for`, else `x-real-ip` (`_ask-core.mjs:190-198`). Returns 429 + `Retry-After` | **No.** It is a module-level `Map` per warm serverless instance: it resets on cold start, is separate per instance, and has **no global or daily limit** (also stated in `docs/ASK_GAMETIME.md` §18 and roadmap V2 :2617 "no global cap") |
| **Request size** | `ASK_BUDGET`, `contract.mjs:55-85`; `conversation.mjs:35-47` | Body ≤ 64 KB (413). Each message ≤ 2,000 chars (413). Last 12 messages kept. UI `maxLength=2000` | Yes, per request |
| **Output tokens** | `app/src/lib/ask/provider-gemini.mjs:226,229` | Planner `maxOutputTokens` 1,500; writer 2,400. `thinkingBudget: 0` in the first request shape | Yes, per call |
| **Timeouts** | `provider-gemini.mjs:158`; tools 8 s | 30 s per HTTP attempt. No `maxDuration` in `app/vercel.json`. A client disconnect aborts the provider call (`ask.mjs:89-101`) | Partial |
| **Calls per turn** | `engine.mjs:157-165, 219, 493`; `provider-gemini.mjs:37-38, 120-151` | **Logical calls:** planning ≤ 2 passes × (1 + 1 repair) = ≤ 4; writer ≤ 2. **HTTP requests per logical call:** a 4-rung "shape ladder" that steps down only on 400 `INVALID_ARGUMENT`, plus 1 transient retry on 408/409/425/429/5xx. The ladder is not remembered between calls, and Production settled on the 2nd rung (`no-thinking`, MIGRATION §H), so **a typical turn ≈ 2 logical calls ≈ 4 HTTP requests** to Google | It bounds a turn, not a day |
| **Answer cache** | — | **None.** Responses are `no-store`. The only cache is published-data assets, 60 s per instance (`loader.mjs:35-72`) | — |
| **Daily or global budget counter** | — | **None in the app** | **No** |
| **Logging** | `askAuditLine`, `_ask-core.mjs:149` | Status, tools, timings and token counts per turn. No question or answer text. Usable to reconstruct spend from Vercel logs | Observability only |

**Measured cost** (`docs/ASK_PROVIDER_MIGRATION_v1.6.1.md`, Production receipt): **$0.002594 per turn** on `gemini-3.5-flash-lite`. That is $2.59 per 1k turns, $25.94 per 10k and $259 per 100k. Sonnet 5 is about 10× that ($24.90 per 1k).

**Conclusion:** nothing in the app caps total daily spend. The only hard ceilings are provider-side (§2) or the kill switch.

## 2. Founder checklist: provider-side cap (console actions, no code)

**Provider in use** (per records):
- Gemini, `ASK_MODEL_PROVIDER=gemini`, `ASK_MODEL_NAME=gemini-3.5-flash-lite` (founder switch 2026-09-22; MIGRATION :276-277).
- Endpoint: `generativelanguage.googleapis.com`.
- Key: env var **`GOOGLE_API_KEY`**, sent as `x-goog-api-key`. No `GEMINI_API_KEY` exists in the code.
- `docs/ASK_GAMETIME.md` §27 still says anthropic / claude-sonnet-5. It is stale.

Decision recorded 2026-10-13 (roadmap V2 :2726-2728): "a provider-level spending cap, keeping the kill switch … Google Cloud quota override on the Gemini key's project … plus a billing budget alert and restricting the key to that API. Founder console action; no code." **Nothing records that it was done.**

| # | Step | Where | Set to | Evidence (screenshot, IDs blurred) |
|---|---|---|---|---|
| 1 | Identify the project that owns the Production key | Google AI Studio → API keys. Match the key's **last 4 characters only** against Vercel → Project → Settings → Environment Variables → `GOOGLE_API_KEY` (Production) | — | Project ID, blurred |
| 2 | Confirm the billing mode | AI Studio → Billing (or Cloud Console → Billing for that project) | The record says a **$5 prepaid balance with auto-reload OFF** (MIGRATION :298, :308). If that still holds, it is a hard ceiling, and exhaustion returns an upstream 429 that Ask shows as a refusal | Balance and the auto-reload toggle |
| 3 | **Quota override** (the hard daily cap) | Cloud Console → IAM & Admin → **Quotas & System Limits** → filter Service = "Generative Language API" → the requests-per-day metric for the model in use (and per-minute if offered) → Edit quota | Lower than the default. **Sizing:** daily requests ≈ (daily budget ÷ $0.0026 per turn) × 4 requests per turn. Example: a $5/day budget is about 1,900 turns, so about 7,700 requests/day. Pick your own $ figure | The override value and "approved" |
| 4 | **Budget alert** (warning only; budgets do not stop spend) | Cloud Console → Billing → Budgets & alerts → Create budget. Scope: that project (and the Generative Language API service if offered) | Monthly amount `[FOUNDER: $]`; thresholds 50%, 90%, 100%; email to the founder | The budget page |
| 5 | **Restrict the key** | Cloud Console → APIs & Services → Credentials → the key → API restrictions | "Restrict key" → Generative Language API only. Application restriction: none (Vercel has no fixed egress IP) | The restriction panel |
| 6 | **Close the fallback** (see §3) | Vercel → Environment Variables (Production), **names only** | `ASK_MODEL_PROVIDER` = `gemini` present. Decide whether `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` stay | A screenshot of names, values hidden |
| 7 | Cap the other providers too, if their keys stay | Anthropic Console → Limits (monthly spend limit); OpenAI → Limits | A low monthly limit | Limit pages |

Steps 1–5 close P-23. Steps 6–7 close O-12. None of them touches the repository or Production deployments.

## 3. Risks found in the code (not fixed here; no change made)

1. **Silent provider fallback.** If `ASK_MODEL_PROVIDER` is unset and `ANTHROPIC_API_KEY` is present, selection defaults to Anthropic (`provider.mjs:98`). The MIGRATION note says both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` "remain in Production unused" (:306-307). Deleting one variable would move Ask to `claude-sonnet-5` at about 10× cost, **outside the Gemini cap**. Today's 400 probe cannot tell which provider is selected.
2. **The kill-switch comment overstates it.** `_ask-core.mjs:28` says switching off is "one environment variable rather than a deployment". On Vercel an env change applies only to **new** deployments. The runbook (`docs/INCIDENT_AND_ROLLBACK_RUNBOOK.md` §7 :123-127) and MIGRATION :313 are right: change the variable, then force a redeploy. `docs/ASK_GAMETIME.md` §29 (:491) omits the redeploy.
3. **Kill-switch values.** Only `0` / `false` / empty / unset disable it. Writing `off` would leave Ask **on**.
4. **Retries on 429.** The adapter retries a 429 once after 700 ms (`provider-gemini.mjs:37, :145-150`). Roadmap V2 :2727 says "without retrying". The extra request is harmless under a quota cap, but the doc is wrong.
5. **Slip reading** (`/api/slip-read`, Anthropic `claude-sonnet-5`, `max_tokens` 1,500) has **no kill switch and no rate limit**. It is held off only by missing env: it needs all of `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` (`_slip-read-core.mjs:16, 43`). If `ANTHROPIC_API_KEY` is indeed present, then **adding the service-role key would switch on an uncapped paid path** (matrix O-12).
6. **Test gaps.** No test covers `askDisabled` values, `makeRateLimiter`, `clientKeyFrom`, or the 405 / 503-disabled branches of `decideAsk`.
7. **Disclosure.** Ask also sends the user's stated risk style and "entertainment bankroll" to the model. See package 1, row 11.

## 4. The documented option: disable Ask for launch

**How** (runbook §7; MIGRATION §I "Emergency"):
1. Vercel → Production env: set `ASK_GAMETIME_ENABLED` to **`0`** (or delete it).
2. Force a redeploy of the current Production commit with `VERCEL_FORCE_BUILD=1`, because `vercel-ignore-build.sh` skips a same-SHA rebuild. Remove `VERCEL_FORCE_BUILD` after it is READY.
3. Cost: one Production build, about $0.15–0.28 (matrix L-06 estimate). Without the forced build, the next bot data commit that builds picks up the change anyway, within hours, unpredictably.
4. **Verify at zero cost:**
   - one `POST /api/ask/` with `{"messages":[]}` must return **503 `FEATURE_DISABLED` "Ask GameTime is not enabled"** (today: 400);
   - `GET` stays 405.

**What users see when disabled** (verified from code):
- `/ask` still renders normally: heading, starter questions, composer (`app/src/app/ask/page.tsx:30-59`).
- **Every entry point stays visible**: the nav rail and footer "Ask GameTime" (`lib/navigation.ts:327-328`), `/research` (`research/page.tsx:59`), and the sport-hub sections (`lib/sports/hub-sections.ts:56, 66, 76, 91`). No `NEXT_PUBLIC_` flag hides them.
- The state appears only **after the user submits a question**. `ask-app.tsx:110-112` shows an error bubble with the API's reason, literally **"Ask GameTime is not enabled"**, plus a Retry button.
- A network failure would instead show "Ask GameTime is temporarily unavailable. The rest of the site still works." (:129).
- The rest of the site is unaffected: it is a static export, and `/api/ask` is the only path touched.

**UX consequence:** a launch visitor can find Ask from the rail, type a question, and only then learn it is off. Hiding the entry points, or showing "paused" before typing, needs a code change and a build. That is **not** prepared here; it would be a separate, founder-approved PR.

## 5. Recommendation framing (founder's call)

| Option | Spend exposure | User effect | Founder actions |
|---|---|---|---|
| **A. Keep Ask on with a provider cap** | Bounded by the quota override (step 3) and/or the prepaid balance with auto-reload off (step 2) | Unchanged; when the cap is hit, the user sees a provider refusal | §2 steps 1–6 (about 20 min), evidence to `~/gtp-evidence/uat-2026-10-18/ask/` |
| **B. Turn Ask off for launch** | Zero | §4: visible entry points, error on submit | Env change + one forced build; zero-cost verification POST |
| **C. On without a cap** | Unbounded except per instance | Unchanged | Not recommended by any record; written acceptance needed |

## 6. Exact founder questions

1. **FD-4(a):** Is the Gemini project still on a prepaid balance with auto-reload OFF? What is the balance today?
2. **FD-4(b):** Will you set the Generative Language API quota override (step 3)? At what daily $ figure? (Requests/day ≈ $ ÷ 0.0026 × 4.)
3. **FD-4(c):** Will you create the budget alert (step 4) and restrict the key to the Generative Language API (step 5)?
4. **FD-4(d):** Confirm `ASK_MODEL_PROVIDER=gemini` is set in Vercel Production. Will you remove `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or cap them (steps 6–7)?
5. **FD-4(e):** If the cap is not in place by the go/no-go, should Ask be **off** for launch (option B), accepting that its entry points stay visible and show "Ask GameTime is not enabled" on submit?
6. Do you want an engineering PR, after launch or before it with your approval, that hides the Ask entry points when the switch is off, and adds a shared limiter?
