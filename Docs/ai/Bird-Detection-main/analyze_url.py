import sys
import json
import tempfile
import os
import requests
from pipeline import analyze_image

def analyze_url(url: str):
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(r.content)
        tmp_path = tmp.name
    try:
        return analyze_image(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def main():
    urls = json.loads(sys.stdin.read() or "[]")
    output = []
    for url in urls:
        try:
            result = analyze_url(url)
            output.append({"url": url, "result": result})
        except Exception as e:
            output.append({"url": url, "error": str(e)})
    print(json.dumps({"results": output}))

if __name__ == "__main__":
    main()
