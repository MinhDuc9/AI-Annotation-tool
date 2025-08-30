from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from typing import List, Dict
import tempfile, os, mimetypes, httpx, re, json
import uvicorn
from pipeline import analyze_image

app = FastAPI()
URL_RE = re.compile(r'https?://[^\s"\'<>]+')

async def download_to_temp(url: str) -> str:
    timeout = httpx.Timeout(20.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        r = await client.get(url)
    if r.status_code != 200:
        raise HTTPException(400, f"Failed to fetch image: {url} (status {r.status_code})")
    ctype = r.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if not ctype.startswith("image/"):
        raise HTTPException(400, f"URL does not return an image (Content-Type={ctype!r}): {url}")
    ext = mimetypes.guess_extension(ctype) or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(r.content); tmp.flush()
    finally:
        tmp.close()
    return tmp.name

def normalize_urls(urls: List[str]) -> List[str]:
    cleaned = []
    for u in urls:
        u = (u or "").strip()
        if not u or u.startswith("#"):  # ignore comments/empties
            continue
        if not u.lower().startswith(("http://", "https://")):
            raise HTTPException(400, f"Invalid URL (must start with http:// or https://): {u}")
        if u not in cleaned:
            cleaned.append(u)
    return cleaned

def extract_urls(body_bytes: bytes, content_type: str) -> List[str]:
    text = body_bytes.decode("utf-8", errors="ignore")
    # Try JSON first if header says JSON
    if content_type == "application/json":
        try:
            payload = json.loads(text)
            if isinstance(payload, dict):
                urls = []
                if isinstance(payload.get("url"), str):
                    urls += URL_RE.findall(payload["url"])
                if isinstance(payload.get("urls"), list):
                    urls += [str(x) for x in payload["urls"]]
                if isinstance(payload.get("image_urls"), list):
                    urls += [str(x) for x in payload["image_urls"]]
                if urls:
                    return urls
            elif isinstance(payload, str):
                found = URL_RE.findall(payload)
                if found:
                    return found
            # If JSON parsed but no URLs found, fall through to regex on raw text
        except Exception:
            # Invalid JSON – fall back to regex on raw text
            pass
    # Plain text (or invalid JSON): pull any urls via regex
    return URL_RE.findall(text)

@app.post("/analyze")
async def analyze(request: Request):
    content_type = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
    body = await request.body()
    if not body:
        raise HTTPException(400, "Empty request body.")
    urls = normalize_urls(extract_urls(body, content_type))
    if not urls:
        raise HTTPException(400, "No valid http/https URLs found in body.")

    results: List[Dict] = []
    for u in urls:
        tmp_path = None
        try:
            tmp_path = await download_to_temp(u)
            res = await run_in_threadpool(analyze_image, tmp_path)
            results.append({"url": u, "result": res})
        except HTTPException as e:
            results.append({"url": u, "error": e.detail})
        except Exception as e:
            results.append({"url": u, "error": f"Unexpected error: {e}"})
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try: os.remove(tmp_path)
                except OSError: pass
    return {"results": results}

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
