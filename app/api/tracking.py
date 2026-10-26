from fastapi import APIRouter, HTTPException, Query

from ..services import tracking

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


@router.get("/dashboard")
def dashboard(days: int = Query(90, ge=1, le=365)):
    """Agregações do AdsPixel: métricas, drenagem, visitantes, donuts, funil e fluxo."""
    return tracking.dashboard(days)


@router.get("/visitante/{ip}")
def visitante(ip: str):
    """Detalhes de um visitante (histórico de eventos + payload)."""
    return tracking.visitante(ip)
