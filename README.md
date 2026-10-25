# TheraTrack: Rehabilitation Telemetry & Thermal Monitoring Prototype

A complete, full-stack clinical rehabilitation monitoring prototype engineered for tracking knee joint exercise repetitions, movement kinematics (range of motion, peak angle variability), bilateral thermal image intensity statistics, and mathematical progression against an individual's established baseline.

> **Medical Safety Notice**  
> *"TheraTrack is a rehabilitation monitoring prototype, not a diagnostic device. Its measurements are estimates and must not replace a physiotherapist's assessment."*

---

## Architecture Overview

TheraTrack is structured into three independent, decoupled components within a unified monorepo:

```
theratrack/
├── frontend/             # React + Vite + TypeScript + Tailwind CSS + Recharts
├── backend/              # Node.js + Express + TypeScript + MSSQL driver (mssql)
├── analysis-service/     # Python 3.12 + FastAPI + OpenCV + NumPy + Pillow
├── database/             # Microsoft SQL Server schema & initialization scripts
├── data/                 # Bundled thermal samples, uploads, and processed heatmaps
├── docs/                 # Architecture, ERD, API specs, and setup instructions
├── evidence/             # Empirical test logs, walkthroughs, and verification checklist
├── README.md             # System documentation & quickstart
└── .gitignore
```

### Component Responsibilities & Boundaries:
1. **React Frontend** (`http://localhost:5173`):
   - Healthcare dashboard with Recharts progress charts.
   - Webcam movement tracking via vector geometry angle estimation and a 4-state Finite-State Machine (FSM).
   - Manual tracking fallback for clinical environments without camera access.
   - Interactive thermal image analyzer with OpenCV colormaps (INFERNO, TURBO, JET) and rectangular ROI selectors.
   - Pre/post exercise thermal delta comparison.
   - Baseline comparison displays and session history with CSV/JSON export.

2. **Node.js Express Backend** (`http://localhost:5000`):
   - Secure patient registration and authentication (bcrypt password hashing, HttpOnly JWT cookies).
   - Enterprise persistence using **Microsoft SQL Server** (`TheraTrackDb`) with parameterized queries and connection pooling.
   - Session lifecycle management (start, event telemetry logging, finish metrics).
   - Genuine baseline comparison calculations (absolute differences, percentage changes, factual summaries).
   - Dedicated internal HTTP client forwarding thermal images to the Python analysis engine.

3. **Python Thermal Analysis Service** (`http://127.0.0.1:8001`):
   - Pure image processing and statistical engine powered by OpenCV and NumPy.
   - Generates processed false-color heatmaps and calculates ROI distributions (mean, median, min, max, std dev, 16-bin histograms, % above threshold).
   - Bilateral regional asymmetry calculation (Left vs Right ROI).
   - Pre/post exercise comparison pipeline generating composite visualizations and delta statistics.
   - Explicitly enforces physical temperature distinction: standard images report intensity units only, with simulated radiometric calibration supported where configured.

---

## Quickstart & Service Startup

### 1. Database Setup (Microsoft SQL Server)
Verify that the `MSSQLSERVER` Windows service is running, then execute `database/schema.sql`:
```powershell
# In PowerShell:
$sql = Get-Content -Raw -Path "database/schema.sql"
# Execute against localhost to create TheraTrackDb and all 6 tables.
```
Configure `backend/.env` with your SQL Server credentials (default: `localhost`, database: `TheraTrackDb`).

### 2. Start Python Thermal Analysis Service (Port 8001)
```powershell
cd analysis-service
pip install -r requirements.txt
python -m uvicorn src.main:app --host 127.0.0.1 --port 8001
```
Health endpoint: `http://127.0.0.1:8001/health`

### 3. Start Node.js Express Backend (Port 5000)
```powershell
cd backend
npm install
npm run build
npm run start
```
Health endpoint: `http://localhost:5000/api/health` (checks both MSSQL and Python engine connectivity).

