import asyncio
import httpx
import time

IMAGE_PATH = "test/input.jpg"
URL = "http://localhost:8000/analyze"
TOTAL_REQUESTS = 100
MAX_CONCURRENCY = 5  # run 5 parallel at a time

async def upload_image(client, image_path, sem):
    async with sem:  # limit concurrency
        with open(image_path, "rb") as f:
            files = {"file": ("image.jpg", f, "image/jpeg")}
            start = time.perf_counter()
            response = await client.post(URL, files=files)
            elapsed = time.perf_counter() - start
            return response.status_code, elapsed

async def main():
    sem = asyncio.Semaphore(MAX_CONCURRENCY)
    async with httpx.AsyncClient(timeout=60.0) as client:  # 60s per request
        tasks = [upload_image(client, IMAGE_PATH, sem) for _ in range(TOTAL_REQUESTS)]

        start_all = time.perf_counter()
        results = await asyncio.gather(*tasks)
        total_time = time.perf_counter() - start_all

    success = sum(1 for status, _ in results if status == 200)
    avg_time = sum(elapsed for _, elapsed in results) / len(results)

    print(f"Total requests: {TOTAL_REQUESTS}")
    print(f"Successful: {success}")
    print(f"Average response time: {avg_time:.2f} sec")
    print(f"Total elapsed wall time: {total_time:.2f} sec")

if __name__ == "__main__":
    asyncio.run(main())
