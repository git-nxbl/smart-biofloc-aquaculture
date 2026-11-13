# Project Handover and Viva Defense Guide

**Project Title:** Smart Aquaculture Water Quality Management System for Zero-Water-Exchange Biofloc Technology  
**Academic Target:** APJ Abdul Kalam Technological University (KTU) B.Tech Computer Science & Engineering (S7/S8)  
**Student Software Role:** Software Architecture, Time-Series Ingestion, ML Forecasting, Concept Drift Detection, Real-Time Web Dashboard  
**Status:** Audit Complete, Software Verification Passed (27/27 Tests), ML Evaluated on Synthetic Held-Out Data  

---

## 1. Executive Summary

This project delivers a **containerized, software-first water quality monitoring and predictive management platform** engineered specifically for **Zero-Water-Exchange Biofloc Technology (BFT)**. 

In intensive biofloc systems, high microbial density consumes substantial oxygen while breaking down toxic nitrogenous waste. A mechanical aerator failure can trigger severe hypoxia within 1 to 2 hours if aeration is lost. This platform addresses this operational challenge by:
1. Simulating coupled biophysical water quality dynamics (DO, TAN, pH, Temperature) using Euler-Maruyama stochastic differential equations informed by literature relationships and operational scenarios.
2. Ingesting telemetry via asynchronous MQTT and direct edge HTTP webhooks.
3. Persisting high-frequency readings in QuestDB (a column-oriented time-series database).
4. Streaming real-time sensor updates to a React TypeScript dashboard via Server-Sent Events (SSE).
5. Forecasting Dissolved Oxygen 2 hours in advance using a LightGBM quantile regression pipeline, achieving a **69.64% RMSE reduction relative to naive persistence** on synthetic held-out data (noting that the diurnal mean baseline achieved slightly lower RMSE on this synthetic test set).
6. Monitoring changes in the streaming distribution of true 2-hour forecast residuals using the **ADWIN (Adaptive Windowing)** algorithm to flag distributional shifts during operational disturbances.

---

## 2. Quickstart Runbook

### 2.1 Prerequisites
- **Operating System:** macOS (Apple Silicon or Intel), Linux (Ubuntu 22.04+), or Windows 11 with WSL2.
- **Docker:** Docker Engine 24.0+ and Docker Compose v2.20+.
- **Ports Required:** `1883`, `3000`, `8000`, `9000`, `9009`.

### 2.2 Launching the Stack
From the project root directory, run:
```bash
# 1. Build and start all 7 containers in detached mode
docker compose up -d

# 2. Verify all services are running and healthy
docker compose ps
```

Expected output:
```text
NAME                    IMAGE                          STATUS                   PORTS
aquaculture_backend     aquaculture-backend:latest     Up (healthy)             0.0.0.0:8000->8000/tcp
aquaculture_frontend    aquaculture-frontend:latest    Up (healthy)             0.0.0.0:3000->80/tcp
aquaculture_ml          aquaculture-ml:latest          Up                       
aquaculture_mosquitto   eclipse-mosquitto:2.0          Up (healthy)             0.0.0.0:1883->1883/tcp, 0.0.0.0:9001->9001/tcp
aquaculture_questdb     questdb/questdb:latest         Up (healthy)             0.0.0.0:8812->8812/tcp, 0.0.0.0:9000->9000/tcp, 0.0.0.0:9009->9009/tcp
aquaculture_redis       redis:7-alpine                 Up (healthy)             0.0.0.0:6379->6379/tcp
aquaculture_simulator   aquaculture-simulator:latest   Up                       
```

### 2.3 Accessing Interfaces
- **Web Dashboard:** `http://localhost:3000`
- **FastAPI Interactive Swagger Docs:** `http://localhost:8000/docs`
- **FastAPI OpenAPI JSON:** `http://localhost:8000/openapi.json`
- **QuestDB Interactive Web Console:** `http://localhost:9000`

### 2.4 Running Automated Verification
```bash
# Execute Tier 1 Unit & Algorithmic Test Suite (inside backend container)
docker compose exec -T backend pytest -v tests/test_simulator.py tests/test_backend.py tests/test_ml.py

# Execute Tier 2 Live Container Integration Tests (from host)
python3 -m unittest -v tests/test_e2e.py
```

