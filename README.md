# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/wompkun/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/wompkun/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Build the best token launch radar. Read a sealed snapshot of every protocol DefiLlama tracks, work out which ones still record no token and are not a wrapped or staked product of one that trades, and rank them by what their launch would be worth; then hand in a web dashboard that shows the board, a detail view for each protocol and the steps to farm it. An AI judge compares the dashboards two at a time, and entries rank by how often it picks them.

Model radar-2: implied value from TVL, capped 7-day growth, age peak, farmability by category, and chain count. Board: 200 rows covering all 40 watchlist protocols, each with 7 farm steps. Dashboard: offline static page with board, detail view, filters and model explanation.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=jk303ka9&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
