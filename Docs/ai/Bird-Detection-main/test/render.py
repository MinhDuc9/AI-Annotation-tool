import requests
import cv2
import json

API_URL = "http://127.0.0.1:8000/analyze"

# === Step 1: Call API ===
with open("test/input.jpg", "rb") as f:
    response = requests.post(API_URL, files={"file": f})

data = response.json()
print("✅ API Response saved as output.json")

with open("test/output.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

# === Step 2: Render on image ===
image = cv2.imread("test/input.jpg")

for box in data["results"]:
    # Draw bounding box
    x, y, w, h = box["bbox"].values()
    cv2.rectangle(image, (x, y - h), (x + w, y), (0, 255, 0), 2)

    # Draw keypoints
    kp_map = {kp["id"]: kp for kp in box["keypoints"]}
    for kp in box["keypoints"]:
        cv2.circle(image, (int(kp["x"]), int(kp["y"])), 4, (0, 0, 255), -1)

    # Draw skeleton edges
    for edge in box["skeleton"]:
        if edge["from"] in kp_map and edge["to"] in kp_map:
            p1 = (int(kp_map[edge["from"]]["x"]), int(kp_map[edge["from"]]["y"]))
            p2 = (int(kp_map[edge["to"]]["x"]), int(kp_map[edge["to"]]["y"]))
            cv2.line(image, p1, p2, (255, 0, 0), 2)

cv2.imwrite("test/output_render.jpg", image)
print("✅ Rendered image saved to test/output_render.jpg")
