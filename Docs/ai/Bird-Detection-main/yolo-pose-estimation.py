from ultralytics import YOLO
import cv2
import json
import os

# Keypoint ID to name mapping
KEYPOINT_NAMES = {
    0: "back",
    1: "beak",
    2: "belly",
    3: "breast",
    4: "crown",
    5: "forehead",
    6: "left eye",
    7: "left leg",
    8: "left wing",
    9: "nape",
    10: "right eye",
    11: "right leg",
    12: "right wing",
    13: "tail",
    14: "throat"
}

# Only show labels for these keypoints
LABELED_NAMES = {
    "beak", "belly", "left eye", "right eye",
    "left wing", "right wing", "nape", "throat",
    "tail", "left leg", "right leg"
}

# Define skeleton connections (pairs of keypoint indices)
SKELETON = [
    (1, 6), (1, 10),  # beak to eyes
    (6, 5), (10, 5),  # eyes to forehead
    (5, 4), (4, 9),   # forehead to nape
    (9, 0), (0, 13),  # nape to back to tail
    (0, 2), (2, 3),   # back to belly to breast
    (3, 14),          # breast to throat
    (7, 2), (11, 2),  # legs to belly
    (8, 0), (12, 0)   # wings to back
]

# Load YOLO pose model
model = YOLO("yolo11n-birdpose.pt")

# Input image
image_path = "pose-example.webp"
image = cv2.imread(image_path)

# Run inference
results = model([image_path])
output_data = {
    "image": os.path.basename(image_path),
    "keypoints": []
}

# Process only the first result (one bird)
result = results[0]
keypoints = result.keypoints

if keypoints is not None and len(keypoints.xy) > 0:
    person = keypoints.xy[0]           # shape: (num_keypoints, 2)
    confidences = keypoints.conf[0]    # shape: (num_keypoints,)
    points = {}  # index -> (x, y)

    for i, ((x, y), conf) in enumerate(zip(person.tolist(), confidences.tolist())):
        name = KEYPOINT_NAMES.get(i, f"keypoint_{i}")
        if conf < 0.6:
            continue  # skip low-confidence keypoints

        x_int, y_int = int(x), int(y)

        # Draw small circle
        cv2.circle(image, (x_int, y_int), radius=4, color=(0, 255, 0), thickness=-1)

        # Draw label if it's a selected one
        if name in LABELED_NAMES:
            cv2.putText(image, name, (x_int + 8, y_int - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), thickness=1)

        # Save for skeleton and JSON
        points[i] = (x_int, y_int)
        connected_to = [b for a, b in SKELETON if a == i] + [a for a, b in SKELETON if b == i]
        output_data["keypoints"].append({
            "id": i,
            "name": name,
            "x": float(x),
            "y": float(y),
            "confidence": float(conf),
            "pointers": connected_to

        })

    # Draw skeleton lines between confident keypoints
    for a, b in SKELETON:
        if a in points and b in points:
            pt1, pt2 = points[a], points[b]
            cv2.line(image, pt1, pt2, color=(255, 0, 0), thickness=1, lineType=cv2.LINE_AA)

# Save output image
output_image_path = "pose_output.jpg"
cv2.imwrite(output_image_path, image)

# Save output JSON
output_json_path = "pose_output.json"
with open(output_json_path, "w") as f:
    json.dump(output_data, f, indent=2)

# Preview in fullscreen while preserving aspect ratio
screen_res = (1920, 1080)  # You can detect this dynamically if needed
img_h, img_w = image.shape[:2]
scale = min(screen_res[0] / img_w, screen_res[1] / img_h)
preview = cv2.resize(image, (int(img_w * scale), int(img_h * scale)))

cv2.namedWindow("Pose Preview", cv2.WINDOW_NORMAL)
cv2.imshow("Pose Preview", preview)
cv2.waitKey(0)
cv2.destroyAllWindows()

print(f"Saved image: {output_image_path}")
print(f"Saved JSON: {output_json_path}")
