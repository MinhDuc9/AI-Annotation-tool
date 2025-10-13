# config.py
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

# === Skeleton (layered aesthetic) ===
# Two smooth chains + symmetric wing/leg fans, compact face links, and gentle ribs.

PRIMARY_SPINE = [  # dorsal curve beak→tail
    (1, 5), (5, 4), (4, 9), (9, 0), (0, 13)
]

VENTRAL_KEEL = [  # ventral curve beak→tail
    (1, 14), (14, 3), (3, 2), (2, 13)
]

WINGS = [  # wing fans from anchors (balanced silhouette)
    (8, 0), (12, 0),     # wings→back
    (8, 9), (12, 9),     # wings→nape
    (8, 13), (12, 13),   # wings→tail
    (8, 3), (12, 3),     # wings→breast
]

LEGS = [  # stable stance triangles
    (7, 2), (11, 2),     # legs→belly
    (7, 13), (11, 13),   # legs→tail
]

FACE = [  # tidy head contour
    (6, 5), (10, 5),     # eyes→forehead
    (6, 1), (10, 1),     # eyes→beak
    (6, 4), (10, 4),     # eyes→crown
]

RIBS = [  # gentle torso links (avoid clutter)
    (0, 3), (0, 2),      # back↔breast, back↔belly
]

# Optional cross-bracing for a stylized “graphic” look
CROSS_BRACING = [
    (6, 10),   # eye↔eye
    (8, 12),   # wing↔wing
    (7, 11),   # leg↔leg
]

# === Presets ===
SKELETON_EDGES_MINIMAL = PRIMARY_SPINE + VENTRAL_KEEL + [(8, 0), (12, 0), (7, 2), (11, 2)]
SKELETON_EDGES_RICH = PRIMARY_SPINE + VENTRAL_KEEL + WINGS + LEGS + FACE + RIBS
SKELETON_EDGES_ULTRA = PRIMARY_SPINE + VENTRAL_KEEL + WINGS + LEGS + FACE + RIBS + CROSS_BRACING

# Choose via ENV var SKELETON_STYLE in {'MINIMAL','RICH','ULTRA'}; default 'RICH'
_style = os.environ.get("SKELETON_STYLE", "RICH").upper()
if _style == "MINIMAL":
    SKELETON_EDGES = SKELETON_EDGES_MINIMAL
elif _style == "ULTRA":
    SKELETON_EDGES = SKELETON_EDGES_ULTRA
else:
    SKELETON_EDGES = SKELETON_EDGES_RICH

# === Optional: one-to-many adjacency for directed exports (key_point_to) ===
FANOUT = {
    1: [5, 14],         # beak → forehead, throat
    5: [4],             # forehead → crown
    4: [9],             # crown → nape
    9: [0, 8, 12],      # nape → back, wings
    0: [13, 3, 2, 8, 12],   # back → tail, breast, belly, wings
    14: [3],            # throat → breast
    3: [2, 8, 12],      # breast → belly, wings
    2: [13, 7, 11],     # belly → tail, legs
    6: [5, 1, 4],       # L eye → forehead, beak, crown
    10: [5, 1, 4],      # R eye → forehead, beak, crown
    7: [2, 13],         # L leg → belly, tail
    11: [2, 13],        # R leg → belly, tail
    8: [0, 9, 13, 3],   # L wing → back, nape, tail, breast
    12: [0, 9, 13, 3],  # R wing → back, nape, tail, breast
}

def fanout_to_edges(fanout: dict[int, list[int]]) -> list[tuple[int, int]]:
    """Convert one-to-many adjacency to a deduplicated directed edge list."""
    edges = set()
    for u, vs in fanout.items():
        for v in vs:
            edges.add((u, v))
    return list(edges)

# If you prefer the directed fanout as your edge source, swap as needed:
# SKELETON_EDGES = fanout_to_edges(FANOUT)
