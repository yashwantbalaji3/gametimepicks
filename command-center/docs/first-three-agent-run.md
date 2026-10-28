# First real three-agent run: Grok → ChatGPT → Claude Code

About 15 minutes. It needs no new accounts, no API keys and no spend. Your Mac stays on: this is the local console.

| Agent | How it takes part | Label you will see |
|---|---|---|
| Grok (xAI) | The Grok app or grok.com, signed in with your X account. You paste its answer | MANUAL PROVIDER HANDOFF |
| ChatGPT (OpenAI) | Your ChatGPT app. You paste its answer | MANUAL PROVIDER HANDOFF |
| Claude Code (Anthropic) | The Claude Code CLI on this Mac, your Max subscription. Read-only, capped at $1 estimated usage | REAL CONNECTED AGENT |
| Facts, evidence and content checks, consolidation | Command Center code | DETERMINISTIC AUTOMATION |
| xAI API, OpenAI API, app connectors | Not set up | UNAVAILABLE / NOT CONFIGURED |

Nothing in this run is simulated. If a step can't run, it is refused and the report says why.

## 1. Get Grok (free, with your X account)

1. Open **grok.com** in a browser, or the **Grok** app on your iPhone (App Store, by xAI).
2. Choose **Sign in with X** and use your existing X account. No purchase or subscription is needed. If you're offered SuperGrok or an X subscription, skip it.
3. Send a test message such as "hello". If it answers, you're ready. Free usage limits aren't published; if you hit one, wait or try later.
4. Grok is already the default seat. In the console, Team → Team seats → **Social Intelligence (Grok)** shows `manual:grok`. Nothing to change.

## 2. Run it in the console

1. Open **http://127.0.0.1:4190** on the Mac. The console is running in the "CEO console" terminal tab.
2. **Team → Controls → Claude Code** should show "Usage credits are OFF" and Preflight **OK**. If it doesn't:
   - re-check claude.ai → Settings → Usage, confirm usage credits are off, then click **Usage credits are OFF**;
   - click **Run preflight now**.
3. **Chat**: tap the suggestion chip, or type:
   > Team, review GameTimePicks' current NFL social-content opportunities and propose an improved weekly X content plan.
4. The Command Center collects verified GameTimePicks facts, then shows a **Social Intelligence (Grok)** card waiting for you:
   - tap **Copy prompt**;
   - paste it into Grok and send it;
   - copy Grok's whole answer, including its ```json block;
   - paste it into the card's box and tap **Record answer**.

   If the format is off, the card says what's wrong and keeps waiting. Ask Grok to fix it and paste again.
5. The evidence check runs on its own. Only findings that cite a specific `x.com/…/status/…` post go forward. Then a **Content Strategist (ChatGPT)** card appears:
   - copy its prompt into ChatGPT;
   - paste ChatGPT's answer back the same way.

   Its prompt contains only the checked findings plus the verified GameTimePicks facts.
6. **Claude Code** starts by itself: a real, read-only review in a temporary working copy, usually under a minute. Its card shows the session id, model, turns, estimated usage and a raw-log link.
7. The **Chief of Staff** consolidates everything into one report. **Approvals** then holds one decision: approve the plan, reject, ask for a revision (with a note) or defer. Approving records a working plan; nothing is posted.

## 3. Check the evidence

In a terminal in `command-center/`:

```bash
node orchestrator/team-evidence.mjs
```

It reads only the ledger and prints:
- each step's agent, label, model, time and output sha256;
- Claude Code's session id and billing proof (preflight: claude.ai · max);
- the hand-off checks: ChatGPT saw every checked Grok finding and no unsourced one; your decision is bound to the exact ChatGPT plan and the exact Claude review;
- a verdict: which providers genuinely contributed to this one workflow, and the number of simulated steps (should be 0).

It saves the same report to `out/console/evidence/<commandId>.md`.

What it can and can't prove: the ledger proves which prompt each manual step was shown, when your paste arrived and its exact content. It can't prove which app produced a paste; that part is your attestation. Claude Code's part is machine-verified (session, model, subscription preflight).

## 4. Later: automated xAI and OpenAI (each a separate approval)

**Subscriptions vs APIs.** These are separate things:
- ChatGPT Plus does **not** include OpenAI API use.
- A free or paid Grok account does **not** include xAI API use.
- Your Claude Max plan covers Claude Code; the Anthropic API is never used.

**CP-X1: Grok via the xAI API**
- [ ] Create an account at console.x.ai (a separate xAI account; needs your approval first).
- [ ] Buy a small prepaid credit, e.g. $5–10. Leave **auto top-up OFF** and the invoiced billing limit at **$0**. xAI rejects requests once prepaid credit is used up.
- [ ] Create one API key named `gtp-command-center` and store it only as `XAI_API_KEY` in the environment you approve (local first, later the hosted worker's secrets).
- [ ] Set `GTP_CC_XAI_MONTHLY_CAP_USD`, e.g. 5. The Command Center refuses any call whose worst case would exceed what's left.
- [ ] Console → Team → Providers → xAI API → **Test connection**. It's free and records OK or the error, never the key.
- [ ] Team seats → Social Intelligence → `api:xai`.
- [ ] Estimate: about $0.16–0.51 per research run (grok-4.3 tokens plus X Search at $5 per 1,000 posts). Light use is about $2–7 a month.

**CP-O1: ChatGPT via the OpenAI API**
- [ ] Create an OpenAI API platform account (platform.openai.com; separate billing from ChatGPT Plus; needs your approval first).
- [ ] Buy a small prepaid credit with **auto-recharge off**, and set a project budget or usage limit.
- [ ] Pick a model and copy its input and output prices from OpenAI's pricing page.
- [ ] Set `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_PRICE_IN_PER_M`, `OPENAI_PRICE_OUT_PER_M` and `GTP_CC_OPENAI_MONTHLY_CAP_USD`. Without prices the seat stays locked, because it couldn't enforce the cap.
- [ ] Run **Test connection**, then Team seats → Content Strategist → `api:openai`.

**Both**
- [ ] Keys never go in the browser, the ledger, chat messages or git.
- [ ] Rotate a key at once if it is ever pasted somewhere else.
- [ ] Each provider's spend this month shows in Providers. Anything refused shows the reason.
