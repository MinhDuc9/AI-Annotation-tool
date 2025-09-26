# app.py
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
from pathlib import Path
import tempfile, os, mimetypes, httpx, re, json, asyncio, shutil
import uvicorn

# Your analyzer (expects a local image path and returns a dict result)
from pipeline import analyze_image

# --------- CONFIG ---------
URL_RE = re.compile(r'https?://[^\s"\'<>]+')
MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "5"))
TIMEOUT = httpx.Timeout(20.0, connect=10.0)  # seconds
LOCAL_STATIC_PREFIX = os.getenv("LOCAL_STATIC_PREFIX", "/uploads/")
_DEFAULT_UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"
LOCAL_IMAGE_ROOT = Path(os.getenv("LOCAL_IMAGE_ROOT", str(_DEFAULT_UPLOAD_ROOT))).resolve()


# --------- HELPERS ---------
def extract_urls(body_bytes: bytes, content_type: str) -> List[str]:
    """
    Extract URLs from JSON or fallback to regex on raw text.
    Accepts:
      - JSON array of urls: ["https://...","https://..."]
      - JSON object: {"urls":[...]} or {"text":"..."}
      - Any other content: scan raw text for URLs
    """
    text = body_bytes.decode("utf-8", errors="ignore")
    ct = (content_type or "").split(";", 1)[0].strip().lower()

    urls: List[str] = []
    if ct == "application/json":
        try:
            payload = json.loads(text)
            if isinstance(payload, list):
                urls = [str(u) for u in payload]
            elif isinstance(payload, dict):
                if "urls" in payload:
                    value = payload["urls"]
                    if isinstance(value, list):
                        urls = [str(u) for u in value]
                    else:
                        urls = [str(value)]
                elif "text" in payload:
                    urls = URL_RE.findall(str(payload["text"]))
        except Exception:
            # Fall back to regex if JSON parse fails
            urls = URL_RE.findall(text)
    else:
        urls = URL_RE.findall(text)

    return urls


def normalize_urls(urls: List[str]) -> List[str]:
    """Strip whitespace and deduplicate while preserving order."""
    out: List[str] = []
    seen = set()
    for u in urls:
        u2 = u.strip()
        if not u2:
            continue
        if u2 in seen:
            continue
        seen.add(u2)
        out.append(u2)
    return out


def _resolve_local_path(resource: str) -> Optional[Path]:
    if resource.startswith("file://"):
        return Path(resource[7:])

    candidate = Path(resource)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    rel = resource
    if LOCAL_STATIC_PREFIX and resource.startswith(LOCAL_STATIC_PREFIX):
        rel = resource[len(LOCAL_STATIC_PREFIX) :]
    rel = rel.lstrip("/")
    if rel.startswith("uploads/"):
        rel = rel[len("uploads/") :]
    if not rel:
        return None

    return (LOCAL_IMAGE_ROOT / rel).resolve()


async def download_to_temp(client: httpx.AsyncClient, resource: str) -> str:
    """Fetch remote image or copy local image into a temp file and return the path."""
    if resource.startswith("http://") or resource.startswith("https://"):
        r = await client.get(resource)
        if r.status_code != 200:
            raise HTTPException(
                400,
                f"Failed to fetch image: {resource} (status {r.status_code})",
            )
        ctype = r.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if not ctype.startswith("image/"):
            raise HTTPException(
                400,
                f"URL does not return an image (Content-Type={ctype!r}): {resource}",
            )

        ext = mimetypes.guess_extension(ctype)
        if not ext:
            for cand in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"):
                if resource.lower().endswith(cand):
                    ext = cand
                    break
        if not ext:
            ext = ".img"

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as f:
            f.write(r.content)
            return f.name

    local_path = _resolve_local_path(resource)
    if not local_path or not local_path.exists():
        raise HTTPException(400, f"Local image not found: {resource}")

    ext = local_path.suffix or ".img"
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp, local_path.open("rb") as src:
        shutil.copyfileobj(src, tmp)
        return tmp.name


async def _analyze_single(client: httpx.AsyncClient, url: str) -> Dict[str, Any]:
    tmp_path = await download_to_temp(client, url)
    try:
        # analyze_image is likely CPU/GPU-bound; run in a thread to avoid blocking loop
        result = await run_in_threadpool(analyze_image, tmp_path)
        return {"url": url, "result": result}
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


async def run_pipeline(client: httpx.AsyncClient, urls: List[str]) -> List[Dict[str, Any]]:
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def guarded(u: str) -> Dict[str, Any]:
        async with sem:
            try:
                return await _analyze_single(client, u)
            except HTTPException as he:
                return {"url": u, "error": he.detail}
            except Exception as e:
                return {"url": u, "error": str(e)}

    tasks = [asyncio.create_task(guarded(u)) for u in urls]
    results: List[Dict[str, Any]] = []
    for t in asyncio.as_completed(tasks):
        results.append(await t)
    return results


# --------- APP LIFESPAN ---------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create a single shared httpx client
    # Use conservative connection limits to avoid "Limits.__init__" signature issues
    limits = httpx.Limits(
        max_connections=max(10, MAX_CONCURRENCY * 2),
        max_keepalive_connections=max(5, MAX_CONCURRENCY),
        keepalive_expiry=30.0,
    )
    client = httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, limits=limits)
    app.state.http = client
    try:
        yield
    finally:
        await client.aclose()


app = FastAPI(title="Bird Pose Pipeline API", version="1.0.0", lifespan=lifespan)


# --------- ROUTES ---------
@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(request: Request):
    body = await request.body()
    if not body:
        raise HTTPException(400, "Empty request body.")

    urls = normalize_urls(extract_urls(body, request.headers.get("content-type", "")))
    if not urls:
        raise HTTPException(400, "No valid image references found in body.")

    results = await run_pipeline(request.app.state.http, urls)
    return {"results": results}


# --------- DEV ENTRYPOINT ---------
if __name__ == "__main__":
    # If your file is named differently, change "app:app" accordingly.
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
