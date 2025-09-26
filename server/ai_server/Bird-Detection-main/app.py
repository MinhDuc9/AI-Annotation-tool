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
def extract_slide_entries(body_bytes: bytes, content_type: str) -> List[Dict[str, str]]:
    """
    Parse incoming payload into a list of slide references with optional ids.
    Supports:
      - {"slides": [{"slideId": "...", "url": "..."}, ...]}
      - {"urls": ["https://..."], "ids": ["..."]}
      - JSON arrays of either strings or objects with "url"
      - Fallback to scanning text for URLs
    """
    text = body_bytes.decode("utf-8", errors="ignore")
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    entries: List[Dict[str, str]] = []

    def push(url: Any, slide_id: Any = "") -> None:
        if url is None:
            return
        url_str = str(url).strip()
        if not url_str:
            return
        slide_id_str = ""
        if slide_id is not None:
            slide_id_str = str(slide_id).strip()
        entries.append({"slide_id": slide_id_str, "url": url_str})

    payload: Any = None
    if ct == "application/json":
        try:
            payload = json.loads(text)
        except Exception:
            payload = None

    if isinstance(payload, dict):
        slides_value = payload.get("slides")
        if isinstance(slides_value, list):
            for item in slides_value:
                if not isinstance(item, dict):
                    continue
                url = (
                    item.get("url")
                    or item.get("image")
                    or item.get("imageRoute")
                )
                if not url:
                    continue
                slide_id = (
                    item.get("slideId")
                    or item.get("slide_id")
                    or item.get("id")
                )
                push(url, slide_id)
            if entries:
                return entries

        urls_value = payload.get("urls")
        if urls_value is not None:
            if isinstance(urls_value, list):
                ids_value = payload.get("ids")
                for idx, url in enumerate(urls_value):
                    slide_id = None
                    if isinstance(ids_value, list) and idx < len(ids_value):
                        slide_id = ids_value[idx]
                    push(url, slide_id)
            else:
                push(urls_value)
            if entries:
                return entries

        text_value = payload.get("text")
        if text_value is not None:
            for url in URL_RE.findall(str(text_value)):
                push(url)
            if entries:
                return entries

    elif isinstance(payload, list):
        for idx, item in enumerate(payload):
            if isinstance(item, dict):
                url = (
                    item.get("url")
                    or item.get("image")
                    or item.get("imageRoute")
                )
                if not url:
                    continue
                slide_id = (
                    item.get("slideId")
                    or item.get("slide_id")
                    or item.get("id")
                    or idx
                )
                push(url, slide_id)
            else:
                push(item)
        if entries:
            return entries

    for url in URL_RE.findall(text):
        push(url)

    return entries


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


async def _analyze_single(client: httpx.AsyncClient, slide: Dict[str, str]) -> Dict[str, Any]:
    url = slide.get("url", "")
    slide_id = slide.get("slide_id", "")
    tmp_path = await download_to_temp(client, url)
    try:
        # analyze_image is likely CPU/GPU-bound; run in a thread to avoid blocking loop
        result = await run_in_threadpool(analyze_image, tmp_path)
        return {"slideId": slide_id, "url": url, "result": result}
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


async def run_pipeline(client: httpx.AsyncClient, slides: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def guarded(slide: Dict[str, str]) -> Dict[str, Any]:
        async with sem:
            try:
                return await _analyze_single(client, slide)
            except HTTPException as he:
                return {
                    "slideId": slide.get("slide_id", ""),
                    "url": slide.get("url", ""),
                    "error": he.detail,
                }
            except Exception as e:
                return {
                    "slideId": slide.get("slide_id", ""),
                    "url": slide.get("url", ""),
                    "error": str(e),
                }

    results: List[Dict[str, Any]] = []
    for slide in slides:
        # Process sequentially to avoid race conditions inside shared model instances
        results.append(await guarded(slide))
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

    slides = extract_slide_entries(body, request.headers.get("content-type", ""))
    if not slides:
        raise HTTPException(400, "No valid image references found in body.")

    results = await run_pipeline(request.app.state.http, slides)
    return {"results": results}


# --------- DEV ENTRYPOINT ---------
if __name__ == "__main__":
    # If your file is named differently, change "app:app" accordingly.
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
