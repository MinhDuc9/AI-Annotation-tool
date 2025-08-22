import os
import json
from PIL import Image

# === CONFIG ===
image_path = "sample.jpg"
json_path = "bird_boxes.json"
output_dir = "cropped_birds"

# Create output folder if it doesn't exist
os.makedirs(output_dir, exist_ok=True)

# Load image
image = Image.open(image_path)

# Load bounding boxes from JSON
with open(json_path, "r") as f:
    bird_boxes = json.load(f)

# Crop and save each bounding box
for idx, box_info in enumerate(bird_boxes):
    bbox = box_info["bbox"]
    x1, y1, x2, y2 = int(bbox["x1"]), int(bbox["y1"]), int(bbox["x2"]), int(bbox["y2"])
    
    # Crop the image
    cropped_img = image.crop((x1, y1, x2, y2))
    
    # Save cropped image
    output_path = os.path.join(output_dir, f"bird_{idx}.jpg")
    cropped_img.save(output_path)
    print(f"Saved {output_path}")
