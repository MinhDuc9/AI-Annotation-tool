import json
import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path

# === Load label list from 2D array JSON ===
with open("bird_info.json", "r") as f:
    label_array = json.load(f)  # e.g., [["001", "Sparrow"], ...]

# === Load ONNX model ===
session = ort.InferenceSession("bird_model.onnx")
input_name = session.get_inputs()[0].name

# === Constants ===
input_size = (224, 224)
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# === Load image ===
img_path = "sample.jpg"
img = cv2.imread(img_path)
if img is None:
    raise FileNotFoundError(f"Image not found: {img_path}")
img_draw = img.copy()
height, width = img.shape[:2]

# === Load bounding boxes ===
with open("bird_boxes.json", "r") as f:
    boxes = json.load(f)

# === Process each bounding box ===
for box in boxes:
    x1 = int(box["bbox"]["x1"])
    y1 = int(box["bbox"]["y1"])
    x2 = int(box["bbox"]["x2"])
    y2 = int(box["bbox"]["y2"])

    # Clamp to image bounds
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(width - 1, x2), min(height - 1, y2)

    # Crop and resize
    crop = img[y1:y2, x1:x2]
    crop_resized = cv2.resize(crop, input_size)
    crop_rgb = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2RGB)

    # Normalize to float32
    crop_array = crop_rgb.astype(np.float32) / 255.0
    crop_array = (crop_array - mean) / std

    # NHWC → NCHW → NCHW[1,3,224,224]
    input_tensor = np.transpose(crop_array, (2, 0, 1))[np.newaxis, :]

    # Inference
    output = session.run(None, {input_name: input_tensor})[0]
    pred_index = int(np.argmax(output[0]))
    species_name = label_array[pred_index][1]
    
    # Generate a unique color per species (hash-based)
    color_seed = hash(species_name) % 0xFFFFFF
    b = (color_seed & 0xFF)
    g = (color_seed >> 8) & 0xFF
    r = (color_seed >> 16) & 0xFF
    color = (b, g, r)
    hex_color = "#{:02X}{:02X}{:02X}".format(r, g, b)

    # Add specie object to output JSON
    box["specie"] = {
        "name": species_name,
        "color": hex_color
    }

    # Draw rectangle and label (thinner, smaller)
    cv2.rectangle(img_draw, (x1, y1), (x2, y2), color, 1)
    cv2.putText(img_draw, species_name, (x1, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX,
                0.4, color, 1, lineType=cv2.LINE_AA)


# === Save outputs ===
cv2.imwrite("annotated.jpg", img_draw)
with open("bird_boxes_annotated.json", "w") as f:
    json.dump(boxes, f, indent=2)

print("✅ Inference complete. Outputs saved:")
print(" - annotated.jpg")
print(" - bird_boxes_annotated.json")
