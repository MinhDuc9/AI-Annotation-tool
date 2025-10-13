# app.py
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
import tempfile, os, mimetypes, httpx, re, json, asyncio
import uvicorn

# Your analyzer (expects a local image path and returns a dict result)
from pipeline import analyze_image

# --------- CONFIG ---------
URL_RE = re.compile(r'https?://[^\s"\'<>]+')
MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "5"))
TIMEOUT = httpx.Timeout(20.0, connect=10.0)  # seconds


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
                if "urls" in payload and isinstance(payload["urls"], list):
                    urls = [str(u) for u in payload["urls"]]
                elif "text" in payload:
                    urls = URL_RE.findall(str(payload["text"]))
        except Exception:
            # Fall back to regex if JSON parse fails
            urls = URL_RE.findall(text)
    else:
        urls = URL_RE.findall(text)

    return urls


def normalize_urls(urls: List[str]) -> List[str]:
    """Keep http/https only, strip whitespace, and deduplicate preserving order."""
    out: List[str] = []
    seen = set()
    for u in urls:
        u2 = u.strip()
        if not u2:
            continue
        if not (u2.startswith("http://") or u2.startswith("https://")):
            continue
        if u2 in seen:
            continue
        seen.add(u2)
        out.append(u2)
    return out


async def download_to_temp(client: httpx.AsyncClient, url: str) -> str:
    """Fetch image and write to a temp file; return path."""
    r = await client.get(url)
    if r.status_code != 200:
        raise HTTPException(400, f"Failed to fetch image: {url} (status {r.status_code})")
    ctype = r.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if not ctype.startswith("image/"):
        raise HTTPException(400, f"URL does not return an image (Content-Type={ctype!r}): {url}")

    # Guess extension from content-type or URL
    ext = mimetypes.guess_extension(ctype)
    if not ext:
        for cand in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"):
            if url.lower().endswith(cand):
                ext = cand
                break
    if not ext:
        ext = ".img"

    # Write to a NamedTemporaryFile
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as f:
        f.write(r.content)
        return f.name


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
            except HTTPException:
                # passthrough as a structured error
                raise
            except Exception as e:
                return {"url": u, "error": str(e)}

    tasks = [asyncio.create_task(guarded(u)) for u in urls]
    results: List[Dict[str, Any]] = []
    for t in asyncio.as_completed(tasks):
        try:
            results.append(await t)
        except HTTPException as he:
            results.append({"error": he.detail})
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
        raise HTTPException(400, "No valid http/https URLs found in body.")

    results = await run_pipeline(request.app.state.http, urls)
    return {"results": results}


# --------- DEV ENTRYPOINT ---------
if __name__ == "__main__":
    # If your file is named differently, change "app:app" accordingly.
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
