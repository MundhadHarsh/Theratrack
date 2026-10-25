# TheraTrack Setup & Execution Guide

## Prerequisites

1. **Node.js**: v18+ (tested with v24.18.0)
2. **Microsoft SQL Server**: 2019, 2022, or LocalDB (running on default port 1433)
3. **Python**: 3.11+ (tested with Python 3.12.10)
4. **Package Managers**: `npm` and `pip`

---

## 1. Microsoft SQL Server Setup

1. Ensure the `MSSQLSERVER` Windows service is running:
   ```powershell
   Get-Service -Name MSSQLSERVER
   ```
2. Apply the database schema script:
   ```powershell
   # Open database/schema.sql in SQL Server Management Studio (SSMS) or execute via sqlcmd / PowerShell:
   $sql = Get-Content -Raw -Path "database/schema.sql"
   # Executes against localhost creating TheraTrackDb and all 6 tables.
   ```
3. A dedicated login `theratrack_user` with password `TheraTrackPassword123!` was granted `db_owner` permissions.
4. Verify backend `.env` configuration:
   ```env
   DB_SERVER=localhost
   DB_PORT=1433
   DB_NAME=TheraTrackDb
   DB_USER=theratrack_user
   DB_PASSWORD=TheraTrackPassword123!
   DB_ENCRYPT=false
   DB_TRUST_SERVER_CERTIFICATE=true
   ```

---

## 2. Python Thermal Analysis Service Setup

1. Install Python dependencies:
   ```powershell
   cd analysis-service
   pip install -r requirements.txt
   ```
2. Generate bundled sample demonstration thermal images:
   ```powershell
   python src/sample_generator.py
   ```
3. Start the FastAPI microservice on port 8001:
   ```powershell
   python -m uvicorn src.main:app --host 127.0.0.1 --port 8001
   ```
4. Check health at `http://127.0.0.1:8001/health`.

---

## 3. Node.js Main Backend Setup

1. Install Node.js dependencies:
   ```powershell
   cd backend
   npm install
   ```
2. Build the TypeScript bundle:
   ```powershell
   npm run build
   ```
3. Start the Express server on port 5000:
   ```powershell
   npm run start
   ```
4. Check health at `http://localhost:5000/api/health`.

---

## 4. React Frontend Setup

1. Install frontend dependencies:
   ```powershell
   cd frontend
   npm install
   ```
2. Start the Vite development server on port 5173:
   ```powershell
   npm run dev
   ```
3. Open your browser at `http://localhost:5173`.

---

## 5. Running Automated Tests

### Python Pytest Suite:
```powershell
cd analysis-service
pytest tests/ -v
# Executes 8 unit and integration tests covering:
# - Valid image processing & OpenCV colormapping
# - Intensity-only labeling checks
# - Calibrated temperature simulation
# - File validation & out-of-bounds ROI handling
# - Health and sample endpoints
```

### Node.js Jest Suite:
```powershell
cd backend
npm test
# Executes 18 integration tests against Microsoft SQL Server:
# - User registration, password hashing (bcrypt), and login
# - JWT authentication protection & user isolation
# - Session lifecycle, event logging, and finish metrics persistence
# - Baseline creation and mathematical comparisons without division errors
# - Dashboard statistics and timeseries progress aggregation
# - File upload validation
```
