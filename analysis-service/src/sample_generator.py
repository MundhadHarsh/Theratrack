import os
import cv2
import numpy as np

def generate_thermal_sample(
    width: int = 640,
    height: int = 480,
    left_knee_intensity: int = 150,
    right_knee_intensity: int = 155,
    quad_intensity: int = 175,
    noise_level: float = 4.0
) -> np.ndarray:
    """
    Synthesize an anatomically realistic bilateral knee thermal gradient image.
    Uses Gaussian radial temperature fields for thighs, knees, and shins.
    """
    img = np.zeros((height, width), dtype=np.float32)
    
    # Ambient background (cool)
    ambient = 45.0
    img[:] = ambient

    y, x = np.ogrid[:height, :width]

    # Bilateral leg positions
    left_center_x = int(width * 0.32)
    right_center_x = int(width * 0.68)
    knee_y = int(height * 0.58)

    # Leg silhouettes (cylindrical masks with soft falloff)
    for cx, base_k_int in [(left_center_x, left_knee_intensity), (right_center_x, right_knee_intensity)]:
        # Thigh / Quadriceps (top to knee)
        quad_y = int(height * 0.25)
        quad_mask = np.exp(-(((x - cx) / 75.0) ** 2 + ((y - quad_y) / 120.0) ** 2))
        img += quad_mask * (quad_intensity - ambient)

        # Patella / Knee Joint Core
        knee_mask = np.exp(-(((x - cx) / 55.0) ** 2 + ((y - knee_y) / 60.0) ** 2))
        img += knee_mask * (base_k_int - ambient)

        # Patellar Tendon & Shin (knee to bottom)
        shin_y = int(height * 0.82)
        shin_mask = np.exp(-(((x - cx) / 45.0) ** 2 + ((y - shin_y) / 90.0) ** 2))
        img += shin_mask * ((base_k_int - 25) - ambient)

    # Add subtle physiological vascular texture noise
    noise = np.random.normal(0, noise_level, (height, width)).astype(np.float32)
    img = img + noise

    # Clip to valid 8-bit range
    img = np.clip(img, 0, 255).astype(np.uint8)

    # Slight Gaussian smooth for continuous thermal diffusion look
    img = cv2.GaussianBlur(img, (5, 5), 0)
    return img

def create_all_samples(samples_dir: str):
    os.makedirs(samples_dir, exist_ok=True)

    samples = [
        {
            "name": "sample_knees_resting.png",
            "desc": "Bilateral Knee Resting Baseline",
            "left_k": 145,
            "right_k": 147,
            "quad": 165
        },
        {
            "name": "sample_knees_pre_exercise.png",
            "desc": "Pre-Exercise Bilateral Knee",
            "left_k": 148,
            "right_k": 150,
            "quad": 168
        },
        {
            "name": "sample_knees_post_exercise.png",
            "desc": "Post-Exercise Bilateral Knee (Active Exertion)",
            "left_k": 162,
            "right_k": 188, # Elevated right knee exertion
            "quad": 210
        },
        {
            "name": "sample_asymmetric_knee.png",
            "desc": "Asymmetric Exertion / Recovery Monitoring",
            "left_k": 195, # Unilateral left focus
            "right_k": 142,
            "quad": 180
        }
    ]

    for s in samples:
        path = os.path.join(samples_dir, s["name"])
        if not os.path.exists(path):
            img = generate_thermal_sample(
                left_knee_intensity=s["left_k"],
                right_knee_intensity=s["right_k"],
                quad_intensity=s["quad"]
            )
            cv2.imwrite(path, img)
            print(f"Generated sample thermal image: {s['name']}")

if __name__ == "__main__":
    current_dir = os.path.dirname(__file__)
    data_dir = os.path.abspath(os.path.join(current_dir, "..", "..", "data", "samples"))
    create_all_samples(data_dir)
