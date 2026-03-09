import asyncio
import logging
import shutil
import platform
from pathlib import Path
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

# Track active SSH tunnel processes so we can clean them up on shutdown.
_ssh_tunnels: dict[int, asyncio.subprocess.Process] = {}


def _is_arm() -> bool:
    return _machine in ("arm64", "aarch64", "ARM64")


def _uses_colima_x86() -> bool:
    """True if we're on an ARM Mac using the Colima x86_64 profile."""
    return _system == "Darwin" and _is_arm() and bool(shutil.which("colima"))


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
    if _uses_colima_x86():
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


async def _docker_daemon_ready() -> bool:
    """Check if Docker daemon is responsive via the Colima socket (ARM Mac).

    Unlike _docker_daemon_running() which uses the default Docker context,
    this targets the Colima x86_64 profile socket directly.
    """
    code, _, _ = await _docker_run("docker", "info", timeout=10)
    return code == 0


async def check_docker_environment() -> DockerStatus:
    if not shutil.which("docker"):
        return DockerStatus(
            docker_available=False,
            message="Docker is not installed. Please install Docker to use this application.",
        )

    # Check daemon
    if _system == "Darwin":
        if _is_arm() and shutil.which("colima"):
            # On ARM Macs, we use a dedicated x86_64 Colima profile.
            # Check that profile specifically, not the default one.
            x86_ok, x86_msg = await ensure_colima_x86()
            if not x86_ok:
                return DockerStatus(
                    docker_available=True,
                    message=x86_msg,
                )
            # Colima profile is running, but the Docker daemon inside may
            # need a moment (especially if just started).  Verify connectivity.
            if not await _docker_daemon_ready():
                return DockerStatus(
                    docker_available=True,
                    message=(
                        "Colima x86_64 VM is running but Docker daemon is not "
                        "responding yet. It may still be starting — try refreshing "
                        "in a few seconds."
                    ),
                )
        elif shutil.which("colima"):
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

    image_built = await _image_exists()

    if not image_built:
        # Retry once — daemon may have been briefly unresponsive
        logger.info("Image '%s' not found on first check, retrying...", CONTAINER_IMAGE)
        await asyncio.sleep(2)
        image_built = await _image_exists()

    if not image_built:
        logger.warning("Image '%s' not detected after retry", CONTAINER_IMAGE)

    return DockerStatus(
        docker_available=True,
        daemon_running=True,
        image_built=image_built,
        message="Docker environment ready." if image_built else "Docker is ready but the MT5 bridge image needs to be built.",
    )


# --------------- Image ---------------

async def _image_exists() -> bool:
    code, stdout, stderr = await _docker_run("docker", "images", "-q", CONTAINER_IMAGE)
    exists = code == 0 and len(stdout.strip()) > 0
    if code != 0:
        logger.debug(
            "docker images check failed (exit=%d, stderr=%r)", code, stderr.strip()
        )
    return exists


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


# --------------- Port forwarding (Colima x86_64 QEMU) ---------------

async def _verify_port_reachable(port: int, timeout: float = 2.0) -> bool:
    """Check if a port on localhost is accepting TCP connections."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection("127.0.0.1", port),
            timeout=timeout,
        )
        writer.close()
        await writer.wait_closed()
        return True
    except (OSError, asyncio.TimeoutError):
        return False


async def ensure_port_forwarded(host_port: int) -> bool:
    """Ensure a container port is reachable from the host.

    On ARM Macs with Colima QEMU, port forwarding is done via SSH tunnels
    managed by Lima's hostagent.  Under heavy CPU load (QEMU x86 emulation),
    these tunnels can drop.  If the port is not reachable, we establish a
    manual SSH tunnel as a fallback.

    Returns True if the port is (or was made) reachable, False otherwise.
    """
    if not _uses_colima_x86():
        return True  # non-Colima platforms don't need this

    if await _verify_port_reachable(host_port):
        return True

    logger.warning(
        "Port %d not reachable on host — Colima SSH forwarding may have "
        "dropped. Establishing manual SSH tunnel as fallback.",
        host_port,
    )

    # Kill any stale tunnel for this port
    if host_port in _ssh_tunnels:
        old = _ssh_tunnels.pop(host_port)
        try:
            old.kill()
        except ProcessLookupError:
            pass

    # Use direct SSH with Lima's SSH config.  `colima ssh -- -N -L ...`
    # does NOT work because colima passes args after `--` to the VM's bash
    # shell, not to the SSH client itself.
    ssh_config = (
        Path.home() / ".colima" / "_lima" / f"colima-{COLIMA_PROFILE}" / "ssh.config"
    )
    if not ssh_config.exists():
        logger.error(
            "Lima SSH config not found at %s — cannot create tunnel.", ssh_config
        )
        return False

    try:
        proc = await asyncio.create_subprocess_exec(
            "ssh",
            "-F", str(ssh_config),
            "-o", "ExitOnForwardFailure=yes",
            "-N",
            "-L", f"{host_port}:localhost:{host_port}",
            f"lima-colima-{COLIMA_PROFILE}",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _ssh_tunnels[host_port] = proc

        # Give the tunnel a moment to establish
        await asyncio.sleep(2.0)

        if await _verify_port_reachable(host_port):
            logger.info("Manual SSH tunnel for port %d established successfully.", host_port)
            return True

        logger.error("Manual SSH tunnel for port %d did not help — port still unreachable.", host_port)
        return False
    except Exception as exc:
        logger.error("Failed to create SSH tunnel for port %d: %s", host_port, exc)
        return False


async def _cleanup_ssh_tunnels():
    """Kill all manual SSH tunnels.  Called on shutdown."""
    for port, proc in _ssh_tunnels.items():
        try:
            proc.kill()
            logger.debug("Killed SSH tunnel for port %d", port)
        except ProcessLookupError:
            pass
    _ssh_tunnels.clear()


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
            # Verify port forwarding is still working (Colima tunnel may have dropped)
            await ensure_port_forwarded(port)
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

    # Return port immediately — the frontend will poll for readiness.
    # The container takes 3-4 minutes to be fully ready under QEMU,
    # which exceeds browser HTTP timeouts if we block here.
    # Note: we don't call _ensure_port_forwarded here because the container
    # hasn't started listening yet — the health poll loop will trigger it.
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
    # Clean up any manual SSH tunnels we created
    await _cleanup_ssh_tunnels()


async def _get_container_port(name: str) -> Optional[int]:
    code, stdout, _ = await _docker_run("docker", "port", name, str(BRIDGE_INTERNAL_PORT))
    output = stdout.strip()
    if output:
        try:
            return int(output.split(":")[-1])
        except (ValueError, IndexError):
            return None
    return None