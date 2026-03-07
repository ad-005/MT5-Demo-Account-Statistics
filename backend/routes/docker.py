from fastapi import APIRouter

from backend.models import DockerStatus
from backend.services import docker_service

router = APIRouter(prefix="/api/docker", tags=["docker"])


@router.get("/status", response_model=DockerStatus)
async def docker_status():
    return await docker_service.check_docker_environment()


@router.post("/build")
async def build_image():
    has_buildx, msg = await docker_service.ensure_buildx()
    if not has_buildx:
        return {"status": "error", "message": msg}
    success = await docker_service.build_image()
    if not success:
        return {"status": "error", "message": "Failed to build image. Check logs."}
    return {"status": "ok", "message": "Image built successfully."}
