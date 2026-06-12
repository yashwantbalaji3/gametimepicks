# Bank Builder methodology — current (updated June 12, 2026)

The public ladder: $100 → $10,000 in five steps, one card per step, paper-only.
Record: 3–0 ($100 → $211.85 → $728.76 → $1,423.64), every step settled from official sources
(MLB Stats API · ESPN box score · ESPN-verified 90′ finals).

## Official-candidate gates (ALL required)
1. Real posted odds from a named book — never synthesized.
2. Model support: every leg model probability ≥55%.
3. Market support: every leg market probability ≥50% (model+market agreement — the June 11
   lesson: agreement favorites delivered; the model-disfavored +195 DC lost).
4. Low correlation: cross-match/cross-game legs only; same-game legs never combine.
5. Clear settlement rule per leg (90′ regulation for soccer; official box scores for
   MLB/NBA) from an official source.
6. Target-fit without forcing: the card must reach the step's ladder floor with the FULL
   current bankroll as stake. Weak filler legs are never added to force the number.
7. Pre-lineup player props are never eligible.

If no card clears every gate, the step stays pending — credibility beats cadence. A lowered
target may be accepted only by explicit owner decision, documented in the audit trail
(June 11 precedent: $2,000 → $1,400–$1,500 was an explicit, recorded decision).

## Settlement
Bankroll × combined decimal odds on win; reset to $100 base on loss; exact math asserted in
tests; idempotent (a step can never settle twice); public artifacts carry legs, finals,
sources, and officialResultConfirmed.
