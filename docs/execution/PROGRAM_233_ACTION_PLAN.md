# Program 233 — action plan

Ranked by dependency, then by user outcome. Each release names its proof. Ordered per the charter's
recommendation, adjusted by what the review found already present.

## A — contain live incidents · **SHIPPED** (`2634d9d35`)

EPL publication classification, receipt-deadline detector, stale learning artifact, `ARTIFACT_READY`
silence, and the mid-flight-day guard class. Proof: offered window COMPLETE / 0 owed; 650 unit + 71
rendered green.

## B — the performance read model · **SHIPPED** (`40b152a15`)

*Current state:* five ledgers exist and are correctly separate (`lab-ledger` 5 streams × 4 tiers,
`graded-picks` per sport, `mr-dub/portfolio`, `product-ledger/*`, `model_audit`). None is queryable
by a reader.

*Desired outcome:* one read model that answers "what is the record for THIS population, sport, date
range and risk tier" without merging populations.

*Changes:* a pure `lib/results/read-model.mjs` that projects the existing ledgers into a common row
shape carrying record type, sport, tier, date, W/L/P/void/pending and denominators — **reading only,
never recomputing settlement**. Explicit `recordType` selector so drafts are never counted as
published cards and a leg is never counted as a parlay.

*Proof:* one manually recomputed cohort per primary sport and per available tier; source-to-view
agreement; zero-decisive renders "unavailable", not 0%.

## C — the filterable results journey · **SHIPPED** (`40b152a15`) — the first substantial user outcome

*Current state:* `/results` has zero filter controls. Verified in the built HTML.

*Desired outcome:* a reader picks record type, sport, date range and risk tier, sees the decisive
record, hit rate with sample size, pending count, and can click through to the rows behind it.

*Changes:* filters over the read model, state in shareable URLs via the existing date/sport owner, a
sport × risk grid whose every cell links to its slips, and a detail view showing the frozen pre-event
forecast beside the actual result. Empty tier reads "no settled cards", never 0%.

*Proof:* the live journey works on mobile and laptop; denominators reconcile to the ledgers; browser
tests for filter/URL/back/refresh.

## D — fixed-frame simulation player

*Current state:* Generate auto-scrolls into a long report. The scene terminates honestly; the report
is a page, not a bounded stage.

*Desired outcome:* one action begins a complete recordable narrative in one fixed frame; the pointer
can stay still; every value matches the underlying report.

*Changes:* a reusable player over an immutable presentation manifest (event id, artifact revision,
model version, supported chapters), chapter navigation, reduced-motion and hidden-tab handling reused
from the existing scene owner. One sport end to end, then the other three.

## E — recording mode

9:16 / 16:9 / 4:5 compositions, countdown, auto-advance, safe margins, branding without navigation.
Board presentations for Top 10 and results recap. Depends on D.

## F — daily evaluation loop and model comparison

Grading and monitoring already run daily. The gap is a reproducible candidate-versus-incumbent
comparison on the same eligible events with a locked window. Depends on B for the population.

## G — navigation and page experience

Home already orients well. The work is section navigation on sport hubs and removing duplicate prose
— **not** a rebuild. Lowest priority: the review found no navigation defect, only polish.

## Out of scope without authorization

NFL paid-odds renewal · Moonshot disposition · protected console redeploy (now **24 days** stale;
boundary intact, packet ready) · social posting.
