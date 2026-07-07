# Company Schedule — GameTime Picks (ET)

*The recurring cadence for the whole company. Every action has a time, an owner, and a gate. Anchored to
the existing automation (nightly-settle 1:30 & 3:30 AM, daily-lifecycle 4:30 AM, morning-projections
9:30 AM). Money steps stay operator-gated. From `vp/ops/AI_COMPANY_OPERATING_MODEL.md` §E.*

| Time (ET) | Cadence | Activity | Owner | Gate / approval |
|---|---|---|---|---|
| After last game final (≈10:00 PM–1:30 AM) | Nightly | **Settlement** — per finished sport: analyst hand-verifies → SOL sequences `--apply` (serial) → money gate between each | Sport Analyst prep → **SOL sequences** → Code applies | Money-integrity + forensic between applies; **serial only** |
| ~1:30 & 3:30 AM | Nightly (auto backstop) | `nightly-settle.yml` passes (completeness/repair) | Code (CI) | Fail-closed |
| Immediately post-settle | Nightly | **Model review** per sport (`MODEL_REVIEW_<sport>_<date>.md`) | Sport Analyst | Weight change → **Yash** ("justified or overfitting?") |
| ~4:30 AM | Nightly (auto) | Daily rebuild / lifecycle (once deploy-hook secret set) | Code (CI) | Money-gated; deploy opt-in |
| ~9:30 AM | Morning | **Generation / refresh** next slate (per active sport) → Top 10 unify → BB pool | Sport Analysts → **SOL** → Code | Money-md5 unchanged |
| ~10:00–10:30 AM | Morning | **Product proposal review** — SOL assembles card; **Yash approves** a card or confirms no-play | SOL proposes → **Yash approves** → Code promotes | **Card approval = Yash only** |
| Before any deploy | On change | **QA** render/route audit (undefined/NaN/Homer/stale/Pass = 0; money reconciles) | QA Engineer / SOL | Fail → fix before deploy |
| After any product change | On change | **Deploy verification** — build → deploy → smoke 9/9 | Launch Manager / Code | **Never deploy red**; ship = Yash |
| ~11:00 AM (after slate set) | Daily | **Social content planning/drafting** — Head assigns angles from the Daily Brief; managers draft | Social Head + managers | Draft only |
| Morning + evening | Daily | **Discord** slate-drop (AM) + results recap (PM), moderation drafts | Discord Manager → Head → **Yash** | No auto-post |
| ~12:00–1:00 PM | Daily | **Instagram** 1 post (+ optional story) drafted | IG Manager → Head → **Yash** | No auto-post |
| After notable results (PM) | 3–5×/week | **TikTok** clip concept drafted (real stories only) | TikTok Manager → Head → **Yash** | No auto-post |
| AM slate + PM results + milestones | 1–3×/day | **X/Twitter** posts drafted | X Manager → Head → **Yash** | No auto-post |
| Monday | Weekly | **Product/Ops performance review** (VP-led) | VP + departments | Decisions logged |
| Friday | Weekly | **Growth review** + next week's calendar | Social Head → VP → Yash | Brand direction = Yash |

**Rule of thumb:** nightly = settle + learn (serial money); morning = generate + propose + approve + deploy;
midday = social drafting; weekly = review + planning. Everything money/card/deploy/brand is founder-gated.

See: [AI_COMPANY_OPERATING_SYSTEM.md](AI_COMPANY_OPERATING_SYSTEM.md) · [SPORTS_OPERATIONS.md](SPORTS_OPERATIONS.md) · [SOCIAL_OPERATIONS.md](SOCIAL_OPERATIONS.md).