### 2.5 Stopping the Stack
```bash
# Stop containers while preserving database volume data
docker compose down

# Stop containers and delete database volumes (clean slate)
docker compose down -v
```

---

## 3. Directory Map & Core Source Files

```text
/Users/nxbl/Documents/Project
├── README.md                      # Academic Project Overview & Specifications
├── docker-compose.yml             # Orchestration of all 7 microservices
│
├── simulator/                     # PHASE 2: Stochastic Telemetry Simulator
│   ├── sde.py                     # Euler-Maruyama coupled SDE engine & Emerson NH3
│   ├── main.py                    # Async MQTT publisher & scenario listener
│   └── Dockerfile                 # Python 3.11 simulator container
│
├── backend/                       # PHASE 3: FastAPI Ingestion & Serving
│   ├── app/
│   │   ├── main.py                # API routing, SSE streaming, scenario dispatch
│   │   ├── broadcaster.py         # Dual-mode fanout (In-memory deque / Redis pub-sub)
│   │   ├── questdb.py             # ILP socket writer & HTTP query client
│   │   ├── mqtt_worker.py         # Asynchronous MQTT ingestion subscriber
│   │   ├── schemas.py             # Pydantic v2 schemas & Emerson equilibrium
│   │   ├── ml_service.py          # ML inference service & quantile bounds
│   │   ├── adwin.py               # Live Adaptive Windowing concept drift engine
│   │   └── models/                # Trained LightGBM artifacts & metadata
│   └── Dockerfile                 # Python 3.11 backend container
│
├── ml/                            # PHASE 4: ML Training & Validation
│   ├── train.py                   # Model training, baselines, and quantile regression
│   ├── adwin.py                   # ADWIN standalone validation script
│   ├── sde.py                     # SDE engine mirror for reproducible generation
│   ├── data/                      # 21-day synthetic training dataset (6,048 rows)
│   └── models/                    # Exported .joblib weights & model_metadata.json
│
├── frontend/                      # PHASE 5: React + TypeScript UI
│   ├── src/
│   │   ├── App.tsx                # Main dashboard view & scenario control
│   │   ├── types.ts               # TypeScript interfaces for telemetry & forecasts
│   │   ├── hooks/
│   │   │   └── useTelemetryStream.ts  # SSE consumer with backoff reconnection
│   │   └── components/
│   │       ├── Header.tsx         # Connection status & viva scenario switcher
│   │       ├── MetricCard.tsx     # Sensor display with Emerson NH3 toxic fraction
│   │       ├── MLForecastCard.tsx # 2h DO forecast, quantiles, persistence benchmark
│   │       └── TelemetryChart.tsx # Sliding time-series chart with safe threshold lines
│   ├── nginx.conf                 # Production reverse proxy config
│   └── Dockerfile                 # Multi-stage build (Node 20 -> Nginx Alpine)
│
├── mosquitto/                     # Core Infrastructure
│   └── config/mosquitto.conf      # MQTT broker configuration (ports 1883/9001)
│
├── tests/                         # PHASE 7: Automated Test Suite
│   ├── conftest.py                # Path resolution fixture
│   ├── test_simulator.py          # SDE stability, reproducibility, scenarios, Emerson NH3
│   ├── test_backend.py            # Pydantic validation, broadcaster buffer, QuestDB ILP
│   ├── test_ml.py                 # Quantile ordering, persistence comparison, ADWIN
│   └── test_e2e.py                # Live HTTP integration queries across microservices
│
└── docs/                          # Comprehensive Academic Documentation
    ├── PROJECT_AUDIT.md           # Phase 0: Detailed codebase audit
    ├── SCIENTIFIC_FOUNDATION.md   # Phase 1: Biofloc microbiology & equations
    ├── ML_VALIDATION.md           # Phase 4: ML methodology, baselines & drift results
    ├── TESTING_AND_VERIFICATION.md# Phase 7: Test outputs & verification trace
    ├── ARCHITECTURE.md            # Phase 8: System architecture & dataflow
    ├── ACADEMIC_SCOPE.md          # Phase 8: Software vs Hardware demarcation
    └── PROJECT_HANDOVER.md        # Phase 8: Student viva defense guide (this document)
```

---

## 4. Academic Viva Demonstration Walkthrough

