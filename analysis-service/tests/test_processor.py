import os
import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient

from src.main import app, DATA_ROOT
from src.processor import ThermalProcessor
from src.models import ProcessingOptions, RoiSelection

client = TestClient(app)

@pytest.fixture
def processor():
    return ThermalProcessor(DATA_ROOT)

@pytest.fixture
def sample_test_image():
    # 200x200 synthetic image with distinct left and right gradient
    img = np.zeros((200, 200), dtype=np.uint8)
    img[:, :100] = 120 # Left side
    img[:, 100:] = 180 # Right side
    return img

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "opencv_version" in data

def test_samples_endpoint():
    response = client.get("/samples")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3
    for sample in data:
        assert "filename" in sample
        assert "image_ref" in sample
        assert sample["is_demo"] is True

def test_valid_image_processing(processor, sample_test_image):
    options = ProcessingOptions(
        colormap="inferno",
        noise_reduction=True,
        rois=[
            RoiSelection(label="Left ROI", x=20, y=20, width=60, height=60),
            RoiSelection(label="Right ROI", x=120, y=20, width=60, height=60)
        ]
    )
    result = processor.process_thermal_image(sample_test_image, "test.png", "upload", options)
    assert result.success is True
    assert result.width == 200
    assert result.height == 200
    assert len(result.roi_statistics) == 2
    assert result.roi_statistics[0].mean_intensity == 120.0
    assert result.roi_statistics[1].mean_intensity == 180.0
    assert result.regional_comparison is not None
    assert result.regional_comparison.absolute_difference == 60.0
    assert result.regional_comparison.higher_intensity_roi == "Right ROI"

def test_intensity_only_labeling(processor, sample_test_image):
    # Standard image must NOT return calibrated temperature
    result = processor.process_thermal_image(sample_test_image, "test.png", "upload")
    assert result.temperature_available is False
    assert "Temperature unavailable — image-intensity analysis only." in result.temperature_notice
    assert result.roi_statistics[0].temperature_stats is None

def test_calibrated_temperature_handling(processor, sample_test_image):
    options = ProcessingOptions(
        measurement_type="calibrated_temperature",
        calibrated_temperature_params={"min_temp_c": 20.0, "max_temp_c": 40.0},
        rois=[RoiSelection(label="ROI 1", x=10, y=10, width=50, height=50)]
    )
    result = processor.process_thermal_image(sample_test_image, "test.png", "upload", options, is_demo=True)
    assert result.temperature_available is True
    assert "Calibrated temperature analysis" in result.temperature_notice
    stat = result.roi_statistics[0]
    assert stat.temperature_stats is not None
    assert stat.temperature_stats["unit"] == "°C"
    assert 20.0 <= stat.temperature_stats["mean_c"] <= 40.0

def test_invalid_file_rejection(processor):
    is_valid, err, img = processor.validate_image_bytes(b"not an image", "test.txt")
    assert is_valid is False
    assert "Unsupported file format" in err or "corrupted" in err

    is_valid, err, img = processor.validate_image_bytes(b"", "empty.png")
    assert is_valid is False

def test_empty_or_out_of_bounds_roi(processor, sample_test_image):
    options = ProcessingOptions(
        rois=[
            RoiSelection(label="Out of Bounds ROI", x=500, y=500, width=50, height=50),
            RoiSelection(label="Valid ROI", x=10, y=10, width=50, height=50)
        ]
    )
    result = processor.process_thermal_image(sample_test_image, "test.png", "upload", options)
    # The out-of-bounds ROI should be safely detected and warned without crashing
    assert len(result.validation_warnings) > 0
    assert len(result.roi_statistics) == 1
    assert result.roi_statistics[0].label == "Valid ROI"

def test_api_analyze_sample():
    response = client.post("/analyze", data={"sample_filename": "sample_knees_resting.png"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["is_demo"] is True
    assert len(data["roi_statistics"]) == 2
    assert "processed_image_ref" in data
