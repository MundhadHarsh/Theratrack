import os
import uuid
import datetime
import cv2
import numpy as np
from typing import List, Tuple, Optional, Dict, Any
from .models import (
    RoiSelection,
    RoiStatistics,
    RegionalComparison,
    ProcessingOptions,
    AnalysisResponse,
    PrePostComparisonResponse
)

# Supported colormaps mapping
COLORMAP_DICT = {
    "inferno": cv2.COLORMAP_INFERNO,
    "turbo": cv2.COLORMAP_TURBO,
    "jet": cv2.COLORMAP_JET,
    "plasma": cv2.COLORMAP_PLASMA,
    "viridis": cv2.COLORMAP_VIRIDIS,
    "bone": cv2.COLORMAP_BONE,
    "hot": cv2.COLORMAP_HOT,
    "magma": cv2.COLORMAP_MAGMA,
    "cividis": cv2.COLORMAP_CIVIDIS if hasattr(cv2, "COLORMAP_CIVIDIS") else cv2.COLORMAP_INFERNO
}

class ThermalProcessor:
    def __init__(self, data_root: str):
        self.data_root = os.path.abspath(data_root)
        self.samples_dir = os.path.join(self.data_root, "samples")
        self.uploads_dir = os.path.join(self.data_root, "uploads")
        self.processed_dir = os.path.join(self.data_root, "processed")

        os.makedirs(self.samples_dir, exist_ok=True)
        os.makedirs(self.uploads_dir, exist_ok=True)
        os.makedirs(self.processed_dir, exist_ok=True)

    def validate_image_bytes(self, image_bytes: bytes, filename: str) -> Tuple[bool, Optional[str], Optional[np.ndarray]]:
        if not image_bytes or len(image_bytes) < 32:
            return False, "File is empty or corrupted.", None

        # Check file extension
        ext = os.path.splitext(filename.lower())[1]
        if ext not in [".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif"]:
            return False, f"Unsupported file format '{ext}'. Supported formats: PNG, JPG, JPEG, BMP, TIFF.", None

        # Decode image
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_UNCHANGED)
        if img is None:
            return False, "Failed to decode image data into valid pixel matrix.", None

        h, w = img.shape[:2]
        if h < 16 or w < 16:
            return False, f"Image dimensions ({w}x{h}) are too small for thermal analysis.", None

        return True, None, img

    def process_thermal_image(
        self,
        img: np.ndarray,
        filename: str,
        image_source: str,
        options: Optional[ProcessingOptions] = None,
        is_demo: bool = False
    ) -> AnalysisResponse:
        if options is None:
            options = ProcessingOptions()

        h, w = img.shape[:2]
        validation_warnings: List[str] = []

        # 1. Determine grayscale representation
        if len(img.shape) == 2:
            gray = img.copy()
        elif len(img.shape) == 3:
            if img.shape[2] == 4:
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                gray = cv2.cvtColor(img_rgb, cv2.COLOR_BGR2GRAY)
            else:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            raise ValueError("Unexpected image channel structure.")

        # 2. Display range adjustment (linear scaling / intensity windowing)
        min_disp = max(0, min(255, options.min_display_intensity))
        max_disp = max(0, min(255, options.max_display_intensity))
        if min_disp >= max_disp:
            min_disp = 0
            max_disp = 255
            validation_warnings.append("Invalid display intensity window: min >= max. Defaulting to 0-255.")

        # Clip and stretch
        clipped = np.clip(gray, min_disp, max_disp)
        if max_disp > min_disp:
            stretched = ((clipped - min_disp) / (max_disp - min_disp) * 255.0).astype(np.uint8)
        else:
            stretched = clipped.astype(np.uint8)

        # 3. Optional Noise Reduction
        if options.noise_reduction:
            ksize = options.blur_ksize
            if ksize % 2 == 0:
                ksize += 1
            ksize = max(3, min(15, ksize))
            filtered_gray = cv2.GaussianBlur(stretched, (ksize, ksize), 0)
        else:
            filtered_gray = stretched

        # 4. Color Mapping
        cmap_choice = options.colormap.lower()
        cv_cmap = COLORMAP_DICT.get(cmap_choice, cv2.COLORMAP_INFERNO)
        heatmap = cv2.applyColorMap(filtered_gray, cv_cmap)

        # 5. Default ROIs if none provided (e.g. Left Knee and Right Knee regions)
        rois_to_use = options.rois
        if not rois_to_use:
            # Place default left and right symmetrical ROIs in lower third
            roi_w = max(20, int(w * 0.22))
            roi_h = max(20, int(h * 0.28))
            y_pos = int(h * 0.45)
            left_x = int(w * 0.20)
            right_x = int(w * 0.58)

            rois_to_use = [
                RoiSelection(label="Left ROI", x=left_x, y=y_pos, width=roi_w, height=roi_h),
                RoiSelection(label="Right ROI", x=right_x, y=y_pos, width=roi_w, height=roi_h)
            ]

        # 6. Calculate ROI statistics
        roi_stats_list: List[RoiStatistics] = []
        annotated_vis = heatmap.copy()

        # Check calibrated temperature capability
        is_calibrated = (options.measurement_type == "calibrated_temperature" and options.calibrated_temperature_params is not None)
        cal_params = options.calibrated_temperature_params or {}
        min_temp_c = cal_params.get("min_temp_c", 22.0)
        max_temp_c = cal_params.get("max_temp_c", 38.0)

        for roi in rois_to_use:
            # Check if completely outside bounds
            if roi.x >= w or roi.y >= h or (roi.x + roi.width) <= 0 or (roi.y + roi.height) <= 0:
                validation_warnings.append(f"ROI '{roi.label}' ({roi.x},{roi.y},{roi.width},{roi.height}) is outside image boundaries ({w}x{h}). Skipped.")
                continue

            # Clamp coordinates to boundaries
            x1 = max(0, min(w - 1, roi.x))
            y1 = max(0, min(h - 1, roi.y))
            x2 = max(x1 + 1, min(w, roi.x + roi.width))
            y2 = max(y1 + 1, min(h, roi.y + roi.height))

            actual_w = x2 - x1
            actual_h = y2 - y1

            if actual_w <= 0 or actual_h <= 0:
                validation_warnings.append(f"ROI '{roi.label}' has invalid or empty boundaries ({roi.x}, {roi.y}, {roi.width}, {roi.height}). Skipped.")
                continue

            roi_patch = filtered_gray[y1:y2, x1:x2]
            pixel_count = int(actual_w * actual_h)

            mean_val = float(np.mean(roi_patch))
            median_val = float(np.median(roi_patch))
            min_val = float(np.min(roi_patch))
            max_val = float(np.max(roi_patch))
            std_val = float(np.std(roi_patch))

            # Threshold calculation (% above relative threshold)
            thresh_val = float(max_val * (options.threshold_percent / 100.0))
            pixels_above = int(np.sum(roi_patch >= thresh_val))
            percent_above = float((pixels_above / pixel_count) * 100.0) if pixel_count > 0 else 0.0

            # 16-bin histogram
            hist = cv2.calcHist([roi_patch], [0], None, [16], [0, 256]).flatten().tolist()
            hist_ints = [int(x) for x in hist]

            # Temperature calculation if calibrated
            temp_stats = None
            if is_calibrated:
                def to_temp(val):
                    return round(min_temp_c + (val / 255.0) * (max_temp_c - min_temp_c), 2)

                temp_stats = {
                    "mean_c": to_temp(mean_val),
                    "median_c": to_temp(median_val),
                    "min_c": to_temp(min_val),
                    "max_c": to_temp(max_val),
                    "std_c": round((std_val / 255.0) * (max_temp_c - min_temp_c), 2),
                    "unit": "°C",
                    "note": "Calibrated temperature from sensor calibration parameters."
                }

            roi_stat = RoiStatistics(
                label=roi.label,
                x=x1,
                y=y1,
                width=actual_w,
                height=actual_h,
                pixel_count=pixel_count,
                mean_intensity=round(mean_val, 2),
                median_intensity=round(median_val, 2),
                min_intensity=round(min_val, 2),
                max_intensity=round(max_val, 2),
                std_intensity=round(std_val, 2),
                percent_above_threshold=round(percent_above, 2),
                intensity_threshold_value=round(thresh_val, 2),
                histogram=hist_ints,
                temperature_stats=temp_stats
            )
            roi_stats_list.append(roi_stat)

            # Draw visual bounding box and label on annotated visualization
            box_color = (0, 255, 255) if "left" in roi.label.lower() else (255, 128, 0)
            cv2.rectangle(annotated_vis, (x1, y1), (x2, y2), box_color, 2)
            label_text = f"{roi.label}: mean={roi_stat.mean_intensity}"
            cv2.putText(
                annotated_vis,
                label_text,
                (x1, max(18, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )

        # 7. Regional Comparison (between first two ROIs, typically Left vs Right)
        regional_comp: Optional[RegionalComparison] = None
        if len(roi_stats_list) >= 2:
            r1 = roi_stats_list[0]
            r2 = roi_stats_list[1]
            abs_diff = round(abs(r1.mean_intensity - r2.mean_intensity), 2)
            signed_diff = round(r1.mean_intensity - r2.mean_intensity, 2)
            rel_pct = None
            if r2.mean_intensity > 0.001:
                rel_pct = round(((r1.mean_intensity - r2.mean_intensity) / r2.mean_intensity) * 100.0, 2)

            higher = r1.label if r1.mean_intensity >= r2.mean_intensity else r2.label
            temp_diff = None
            if is_calibrated and r1.temperature_stats and r2.temperature_stats:
                temp_diff = round(abs(r1.temperature_stats["mean_c"] - r2.temperature_stats["mean_c"]), 2)

            interp = f"Absolute regional mean difference: {abs_diff} intensity units. Higher in {higher}."
            if rel_pct is not None:
                interp += f" Relative difference: {abs(rel_pct)}%."
            if temp_diff is not None:
                interp += f" Calibrated regional temperature difference: {temp_diff}°C."

            regional_comp = RegionalComparison(
                roi1_label=r1.label,
                roi2_label=r2.label,
                absolute_difference=abs_diff,
                signed_difference=signed_diff,
                relative_percent_difference=rel_pct,
                higher_intensity_roi=higher,
                temperature_difference=temp_diff,
                interpretation=interp
            )

        # 8. Save Processed Image
        unique_id = str(uuid.uuid4())[:12]
        processed_filename = f"proc_{unique_id}.png"
        processed_filepath = os.path.join(self.processed_dir, processed_filename)
        cv2.imwrite(processed_filepath, annotated_vis)

        # Save Original Image as well for consistent side-by-side reference
        orig_filename = f"orig_{unique_id}.png"
        orig_filepath = os.path.join(self.uploads_dir, orig_filename)
        cv2.imwrite(orig_filepath, img)

        # Construct temperature notice
        if is_calibrated:
            temp_notice = "Calibrated temperature analysis (Simulated Sensor Model)" if is_demo else "Calibrated temperature analysis"
        else:
            temp_notice = "Temperature unavailable — image-intensity analysis only."

        # Histogram global bins representation (0-255 divided into 16 bins)
        bins = [int(i * 16) for i in range(16)]

        return AnalysisResponse(
            success=True,
            image_id=unique_id,
            filename=filename,
            width=w,
            height=h,
            image_source=image_source,
            measurement_type="calibrated_temperature" if is_calibrated else "image_intensity",
            temperature_available=is_calibrated,
            temperature_notice=temp_notice,
            is_demo=is_demo,
            processed_image_ref=f"/api/images/processed/{processed_filename}",
            original_image_ref=f"/api/images/uploads/{orig_filename}",
            roi_statistics=roi_stats_list,
            regional_comparison=regional_comp,
            validation_warnings=validation_warnings,
            histogram_bins=bins,
            processed_timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
        )

    def compare_pre_post(
        self,
        pre_img_path: str,
        post_img_path: str,
        rois: Optional[List[RoiSelection]] = None,
        options: Optional[ProcessingOptions] = None
    ) -> PrePostComparisonResponse:
        if not os.path.exists(pre_img_path) or not os.path.exists(post_img_path):
            raise FileNotFoundError("One or both images for pre/post comparison could not be found.")

        pre_img = cv2.imread(pre_img_path)
        post_img = cv2.imread(post_img_path)

        if pre_img is None or post_img is None:
            raise ValueError("Failed to read image files.")

        if options is None:
            options = ProcessingOptions(rois=rois)
        else:
            options.rois = rois

        pre_res = self.process_thermal_image(pre_img, "pre_exercise.png", "pre_exercise", options)
        post_res = self.process_thermal_image(post_img, "post_exercise.png", "post_exercise", options)

        # Calculate deltas per ROI matching label
        deltas: List[Dict[str, Any]] = []
        post_by_label = {r.label: r for r in post_res.roi_statistics}

        for pre_r in pre_res.roi_statistics:
            post_r = post_by_label.get(pre_r.label)
            if post_r:
                mean_delta = round(post_r.mean_intensity - pre_r.mean_intensity, 2)
                max_delta = round(post_r.max_intensity - pre_r.max_intensity, 2)
                pct_delta = round(post_r.percent_above_threshold - pre_r.percent_above_threshold, 2)
                
                temp_delta = None
                if pre_r.temperature_stats and post_r.temperature_stats:
                    temp_delta = round(post_r.temperature_stats["mean_c"] - pre_r.temperature_stats["mean_c"], 2)

                deltas.append({
                    "label": pre_r.label,
                    "pre_mean_intensity": pre_r.mean_intensity,
                    "post_mean_intensity": post_r.mean_intensity,
                    "mean_intensity_delta": mean_delta,
                    "pre_max_intensity": pre_r.max_intensity,
                    "post_max_intensity": post_r.max_intensity,
                    "max_intensity_delta": max_delta,
                    "pre_percent_above_threshold": pre_r.percent_above_threshold,
                    "post_percent_above_threshold": post_r.percent_above_threshold,
                    "percent_above_threshold_delta": pct_delta,
                    "temperature_delta_c": temp_delta
                })

        # Generate side-by-side comparison image
        pre_vis_path = os.path.join(self.processed_dir, os.path.basename(pre_res.processed_image_ref))
        post_vis_path = os.path.join(self.processed_dir, os.path.basename(post_res.processed_image_ref))

        side_by_side_ref = None
        if os.path.exists(pre_vis_path) and os.path.exists(post_vis_path):
            img_a = cv2.imread(pre_vis_path)
            img_b = cv2.imread(post_vis_path)
            if img_a is not None and img_b is not None:
                # Resize to match height if needed
                h_target = min(img_a.shape[0], img_b.shape[0])
                wa = int(img_a.shape[1] * (h_target / img_a.shape[0]))
                wb = int(img_b.shape[1] * (h_target / img_b.shape[0]))
                res_a = cv2.resize(img_a, (wa, h_target))
                res_b = cv2.resize(img_b, (wb, h_target))

                # Add labels: Pre-Exercise / Post-Exercise
                cv2.putText(res_a, "PRE-EXERCISE", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                cv2.putText(res_b, "POST-EXERCISE", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

                side_by_side = cv2.hconcat([res_a, res_b])
                cmp_id = f"cmp_{uuid.uuid4().hex[:10]}.png"
                cmp_path = os.path.join(self.processed_dir, cmp_id)
                cv2.imwrite(cmp_path, side_by_side)
                side_by_side_ref = f"/api/images/processed/{cmp_id}"

        summary = f"Pre-to-post exercise comparison completed for {len(deltas)} ROI(s)."
        if deltas:
            avg_delta = np.mean([d["mean_intensity_delta"] for d in deltas])
            summary += f" Average ROI intensity change: {round(avg_delta, 2)} intensity units."

        return PrePostComparisonResponse(
            success=True,
            pre_image_ref=pre_res.processed_image_ref,
            post_image_ref=post_res.processed_image_ref,
            pre_rois=pre_res.roi_statistics,
            post_rois=post_res.roi_statistics,
            roi_deltas=deltas,
            summary_interpretation=summary,
            temperature_available=pre_res.temperature_available,
            side_by_side_processed_ref=side_by_side_ref
        )