### 4. Start React Frontend (Port 5173)
```powershell
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## Automated Test Results

### Node.js Jest Integration Suite (18 Tests Passed)
```bash
cd backend
npm test
```
- **Authentication**: Registration with bcrypt password hashing, duplicate email rejection, invalid parameter rejection, valid login, incorrect password handling, JWT cookie authorization, protected route enforcement.
- **Session Lifecycle & User Isolation**: Session creation in MSSQL, exercise event logging, finish metrics persistence, cross-user isolation verification (preventing patient B from accessing or deleting patient A's session).
- **Baseline Calculations**: Establishing baseline, calculating absolute difference and percentage change without division errors, missing data handling.
- **Dashboard & Exports**: Aggregated summary statistics, progress timeseries generation, RFC-4180 CSV export and JSON export.
- **File Validation**: Rejecting invalid image formats.

### Python Pytest Suite (8 Tests Passed)
```bash
cd analysis-service
pytest tests/ -v
```
- Valid OpenCV image processing and colormapping.
- Correct intensity-only labeling enforcement (`"Temperature unavailable — image-intensity analysis only"`).
- Calibrated temperature simulation testing.
- Invalid file rejection (empty byte streams, unsupported extensions).
- Safe boundary handling for out-of-bounds or zero-area ROIs without crashing.
- Sample demonstration retrieval and processing.

---

## Main User Demonstration Journey

1. **Register**: Navigate to `http://localhost:5173/register` and register a patient account.
2. **Seed Demonstration Telemetry**: Go to `Settings & Demo` in the sidebar and click **Seed Demonstration Dataset**. This populates 3 progressive exercise sessions across multiple days, sets an active reference baseline, and attaches OpenCV thermal analyses with `IsDemo = 1`.
3. **Inspect Dashboard**: View real-time aggregated metrics from SQL Server and 4 Recharts progress charts (Repetitions, Estimated Range of Motion, Pain & Fatigue ratings, Bilateral thermal asymmetry).
4. **Thermal Analysis (Module A)**:
   - Select bundled sample `sample_knees_resting.png` or upload a custom image.
   - Adjust colormaps (`INFERNO`, `TURBO`, `JET`), display range sliders, and ROI coordinates.
   - Click **Execute OpenCV Thermal Analysis** to view side-by-side false-color rendering and the calculated ROI distribution table.
   - Switch to the **Pre/Post Comparison** tab to analyze physiological thermal changes before and after exercise.
5. **Exercise Tracking (Module B)**:
   - Go to **New Session**, select *Seated Knee Extension*, set target reps (e.g. 10), and click **Launch Tracking Screen**.
   - Start the webcam pose estimation or run the live demo simulator to observe real-time angle readout ($90^\circ \to 168^\circ$), movement phase indicators (`FLEXED`, `EXTENDING`, `EXTENDED`, `RETURNING`), and repetition counting.
   - Switch to **Manual Fallback** mode anytime to increment reps manually with an angle slider.
   - Click **Complete Session** to save the session to SQL Server.
6. **Baseline & Progress (Module C)**:
   - Review active baseline metrics (ROM, completed reps, peak variability, pain).
   - Compare any completed session against the baseline to review computed mathematical differences and factual comparison summaries.
7. **Session History & Export (Module D)**:
   - Filter all historical sessions.
   - Click **CSV** or **JSON** on any session to download the complete clinical telemetry report.
   - View detailed individual session audit pages.

---

## Technical Documentation Links
- [System Architecture & Data Flows](file:///c:/Projects/Theratrack/docs/ARCHITECTURE.md)
- [Prerequisites & Setup Guide](file:///c:/Projects/Theratrack/docs/SETUP.md)
- [Empirical Demonstration Walkthrough & Verification Checksheet](file:///c:/Projects/Theratrack/evidence/WALKTHROUGH.md)
- [MSSQL Database Schema](file:///c:/Projects/Theratrack/database/schema.sql)
