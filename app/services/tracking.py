"""AdsTracking — agregações do pixel próprio (tabela visitas) + parser de User-Agent."""
import hashlib
import re
from datetime import datetime, timedelta

from .database import get_db
from .store import get_settings

DRENAGEM_MIN_CLIQUE = 4  # IP com >= N cliques em CTA entra no alerta de drenagem


def parse_user_agent(ua: str) -> dict:
    ua = ua or ""
    low = ua.lower()
    if "ipad" in low or "tablet" in low:
        device = "Tablet"
    elif "mobile" in low or "iphone" in low or "android" in low:
        device = "Smartphone"
    elif ua:
        device = "Computador"
    else:
        device = "—"

    if "windows" in low:
        os_name = "Windows"
    elif "iphone" in low or "ipad" in low or " mac" in low or low.startswith("mac"):
        os_name = "iOS" if ("iphone" in low or "ipad" in low) else "macOS"
    elif "android" in low:
        os_name = "Android"
    elif "mac os" in low:
        os_name = "macOS"
    elif "linux" in low:
        os_name = "Linux"
    else:
        os_name = "—"

    if "edg/" in low or "edge" in low:
        browser = "Edge"
    elif "opr/" in low or "opera" in low:
        browser = "Opera"
    elif "chrome" in low or "crios" in low:
        browser = "Chrome"
    elif "firefox" in low or "fxios" in low:
        browser = "Firefox"
    elif "safari" in low:
        browser = "Safari"
    else:
        browser = "—"
    return {"device": device, "os": os_name, "browser": browser}


def visitor_id(ip: str) -> str:
    return hashlib.sha256((ip or "").encode()).hexdigest()[:12].lower()


def _since_clause(days: int) -> str:
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    return start


def _domain(url: str) -> str:
    match = re.match(r"https?://([^/]+)", url or "")
    return match.group(1).replace("www.", "") if match else (url or "")


