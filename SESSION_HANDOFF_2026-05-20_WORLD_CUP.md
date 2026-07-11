# SESSION HANDOFF · 2026-05-20 · WORLD CUP COMMAND CENTER

> Audience: the next Claude Code session.
> Working dir: `~/Downloads/gametimepicks`
> Status: PR #69 MERGED · production live · all custom-domain markers verified.

---

## 1. Current state

| Field | Value |
|---|---|
| `main` SHA | `c2c919c444463912faf1cc147785b778619078ae` (`c2c919c`) |
| Prior PR | #68 (NBA market lines + sparklines) merged as `9e20631` |
| This PR | **#69** — `feat(world-cup): launch tournament command center` |
| Squash SHA | `c2c919c` |
| Production | https://gametimepicks.yashwantbalaji.com · 200 on every audited route |
| Vercel canonical preview (PR #69) | https://gametimepicks-r9opurzc5-yashwantbalaji33-7164s-projects.vercel.app |
| Vercel canonical production (after merge) | https://gametimepicks-5yq2hveom-yashwantbalaji33-7164s-projects.vercel.app |
| Odds API balance | 294 / 1000 (unchanged — no paid calls this PR) |
| Standing API floor | 300 (restored — session-only 240 override has lapsed) |

---

## 2. What shipped in PR #69

### Routes added
- `/world-cup` — premium command center: hero with kickoff countdown, 48-flag rail, opener preview, planned-model-inputs methodology block, squads-pending banner, sources block.
- `/world-cup/schedule` — full 104-match schedule. Stage strip (72/16/8/4/2/1/1), date-anchored cards, knockout placeholders.
- `/world-cup/groups` — 12 group cards with confederation chips. Standings "unlock at kickoff."
- `/world-cup/teams` — 48 teams grouped by confederation; hosts highlighted.
- `/world-cup/team/[code]` — 48 pre-built static team detail pages (hero, group rivals, fixtures, roster-pending module).

### Static data files
- `app/public/data/world-cup/meta.json` — tournament structure, sources, projection status.
- `app/public/data/world-cup/teams.json` — 48 teams with ISO codes (GB-ENG / GB-SCT sub-codes handled).
- `app/public/data/world-cup/groups.json` — 12 groups from the Final Draw (2025-12-05).
- `app/public/data/world-cup/schedule.json` — full 104-match schedule.
- `app/public/data/world-cup/squads.json` — empty placeholder; `status: "pending_official_release"`.

### Components
- `app/src/components/flag-badge.tsx` — emoji-flag chip with sub-flag support.
- `app/src/components/world-cup/world-cup-section-tabs.tsx` — section tabs for `/world-cup/*` routes.
- `app/src/lib/data-world-cup.ts` — loader + derived helpers + `flagEmoji()` + `daysUntilOpener()`.

### Pipeline test
- `pipeline.world_cup_data_test` — **520 assertions** covering 48 teams · 12 groups · 104 matches · group-stage consistency · no fabricated knockout team names · no fabricated squads.

### Integrations
- `app/src/components/nav.tsx` — added "World Cup" between IPL and Parlays.
- `app/src/components/homepage-sports-rail.tsx` — expanded 4 → 5 sport cards; World Cup card shows days-to-kickoff countdown + opener.

---

## 3. Source links (all cited in `app/public/data/world-cup/meta.json`)

- FIFA — Official 2026 World Cup hub
  https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026
- FIFA — Final Draw results (2025-12-05)
  https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/final-draw-results
- ESPN — Full 2026 World Cup format + match schedule
  https://www.espn.com/soccer/story/_/id/47108758/2026-fifa-world-cup-format-tiebreakers-fixtures-schedule
- FIFA — Squad lists number + dates
  https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/squad-lists-number-date

---

## 4. Data integrity invariants enforced

- 48 teams across 12 groups (4 each) — verified
- 104 matches (72 group + 16 R32 + 8 R16 + 4 QF + 2 SF + 1 third + 1 final) — verified
- Each group has 6 group-stage matches; each team plays 3 — verified
- Knockout-stage entries carry placeholders only, no fabricated team names — verified
- `squads.json` is empty until official release (June 2) — verified
- Tournament dates 2026-06-11 → 2026-07-19, every venue in a host country (US/CA/MX) — verified
- Sources cited in `meta.json` and surfaced on `/world-cup` page

---

## 5. Tests + verification

- Full 18-suite pipeline sweep: **all green**
  - new `pipeline.world_cup_data_test` — 520/520
  - existing 17 suites unchanged: public_copy, parlay_builder, settle (NBA + MLB), export_results (NBA + MLB), context_tag, mlb_model, active_slate, attach_recent10, credit_guard, model_audit, game_context, playoff_context, team_projection, team_rosters, fetch_game_markets
- `tsc --noEmit` clean
- `next build` green — 48 team detail pages pre-rendered as SSG
- Mobile (390 px): no horizontal overflow, all 48 flag badges render
- Production custom-domain markers verified after deploy: "World Cup", "kickoff in", "Mexico vs South Africa", "Squads pending official release", "Planned model inputs", "Every federation in the field"
- NBA / MLB unchanged: SA @ OKC + -7.5 + 216.5 still on `/nba/board`; 51.9% / 1102 / 53.7% / 50.3% still on `/results`

---

## 6. Known limitations

- **Squads** — final 26-man rosters publish June 2. Team detail pages show "Roster module pending" until each federation officially announces. No predicted, leaked, or speculative names anywhere.
- **Projections / odds / parlays** — no model live for World Cup matches yet. Methodology preview block lists PLANNED inputs only. `/world-cup` and every match card honestly says "Projection pending."
- **Stadium names** — schedule shows venue city + host country only. Specific stadium names not enumerated (we don't claim each city↔stadium pairing without an explicit source assertion).
- **Local kickoff times** — venue-local clock. ET reference not included. (ESPN's dual-time annotations weren't preserved in the artifact — could be added in a follow-up if a user demand emerges.)
- **Hit rate** — Results page deliberately has NO World Cup record. World Cup picks only count after the projection model lands and matches settle.
- **Parlay Lab** — no World Cup slips. Same persistence requirement applies as NBA/MLB.

---

## 7. Next steps (suggested PR roadmap)

- **PR #70 — World Cup squad ingestion**
  After June 2, write a `pipeline/fetch_world_cup_squads.py` that pulls per-team 26-player rosters from FIFA's public squad lists, persists to `app/public/data/world-cup/squads.json`, and surfaces them on team detail pages. Honest about source + announcement date per team.
- **PR #71 — World Cup projection model v0**
  Wire planned inputs: team Elo, recent form, market odds (if/when paid budget is approved for soccer), travel/rest, group leverage. Model output goes into match cards as "Model projection" + edge, with the same R5-style anomaly cap and confidence guardrails NBA uses.
- **PR #72 — Parlay candidate persistence**
  The blocker for any honest parlay hit rate. Snapshot candidate slips before games, grade after settlement. Unlocks `/results/parlays`.

---

## 8. Files to read first (next session)

1. This handoff.
2. `app/public/data/world-cup/*.json` — the static data shape.
3. `app/src/lib/data-world-cup.ts` — loaders + helpers (`flagEmoji`, `daysUntilOpener`, `fixturesForTeam`).
4. `pipeline/world_cup_data_test.py` — integrity contract.
5. PRIOR handoff: `SESSION_HANDOFF_2026-05-20_PRODUCT_READINESS.md` (PR #68 context).

---

## 9. Rollback command

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit c2c919c
git push origin main
# Vercel redeploys in ~1 min; custom-domain edges propagate in ~1–3 min
```

---

## 10. Hard operating rules (carried forward)

- No fabricated schedule / squads / odds / projections / results
- Pushes still excluded from hit-rate denominator (NBA/MLB)
- Forbidden public copy still guarded (public_copy_test runs in every PR)
- `app/package*.json` untouched
- Paid Odds API floor: 300 (standing). One-time 240 override from PR #68 has expired.
- Squad publication is opt-in per federation — even after June 2, only publish what each federation announces officially

*End of handoff. World Cup section is launch-ready and production-verified.*