When presenting this project to external examiners or university faculty, follow this step-by-step demonstration sequence:

### Step 1: Prove System Health & Architecture (2 minutes)
1. Open terminal and run `docker compose ps`. Point out that all 7 microservices are running in isolated containers with native health checks.
2. Open `http://localhost:8000/docs` in the browser. Show the interactive OpenAPI documentation, highlighting `/api/telemetry` (hardware ingestion webhook) and `/api/ml/forecast` (machine learning inference).
3. Open `http://localhost:9000` to show QuestDB Web Console. Run query `SELECT count() FROM telemetry;` to prove live streaming data is continuously appending.

### Step 2: Live Real-Time Dashboard (3 minutes)
1. Open `http://localhost:3000` to show the React + TypeScript frontend.
2. Highlight that the connection badge indicates **"Simulated Stream Connected"** via Server-Sent Events (SSE).
3. Show the **Dissolved Oxygen (DO)**, **pH**, **Temperature**, and **Total Ammonia Nitrogen (TAN)** metric cards.
4. **Key Technical Highlight:** Point to the **Toxic Unionized Ammonia ($NH_3$)** indicator on the TAN card. Explain to the examiner that raw TAN alone is not acutely toxic; toxicity is governed by the Emerson et al. (1975) chemical equilibrium equation, which our backend calculates dynamically from pH and temperature.

### Step 3: Interactive Scenario Switching (3 minutes)
Demonstrate the dynamic feedback loop between the frontend and the stochastic engine:
1. In the top navigation header, locate the **"Demo Scenario"** dropdown.
2. Change the scenario from `Normal Operation` to **`Aerator Failure (Hypoxia Crisis)`**.
3. Point to the live terminal logs:
   ```bash
   docker compose logs -f simulator backend
   ```
   Show that the backend dispatched an MQTT message on `telemetry/control/scenario`, and the simulator logged:
   `[SCENARIO] Switched to: aerator_failure`.
4. Observe the live chart: the DO curve begins a steep exponential decay toward $< 2.5$ mg/L, reflecting intense microbial respiration without aeration.
5. Point out that the metric card transitions to a red **"Critical"** state.
6. Now switch to **`Aerator Recovery`**: observe re-oxygenation as DO asymptotically recovers back above 5.0 mg/L.

### Step 4: Machine Learning & Concept Drift Validation (4 minutes)
1. Point to the **2-Hour Dissolved Oxygen ML Forecast** card on the dashboard.
2. Explain the methodology:
   - Our model uses **LightGBM Quantile Regression** with a 6-hour lookback window (72 steps) across **27 canonical engineered features** including lags, rolling statistics, cyclical diurnal embeddings, and Emerson $NH_3$.
   - Point to the **Benchmarks**: explain that a naive persistence model simply predicts $DO_{t+24} = DO_t$ (RMSE: $0.4963$ mg/L). Our LightGBM model achieves an RMSE of **0.1507 mg/L**, proving a **69.64% error reduction**. Acknowledge transparently that the diurnal mean baseline achieved $0.1447$ mg/L on this synthetic dataset due to regular periodic cycles, but LightGBM provides dynamic 27-feature adaptability.
   - Point to the **Prediction Interval (5% - 95%)**: explain that empirical quantile regressors generate uncertainty bounds (~74.4% empirical coverage on synthetic held-out data).
3. Point to the **Concept Drift Indicator**:
   - Explain the **ADWIN (Adaptive Windowing)** algorithm monitoring true delayed 2-hour forecast residuals ($e_t = |y_{t+2h} - \hat{y}_{t+2h}|$).
   - On stationary test data, ADWIN yielded 0 false alarms across all 893 held-out steps. During the simulated aerator failure experiment, ADWIN flagged a distribution shift at evaluated step 15 (75 minutes post-failure). Clarify that this reflects synthetic scenario dynamics rather than guaranteed physical warning latency.

### Step 5: Hardware Integration Readiness (2 minutes)
1. Open a second terminal window and execute an HTTP POST to simulate an external physical ESP32 microcontroller:
   ```bash
   curl -X POST http://localhost:8000/api/telemetry \
     -H "Content-Type: application/json" \
     -d '{"timestamp":"2026-09-15T12:00:00Z","tank_id":"tank_01","sensors":{"ph":7.85,"temperature_c":28.5,"dissolved_oxygen_mgl":6.20,"tan_mgl":0.45}}'
   ```
