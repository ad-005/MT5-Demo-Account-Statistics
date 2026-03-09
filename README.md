# MT5 Demo Stats

A self-hosted dashboard for tracking MetaTrader 5 demo account performance. Add your accounts, and the app handles the rest — spinning up containers, pulling trade data, and presenting clear statistics.

![Python 3.13+](https://img.shields.io/badge/python-3.13%2B-blue)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688)
![Vanilla JS](https://img.shields.io/badge/frontend-Vanilla%20JS-f7df1e)

## Features

- **Multi-account** — each account runs in its own isolated Docker container, started on demand
- **Overall score** — composite A+ through F grade based on prop firm and institutional benchmarks
- **Full stats suite** — win rate, profit factor, Sharpe/Sortino, drawdown, expectancy, R:R, streaks
- **Session & daily breakdown** — win rates by trading session and day of the week
- **Symbol breakdown** — per-instrument trade count, win rate, and P&L
- **Trade explorer** — searchable trade history with date, direction, symbol, and profit filters
- **Reports & snapshots** — save point-in-time snapshots of your stats, view them offline, and compare any two reports side by side with color-coded deltas
- **Compare with live** — compare a saved snapshot against your current live stats
- **Cross-platform** — macOS (ARM and Intel), Windows, Linux

## Prerequisites

- **Python 3.13+**
- **Docker** with BuildKit support
  - macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Colima](https://github.com/abiosoft/colima)
  - Windows: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - Linux: Docker Engine with [buildx plugin](https://docs.docker.com/build/install-buildx/)
- A **MetaTrader 5 demo account** (free from any MT5 broker)

> **Apple Silicon (M1/M2/M3/M4):** The app automatically sets up a Colima x86_64 VM to run MT5. Just have Colima installed (`brew install colima`).

## Quick Start

```bash
git clone https://github.com/ad-005/MT5-Demo-Account-Statistics.git
cd MT5-Demo-Account-Statistics
pip install -r requirements.txt
python run.py
```

Open **http://127.0.0.1:8000** in your browser.

### First-time setup

1. The app checks your Docker environment and guides you through any needed setup
2. Build the MT5 image when prompted (one-time, ~15 minutes)
3. Add your demo account credentials and start the container
4. Stats appear once the container initializes (~1-2 min on x86, ~3-4 min on ARM)

### Saving reports

1. With stats loaded on the dashboard, click **Save Snapshot**
2. Give it a label and it's saved — viewable anytime from the **Reports** page
3. Select two reports and click **Compare** to see a side-by-side diff with improvement indicators

## License

This project is provided as-is for educational and personal use.