import asyncio
import logging
import shutil
import platform
from typing import Optional

from backend.config import (
    BRIDGE_INTERNAL_PORT,
    CONTAINER_IMAGE,
    CONTAINER_PREFIX,
    MT5_STARTUP_TIMEOUT,
    BASE_DIR,
)
from backend.models import Account, DockerStatus

logger = logging.getLogger(__name__)

_next_port = 8100
_system = platform.system()
_machine = platform.machine()  # arm64 / x86_64 / AMD64

COLIMA_PROFILE = "mt5"


def _is_arm() -> bool:
    return _machine in ("arm64", "aarch64", "ARM64")


def _get_next_port() -> int:
    global _next_port
    port = _next_port
    _next_port += 1
    return port


def _colima_socket() -> str:
    return f"{_home}/.colima/{COLIMA_PROFILE}/docker.sock"


_home = str(__import__("pathlib").Path.home())


async def _run(*args: str, timeout: int = 120, env: dict = None) -> tuple[int, str, str]:
    import os
    run_env = os.environ.copy()
    if env:
        run_env.update(env)
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=run_env,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return 1, "", "Command timed out"
    return proc.returncode, stdout.decode(), stderr.decode()


async def _docker_run(*args: str, timeout: int = 120) -> tuple[int, str, str]:
    """Run a docker command, targeting the x86_64 Colima VM on ARM Macs."""
    env = {}
    if _system == "Darwin" and _is_arm() and shutil.which("colima"):
        socket = _colima_socket()
        env["DOCKER_HOST"] = f"unix://{socket}"
    return await _run(*args, timeout=timeout, env=env if env else None)


# --------------- Colima x86_64 profile (ARM Macs only) ---------------

async def _colima_profile_running() -> bool:
    code, stdout, _ = await _run("colima", "list", "--json")
    if code != 0:
        return False
    import json
    for line in stdout.strip().split("\n"):
        try:
            profile = json.loads(line)
            if profile.get("name") == COLIMA_PROFILE and profile.get("status") == "Running":
                return True
        except (json.JSONDecodeError, KeyError):
            continue
    return False


async def _colima_profile_exists() -> bool:
    code, stdout, _ = await _run("colima", "list", "--json")
    if code != 0:
        return False
    import json
    for line in stdout.strip().split("\n"):
        try:
            profile = json.loads(line)
            if profile.get("name") == COLIMA_PROFILE:
                return True
        except (json.JSONDecodeError, KeyError):
            continue
    return False


async def ensure_colima_x86() -> tuple[bool, str]:
    """On ARM Macs, ensure a Colima x86_64 profile exists and is running."""
    if not (_system == "Darwin" and _is_arm()):
        return True, ""

    if not shutil.which("colima"):
        return False, (
            "Colima is required on Apple Silicon Macs. "
            "Install with: brew install colima"
        )

    if await _colima_profile_running():
        return True, ""

    if await _colima_profile_exists():
        logger.info(f"Starting existing Colima '{COLIMA_PROFILE}' profile...")
        code, _, stderr = await _run(
            "colima", "start", COLIMA_PROFILE,
            timeout=300,
        )
        if code != 0:
            return False, f"Failed to start Colima x86_64 profile: {stderr}"
        return True, ""

    logger.info(f"Creating Colima x86_64 profile '{COLIMA_PROFILE}'...")
    code, _, stderr = await _run(
        "colima", "start", COLIMA_PROFILE,
        "--arch", "x86_64",
        "--runtime", "docker",
        "--cpu", "2",
        "--memory", "4",
        "--disk", "30",
        timeout=300,
    )
    if code != 0:
        return False, f"Failed to create Colima x86_64 profile: {stderr}"

    return True, ""


# --------------- Buildx ---------------

async def _has_buildx() -> bool:
    code, _, _ = await _run("docker", "buildx", "version")
    return code == 0


