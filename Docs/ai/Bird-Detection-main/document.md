Each Image will return an object with general format like this

[image_id,
bbox,
skeletal]

for the bounding box object:
bbox [

{bb_id: uuid
x: float
y: float
width: float
height: float
species_name: string
colour: string
}, ...

]

for the skeletal object
skeletal [
bb_id: uuid,
keypoints: {
key_id: uuid, -> key id (id tu cua keypoint nay noi voi keypoint khac)
x: float,
y: float,
key_point_to: key_id, ( keypoint destination)
colour: string
},...

]