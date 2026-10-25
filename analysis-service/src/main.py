import os
import json
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import cv2

from .models import (
    ProcessingOptions,
    AnalysisResponse,
    PrePostComparisonRequest,
    PrePostComparisonResponse,
    RoiSelection
)
from .processor import ThermalProcessor
from .sample_generator import create_all_samples
from contextlib import asynccontextmanager

DATA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
processor = ThermalProcessor(DATA_ROOT)

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_all_samples(os.path.join(DATA_ROOT, "samples"))
    yield

app = FastAPI(
    title="TheraTrack Thermal Analysis Service",
    description="Dedicated OpenCV & NumPy thermal image processing and ROI statistical analysis service",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "TheraTrack Thermal Analysis Service",
        "opencv_version": cv2.__version__,
        "data_root": DATA_ROOT
    }

@app.get("/samples")
def list_samples():
    """List bundled sample demonstration thermal images."""
    samples_dir = os.path.join(DATA_ROOT, "samples")
    if not os.path.exists(samples_dir):
        return []

    sample_meta = {
        "sample_knees_resting.png": {
            "title": "Bilateral Knee Resting Baseline",
            "description": "Resting anterior view with symmetrical basal thermal intensity across both knee joints.",
            "type": "resting",
            "is_demo": True
        },
        "sample_knees_pre_exercise.png": {
            "title": "Pre-Exercise Bilateral Knee",
            "description": "Baseline thermal signature recorded immediately prior to extension repetitions.",
            "type": "pre_exercise",
            "is_demo": True
        },
        "sample_knees_post_exercise.png": {
            "title": "Post-Exercise Bilateral Knee",
            "description": "Elevated thermal intensity in quadriceps and right patellar tendon following loaded repetitions.",
            "type": "post_exercise",
            "is_demo": True
        },
        "sample_asymmetric_knee.png": {
            "title": "Asymmetric Exertion / Recovery Monitoring",
            "description": "Unilateral exertion heat concentration in left knee joint area compared to right.",
            "type": "asymmetric",
            "is_demo": True
        }
    }

    files = [f for f in os.listdir(samples_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]
    result = []
    for f in files:
        meta = sample_meta.get(f, {
            "title": f,
            "description": "Bundled demonstration thermal image",
            "type": "general",
            "is_demo": True
        })
        result.append({
            "filename": f,
            "title": meta["title"],
            "description": meta["description"],
            "type": meta["type"],
            "is_demo": meta["is_demo"],
            "image_ref": f"/api/images/samples/{f}"
        })
    return result

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_image(
    file: Optional[UploadFile] = File(None),
    sample_filename: Optional[str] = Form(None),
    options_json: Optional[str] = Form(None),
    image_source: str = Form("upload")
):
    """
    Process a thermal image (either uploaded or chosen from bundled samples).
    Validates file, applies display normalization, optional noise reduction, colormapping,
    computes ROI statistics and Left/Right regional comparison.
    """
    options = ProcessingOptions()
    if options_json:
        try:
            parsed = json.loads(options_json)
            options = ProcessingOptions(**parsed)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid processing options JSON: {str(e)}")

    is_demo = False

    # Scenario A: Sample file selected
    if sample_filename:
        safe_name = os.path.basename(sample_filename)
        sample_path = os.path.join(DATA_ROOT, "samples", safe_name)
        if not os.path.exists(sample_path):
            raise HTTPException(status_code=404, detail=f"Sample file '{safe_name}' not found.")
        
        img = cv2.imread(sample_path)
        if img is None:
            raise HTTPException(status_code=400, detail="Could not read sample image.")
        filename = safe_name
        image_source = "sample"
        is_demo = True

    # Scenario B: Uploaded file
    elif file is not None:
        content = await file.read()
        valid, err, img = processor.validate_image_bytes(content, file.filename or "uploaded.png")
        if not valid or img is None:
            raise HTTPException(status_code=400, detail=err or "Invalid image file.")
        filename = file.filename or "uploaded.png"
        is_demo = False

    else:
        raise HTTPException(status_code=400, detail="Must provide either an uploaded file or sample_filename.")

    try:
        response = processor.process_thermal_image(
            img=img,
            filename=filename,
            image_source=image_source,
            options=options,
            is_demo=is_demo
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Thermal analysis failed: {str(e)}")

@app.post("/compare", response_model=PrePostComparisonResponse)
async def compare_images(request: PrePostComparisonRequest):
    """
    Compare pre-exercise and post-exercise thermal images.
    Extracts regional statistics for both images, calculates deltas,
    and returns combined side-by-side visualization.
    """
    def resolve_ref_to_path(ref: str) -> str:
        # Expected formats: /api/images/{folder}/{filename} or filename
        parts = ref.strip("/").split("/")
        if len(parts) >= 3 and parts[0] == "api" and parts[1] == "images":
            folder = parts[2]
            fname = os.path.basename(parts[3])
        elif len(parts) >= 2 and parts[0] in ["samples", "uploads", "processed"]:
            folder = parts[0]
            fname = os.path.basename(parts[1])
        else:
            folder = "processed"
            fname = os.path.basename(ref)

        if folder not in ["samples", "uploads", "processed"]:
            folder = "processed"

        path = os.path.join(DATA_ROOT, folder, fname)
        return os.path.abspath(path)

    pre_path = resolve_ref_to_path(request.pre_image_ref)
    post_path = resolve_ref_to_path(request.post_image_ref)

    if not os.path.exists(pre_path):
        raise HTTPException(status_code=404, detail=f"Pre-exercise image could not be resolved.")
    if not os.path.exists(post_path):
        raise HTTPException(status_code=404, detail=f"Post-exercise image could not be resolved.")

    try:
        cmp_response = processor.compare_pre_post(
            pre_img_path=pre_path,
            post_img_path=post_path,
            rois=request.rois,
            options=request.options
        )
        return cmp_response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pre/post comparison failed: {str(e)}")

@app.get("/images/{folder}/{filename}")
def serve_image(folder: str, filename: str):
    """Safely stream images from protected data directories (samples, uploads, processed)."""
    if folder not in ["samples", "uploads", "processed"]:
        raise HTTPException(status_code=400, detail="Invalid image category folder.")

    safe_filename = os.path.basename(filename)
    target_path = os.path.join(DATA_ROOT, folder, safe_filename)

    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Requested image was not found.")

    ext = os.path.splitext(safe_filename)[1].lower()
    media_type = "image/png"
    if ext in [".jpg", ".jpeg"]:
        media_type = "image/jpeg"
    elif ext == ".bmp":
        media_type = "image/bmp"

    return FileResponse(target_path, media_type=media_type)
