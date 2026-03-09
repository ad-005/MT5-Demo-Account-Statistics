# MT5 Demo Stats

A self-hosted dashboard for tracking MetaTrader 5 demo account trading statistics. Each account runs in its own Docker container, and the app displays performance metrics, risk analysis, session breakdowns, and an overall trading score.

![Python 3.13+](https://img.shields.io/badge/python-3.13%2B-blue)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688)
![Vanilla JS](https://img.shields.io/badge/frontend-Vanilla%20JS-f7df1e)

## Features

- **Multi-account support** — add multiple MT5 demo accounts, each running in an isolated Docker container
- **On-demand containers** — only the selected account's container runs, saving resources
- **Overall trading score** — composite grade (A+ through F) based on industry benchmarks from prop firms (FTMO) and institutional standards (CFA/GIPS)
- **Performance metrics** — net profit, win rate, profit factor, expectancy, Sharpe/Sortino ratios, max drawdown, R:R ratio, consecutive wins/losses
- **Session analysis** — win rates broken down by trading session (Asian, London, New York, NY PM)
- **Daily analysis** — win rates by day of the week
- **Symbol breakdown** — per-instrument trade count, win rate, and P&L
- **Trade filtering** — filter by date range, direction, symbol, and profit range
- **Cross-platform** — works on macOS (ARM and x86), Windows, and Linux

## Prerequisites

- **Python 3.13+**
- **Docker** with BuildKit support
  - macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Colima](https://github.com/abiosoft/colima)
  - Windows: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - Linux: Docker Engine with [buildx plugin](https://docs.docker.com/build/install-buildx/)
- A **MetaTrader 5 demo account** (free from any MT5 broker)

> **Apple Silicon (M1/M2/M3/M4):** The app automatically creates a dedicated Colima x86_64 VM profile to run MT5 under Wine via QEMU. No manual setup needed — just have Colima installed (`brew install colima`).

## Quick Start

```bash
# Clone the repo
git clone https://github.com/ad-005/MT5-Demo-Account-Statistics.git
cd MT5-Demo-Account-Statistics

# Install dependencies
pip install -r requirements.txt

# Start the app
python run.py
```

Open **http://127.0.0.1:8000** in your browser.

### First-time setup

1. The app will check your Docker environment and show a status banner if anything needs attention
2. Click **Build Image** if prompted — this builds the MT5 Docker image (one-time, takes approximately 15 minutes)
3. Click **+ Add Account** and enter your MT5 demo account credentials (login, password, server)
4. Select the account from the sidebar and click **Start Container**
5. Wait for the container to initialize (~1-2 min on x86, ~3-4 min on ARM Mac via QEMU)
6. Once ready, the dashboard will display your trading statistics

## How It Works

Each Docker container runs:
1. **MetaTrader 5** under Wine with a custom MQL5 Expert Advisor (DataExporter)
2. **Bridge server** (Python/FastAPI) that reads exported data and serves it over HTTP

The EA writes account info and trade history to JSON files inside the Wine filesystem. The bridge server reads these files and exposes them via HTTP. The main app fetches data from the bridge and computes statistics client-side and server-side.

```
Browser  ←→  FastAPI backend (port 8000)  ←→  Bridge server (port 8100+)  ←→  MT5/Wine
                    ↓
              Static frontend
              (HTML/CSS/JS)
```

## Project Structure

```
backend/
  main.py              — FastAPI app entry point
  config.py            — Configuration (ports, timeouts, paths)
  models.py            — Pydantic data models
  services/
    account_service.py  — Account CRUD (JSON file storage)
    docker_service.py   — Container lifecycle, cross-platform Docker handling
    mt5_bridge_client.py — HTTP client to fetch data from containers
    stats_service.py    — Statistics calculations
  routes/
    accounts.py         — /api/accounts/* endpoints
    trades.py           — /api/trades/* endpoints
    stats.py            — /api/stats/* endpoints
    docker.py           — /api/docker/* endpoints
bridge/
  bridge_server.py      — In-container HTTP server
  mql5/DataExporter.mq5 — MQL5 EA that exports data to JSON
  Dockerfile            — Container image definition
  setup_and_run.sh      — Container startup script
frontend/
  index.html            — Dashboard page
  trades.html           — Trades page
  css/style.css         — Dark theme styles
  js/api.js             — API client
  js/dashboard.js       — Dashboard logic and scoring
  js/trades.js          — Trades page logic
```

## Overall Score Methodology

The composite trading score is calculated from 7 metrics weighted by importance, informed by prop firm evaluation criteria and institutional risk-adjusted performance standards:

| Metric | Weight | Target | Source |
|--------|--------|--------|--------|
| Profit Factor | 20% | >= 1.5 | Industry standard |
| Max Drawdown % | 20% | <= 10% | FTMO/prop firm cap |
| Sharpe Ratio | 15% | >= 1.0 | CFA benchmark |
| Win Rate | 15% | >= 50% | Industry standard |
| R:R Ratio | 10% | >= 1.5 | Industry consensus |
| Consistency | 10% | Best trade < 30% of total profit | Prop firm rule |
| Expectancy | 10% | >= $5/trade | Meaningful threshold |

Additional rules:
- **Drawdown penalty**: 20% score reduction if max DD exceeds 20%; 50% reduction if over 30%
- **Low sample warning**: displayed when fewer than 20 trades

## License

This project is provided as-is for educational and personal use.
