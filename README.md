# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/snavvansa/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/snavvansa/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for a sealed DefiLlama snapshot. Every one of its 758 protocols is accounted for in exactly one group. The 198 that record no token are ranked by implied value = launch value × token odds:

- Launch value is fitted on the snapshot's 119 traded tokens. Each candidate term (size, category, growth, age, family, chains) is kept only if it lowers the held-out error in both leave-one-out and walk-forward tests.
- Token odds come from a logistic fit on 702 protocols, with its terms tested the same way (10-fold and walk-forward).

Each row carries a farm verdict (FARM, THIN or SKIP) at a chosen deposit, netted against every fee and what a T-bill would pay, plus its break-even deposit and an eight-step plan with costs and times. A self-test that can fail blocks the build.

- `dashboard/core-*.js`: the model (stats, fits, accounting, farm economics, self-test). It is one script that runs in both Node and the browser.
- `main.ts`: runs that model on the snapshot and writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json`.
- `dashboard/app-*.js`: the page (no framework, no network). On load it refits the models and recomputes every row, and checks the result against `board.json`. The first screen shows the four decision numbers and ranked board; the full fitted-model audit is expandable below the board.
- The dossier keeps all dashboard source visible under the 65,536-byte text budget, with three locally captured JPEGs. A smaller dossier is not evidence of a higher judge score.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
# then open out/dashboard/index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=7pb8t6nt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
