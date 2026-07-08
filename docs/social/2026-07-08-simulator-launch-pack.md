# Simulator Launch — Social Content Pack (2026-07-08)

**Status: INTERNAL DRAFT. Nothing is posted. No social APIs are called.** These are copy drafts for the founder to review, edit, and publish manually.

**Product framing (non-negotiable across every draft):** GameTime Picks is an **educational, paper-only sports model**. The simulator shows model reads — it is **not betting advice**, and there is no real money, wallet, or sportsbook behavior anywhere in the product. Every claim below uses real product facts only.

**Verified facts these drafts rely on:**
- `/simulate` is live.
- The MLB simulator plays a **10-second baseball animation** before revealing results.
- Results are backed by **1,000-run deterministic MLB simulation artifacts** (precomputed — the **same output for every user** on the same game and model version; nothing is computed in the browser).
- The dashboard is a **model-vs-market** view: projection-vs-line visuals, a strongest-lean "central read" (a prop read, not a predicted final score), a priced-prop snapshot, a current-slate market-agreement module, a player/prop table, distributions, and a copyable recap.
- Currently **no active exposure** — Bank Builder is no-play (awaiting Step 3) and Moonshot is no-play. **No-play discipline** is a feature, not a gap.
- No fabricated soccer modules; run count is honestly **1,000**.

---

## 1. Founder summary

The MLB simulator is now a full product, not a button on a report. On `/simulate`, a user picks a game, presses **Generate Simulation**, watches a 10-second baseball animation, and reads a complete model dashboard: the model's strongest prop lean, projection-vs-line visuals, a model-vs-market gap read, a full prop table, distributions, and a copyable recap.

The whole thing is honest by construction: results come from precomputed 1,000-run deterministic artifacts, so every user sees the exact same output for a given game and model version. It stays educational and paper-only, there's no active exposure right now (the model is on a disciplined no-play for today's card), and nothing that isn't in the data is shown — no fabricated soccer stats, no inflated run counts.

This pack gives you ready-to-edit drafts for X, Discord, Instagram, TikTok/Reels, the website, plus an explainer, a shot list, the disclaimer, a banned-copy checklist, and the live links. **Review and post manually — nothing here is scheduled or sent.**

---

## 2. X / Twitter launch thread

**1/**
New on GameTime Picks: the MLB simulator is now a full dashboard.

Pick a game → press Generate Simulation → watch a 10-second reveal → read the model's leans.

Educational, paper-only. Not betting advice. 🧵

**2/**
Every run is a **1,000-run deterministic simulation**. That means it's precomputed — you and everyone else get the **exact same output** for the same game and model version. Nothing is made up in your browser.

**3/**
The dashboard is a **model-vs-market** read:
• the model's strongest prop lean (a prop read — not a predicted final score)
• projection-vs-line visuals
• where the model and the market disagree most
• a full player/prop table + distributions

**4/**
If the model doesn't have something, we say so. No fabricated soccer stats, no inflated run counts, no padding an empty slate. When there's no qualified play, it shows a clean no-play — that's the discipline, on purpose.

**5/**
It's live now. Try a game:
→ gametime-picks.vercel.app/simulate

Educational · paper-only · not betting advice.

---

## 3. Discord announcement

**📣 The MLB Simulator just leveled up**

`/simulate` is live, and Generate Simulation now opens a full model dashboard.

**What you get per game:**
- A 10-second baseball animation while the model read loads
- A **1,000-run deterministic** simulation (precomputed — same output for everyone, same game + model version)
- The model's **strongest prop lean** (a prop read, not a predicted score)
- **Projection-vs-line** visuals and a **model-vs-market** gap read
- A full player/prop table, distributions, and a copyable recap

**What it won't do:**
- No fabricated modules — if the data isn't there, it says so
- No inflated run counts (it's 1,000, and it says 1,000)
- No real money, no wallet, no sportsbook — it's **educational and paper-only**

Right now the model is on a no-play for today's card, so there's no active exposure — that's the discipline working as intended.

👉 Take it for a spin: <https://gametime-picks.vercel.app/simulate>

*Educational · paper-only · not betting advice.*

---

## 4. Instagram carousel copy

**Slide 1 (cover):**
The MLB simulator is now a full dashboard.
Pick a game. Press Generate. Read the model.

**Slide 2:**
A 10-second baseball animation runs while the model read loads. It's a reveal, not a loading spinner.

**Slide 3:**
Every run is a **1,000-run deterministic simulation** — precomputed. You and everyone else see the **same output** for the same game and model version.

**Slide 4:**
The dashboard is **model vs market**: the strongest prop lean, projection-vs-line visuals, and where the model and the market disagree most.

**Slide 5:**
Honest by design. If the model doesn't have it, it says so — no fabricated stats, no inflated numbers, no padding an empty slate.

**Slide 6 (CTA):**
Live now → link in bio → /simulate
Educational · paper-only · not betting advice.

**Caption:**
The MLB simulator is now a full model dashboard. Pick a game, press Generate Simulation, and read the model's leans — projection vs line, model vs market, the whole picture. It's a 1,000-run deterministic model, so everyone sees the same output for the same game. Educational and paper-only — not betting advice. Try it: /simulate 🔗

---

## 5. TikTok / Reels script (~30 seconds)

**Format:** screen recording of `/simulate` on mobile, voiceover + on-screen captions.

| Time | On screen | Voiceover / caption |
|---|---|---|
| 0:00–0:03 | `/simulate` lobby scrolling | "GameTime Picks just turned its MLB simulator into a full dashboard." |
| 0:03–0:07 | Tap an MLB game card → game page | "Pick any game on the slate…" |
| 0:07–0:10 | Finger taps **Generate Simulation** | "…and press Generate Simulation." |
| 0:10–0:16 | The 10-second baseball animation plays | "It runs a 1,000-run deterministic model. Same output for everyone — nothing's computed in your browser." |
| 0:16–0:22 | Dashboard reveals; scroll to the central read | "Then you get the model's strongest prop lean — a prop read, not a predicted score." |
| 0:22–0:27 | Scroll to model-vs-market / projection-vs-line | "Projection vs line. Model vs market. Where they disagree most." |
| 0:27–0:30 | Cut to disclaimer card | "Educational and paper-only. Not betting advice. It's on /simulate." |

**On-screen end card:** `/simulate` · educational · paper-only · not betting advice.

---

## 6. Short website announcement blurb

**The MLB simulator is now a full dashboard.**
Pick a game, press Generate Simulation, and read a complete model report: a 10-second reveal, then the model's strongest prop lean, projection-vs-line visuals, a model-vs-market gap read, a full prop table, and distributions — all from a 1,000-run deterministic simulation that returns the same output for every user. Educational and paper-only. Try it on **/simulate**.

