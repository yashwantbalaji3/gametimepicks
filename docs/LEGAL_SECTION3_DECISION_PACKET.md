# Legal Section-3 Decision Packet — FOR REVIEW · NOT LEGAL ADVICE (Program 164 · Release 5)

Everything here is drafted by engineering for the founder and a qualified reviewer. Nothing in
this document is counsel-approved, and the publish guard (`src/lib/legal/content-manifest.mjs`)
makes unapproved text structurally unable to ship as final. Source of repository facts:
`docs/LEGAL_CONTENT_MAP.md` (sections 2, 5-7 remain authoritative).

## Part A — the five founder business decisions (answer in your own words, 1-5)

| # | Decision | Why it gates everything | Recommended conservative option | Alternatives | Affected surfaces | Risk if unanswered |
|---|---|---|---|---|---|---|
| 1 | **Operating entity** — whose name stands behind the Terms? | every legal page needs a named legal person | incorporate before public beta if practical; otherwise sole trader under the founder's name, revisited at launch | company now · company later | Terms, Privacy, footer notices | Terms cannot name a party → cannot publish |
| 2 | **Governing jurisdiction** | dispute venue + which regime's rules apply | follow the entity's home jurisdiction | none meaningful — follows #1 | Terms | unanswerable adviser questions stay unanswerable |
| 3 | **Target geography** — who is the site FOR? | a US audience raises state-level gambling-adjacent questions a single-country audience does not | name ONE primary geography for beta | multi-region later with counsel | Terms, age gate, responsible-use, analytics consent basis | the adviser cannot scope any answer |
| 4 | **Age position** — 18+/21+/none | the product takes no bets but publishes betting analysis; promotion to minors is treated seriously in most regimes | 18+ stated, pending adviser confirmation of whether a formal gate is required | 21+ · none (not recommended) | responsible-use page, onboarding, beta terms | responsible-use copy stays blocked |
| 5 | **Audience claim** — research/education vs followable picks | the record supports the former: the model demonstrably does not beat the market (Sprint 056/057) | KEEP "research and education" — the entire public copy already enforces it | none honest | every public claim, methodology, results framing | none — the current framing holds until changed |

## Part B — LEGAL_COUNSEL_REQUIRED (verbatim scope for the adviser session; do not answer from the repository)

6. Does publishing paper betting analysis constitute regulated gambling advertising or affiliate
   activity in the target geography, given no bets are taken and no operator is linked?
7. Is an age gate legally required, and if so what form satisfies it?
8. What responsible-gambling signposting is mandatory versus advisable?
9. What disclaimer language limits liability for a published record users might act on?
10. What privacy notice is required for cookieless, day-granularity, PII-free event counts — and
    does it require consent in the target regime, or is it out of scope as non-personal data?
11. Are there advertising-standards implications in publishing a win/loss record at all?

## Part C — what happens after answers

1. Part-A answers land in this packet (a dated edit, founder-authored wording).
2. The counsel session covers Part B; outcomes are recorded per question with reviewer identity,
   role, and date in the legal content manifest — **never inferred from a repository commit**.
3. Draft Terms/Privacy/responsible-use text is produced FOR REVIEW, mapped surface-by-surface via
   the content map's section 5, and can only publish once the manifest carries the approval
   receipt (guard-enforced).
4. Post-approval acceptance: apply exact approved text → diff every surface → accessibility/link
   checks → version + effective-date receipt → production verification → prior version archived.

## Known copy posture (inventoried, consistent today)

The public copy is uniformly paper-only/educational; "beat the market", "edge", "lock", and
guarantee-language are guard-banned across the public surface (public-beta-safety + export-string
guards, enforced every CI run). No Terms/Privacy pages currently publish — absence, not
contradiction, is the present state, and the fail-closed default keeps it that way.
