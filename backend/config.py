import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ACCOUNTS_FILE = DATA_DIR / "accounts.json"
REPORTS_FILE = DATA_DIR / "reports.json"
FRONTEND_DIR = BASE_DIR / "frontend"

BRIDGE_INTERNAL_PORT = 8080
CONTAINER_IMAGE = "mt5-bridge"
CONTAINER_PREFIX = "mt5-account-"

MT5_STARTUP_TIMEOUT = int(os.environ.get("MT5_STARTUP_TIMEOUT", "300"))