2. Show the response: `HTTP 201 Created` with `"source": "http_webhook_esp32"` and `"calculated_nh3_mgl": 0.0435`.
3. Explain that teammates developing the physical ESP32 sensor node can immediately ingest field readings without modifying backend or database code.

---

## 5. What is Simulated vs What is Real

To ensure absolute academic honesty during viva evaluation:

| Component | Status | Reality Assessment |
| :--- | :--- | :--- |
| **Water Quality Data** | **Simulated** | Generated by Euler-Maruyama SDE engine calibrated to biofloc literature parameters. Not collected from a live biological shrimp pond. |
| **Network & Telemetry** | **Real** | Actual TCP sockets, real Mosquitto MQTT broker, real QoS 0/1 messaging. |
| **FastAPI Backend** | **Real** | Fully asynchronous ASGI Python backend running under Uvicorn with Pydantic v2 validation. |
| **Database Persistence**| **Real** | Live QuestDB time-series engine using Influx Line Protocol (ILP) and SQL engine. |
| **Machine Learning** | **Real** | Trained LightGBM point and quantile regression models loaded from `.joblib` artifacts. |
| **Concept Drift** | **Real** | Bifet & Gavalda (2007) ADWIN algorithm actively monitoring streaming prediction residuals. |
| **Web Dashboard** | **Real** | React 18, TypeScript, Vite, Tailwind CSS, sliding Recharts, and live EventSource SSE connection. |
| **Physical ESP32 Sensor**| **Future / Teammate Scope** | Webhook `/api/telemetry` is implemented and verified. Physical probe wiring and MCU firmware belong to hardware teammate scope. |

---

## 6. Troubleshooting and Common Questions

### Q1: "Why does the frontend show 'Connection Disconnected' on startup?"
- **Cause:** The backend takes 10–15 seconds to connect to QuestDB ILP port and start the MQTT worker.
- **Remedy:** The frontend hook `useTelemetryStream.ts` implements automatic exponential backoff reconnection. Once the backend becomes healthy, the connection badge automatically switches to green.

### Q2: "Why use QuestDB instead of PostgreSQL or InfluxDB?"
- **Answer for Examiners:** QuestDB is optimized specifically for ultra-high-frequency time-series telemetry. It writes via Influx Line Protocol (ILP) over raw TCP sockets without transaction lock overhead, while offering ANSI SQL queries for fast historical aggregation and chart rendering.

### Q3: "Why LightGBM instead of an LSTM or Transformer?"
- **Answer for Examiners:** For tabular time-series with lag and rolling window features, gradient-boosted decision trees (GBDTs like LightGBM) consistently match or exceed recurrent neural network performance on tabular benchmarks while requiring orders of magnitude lower compute, enabling real-time inference on low-cost edge hardware without GPUs.

---

## 7. Suggested Student Learning Order

For students taking over or defending this software project:
1. **Week 1 — Scientific Understanding:** Read [`docs/SCIENTIFIC_FOUNDATION.md`](file:///Users/nxbl/Documents/Project/docs/SCIENTIFIC_FOUNDATION.md). Understand why biofloc requires constant aeration, how feeding causes TAN spikes, and how Emerson $NH_3$ equilibrium works.
2. **Week 2 — Simulator & Data Pipeline:** Inspect `simulator/sde.py` and `simulator/main.py`. Follow how Euler-Maruyama equations produce data and publish to Mosquitto MQTT.
3. **Week 3 — Backend & Time-Series Persistence:** Inspect `backend/app/mqtt_worker.py`, `questdb.py`, and `broadcaster.py`. Understand how ILP socket writes work and how SSE streams data to clients.
4. **Week 4 — Machine Learning & Drift:** Read [`docs/ML_VALIDATION.md`](file:///Users/nxbl/Documents/Project/docs/ML_VALIDATION.md) and inspect `ml/train.py`. Understand lag features, quantile regression, and ADWIN Hoeffding bounds.
5. **Week 5 — Frontend & Integration:** Review `frontend/src/App.tsx` and `useTelemetryStream.ts`. Run the live integration test suite (`tests/test_e2e.py`) to master full-stack verification.
