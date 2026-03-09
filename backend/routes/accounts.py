from fastapi import APIRouter, HTTPException

from backend.models import AccountCreate, AccountOut
from backend.services import account_service, docker_service, mt5_bridge_client

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts():
    accounts = account_service.load_accounts()
    result = []
    for acc in accounts:
        status = await docker_service.get_container_status(acc)
        result.append(AccountOut(
            id=acc.id,
            name=acc.name,
            login=acc.login,
            server=acc.server,
            trade_mode=acc.trade_mode,
            container_status=status,
        ))
    return result


@router.post("", response_model=AccountOut, status_code=201)
async def create_account(data: AccountCreate):
    acc = account_service.add_account(data)
    return AccountOut(
        id=acc.id,
        name=acc.name,
        login=acc.login,
        server=acc.server,
        trade_mode=acc.trade_mode,
        container_status="not_created",
    )


@router.delete("/{account_id}")
async def remove_account(account_id: str):
    acc = account_service.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    await docker_service.stop_container(acc)
    account_service.delete_account(account_id)
    return {"status": "deleted"}


@router.post("/{account_id}/start")
async def start_account_container(account_id: str):
    acc = account_service.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")

    # Verify Docker environment is ready before attempting to start
    docker_status = await docker_service.check_docker_environment()
    if not docker_status.daemon_running:
        raise HTTPException(
            503,
            "Docker daemon is not ready yet. "
            "The Colima VM may still be starting — please wait a moment and try again.",
        )
    if not docker_status.image_built:
        raise HTTPException(
            400,
            "The MT5 bridge image has not been built yet. "
            "Please build it first from the dashboard.",
        )

    port = await docker_service.start_container(acc)
    if port is None:
        raise HTTPException(500, "Failed to start container")
    account_service.assign_port(account_id, port)
    return {"status": "running", "port": port}


@router.get("/{account_id}/health")
async def account_health(account_id: str):
    acc = account_service.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    if not acc.container_port:
        return {"ready": False, "status": "no_port"}
    # Ensure Colima port forwarding hasn't dropped (ARM Mac QEMU workaround)
    await docker_service.ensure_port_forwarded(acc.container_port)
    healthy = await mt5_bridge_client.check_health(acc.container_port)
    return {"ready": healthy, "status": "ok" if healthy else "starting"}


@router.post("/{account_id}/stop")
async def stop_account_container(account_id: str):
    acc = account_service.get_account(account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    await docker_service.stop_container(acc)
    account_service.assign_port(account_id, None)
    return {"status": "stopped"}
