# Founder Response Form (Program 165 · Release A) — seven short answers, no secrets

Fill `docs/founder-response.template.json` (or reply in chat with the seven choices) and run:
`npx tsx scripts/ops/founder-orchestrate.mjs <your-response.json>` — it validates, prints the safe
next steps, and mutates nothing. **Never put secrets, passwords, keys, or participant identities
in this form** — those go directly into provider dashboards; the form only records that you did.

| # | Blocker | Recommended (first) | Alternatives |
|---|---|---|---|
| 1 | Legal §3 | `ANSWERS_PROVIDED_SEE_DECISIONS` — write the five numbered answers into the packet | `DEFER_LEGAL` |
| 2 | Support | `DEDICATED_MONITORED_INBOX` | `EXISTING_HELPDESK_URL` · `TEMPORARY_FOUNDER_INBOX` · `DEFER_BETA` |
| 3 | Analytics | `FIRST_PARTY_COLLECTOR` (spec: docs/ANALYTICS_COLLECTOR_SPEC.md) | `DEFER_ANALYTICS` |
| 4 | Beta cohort | `COHORT_APPROVED_SEE_DETAILS` (size 8 · allowlist · 4-week window recommended) | `DEFER_BETA_COHORT` |
| 5 | Odds | `AUTHORIZE_ONE_NFL_CANARY_MAX_5` (after confirming plan covers the 4 sports) | `DEFER_ODDS` · `CHANGE_PROVIDER_PLAN` |
| 6 | NBA lineups | `defer` (honest; the model card carries the limitation) | `nba-com-terms-reviewed` · `licensed-feed:<vendor>` |
| 7 | Admin access | `OPTION_1_PROTECTED_INTERNAL_DEPLOYMENT` | `OPTION_2_ZERO_TRUST_PROXY` · `OPTION_3_LOCAL_ONLY` |

Per answer, `externalConfigurationComplete: true` means you ALSO finished the provider-dashboard
half (env vars, protection, inbox). A choice alone moves a blocker to FOUNDER_ACTION_PROVIDED;
configuration moves it to VERIFYING; **CLOSED only ever comes from the real acceptance receipt.**
