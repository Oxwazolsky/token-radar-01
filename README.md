# Token Radar — radar-2

A token launch radar for make.fun's `token-radar-01` bounty, entered by @oxwazolsky.

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot at
`/input/snapshot.json`, ranks every protocol that **records no token** by a conditional
implied value, and writes `/output/board.json`, the dashboard data (`data.js`), the static
dashboard, three screenshots, and `/output/dossier.json` (via the vendored
`vendor/makefun-board.ts`, byte-for-byte the scorer's library).

Run it locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

## The model (radar-2)

The starter priced everything at a flat 0.25 × TVL. Radar-2 instead measures its pricing
from the snapshot itself:

- **Peer multiple** — per category, the median market-cap / TVL of the protocols in the
  snapshot whose token already trades (≥4 peers, clamped 0.08–1.5×; global peer median
  otherwise). Re-running on a future snapshot re-prices every category automatically.
- **Growth** — 7-day TVL change clamped to −60…+120%, weighted 0.45 on rises and 0.65 on
  falls (capital leaving is a stronger signal than capital arriving).
- **Maturity** — `0.65 + 0.35 × (1 − exp(−age/730d))`: time running while recording no
  token counts, with diminishing returns; 365 days assumed when no date is recorded.
- **Breadth** — +4% per doubling of the chain count, capped at three doublings.

`implied = round(TVL × peer × growth × maturity × breadth)`

A separate **launch score (0–100)** — category tokenisation share 30%, time recording no
token 25%, scale 20%, momentum 15%, breadth 10% — is shown beside the value and never
multiplied into it. Each row also carries field-derived **risks** and a 7-step,
category-specific **farm plan** with costs and times.

Coverage: all 40 watchlist slugs, plus 200 early rows below the $50M floor chosen by
preliminary implied value (not raw TVL). Live-token protocols are set aside and shown at
their real market caps — they are the peer evidence, not the ranking.

Wording discipline: the board says a protocol "records no token" (its snapshot fields are
null). It never claims the protocol has no token, and an implied value is a conditional
estimate, not a prediction that a token will be issued.
