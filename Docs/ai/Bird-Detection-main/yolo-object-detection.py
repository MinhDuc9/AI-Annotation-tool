from ultralytics import YOLO
import json

# Load a model
model = YOLO("yolo11n.pt")  # pretrained YOLO11n model

# Assume 'bird' has a class index (you can get it from model.names)
class_names = model.names  # Dictionary {class_index: class_name}
bird_class_id = None

# Find class ID for 'bird'
for cls_id, cls_name in class_names.items():
    if cls_name.lower() == "bird":
        bird_class_id = cls_id
        break

if bird_class_id is None:
    raise ValueError("No class named 'bird' found in model class names.")


# Run batched inference on a list of images
results = model(["sample.jpg"])  # return a list of Results objects

# Collect filtered boxes
bird_boxes_json = []

for result in results:
    boxes = result.boxes  # Boxes object

    for i, box in enumerate(boxes):
        cls_id = int(box.cls[0].item())
        if cls_id == bird_class_id:
            xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
            confidence = float(box.conf[0].item())
            bird_boxes_json.append({
                "class": "bird",
                "confidence": confidence,
                "bbox": {
                    "x1": xyxy[0],
                    "y1": xyxy[1],
                    "x2": xyxy[2],
                    "y2": xyxy[3]
                }
            })
    result.save()  # Save results to 'runs/detect/exp' by default
# Serialize to JSON string or save to a file
json_output = json.dumps(bird_boxes_json, indent=4)
print(json_output)

# Optionally save to file
with open("bird_boxes.json", "w") as f:
    f.write(json_output)