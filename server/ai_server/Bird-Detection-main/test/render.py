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

    if isinstance(result, dict) and result:  # Only process if detection results exist
        bounding_boxes = result.get("bbox", [])
        skeletals = result.get("skeletal", [])

        # Group skeletals by their bounding box id for easier lookup
        skeletals_by_box = {}
        for skel in skeletals:
            box_id = skel.get("bb_id")
            if not isinstance(box_id, str):
                continue
            skeletals_by_box.setdefault(box_id, []).extend(skel.get("keypoints", []))

        for bb in bounding_boxes:
            box_id = bb.get("bb_id")
            if not isinstance(box_id, str):
                continue

            x = int(bb.get("x_pos", 0))
            y = int(bb.get("y_pos", 0))
            w = int(bb.get("x_long", 0))
            h = int(bb.get("y_long", 0))

            # Draw bounding box
            cv2.rectangle(image, (x, y), (x + w, y + h), (0, 255, 0), 2)

            label = bb.get("category")
            if isinstance(label, str) and label:
                cv2.putText(
                    image,
                    label,
                    (x, max(0, y - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 0),
                    2,
                )

            keypoints = skeletals_by_box.get(box_id, [])
            kp_map = {
                kp.get("key_id"): kp
                for kp in keypoints
                if isinstance(kp.get("key_id"), str)
            }

            for kp in keypoints:
                try:
                    px = int(kp.get("x_pos", 0))
                    py = int(kp.get("y_pos", 0))
                except (TypeError, ValueError):
                    continue
                cv2.circle(image, (px, py), 4, (0, 0, 255), -1)

                connections = kp.get("key_points")
                if not connections:
                    continue
                for dst_id in connections:
                    dst = kp_map.get(dst_id)
                    if not dst:
                        continue
                    try:
                        p1 = (px, py)
                        p2 = (
                            int(dst.get("x_pos", 0)),
                            int(dst.get("y_pos", 0)),
                        )
                    except (TypeError, ValueError):
                        continue
                    cv2.line(image, p1, p2, (255, 0, 0), 2)


    cv2.imwrite(output_path, image)
    print(f"✅ Rendered image saved to {output_path}")
