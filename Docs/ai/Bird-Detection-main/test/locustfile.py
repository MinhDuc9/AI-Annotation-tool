from locust import HttpUser, task, between
import os

IMAGE_PATH = os.path.join(os.path.dirname(__file__), "input.jpg")

class ImageUser(HttpUser):
    wait_time = between(1, 2)  # wait between requests (can tune down)

    @task
    def upload_image(self):
        with open(IMAGE_PATH, "rb") as f:
            files = {"file": ("image.jpg", f, "image/jpeg")}
            self.client.post("/analyze", files=files)