async def _install_buildx() -> bool:
    if _system == "Darwin":
        if shutil.which("brew"):
            code, _, stderr = await _run("brew", "install", "docker-buildx")
            if code == 0:
                logger.info("Installed docker-buildx via Homebrew")
                return True
            logger.error(f"brew install docker-buildx failed: {stderr}")
    elif _system == "Linux":
        proc = await asyncio.create_subprocess_shell(
            "mkdir -p ~/.docker/cli-plugins && "
            "ARCH=$(uname -m) && "
            'curl -fsSL "https://github.com/docker/buildx/releases/latest/download/'
            'buildx-v0.14.0.linux-${ARCH}" '
            "-o ~/.docker/cli-plugins/docker-buildx && "
            "chmod +x ~/.docker/cli-plugins/docker-buildx",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode == 0:
            logger.info("Installed docker-buildx via direct download")
            return True
        logger.error(f"buildx install failed: {stderr.decode()}")
    # Windows: buildx ships with Docker Desktop; no auto-install path
    return False


async def ensure_buildx() -> tuple[bool, str]:
    if await _has_buildx():
        return True, ""

    logger.info("buildx not found, attempting automatic install...")
    if await _install_buildx() and await _has_buildx():
        return True, ""

    hints = {
        "Darwin": "Install with: brew install docker-buildx",
        "Windows": "Buildx is included with Docker Desktop. Please update or reinstall Docker Desktop.",
        "Linux": "Install with: apt-get install docker-buildx-plugin (or see https://docs.docker.com/build/install-buildx/)",
    }
    hint = hints.get(_system, "See https://docs.docker.com/build/install-buildx/")
    return False, f"Docker Buildx is required but not installed. {hint}"


# --------------- Docker daemon check ---------------

async def _docker_daemon_running() -> bool:
    code, _, _ = await _run("docker", "info")
    return code == 0


async def check_docker_environment() -> DockerStatus:
    if not shutil.which("docker"):
        return DockerStatus(
            docker_available=False,
            message="Docker is not installed. Please install Docker to use this application.",
        )

    # Check daemon
    if _system == "Darwin":
        if shutil.which("colima"):
            code, _, _ = await _run("colima", "status")
            if code != 0:
                return DockerStatus(
                    docker_available=True,
                    message="Colima is installed but not running. Start it with: colima start",
                )
        elif not await _docker_daemon_running():
            return DockerStatus(
                docker_available=True,
                message=(
                    "Docker daemon is not running. "
                    "If using Colima: brew install colima && colima start. "
                    "If using Docker Desktop: open Docker Desktop."
                ),
            )

        # On ARM Macs, check for x86_64 Colima profile
        if _is_arm() and shutil.which("colima"):
            x86_ok, x86_msg = await ensure_colima_x86()
            if not x86_ok:
                return DockerStatus(
                    docker_available=True,
                    daemon_running=True,
                    message=x86_msg,
                )

    elif _system == "Windows":
        if not await _docker_daemon_running():
            return DockerStatus(
                docker_available=True,
                message="Docker daemon is not running. Please start Docker Desktop.",
            )
    else:  # Linux
        if not await _docker_daemon_running():
            return DockerStatus(
                docker_available=True,
                message="Docker daemon is not running. Start it with: sudo systemctl start docker",
            )

    # Check buildx
    has_buildx, buildx_msg = await ensure_buildx()
    if not has_buildx:
        return DockerStatus(
            docker_available=True,
            daemon_running=True,
            message=buildx_msg,
        )

    code, stdout, _ = await _docker_run("docker", "images", "-q", CONTAINER_IMAGE)
    image_built = code == 0 and len(stdout.strip()) > 0

    return DockerStatus(
        docker_available=True,
        daemon_running=True,
        image_built=image_built,
        message="Docker environment ready." if image_built else "Docker is ready but the MT5 bridge image needs to be built.",
    )


# --------------- Image ---------------

async def _image_exists() -> bool:
    code, stdout, _ = await _docker_run("docker", "images", "-q", CONTAINER_IMAGE)
    return code == 0 and len(stdout.strip()) > 0


async def build_image() -> bool:
    has_buildx, msg = await ensure_buildx()
    if not has_buildx:
        logger.error(f"Cannot build: {msg}")
        return False

    # On ARM Macs, ensure x86_64 Colima profile
    if _system == "Darwin" and _is_arm():
        ok, err = await ensure_colima_x86()
        if not ok:
            logger.error(f"Cannot build: {err}")
            return False

    bridge_dir = BASE_DIR / "bridge"
    code, _, stderr = await _docker_run(
        "docker", "buildx", "build",
        "--load",
        "-t", CONTAINER_IMAGE,
        str(bridge_dir),
        timeout=600,
    )
    if code != 0:
        logger.error(f"Image build failed: {stderr}")
        return False
    return True


# --------------- Containers ---------------

def _container_name(account: Account) -> str:
    return f"{CONTAINER_PREFIX}{account.id[:8]}"


async def start_container(account: Account) -> Optional[int]:
    name = _container_name(account)

    # Check if already running
    code, stdout, _ = await _docker_run("docker", "ps", "-q", "-f", f"name={name}")
    if stdout.strip():
        port = await _get_container_port(name)
        if port:
            return port

    # Remove stopped container with same name
    await _docker_run("docker", "rm", "-f", name)

    host_port = _get_next_port()

    code, _, stderr = await _docker_run(
        "docker", "run", "-d",
        "--name", name,
        "-p", f"{host_port}:{BRIDGE_INTERNAL_PORT}",
        "-e", f"MT5_LOGIN={account.login}",
        "-e", f"MT5_PASSWORD={account.password}",
        "-e", f"MT5_SERVER={account.server}",
        CONTAINER_IMAGE,
    )
    if code != 0:
        logger.error(f"Container start failed: {stderr}")
        return None

    # Wait for bridge to be ready
    import httpx
    for _ in range(MT5_STARTUP_TIMEOUT):
        await asyncio.sleep(1)
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"http://localhost:{host_port}/health", timeout=2)
                if resp.status_code == 200:
                    return host_port
        except Exception:
            continue

    logger.warning(f"Container started but bridge not ready after {MT5_STARTUP_TIMEOUT}s")
    return host_port


async def stop_container(account: Account) -> bool:
    name = _container_name(account)
    await _docker_run("docker", "stop", name)
    await _docker_run("docker", "rm", name)
    return True


async def get_container_status(account: Account) -> str:
    name = _container_name(account)
    code, stdout, _ = await _docker_run(
        "docker", "ps", "-a", "--filter", f"name={name}", "--format", "{{.Status}}",
    )
    status = stdout.strip()
    if not status:
        return "not_created"
    if status.startswith("Up"):
        return "running"
    return "stopped"


async def stop_all_containers():
    code, stdout, _ = await _docker_run(
        "docker", "ps", "-q", "--filter", f"name={CONTAINER_PREFIX}",
    )
    for cid in stdout.strip().split("\n"):
        if cid:
            await _docker_run("docker", "stop", cid)
            await _docker_run("docker", "rm", cid)


async def _get_container_port(name: str) -> Optional[int]:
    code, stdout, _ = await _docker_run("docker", "port", name, str(BRIDGE_INTERNAL_PORT))
    output = stdout.strip()
    if output:
        try:
            return int(output.split(":")[-1])
        except (ValueError, IndexError):
            return None
    return None