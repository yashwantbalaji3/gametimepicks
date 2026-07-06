# Custom Change Workflow — GameTime Picks

*How an admin request ("just tell Claude what you want") becomes a safe, gated, deployed change. This is the
contract Claude follows for any request. The goal: you describe intent in plain English; Claude classifies,
risk-rates, plans, implements only if safe, gates, deploys, and logs it.*

## The 8 steps
1. **Capture** — the request verbatim (paste it, or drop it in `admin/change-requests/` later).
2. **Classify** — one of five change classes (below). This sets the guardrails.
3. **Risk-rate** — Low / Medium / High / **Blocked**.
4. **Plan** — the exact files, the approach, the gates it must pass, and what could break.
5. **Implement** — only if risk ≤ the class ceiling and the hard rules hold. Otherwise stop and report.
6. **Gate** — tsc · tests · build · money-integrity · forensic · health (the full suite).
7. **Deploy** — logical commit → rebase-safe push → wait for Vercel → smoke 9/9 → production spot-check.
8. **Changelog** — one honest line (what changed, commit, gates, verification).

## The five change classes
| Class | Examples | Risk ceiling | Guardrail |
|---|---|---|---|
| **Copy** | reword a label, fix jargon, add an explanation | Low | Banned-tout-copy guard on /methodology (no "lock"/"safe"/"guaranteed" as sure-thing language); keep meaning honest |
| **UI** | card design, ladder visuals, flags/avatars, animations, mobile spacing | Low–Med | Deterministic asset fallbacks (never fake logos/portraits); reduced-motion safe; no heavy deps; render-audit stays clean |
| **Product logic** | selection rules, ladder policy, Top 10 ranking, no-play thresholds | Med | Pure/tested policy fns; add/adjust tests; no player props in Bank Builder; ≤3 legs; no forced cards |
| **Data refresh** | regenerate today's/forward slate, board horizon, props | Med | `refresh_daily_products.sh` (md5-guards money); real odds only; completed games not bettable |
| **Settlement / money** | grade a card, move the bankroll, restart a lane | **High** | Official results ONLY via `settle_soccer_day.sh`; dry-run + hand-verify first; approved-card lock; canonical md5 unchanged until official settlement |

## Risk levels → what Claude does
- **Low** → implement now, gate, deploy.
- **Medium** → state the plan + the blast radius, implement, gate, deploy; call out anything reversible-only-with-effort.
- **High** → propose the plan and the exact settlement/verification steps; implement ONLY the money-safe parts; canonical money moves ONLY through official settlement, never a hindsight rewrite.
- **Blocked** → refuse with the reason (e.g. "that would fabricate a result" / "that moves the bankroll outside official settlement"). Offer the safe alternative.

## Worked examples
| Request | Class | Risk | What Claude does |
|---|---|---|---|
| "Approve this Bank Builder card" | Settlement-adjacent | High | Restart the lane if stopped → author `bank-builder-approved.json` verbatim → `promote --apply` (md5-guarded) → prove canonical unchanged. Paper exposure only until official settlement. |
| "Change the Moonshot Day-2 target to $400" | Product logic | Med | Edit `moonshotV2LadderPolicy` in `ladder-policy.ts`, update the reconciliation math + tests, re-render the ladder. Gate + deploy. |
| "Add player portraits to the MLB board" | UI | Low–Med | Use the existing `PlayerAvatar` with its deterministic fallback; never a fabricated portrait; render-audit for broken images. |
| "Refresh today's slate" | Data refresh | Med | `refresh_daily_products.sh --date <today>`; confirm money md5 unchanged + health green. |
| "Settle yesterday" | Settlement/money | High | Dry-run `settle_soccer_day.sh`, hand-verify each leg vs official FT, then `--apply`; report the new canonical record. |
| "Update the methodology copy for the ladders" | Copy | Low | Edit `/methodology`; keep the banned-tout-copy guard green ("profit-locking" ok, standalone "lock" → "bank"). |
| "Make Bank Builder pay out $50 to the bankroll" | Settlement/money | **Blocked** | Refuse — money changes only through official settlement of a real result. |
| "Show a 90% win rate on the homepage" | Copy/data | **Blocked** | Refuse — no fabricated hit-rates. Offer the real settled record instead. |

## The refusal test (say no when any is true)
- It fabricates odds / scores / props / assets / hit-rates / EV / markets.
- It moves canonical money outside official settlement.
- It un-retires Homer Nukes, or forces a card the model didn't qualify.
- It would deploy with a red gate.

When refusing, always offer the honest alternative that gets closest to the intent.

## Changelog format
`YYYY-MM-DD · <class> · <one line> · <commit> · gates green · smoke 9/9` — appended to the deploy's commit
body and (optionally) `docs/CHANGELOG.md`.
