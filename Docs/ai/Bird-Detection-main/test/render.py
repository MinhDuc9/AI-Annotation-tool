import requests
import cv2
import json
import os

API_URL = "http://127.0.0.1:8000/analyze"

# === Step 1: Call API with image URLs ===
payload = {
    "image_urls": [
        "https://www.pennington.com/-/media/Project/OneWeb/Pennington/Images/headers/secondary-category/About_WildBird.jpg?h=400&iar=0&w=1920&hash=8EF437CB363EC6B78F6FB4E1EAE5A0A5",
        "https://cdn.britannica.com/10/250610-050-BC5CCDAF/Zebra-finch-Taeniopygia-guttata-bird.jpg",
        "https://www.tracyvets.com/files/Parakeets.jpeg",
        "https://th-thumbnailer.cdn-si-edu.com/lfijTnSV90UdEK01Lv0f1-pihv8=/1026x684/https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/filer/4a/9c/4a9c541a-4ee3-4844-b2c7-490530868a63/m1gr8h.jpg"
    ]
}

response = requests.post(API_URL, json=payload)
response.raise_for_status()
data = response.json()

os.makedirs("test", exist_ok=True)

with open("test/output.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("✅ API Response saved as test/output.json")

# === Step 2: Render results ===
for idx, item in enumerate(data["results"]):
    url = item["url"]
    result = item["result"]

    # Download the corresponding input image
    img_data = requests.get(url, timeout=10).content
    input_path = f"test/input_{idx}.jpg"
    output_path = f"test/output_render_{idx}.jpg"

    with open(input_path, "wb") as f:
        f.write(img_data)

    image = cv2.imread(input_path)

    if result:  # Only process if detection results exist
        for box in result:
            # bbox is a list → iterate through it
            for bb in box["bbox"]:
                x = int(bb["x"])
                y = int(bb["y"])
                w = int(bb["width"])
                h = int(bb["height"])

                # Draw bounding box
                cv2.rectangle(image, (x, y - h), (x + w, y), (0, 255, 0), 2)

                # Draw species name if available
                if "species_name" in bb:
                    cv2.putText(
                        image,
                        bb["species_name"],
                        (x, y - h - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 255, 0),
                        2,
                    )

            # Keypoints
            if "keypoints" in box:
                kp_map = {kp["id"]: kp for kp in box["keypoints"]}
                for kp in box["keypoints"]:
                    cv2.circle(image, (int(kp["x"]), int(kp["y"])), 4, (0, 0, 255), -1)

                # Skeleton edges
                for edge in box.get("skeleton", []):
                    if edge["from"] in kp_map and edge["to"] in kp_map:
                        p1 = (int(kp_map[edge["from"]]["x"]), int(kp_map[edge["from"]]["y"]))
                        p2 = (int(kp_map[edge["to"]]["x"]), int(kp_map[edge["to"]]["y"]))
                        cv2.line(image, p1, p2, (255, 0, 0), 2)


    cv2.imwrite(output_path, image)
    print(f"✅ Rendered image saved to {output_path}")
