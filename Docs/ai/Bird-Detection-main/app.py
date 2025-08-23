from fastapi import FastAPI, UploadFile
import uvicorn
import tempfile
from pipeline import analyze_image

app = FastAPI()

@app.post("/analyze")
async def analyze(file: UploadFile):
    # Save uploaded file to a temp path
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    contents = await file.read()
    tmp.write(contents)
    tmp.close()

    # Run pipeline
    result = analyze_image(tmp.name)

    return {"results": result}

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
