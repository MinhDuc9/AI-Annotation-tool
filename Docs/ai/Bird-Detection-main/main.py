import os
import json
import cv2
import numpy as np
import hashlib
from ultralytics import YOLO
import onnxruntime as ort

# === CONFIG ===
IMAGE_PATH = "input.jpg"
CROP_DIR = "cropped_birds"
SPECIES_MODEL_PATH = "bird_model.onnx"
POSE_MODEL_PATH = "yolo11n-birdpose.pt"  # pose model
DETECTION_MODEL_PATH = "yolo11n.pt"      # detection model
LABELS_PATH = "bird_info.json"

os.makedirs(CROP_DIR, exist_ok=True)

# ---------- utils ----------
def stable_color_hex(text: str) -> str:
    """Deterministic hex color from a string (stable across runs)."""
    d = hashlib.md5(text.encode("utf-8")).digest()
    return f"#{d[0]:02X}{d[1]:02X}{d[2]:02X}"

def iou_xyxy(a, b):
    """IoU for boxes in [x1,y1,x2,y2] format."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    iw = max(0, inter_x2 - inter_x1)
    ih = max(0, inter_y2 - inter_y1)
    inter = iw * ih
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    denom = area_a + area_b - inter
    return inter / denom if denom > 0 else 0.0

def get_label_name(labels, idx: int):
    """Supports labels as list[str], list[list], or dict[int->str]/dict[str->str]."""
    if isinstance(labels, dict):
        # keys may be str or int
        return labels.get(idx, labels.get(str(idx), f"class_{idx}"))
    if isinstance(labels, list):
        item = labels[idx]
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            return item[1]
        if isinstance(item, str):
            return item
    return f"class_{idx}"

# === Step 1: Bird Detection (YOLO) ===
yolo_detect = YOLO(DETECTION_MODEL_PATH)
detect_results = yolo_detect([IMAGE_PATH])[0]
class_names = yolo_detect.names

try:
    bird_class_id = next(k for k, v in class_names.items() if v.lower() == "bird")
except StopIteration:
    bird_class_id = None  # if model doesn't have "bird", keep all detections

# === Step 2: Crop Detected Birds ===
image_cv = cv2.imread(IMAGE_PATH)
if image_cv is None:
    raise FileNotFoundError(f"Could not read image at {IMAGE_PATH}")
height, width = image_cv.shape[:2]

cropped_boxes = []
if detect_results.boxes is not None and len(detect_results.boxes) > 0:
    for det_id, box in enumerate(detect_results.boxes):
        cls_id = int(box.cls[0]) if box.cls is not None else -1
        if (bird_class_id is not None) and (cls_id != bird_class_id):
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(width - 1, x2), min(height - 1, y2)
        if x2 <= x1 or y2 <= y1:
            continue

        cropped = image_cv[y1:y2, x1:x2]
        crop_path = os.path.join(CROP_DIR, f"bird_{det_id}.jpg")
        cv2.imwrite(crop_path, cropped)

        bbox_width = x2 - x1
        bbox_height = y2 - y1

        cropped_boxes.append({
            "id": det_id,
            "crop_path": crop_path,
            # Store bbox with top-left origin (x1,y1)
            "bbox": {"x": x1, "y": y1, "width": bbox_width, "height": bbox_height},
            "bbox_xyxy": [x1, y1, x2, y2],  # keep for IoU matching to pose
            "confidence": float(box.conf[0]) if box.conf is not None else None
        })
else:
    print("⚠️ No detections found in image.")

# Early out if nothing to do
if not cropped_boxes:
    with open("final_output.json", "w", encoding="utf-8") as f:
        json.dump([], f, indent=2, ensure_ascii=False)
    print("✅ Done! No birds found. Output written to final_output.json")
    raise SystemExit

# === Step 3: Species Annotation ===
with open(LABELS_PATH, "r", encoding="utf-8") as f:
    label_array = json.load(f)

# ONNX inference session (default providers)
species_session = ort.InferenceSession(SPECIES_MODEL_PATH, providers=['CPUExecutionProvider'])
input_name = species_session.get_inputs()[0].name
# Common ImageNet normalization
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

for box in cropped_boxes:
    img = cv2.imread(box["crop_path"])
    if img is None:
        # fallback to crop again from original if needed
        x1, y1, x2, y2 = box["bbox_xyxy"]
        img = image_cv[y1:y2, x1:x2]
    img_resized = cv2.resize(img, (224, 224))
    img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    img_norm = (img_rgb - mean) / std
    input_tensor = np.transpose(img_norm, (2, 0, 1))[np.newaxis, :].astype(np.float32)
    output = species_session.run(None, {input_name: input_tensor})[0]  # shape [1, C]
    pred_idx = int(np.argmax(output[0]))
    species_name = get_label_name(label_array, pred_idx)
    hex_color = stable_color_hex(species_name)
    box["species"] = {"name": species_name, "color": hex_color}

# === Step 4: Skeleton Pose Estimation (per-instance via IoU matching) ===
KEYPOINT_NAMES = {
    0: "back", 1: "beak", 2: "belly", 3: "breast", 4: "crown", 5: "forehead",
    6: "left eye", 7: "left leg", 8: "left wing", 9: "nape",
    10: "right eye", 11: "right leg", 12: "right wing", 13: "tail", 14: "throat"
}

pose_model = YOLO(POSE_MODEL_PATH)
pose_result = pose_model([IMAGE_PATH])[0]

pose_boxes_xyxy = []
pose_kpts_xy = []
pose_kpts_conf = []

if (pose_result.boxes is not None and len(pose_result.boxes) > 0 and
    pose_result.keypoints is not None and len(pose_result.keypoints.xy) == len(pose_result.boxes)):
    # Collect pose detections
    for j, pbox in enumerate(pose_result.boxes):
        px1, py1, px2, py2 = map(float, pbox.xyxy[0].tolist())
        pose_boxes_xyxy.append([px1, py1, px2, py2])
    # keypoints arrays
    k_xy = pose_result.keypoints.xy.cpu().numpy()  # shape [N, K, 2]
    k_cf = pose_result.keypoints.conf.cpu().numpy()  # shape [N, K]
    pose_kpts_xy = k_xy
    pose_kpts_conf = k_cf

# Match each cropped box to the best pose detection (by IoU)
for box in cropped_boxes:
    box["keypoints"] = []
    best_idx, best_iou = -1, 0.0
    for j, pxyxy in enumerate(pose_boxes_xyxy):
        cur_iou = iou_xyxy(box["bbox_xyxy"], pxyxy)
        if cur_iou > best_iou:
            best_iou, best_idx = cur_iou, j

    if best_idx >= 0 and best_iou > 0.1:
        k_xy = pose_kpts_xy[best_idx]     # [K,2]
        k_cf = pose_kpts_conf[best_idx]   # [K]
        # Keep points with decent confidence
        keypoints = []
        for kid, ((kx, ky), kc) in enumerate(zip(k_xy, k_cf)):
            if float(kc) < 0.6:
                continue
            keypoints.append({
                "id": int(kid),
                "name": KEYPOINT_NAMES.get(int(kid), f"kpt_{kid}"),
                "x": float(kx),
                "y": float(ky),
                "confidence": float(kc)
            })
        box["keypoints"] = keypoints

# === Step 4.5: Keypoint Linking Mechanism ===
KEYPOINT_LINKS = [
    (1, 5),   # beak -> forehead
    (5, 4),   # forehead -> crown
    (4, 9),   # crown -> nape
    (9, 0),   # nape -> back
    (0, 13),  # back -> tail
    (0, 8),   # back -> left wing
    (0, 12),  # back -> right wing
    (2, 3),   # belly -> breast
    (3, 14),  # breast -> throat
    (14, 5),  # throat -> forehead
    (2, 7),   # belly -> left leg
    (2, 11),  # belly -> right leg
    (6, 10),  # left eye -> right eye
    (6, 5),   # left eye -> forehead
    (10, 5),  # right eye -> forehead
]

for box in cropped_boxes:
    present_ids = {kp["id"] for kp in box.get("keypoints", [])}
    box["keypoint_links"] = [
        {"from": int(start), "to": int(end)}
        for (start, end) in KEYPOINT_LINKS
        if start in present_ids and end in present_ids
    ]

# Remove helper field
for box in cropped_boxes:
    box.pop("bbox_xyxy", None)

# === Step 5: Output as JSON ===
with open("final_output.json", "w", encoding="utf-8") as f:
    json.dump(cropped_boxes, f, indent=2, ensure_ascii=False)

print("✅ Done! Output written to final_output.json")
