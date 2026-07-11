# 0001 — Open Strategic Decisions (the first 10 I need from you)

**Status:** ✅ RESOLVED (2026-07-06) — all ten answered by Yash. Formal record: `DECISION_LOG.md` (ADR-0001…0010). This file is kept for the framing/options that produced the decisions.

**Status:** proposed · **Opened:** 2026-07-06 · **Owner:** Yash decides, Claude (VP) frames

Ranked by impact and by how much they unblock other work. For each: my recommendation is first (marked ⭐) so you can just confirm or override. Answer inline, in chat, or in `../inbox.md`.

---

### 1. What does "scalable into a real business" mean — and by when?
Everything downstream (monetization, audience, feature priority) hangs on this.
- ⭐ **A. Trust-first audience play:** grow a public following on radical honesty; defer money 6–12 months.
- B. Near-term monetization test right after launch (pro tier / donations).
- C. Portfolio/credibility asset that *could* become a business but isn't optimized for it yet.
- **My rec:** A — the honest paper ledger is the moat; audience + trust first, monetize from strength.

### 2. Do we launch July 10 as planned?
- ⭐ **Yes**, as a *soft* launch (limited audience, honest framing) — product is 9.5/10 and blocker-free.
- Delay to harden hands-free ops first.
- **My rec:** Yes, soft launch July 10, *conditional* on the three GitHub secrets being set so the slate stays fresh unattended.

### 3. Who is the launch audience, and where do we tell them?
- ⭐ Sports-analytics/dev community first (HN, r/sportsbook analytics, X) — they value the honesty + engineering.
- Casual sports fans.
- Recruiters only (portfolio framing).
- **My rec:** the analytics/dev crowd — they're forgiving of thin records and reward transparency, which is our edge.

### 4. Activate LADDER_V2 (profit-preserving cash-out) — when?
The v1 all-in model just cost a Step-3 position on July-3.
- Now (before launch). ⭐ **After launch, behind the flag + checklist, once the loop is hands-free.** Only after n≥X more settled ladders.
- **My rec:** after launch. It's the right model, but it breaks three money invariants — don't destabilize the crown jewel days before shipping.

### 5. How autonomous should nightly ops be?
- ⭐ **Fully automated fetch/settle/rebuild** (set all three secrets), you approve cards + deploys.
- Keep operator-run for now (more control, more toil).
- **My rec:** automate — "freshness is the product," and manual nightly ops won't survive a busy week.

### 6. Post-World-Cup transition — what's the flagship when the WC ends?
The WC is time-boxed and currently the center of gravity.
- ⭐ **MLB becomes the daily flagship** (data already flowing) + prep NFL/NHL on the WC pipeline pattern.
- Pause and rebuild around one US sport.
- **My rec:** MLB now, NFL/NHL for fall — reuse the proven pipeline; don't let the product go dark post-tournament.

### 7. Should we productize a second market beyond team-market ladders?
Player props are banned in BB (~8% settled) — correctly. But props are a big part of what users expect.
- Keep props display-only/honest-pending, never in money products. ⭐
- Invest in a genuinely better prop model before featuring them.
- **My rec:** keep props out of money products until a settled sample earns them in; honesty > coverage.

### 8. Monetization model (even if "not yet")?
- ⭐ **Decide the *shape* now, execute later:** free + optional supporter tier, zero sportsbook affiliate money (protects the honesty claim).
- Affiliate/referral revenue.
- Ads.
- **My rec:** supporter/pro tier, explicitly no sportsbook affiliates — affiliate money quietly compromises the trust moat.

### 9. Do we reconcile the public README / narrative now?
It still says "NBA-only demo." That's a credibility risk at launch.
- ⭐ **Rewrite before launch** to match reality (paper-prediction product, honest ledger).
- Leave it; focus on the app.
- **My rec:** rewrite — it's the front door for exactly the audience in #3.

### 10. What's the one metric we optimize for the next 90 days?
- ⭐ **Trust/credibility proxy:** consecutive days of fresh, gate-green, honestly-settled slates (operational reliability) — because everything else compounds off it.
- Audience/traffic.
- Model hit rate on a curated subset.
- **My rec:** operational reliability first (uninterrupted honest daily loop); traffic and model both depend on it.

---

**After you answer:** I'll convert each accepted decision into its own ADR, update the knowledge base, and turn the actionable ones (2, 4, 5, 6, 9) into Claude Code plans in `../plans/`.
