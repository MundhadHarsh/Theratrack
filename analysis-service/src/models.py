from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class RoiSelection(BaseModel):
    label: str = Field(default="ROI", description="Human-readable label for the ROI, e.g. Left Knee")
    x: int = Field(..., ge=0, description="Top-left X coordinate in pixels")
    y: int = Field(..., ge=0, description="Top-left Y coordinate in pixels")
    width: int = Field(..., gt=0, description="Width in pixels")
    height: int = Field(..., gt=0, description="Height in pixels")

class ProcessingOptions(BaseModel):
    colormap: str = Field(default="inferno", description="OpenCV colormap (inferno, turbo, jet, plasma, viridis, bone, hot, magma)")
    noise_reduction: bool = Field(default=True, description="Apply Gaussian noise reduction")
    blur_ksize: int = Field(default=3, description="Gaussian kernel size (odd integer >= 3)")
    min_display_intensity: int = Field(default=0, ge=0, le=255, description="Lower display clipping range (0-255)")
    max_display_intensity: int = Field(default=255, ge=0, le=255, description="Upper display clipping range (0-255)")
    threshold_percent: float = Field(default=75.0, ge=0.0, le=100.0, description="Relative intensity threshold percent")
    rois: Optional[List[RoiSelection]] = Field(default=None, description="Optional ROI selections")
    measurement_type: str = Field(default="image_intensity", description="image_intensity | calibrated_temperature")
    calibrated_temperature_params: Optional[Dict[str, float]] = Field(
        default=None, 
        description="Optional calibration params: min_temp_c, max_temp_c for simulated/radiometric matrices"
    )

class RoiStatistics(BaseModel):
    label: str
    x: int
    y: int
    width: int
    height: int
    pixel_count: int
    mean_intensity: float
    median_intensity: float
    min_intensity: float
    max_intensity: float
    std_intensity: float
    percent_above_threshold: float
    intensity_threshold_value: float
    histogram: List[int] # 16 bins
    temperature_stats: Optional[Dict[str, Any]] = None # Only populated when calibrated data exists

class RegionalComparison(BaseModel):
    roi1_label: str
    roi2_label: str
    absolute_difference: float
    signed_difference: float
    relative_percent_difference: Optional[float]
    higher_intensity_roi: str
    temperature_difference: Optional[float] = None
    interpretation: str

class AnalysisResponse(BaseModel):
    success: bool
    image_id: str
    filename: str
    width: int
    height: int
    image_source: str # 'upload' | 'sample' | 'webcam_capture'
    measurement_type: str # 'image_intensity' | 'calibrated_temperature'
    temperature_available: bool
    temperature_notice: str
    is_demo: bool
    processed_image_ref: str
    original_image_ref: str
    roi_statistics: List[RoiStatistics]
    regional_comparison: Optional[RegionalComparison] = None
    validation_warnings: List[str] = []
    histogram_bins: List[int]
    processed_timestamp: str

class PrePostComparisonRequest(BaseModel):
    pre_image_ref: str
    post_image_ref: str
    rois: Optional[List[RoiSelection]] = None
    options: Optional[ProcessingOptions] = None

class PrePostComparisonResponse(BaseModel):
    success: bool
    pre_image_ref: str
    post_image_ref: str
    pre_rois: List[RoiStatistics]
    post_rois: List[RoiStatistics]
    roi_deltas: List[Dict[str, Any]]
    summary_interpretation: str
    temperature_available: bool
    side_by_side_processed_ref: Optional[str] = None