def dashboard(days: int = 90) -> dict:
    start = _since_clause(days)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT event, page, gclid, utm_source, utm_medium, utm_campaign, ref, ip, user_agent, extra, created_at "
            "FROM visitas WHERE created_at >= ? ORDER BY created_at DESC",
            (start,),
        ).fetchall()
    rows = [dict(row) for row in rows]
    pageviews = [r for r in rows if r["event"] == "pageview"]
    cliques = [r for r in rows if r["event"] == "cta_click"]

    # --- Métricas ---
    ips_unicos = {r["ip"] for r in pageviews if r["ip"]}
    resumo = {
        "visitas": len(pageviews),
        "visitantes_unicos": len(ips_unicos),
        "cliques_oferta": len(cliques),
        "ctr": round(100 * len(cliques) / len(pageviews), 2) if pageviews else 0.0,
        "checkouts": 0,  # evento de checkout ainda não instrumentado (webhooks: próxima parte)
        "vendas": 0,     # vendas chegam via webhook (próxima parte)
        "dias": days,
    }

    # --- Drenagem: IPs com cliques repetidos ---
    cliques_por_ip = {}
    for row in cliques:
        if row["ip"]:
            item = cliques_por_ip.setdefault(row["ip"], {"ip": row["ip"], "cliques": 0, "ultimo": row["created_at"], "user_agent": row["user_agent"], "eventos": 0})
            item["cliques"] += 1
            item["ultimo"] = max(item["ultimo"], row["created_at"])
            item["user_agent"] = item["user_agent"] or row["user_agent"]
    for row in pageviews:
        if row["ip"] and row["ip"] in cliques_por_ip:
            cliques_por_ip[row["ip"]]["eventos"] += 1
    drenagem = sorted(
        [v for v in cliques_por_ip.values() if v["cliques"] >= DRENAGEM_MIN_CLIQUE],
        key=lambda v: v["cliques"],
        reverse=True,
    )[:50]

    # --- Cards de visitantes (mais ativos) ---
    visitantes = []
    sample_por_ip = {}
    for row in pageviews:
        sample_por_ip.setdefault(row["ip"], row)
    for ip, info in sorted(cliques_por_ip.items(), key=lambda kv: kv[1]["cliques"], reverse=True)[:12]:
        sample = sample_por_ip.get(ip, {})
        ua = parse_user_agent(info["user_agent"] or sample.get("user_agent"))
        visitantes.append({
            "ip": ip,
            "visitor_id": visitor_id(ip),
            "cliques": info["cliques"],
            "ultimo": info["ultimo"],
            "origem": (sample.get("utm_source") or _domain(sample.get("ref")) or "Acesso direto"),
            "gclid": sample.get("gclid") or "",
            **ua,
        })
    if not visitantes:
        for ip, sample in list(sample_por_ip.items())[:6]:
            ua = parse_user_agent(sample.get("user_agent"))
            visitantes.append({
                "ip": ip,
                "visitor_id": visitor_id(ip),
                "cliques": 0,
                "ultimo": sample.get("created_at", ""),
                "origem": (sample.get("utm_source") or _domain(sample.get("ref")) or "Acesso direto"),
                "gclid": sample.get("gclid") or "",
                **ua,
            })

    # --- Donuts ---
    def aggregate(items, fallback="—"):
        counts = {}
        for item in items:
            key = item or fallback
            counts[key] = counts.get(key, 0) + 1
        return sorted(counts.items(), key=lambda kv: kv[1], reverse=True)

    origem = []
    for row in pageviews:
        origem.append(row["utm_source"] or _domain(row["ref"]) or "Acesso direto")
    dispositivos = aggregate([parse_user_agent(r["user_agent"]).get("device", "—") for r in pageviews])
    sistemas = aggregate([parse_user_agent(r["user_agent"]).get("os", "—") for r in pageviews])

    # --- Funil ---
    funil = {
        "visitas": len(pageviews),
        "cliques": len(cliques),
        "checkouts": 0,
        "vendas": 0,
        "taxas": {
            "cliques": round(100 * len(cliques) / len(pageviews), 2) if pageviews else 0,
            "checkouts": 0.0,
            "vendas": 0.0,
        },
    }

    # --- Fluxo por hora (últimas 24 janelas com dados ou 24h) ---
    por_hora = {}
    for row in pageviews:
        hora = (row["created_at"] or "")[:13]
        if hora:
            por_hora[hora] = por_hora.get(hora, 0) + 1
    fluxo = sorted(por_hora.items())[-24:]
    fluxo = [{"hora": h, "visitas": v} for h, v in fluxo]

    return {
        "resumo": resumo,
        "drenagem": drenagem,
        "visitantes": visitantes,
        "origem": aggregate(origem)[:6],
        "dispositivos": dispositivos,
        "sistemas": sistemas,
        "funil": funil,
        "fluxo": fluxo,
        "pixel_url": ((((get_settings().get("api_keys") or {}).get("tracking") or {}).get("pixel_url")) or "").strip(),
    }


def visitante(ip: str) -> dict:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM visitas WHERE ip = ? ORDER BY created_at DESC LIMIT 50",
            (ip,),
        ).fetchall()
    rows = [dict(row) for row in rows]
    if not rows:
        return {"ip": ip, "visitor_id": visitor_id(ip), "eventos": [], "primeiro": "", "ultimo": "", "payload": {}}
    first = rows[-1]
    last = rows[0]
    # Atribuição (gclid/utm/ref) vem do último PAGEVIEW; dispositivo do último evento
    last_pageview = next((r for r in rows if r["event"] == "pageview"), last)
    return {
        "ip": ip,
        "visitor_id": visitor_id(ip),
        "primeiro": first["created_at"],
        "ultimo": last["created_at"],
        "eventos": [{"event": r["event"], "page": r["page"], "created_at": r["created_at"], "gclid": r["gclid"], "ref": r["ref"]} for r in rows],
        "payload": {
            "ipv4": ip,
            "visitor_id": visitor_id(ip),
            "is_ip_blocked": False,
            "created_at": last["created_at"],
            **parse_user_agent(last["user_agent"]),
            "access_type": "humano (sem verificação de bot nesta versão)",
            "gclid": last_pageview["gclid"] or "",
            "utm_source": last_pageview["utm_source"] or "",
            "utm_medium": last_pageview["utm_medium"] or "",
            "utm_campaign": last_pageview["utm_campaign"] or "",
            "ref": last_pageview["ref"] or "",
        },
    }
