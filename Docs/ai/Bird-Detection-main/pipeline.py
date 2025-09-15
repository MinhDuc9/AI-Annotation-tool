# pipeline.py
import json
import cv2
import uuid
import numpy as np
import onnxruntime as ort
from ultralytics import YOLO

from config import (
    SPECIES_MODEL_PATH, POSE_MODEL_PATH, DETECTION_MODEL_PATH, LABELS_PATH,
    KEYPOINT_NAMES, SKELETON_EDGES
)

# === Load Models once (avoid reload per request) ===
yolo_detect = YOLO(DETECTION_MODEL_PATH)
pose_model = YOLO(POSE_MODEL_PATH)
species_session = ort.InferenceSession(SPECIES_MODEL_PATH)
species_input_name = species_session.get_inputs()[0].name

# Labels for species
with open(LABELS_PATH, "r", encoding="utf-8") as f:
    label_array = json.load(f)

# Preprocess consts
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _classify_species(bgr_img):
    """Run ONNX species classifier on a BGR crop image (in memory)."""
    img_resized = cv2.resize(bgr_img, (224, 224))
    img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    img_norm = (img_rgb - mean) / std
    input_tensor = np.transpose(img_norm, (2, 0, 1))[np.newaxis, :]
    output = species_session.run(None, {species_input_name: input_tensor})[0]
    pred_idx = int(np.argmax(output[0]))
    species_name = label_array[pred_idx][1]
    color_seed = hash(species_name) % 0xFFFFFF
    hex_color = "#{:02X}{:02X}{:02X}".format(
        (color_seed >> 16) & 255, (color_seed >> 8) & 255, color_seed & 255
    )
    return {"name": species_name, "color": hex_color}

def analyze_image(image_path: str):
    image_cv = cv2.imread(image_path)
    if image_cv is None:
        raise ValueError(f"Failed to read image: {image_path}")
    img_h, img_w = image_cv.shape[:2]

    # === 1) Bird detection on full image ===
    detect_results = yolo_detect([image_path])[0]
    class_names = yolo_detect.names
    bird_class_id = next(k for k, v in class_names.items() if v.lower() == "bird")

    bbox_list = []
    skeletal_list = []

    for idx, box in enumerate(detect_results.boxes):
        if int(box.cls[0]) != bird_class_id:
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(img_w - 1, x2), min(img_h - 1, y2)

        bbox_w = x2 - x1
        bbox_h = y2 - y1
        bb_id = str(uuid.uuid4())

        crop_img = image_cv[y1:y2, x1:x2]

        # === Species classification ===
        if crop_img is None or crop_img.size == 0:
            species_info = {"name": "", "color": "#000000"}
        else:
            species_info = _classify_species(crop_img)

        # Store bbox
        bbox_list.append({
            "bb_id": bb_id,
            "x": float(x1),
            "y": float(y2),
            "width": float(bbox_w),
            "height": float(bbox_h),
            "species_name": species_info["name"],
            "colour": species_info["color"]
        })

        # === Pose estimation ===
        keypoints_list = []
        if crop_img is not None and crop_img.size > 0:
            by_top = y2 - bbox_h
            pose_res = pose_model([crop_img])[0]

            if pose_res.keypoints is not None and len(pose_res.keypoints.xy) > 0:
                if pose_res.boxes is not None and pose_res.boxes.conf is not None and len(pose_res.boxes) > 0:
                    confs = pose_res.boxes.conf.detach().cpu().numpy()
                    det_idx = int(np.argmax(confs))
                else:
                    det_idx = 0

                kpts_xy = pose_res.keypoints.xy[det_idx].tolist()
                kpts_conf = pose_res.keypoints.conf[det_idx].tolist()

                kp_map = {}
                for k_id, ((kx, ky), kconf) in enumerate(zip(kpts_xy, kpts_conf)):
                    if kconf is None or kconf < 0.6:
                        continue
                    kp_uuid = str(uuid.uuid4())
                    gx = float(x1 + kx)
                    gy = float(by_top + ky)
                    kp_map[k_id] = kp_uuid
                    keypoints_list.append({
                        "key_id": kp_uuid,
                        "x": gx,
                        "y": gy,
                        "colour": species_info["color"]
                    })

                # link edges
                for (i, j) in SKELETON_EDGES:
                    if i in kp_map and j in kp_map:
                        keypoints_list.append({
                            "key_id": kp_map[i],
                            "x": next(kp["x"] for kp in keypoints_list if kp["key_id"] == kp_map[i]),
                            "y": next(kp["y"] for kp in keypoints_list if kp["key_id"] == kp_map[i]),
                            "key_point_to": kp_map[j],
                            "colour": species_info["color"]
                        })

        skeletal_list.append({
            "bb_id": bb_id,
            "keypoints": keypoints_list
        })

    # === Final output ===
    return {
        "image_id": str(uuid.uuid4()),
        "bbox": bbox_list,
        "skeletal": skeletal_list
    }