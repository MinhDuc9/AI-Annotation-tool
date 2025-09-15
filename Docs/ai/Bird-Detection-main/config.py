import os

# === CONFIG ===
IMAGE_PATH = "input.jpg"  # only for testing, API will handle uploads
CROP_DIR = "cropped_birds"
SPECIES_MODEL_PATH = "models/bird_model.onnx"
POSE_MODEL_PATH = "models/yolo11n-birdpose.pt"
DETECTION_MODEL_PATH = "models/yolo11n.pt"
LABELS_PATH = "bird_info.json"

os.makedirs(CROP_DIR, exist_ok=True)

# === Keypoints Map ===
KEYPOINT_NAMES = {
    0: "back", 1: "beak", 2: "belly", 3: "breast", 4: "crown", 5: "forehead",
    6: "left eye", 7: "left leg", 8: "left wing", 9: "nape",
    10: "right eye", 11: "right leg", 12: "right wing", 13: "tail", 14: "throat"
}

# === Skeleton Edges (pairs of keypoints) ===
SKELETON_EDGES = [
    (1, 4), (4, 9), (9, 0), (0, 13),
    (2, 3), (3, 14),
    (7, 2), (11, 2),
    (8, 0), (12, 0)
]
