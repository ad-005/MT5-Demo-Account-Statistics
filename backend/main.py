import logging
import signal
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import FRONTEND_DIR
from backend.routes import accounts, trades, stats, docker
from backend.services.docker_service import stop_all_containers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    logger.info("Shutting down — stopping all MT5 containers...")
    await stop_all_containers()
    logger.info("All containers stopped.")


app = FastAPI(title="MT5 Demo Stats", version="1.0.0", lifespan=lifespan)

app.include_router(accounts.router)
app.include_router(trades.router)
app.include_router(stats.router)
app.include_router(docker.router)

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
async def serve_dashboard():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.get("/trades")
async def serve_trades_page():
    return FileResponse(str(FRONTEND_DIR / "trades.html"))