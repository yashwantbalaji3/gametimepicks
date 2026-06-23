# MLB Public-Release UX Audit — /mlb, /homer-nukes, /mr-dub

_Phase A of the Master MLB + Product Polish sprint. Date: 2026-06-23. Release-candidate review._

Scope: the three MLB-facing surfaces, audited for IA order, honest empty states, headshot/logo wiring,
broken/placeholder copy, and cross-surface visual consistency. Every claim cites `file:line`. No
fabrication: all "pending"/"awaiting" copy below is intentional and correctly flagged.

## /mlb — landing

Source: `app/src/app/mlb/page.tsx`. The flagship block (`MlbFlagshipSections`, page.tsx:304) renders the
five sportsbook-order sections, **confirmed in this exact order**:

1. **Featured Plays** — `tag="1 · Featured plays"`, "Today's featured MLB plays"
   (`mlb-flagship-sections.tsx:99`)
2. **Homer Nukes Parlay** — `tag="2 · Flagship"`, "Homer Nukes — daily 5-leg HR parlay"
   (`mlb-flagship-sections.tsx:103`)
3. **Best Player Props** — `tag="3 · Player props"`, "Best player props"
   (`mlb-flagship-sections.tsx:108`)
4. **Pitcher Props** — `tag="4 · Pitcher props"`, "Pitcher props" (`mlb-flagship-sections.tsx:112`)
5. **Games** — `tag="5 · Games"`, "Today's MLB games" (`mlb-flagship-sections.tsx:116`)

Below the flagship block, the legacy tabbed sport shell (page.tsx:308) remains for Games / Overview /
Projections / Player Props / Suggested / Results / Methodology.

**Empty states (honest, data-gated).** When `props.length === 0`, every section shows a `GatedSlot`
(`mlb-flagship-sections.tsx:36`) with the copy: _"Today's MLB board has not been posted yet — waiting on
the sportsbooks. This section fills in automatically the moment real MLB markets post; no fabricated picks
in the meantime."_ Per-section labels at lines 100/109/113/117. No fabricated rows are ever shown.

**Headshots + team logos** are wired on every leg/row surface: Featured/Pitcher `TopList`
(`mlb-flagship-sections.tsx:60–61`), Homer board legs (`homer-nukes-board.tsx:99–100`), props-board
desktop rows and mobile cards (`props-board.tsx` table + cards). All use `PlayerAvatar photo={…}` with a
conditional `TeamLogo`.

**Props board (section 3) — fully filterable (Phase E).** Sticky filter bar (`props-board.tsx`) with
group pills, player/team search, game, **odds range**, **confidence**, and sort; a "Clear N filters"
reset; "N shown" count; desktop sticky-header table + mobile cards. Verified live: Favorites filter →
all rows ≤ −110; Favorites + High confidence stack → all rows graded `high`.

## /homer-nukes — daily HR parlay

Source: `app/src/app/homer-nukes/page.tsx`. Header → `HomerNukesBoard` → closing disclosure.

The board is **premium and honest** (`homer-nukes-board.tsx`):

- **Hero**: stake ($20), combined odds, potential return, win probability, source books, a 3-bar
  confidence meter.
- **Homer Score status row** (lines 82–88): "Partial Model" badge + "0/7 advanced inputs live (Barrel% ·
  Hard-Hit% · xSLG · HR/FB · Pitcher HR/9 · Weather · Park factor — pending Statcast)".
- **5 ranked legs**: rank #, real headshot + team-logo overlay, player, "To hit a HR · {matchup}", odds,
  per-leg confidence (% + level).
- **WHY section** (lines 116–122): the honest rationale — five shortest-priced anytime-HR bats, one per
  game, ranked by de-vigged market probability; "Model rationale (barrel rate vs HR-prone pitcher, park &
  weather) is **pending advanced Statcast integration**." No fabricated reasons.
- **Empty state** (lines 48–59): "Today's Homer Nukes parlay isn't posted yet" + dynamic `board.note` +
  CTAs. Refuses to render without `board.available && board.parlay`.
- **History** (line 135): "Awaiting settled history — fills in after the first parlay settles from
  official box scores."

No broken or stale copy. Every pending label is intentional and styled to read as in-progress.

## /mr-dub — portfolio

Source: `app/src/app/mr-dub/page.tsx`. Order: 4-product allocation → daily portfolio candidates → standings
hero → latest-day strip → dual Bank Builder → active/awaiting cards → Moonshot → daily ledger → exposure &
bankroll health → full ledger → disclosure. Empty states are intentional (portfolio generating; no open
exposure; no exposure to break down). Daily-portfolio legs carry player avatars; product rows are
product-level (no per-leg headshots, by design).

## Cross-surface visual-consistency findings (feeds Phase G)

These are the concrete polish targets. All are cosmetic — none block release.

1. **Card radius drift.** `rounded-[8px]` (projection-card) vs `rounded-[10px]` (suggested-card, props
   rows) vs `rounded-[12px]` (section wrappers, lane cards) vs `rounded-[14px]` (Homer hero) vs
   `rounded-2xl` (Homer empty state). Target: cards `rounded-[10px]`, section wrappers `rounded-[14px]`.
2. **Card background tokens.** Three competing tones: warm `rgba(26,16,11,…)` (MLB sections), cool
   `rgba(12,8,6,…)` (lists/hero), neutral `rgba(255,255,255,0.02)` (Mr. Dub tiles). No single
   "card background" token.
3. **Badge styling.** Props board uses CSS pills `rounded-[5px]` (`props-board.tsx` `CONF_PILL`); Homer
   uses a bespoke flex confidence meter; Mr. Dub uses `rounded-full` status pills. No shared badge.
4. **Odds styling.** Props board wraps odds in bordered pills; Homer legs render odds as bare text.
5. **Typography scale.** Section titles 16–17px, subtitles 8.5–11.5px, ad-hoc per surface. No shared
   heading scale.

## Mobile findings (feeds Phase I)

- Props board is the one dual-layout surface: desktop sticky-header table (`hidden lg:block`,
  `maxHeight:560`) + mobile cards (`lg:hidden`). Clean separation.
- Homer hero uses `grid-cols-2 sm:grid-cols-4`; legs are a single-column list — no overflow risk.
- Mr. Dub uses `grid-cols-1 lg:grid-cols-2`. No fixed widths that overflow at 375px; the only borderline
  case is the props search input `min-w-[150px]`, which wraps inside the flex bar (verified no overflow).
- Page padding `px-4 sm:px-8` → 343px content at 375px; all surfaces degrade to single column.

## Release verdict

**Ship-ready for public MLB.** IA is correct (5 sections in order), empty states are honest, headshots +
team logos are wired everywhere, the props board is fully filterable, and there is no broken/placeholder
copy. The only open dependency is the **Statcast/weather feed** for the full Homer Score (today: Partial
Model, market-probability ranking) — documented and honestly surfaced, not a blocker. Remaining work is
cosmetic polish (Phase G) and mobile QA screenshots (Phase I).
</content>
