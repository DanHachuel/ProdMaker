"""Cliente Gamma AI (modo Premium) — melhor esforço conforme contrato do prompt mestre:
POST {base}/v1.0/generations (exportAs: "pdf") -> polling -> download do PDF.
Base URL configurável em Chaves de API (padrão https://api.gamma.app).
"""
import time


class GammaError(Exception):
    pass


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def gerar_pdf_gamma(api_key: str, base_url: str, titulo: str, prompt: str, total_timeout: float = 600.0) -> bytes:
    import httpx

    base = (base_url or "https://api.app.gamma").rstrip("/")
    started = time.time()
    with httpx.Client(timeout=60.0) as client:
        try:
            response = client.post(
                f"{base}/v1.0/generations",
                headers=_headers(api_key),
                json={"title": titulo, "prompt": prompt, "exportAs": "pdf"},
            )
        except httpx.HTTPError as exc:
            raise GammaError(f"Falha de conexão com a Gamma API: {exc}") from exc
        if response.status_code in (401, 403):
            raise GammaError("Gamma API rejeitou a chave (401/403). Confira a API key em Chaves de API.")
        if response.status_code != 200:
            raise GammaError(f"Gamma API respondeu {response.status_code}: {response.text[:300]}")
        data = response.json()
        generation_id = data.get("id") or data.get("generationId") or (data.get("data") or {}).get("id")
        if not generation_id:
            raise GammaError(f"Resposta inesperada da Gamma API (sem id): {str(data)[:300]}")

        while time.time() - started < total_timeout:
            try:
                poll = client.get(f"{base}/v1.0/generations/{generation_id}", headers=_headers(api_key))
            except httpx.HTTPError as exc:
                raise GammaError(f"Falha de conexão no polling da Gamma API: {exc}") from exc
            if poll.status_code != 200:
                raise GammaError(f"Polling Gamma API respondeu {poll.status_code}: {poll.text[:300]}")
            info = poll.json()
            status = str(info.get("status") or (info.get("data") or {}).get("status") or "").lower()
            if status in ("ready", "completed", "succeeded", "done"):
                pdf_url = (
                    info.get("pdfUrl")
                    or info.get("pdf_url")
                    or (info.get("data") or {}).get("pdfUrl")
                    or info.get("exportUrl")
                )
                if not pdf_url:
                    raise GammaError(f"Geração concluída sem URL de PDF: {str(info)[:300]}")
                file_response = client.get(pdf_url)
                if file_response.status_code != 200:
                    raise GammaError(f"Download do PDF falhou ({file_response.status_code}).")
                return file_response.content
            if status in ("failed", "error", "cancelled"):
                raise GammaError(f"Geração Gamma falhou: {str(info)[:300]}")
            time.sleep(5)
    raise GammaError("Tempo limite aguardando a Gamma API concluir a geração.")