---

## 7. "How Generate Simulation works" explainer

1. **Pick a game.** Open `/simulate`, choose any game on the slate, and go to its page.
2. **Press Generate Simulation.** A 10-second baseball animation plays while the model read is prepared.
3. **It's precomputed.** The result comes from a **1,000-run deterministic** simulation artifact — computed ahead of time on the server, not in your browser. Everyone sees the **same output** for the same game and model version.
4. **Read the dashboard.** The reveal includes:
   - **Central read** — the model's single strongest prop lean (a prop read, not a predicted final score or win probability).
   - **Priced prop snapshot** — where the model met a real market price, with the widest model-vs-market gap flagged.
   - **Projection-vs-line + model-vs-market** visuals on each pick.
   - **Main takeaways**, a **player/prop table**, **distributions**, a **current-slate market-agreement** read (a snapshot of this slate — not a long-term accuracy score), and a **copyable recap**.
5. **Honest edges.** Anything the model doesn't produce shows an honest "not generated" state. No fabricated stats. Run count is exactly what the artifact holds — 1,000.
6. **Paper-only.** Everything is a model read for education and research. It is **not betting advice**, and there is no wallet, payment, or sportsbook anywhere in the product.

---

## 8. Suggested clip / shot list

For the video and carousel assets, capture these in order (mobile screen recording recommended):

1. **`/simulate` lobby** — the hero ("Run a precomputed model simulation…") and the featured-games strip scrolling.
2. **MLB game card** — tapping a featured game / a card in the games list.
3. **Generate Simulation button** — a clean close-up of the button, then the tap.
4. **10-second baseball animation** — the full diamond animation with the "Running GameTime simulation · 1,000-run · precomputed model artifact" header and the stage checklist advancing. (Let it run the full ~10s for at least one take.)
5. **Dashboard reveal** — the moment the dashboard appears; scroll top-to-bottom once.
6. **Strongest lean / market gap** — hold on the central-read card (strongest prop lean + model/market/edge) and the projection-vs-line + model-vs-market visuals.

**B-roll extras:** the honest "not generated" / no-play states (shows the discipline), and the copyable recap block.

---

## 9. Responsible paper-only disclaimer

Use this (or a trimmed version) on every asset:

> **GameTime Picks is an educational, paper-only sports model.** Simulations are model reads for research and entertainment — **not betting advice**, not a prediction of any outcome, and not a promise of results. There is no real money, wallet, payment, or sportsbook in the product. Model output is deterministic and identical for every user on the same game and model version. Please make your own decisions responsibly. 18+.

Short form (for captions / end cards): *Educational · paper-only · not betting advice.*

---

## 10. Banned-copy checklist

Before posting **any** asset, confirm none of these appear. All drafts in this pack were written to pass this check.

- [ ] "lock" — not used
- [ ] "guaranteed" — not used
- [ ] "safe" — not used
- [ ] "free money" — not used
- [ ] "can't lose" — not used
- [ ] "sure thing" — not used
- [ ] "risk-free" — not used
- [ ] "10,000 runs" / inflated run count — not used (run count is stated as **1,000**)
- [ ] method-name claim (e.g. a sampling-method brand name) — not used
- [ ] any real-money / wallet / sportsbook / payment language — not used
- [ ] any "predicted final score" / win-probability claim for the central read — not used (it's framed as a prop read)

**Grep to verify a draft file:**
```
grep -inE "\block\b|\bguaranteed\b|\bsafe\b|free money|can'?t lose|sure thing|risk-?free|10,000" <file>
```

---

## 11. Live routes

- **Simulator lobby:** https://gametime-picks.vercel.app/simulate
- **Games hub (same lobby):** https://gametime-picks.vercel.app/games
- **Example MLB game (Generate Simulation lives here):** https://gametime-picks.vercel.app/games/mlb/tor-vs-sf-2026-07-08
- **Home:** https://gametime-picks.vercel.app/

*(All routes return 200 as of 2026-07-08. Example game slug reflects the current slate; swap in whichever game you're filming.)*

---

**Reminder:** this is an internal draft pack. Review, edit for voice, and post manually. Nothing here has been published, scheduled, or sent to any platform.
