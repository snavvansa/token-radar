# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/snavvansa/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/snavvansa/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks every pre-token DeFi protocol in a sealed DefiLlama snapshot by a peer-implied value: TVL times the market-cap-to-TVL multiple the snapshot's own traded tokens of the same category carry, adjusted for seven-day growth and how long the protocol has run with no token. Each protocol gets an eight-step farm plan with costs and times, in a static, sortable and filterable dashboard with a detail view.

- `lib/model.ts`: the value model (peer table, growth and track-record factors) and the farm plans
- `main.ts`: reads the snapshot, writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json`
- `dashboard/`: the page (no framework, no network); it re-derives each row's implied value from the row's inputs

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
# then open out/dashboard/index.html
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=7pb8t6nt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
