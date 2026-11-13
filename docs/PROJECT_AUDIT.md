# System Audit & Technical Defensibility Report

**Document ID**: `DOC-AUDIT-001`  
**Project**: Smart Aquaculture Water Quality Management System for Zero-Water-Exchange Biofloc Technology  
**Context**: KTU S7/S8 B.Tech Computer Science & Engineering Group Project  
**Date**: September 2026  
**Auditor**: Senior Systems Architect, ML Engineer, DevOps & Aquaculture Technical Reviewer  

---

## 1. Executive Summary

This audit provides a rigorous, technically honest, and academically defensible assessment of the Smart Aquaculture Water Quality Management System codebase. The system was originally scaffolded as an end-to-end containerized prototype incorporating an Ornstein-Uhlenbeck stochastic telemetry simulator, an Eclipse Mosquitto MQTT broker, a FastAPI asynchronous backend, QuestDB time-series storage, a LightGBM predictive pipeline with ADWIN concept drift detection, and a React/TypeScript/Tailwind CSS dashboard consuming Server-Sent Events (SSE).

While all 7 Docker services compile and run (Mosquitto, QuestDB, Redis, Simulator, ML, Backend, Frontend), this audit reveals critical gaps between previous high-level documentation claims and actual code behavior:
- **Redis Container**: Provisioned and healthy in Docker Compose, yet completely unreferenced in backend ingestion, caching, or streaming logic.
- **Scientific Kinetics**: The simulator previously relied on uncalibrated wall-clock time with an unphysical instantaneous TAN drop (-0.50 mg/L in 5 seconds) and no scenario/event triggers.
- **Machine Learning**: LightGBM reported high $R^2$ on smooth synthetic data without comparing against a standard persistence baseline ($DO_{t+2h} = DO_t$). Prediction intervals were hardcoded as $\pm 0.35$ rather than statistically derived. Live backend inference hardcoded ADWIN status to `"STABLE"`.
- **Testing & Documentation**: Zero automated test files existed in the repository prior to this audit; no formal scientific foundation or architecture documentation had been compiled.

---

## 2. Actual Project Structure

```
/Users/nxbl/Documents/Project
├── docker-compose.yml              # Multi-container orchestration (7 services)
├── mosquitto/
│   └── config/
│       └── mosquitto.conf          # MQTT listener (1883) & WebSockets (9001)
├── simulator/
│   ├── Dockerfile                  # Python 3.11-slim container
│   ├── requirements.txt            # aiomqtt, numpy, pydantic
│   ├── sde.py                      # Euler-Maruyama Ornstein-Uhlenbeck generator
│   └── main.py                     # Async MQTT publisher (5s interval)
├── backend/
│   ├── Dockerfile                  # Python 3.11-slim container + libgomp1
│   ├── requirements.txt            # fastapi, uvicorn, pydantic, aiomqtt, httpx, redis, lightgbm, scikit-learn
│   └── app/
│       ├── __init__.py
│       ├── main.py                 # FastAPI application, REST endpoints, SSE stream
│       ├── schemas.py              # Pydantic v2 schemas for telemetry & ML
│       ├── questdb.py              # Influx Line Protocol (ILP) TCP & HTTP query client
│       ├── mqtt_worker.py          # Background asyncio MQTT consumer
│       ├── broadcaster.py          # In-memory async pub-sub SSE broadcaster
│       ├── features.py             # Canonical 27-feature engineering & extraction
│       ├── ml_service.py           # 2-hour DO inference engine & delayed residual ADWIN
│       └── models/
│           ├── lgbm_do_model.joblib # Serialized LightGBM regressor artifact
│           └── model_metadata.json # Feature names & offline evaluation metrics
├── ml/
│   ├── Dockerfile                  # Python 3.11-slim container for training
│   ├── requirements.txt            # lightgbm, numpy, pandas, scikit-learn, joblib
│   ├── features.py                 # Canonical 27-feature definitions and pipeline
│   ├── adwin.py                    # Standalone Adaptive Windowing implementation
│   ├── train.py                    # Synthetic data generator, feature pipeline, training script
│   └── models/
│       ├── lgbm_do_model.joblib
│       └── model_metadata.json
├── frontend/
│   ├── Dockerfile                  # Multi-stage build (Node 20 Alpine -> Nginx Alpine)
│   ├── nginx.conf                  # Static file server & unbuffered SSE reverse proxy
│   ├── package.json                # React 18, Vite 5, Tailwind 3, Recharts 2, Lucide
│   ├── vite.config.ts              # Vite bundler configuration & local proxy
│   ├── tailwind.config.js          # Aquatic theme & custom color tokens
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx                # React DOM root entry
│       ├── App.tsx                 # Dashboard view & layout assembly
│       ├── index.css               # Design system tokens & glassmorphism
│       ├── types.ts                # TypeScript data interfaces
│       ├── hooks/
│       │   └── useTelemetryStream.ts # EventSource SSE consumer with 50-point buffer
│       └── components/
│           ├── Header.tsx          # System status pill & webhook trigger
│           ├── MetricCard.tsx      # Physicochemical card with threshold chips
│           ├── TelemetryChart.tsx  # Recharts dual-axis line chart (DO & TAN)
│           ├── SecondaryChart.tsx  # Physicochemical chart (pH & Temperature)
│           ├── MLForecastCard.tsx  # 2-Hour DO forecast & ADWIN status
│           ├── ESP32SimulatorModal.tsx # Interactive hardware webhook tester
│           └── SystemTopology.tsx  # Microservice architecture visualizer
└── docs/                           # (This academic documentation suite)
```

---

## 3. Existing Services & Actual Dependencies

| Service Name | Container Image | Port Mappings | Actual Internal Purpose | Audit Finding |
| :--- | :--- | :--- | :--- | :--- |
| **`mosquitto`** | `eclipse-mosquitto:2.0` | `1883:1883`, `9001:9001` | Ingests simulator telemetry over MQTT topic `telemetry/tank/1`. | **Functional**: Correctly handles async MQTT publishing and subscription. |
| **`questdb`** | `questdb/questdb:latest` | `9000:9000`, `8812:8812`, `9009:9009` | Time-series persistence via Influx Line Protocol (ILP) and SQL queries via HTTP REST. | **Functional**: Ingestion via port 9009 and queries via port 9000 operate smoothly. |
| **`redis`** | `redis:7-alpine` | `6379:6379` | Standby message bus / state cache. | **Unused**: Running in Compose, but zero active connections from FastAPI backend. Needs resolution. |
| **`backend`** | `aquaculture-backend:latest` | `8000:8000` | FastAPI application. Consumes MQTT, writes ILP to QuestDB, serves SSE (`/api/stream`), accepts ESP32 webhook (`POST /api/telemetry`). | **Functional with Gaps**: Strict async I/O verified; ML service lacked dynamic ADWIN execution; heuristic uncertainty intervals. |
| **`simulator`** | `aquaculture-simulator:latest` | None (Internal) | Python SDE loop publishing every 5 seconds. | **Partially Defensible**: SDE mathematics were uncalibrated; diurnal cycle tied to wall-clock time; unphysical TAN step reset. |
| **`ml`** | `aquaculture-ml:latest` | None (One-shot) | Trains LightGBM model and saves serialized artifacts to shared volume. | **Partially Defensible**: High $R^2$ verified on synthetic data, but missing persistence baseline comparison and true empirical prediction intervals. |
| **`frontend`** | `aquaculture-frontend:latest` | `3000:80` | Nginx reverse proxy serving compiled React/Vite dashboard. | **Functional**: Consumes SSE stream reliably; requires more academic terminology and explicit simulated vs real data labels. |

---

## 4. Actual Data Flow

```
+-----------------------------------------------------------------------------------+
| SIMULATION PATH:                                                                  |
| [simulator/main.py]                                                               |
|        |                                                                          |
|        | (MQTT QoS 1 every 5s on 'telemetry/tank/1')                              |
|        v                                                                          |
| [mosquitto:1883]                                                                  |
|        |                                                                          |
|        | (Asyncio MQTT subscription in backend/app/mqtt_worker.py)                |
|        v                                                                          |
| [backend FastAPI] --(Validate via Pydantic v2 TelemetryPayload)                   |
|        |                                                                          |
|        +-----> [QuestDB ILP :9009] ---> Appends to 'telemetry' time-series table  |
|        |                                                                          |
|        +-----> [TelemetryBroadcaster] -> Pushes to in-memory asyncio.Queue        |
|                       |                                                           |
|                       v                                                           |
|                 [GET /api/stream] (Server-Sent Events text/event-stream)          |
|                       |                                                           |
|                       v                                                           |
|                 [Nginx :3000] (proxy_buffering off)                               |
|                       |                                                           |
|                       v                                                           |
|                 [Browser EventSource in React frontend]                           |
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
| PHYSICAL HARDWARE PATH (Future ESP32):                                            |
| [ESP32 Microcontroller or Simulator Modal]                                       |
|        |                                                                          |
|        | (HTTP POST JSON to /api/telemetry)                                       |
|        v                                                                          |
| [backend FastAPI] --(Validate via Pydantic v2 TelemetryPayload)                   |
|        |                                                                          |
|        +-----> [QuestDB ILP :9009] ---> Appends to identical 'telemetry' table    |
|        |                                                                          |
|        +-----> [TelemetryBroadcaster] -> Pushes to SSE stream immediately        |
+-----------------------------------------------------------------------------------+
```

---

## 5. Detailed Audit Matrix

### 5.1 Implemented Features (Verified Working)
- [x] Multi-container Docker Compose deployment (6 operational containers).
- [x] Asynchronous MQTT publishing (`aiomqtt`) from simulator to broker.
- [x] Asynchronous MQTT consumer background task in FastAPI without thread blocking.
- [x] Non-blocking Influx Line Protocol (ILP) TCP client writing to QuestDB port 9009.
- [x] Hardware ingestion webhook `POST /api/telemetry` accepting identical schema.
- [x] Real-time Server-Sent Events (SSE) stream `GET /api/stream` with history backfill and keepalive pings.
- [x] Recharts dual-axis live chart displaying Dissolved Oxygen and TAN with 50-point FIFO buffer.
- [x] Interactive ESP32 test modal allowing manual payload transmission to the webhook.

### 5.2 Partially Implemented & Deficient Features
- [!] **Redis Integration**: Container runs in Compose, environment variables defined, but zero code connects to it. Broadcaster runs purely in Python memory.
- [!] **ML Prediction Uncertainty**: The backend reported `"confidence_interval": [pred - 0.35, pred + 0.35]`. This was a static scalar offset, NOT a statistically computed 95% confidence interval.
- [!] **Live Concept Drift Evaluation**: Backend `MLForecaster` returned a hardcoded `"concept_drift_status": "STABLE"`. It did not instantiate `ADWIN` in the live stream.
- [!] **Physical Plausibility of Simulator**:
  - Diurnal cycle relied on `datetime.now().hour`, preventing fast-forward demonstration.
  - TAN assimilation was simulated by subtracting `0.50` in a single 5-second step, which is biochemically unrealistic.
  - No deterministic random seed parameter.
- [!] **ML Baseline Comparisons**: No baseline models (persistence, diurnal mean) were evaluated in `ml/train.py`.

### 5.3 Missing Features
- [ ] Automated unit and integration test suite (`pytest`).
- [ ] Formal scenario/event simulation engine (`normal`, `feeding`, `aerator_failure`, `aerator_recovery`).
- [ ] Calculation of toxic unionized ammonia ($NH_3$) from TAN, pH, and temperature.
- [ ] Empirical quantile regression for true prediction intervals.
- [ ] Comprehensive academic documentation package.

---

## 6. Scientific & Mathematical Assumptions Audit

1. **Species Context**:
   - The initial thresholds (DO critical $<4.0$ mg/L, TAN warning $>1.0$ mg/L) are appropriate for Pacific white shrimp (*Litopenaeus vannamei*) or Nile tilapia (*Oreochromis niloticus*), but were previously stated as universal. Water quality thresholds vary significantly by species and life stage.
2. **Ammonia Dynamics**:
   - Total Ammonia Nitrogen (TAN = $NH_3 + NH_4^+$) was reported as toxic, but in reality, only unionized ammonia ($NH_3$) is acutely toxic to aquatic fauna. The proportion of $NH_3$ depends exponentially on pH and temperature according to the Emerson (1975) equilibrium relation. The system must explicitly document this and provide calculated $NH_3$.
3. **Biofloc Oxygen Demand**:
   - In zero-water-exchange biofloc systems, microbial respiration accounts for a substantial fraction of total oxygen demand. When mechanical aeration fails, oxygen depletion can occur rapidly within 1 to 2 hours if unmitigated. The simulator models this phenomenological scenario decay toward a low-DO floor.

---

## 7. Machine Learning Assumptions & Rigor Audit

1. **Synthetic Data Evaluation Bias**:
   - The LightGBM model achieved $R^2 \approx 0.91$ and RMSE $\approx 0.29$ mg/L on synthetic data generated from smooth mathematical equations. In real biofloc ponds, sensor noise, biofouling, and stochastic weather events reduce performance. This limitation must be explicitly documented.
2. **Baseline Necessity**:
   - In time-series forecasting, achieving a low RMSE is trivial if the underlying signal has high autocorrelation and the baseline persistence error ($DO_{t+2h} \approx DO_t$) is not reported. LightGBM must be proven superior to persistence:
     $$RMSE_{LGBM} < RMSE_{persistence}$$
3. **Uncertainty Quantification**:
   - True prediction intervals must be estimated via empirical quantile loss ($5^{th}$ and $95^{th}$ percentiles) or calibrated test-set residual distributions, not arbitrary offsets.

---

## 8. Security & Operational Considerations

- **Current Posture**: Configured for local academic development. Mosquitto permits anonymous access (`allow_anonymous true`). QuestDB runs with default development credentials. FastAPI CORS allows all origins (`*`).
- **Required Production Hardening (Documented for Academic Viva)**:
  - MQTT TLS encryption (port 8883) with X.509 client certificates or username/password authentication for physical edge microcontrollers.
  - API Key or OAuth2 bearer tokens on `POST /api/telemetry` to authenticate field gateways.
  - Restricted CORS origin matching the frontend production domain.
  - Secret management via environment variable files rather than repository defaults.

---

## 9. Recommended Actions & Explicit Exclusions

### Recommended Actions (Priority Order)
1. **Phase 1**: Author `docs/SCIENTIFIC_FOUNDATION.md` establishing biological biofloc equations, Emerson ammonia equilibrium, and literature citations.
2. **Phase 2**: Refactor `simulator/sde.py` with reproducible seeds (`seed=42`), continuous microbial TAN uptake, and an event/scenario engine (`normal`, `feeding`, `aerator_failure`, `aerator_recovery`).
3. **Phase 3**: Implement a dual-mode broadcast adapter in backend (in-memory default, optional Redis Pub/Sub) and compute real-time toxic $NH_3$.
4. **Phase 4**: Refactor `ml/train.py` with persistence baseline comparison, quantile regression prediction intervals, and live ADWIN drift tracking in `ml_service.py`. Author `docs/ML_VALIDATION.md`.
5. **Phase 5**: Refine frontend with academic labeling, scenario triggers, and calculated $NH_3$ metrics.
6. **Phase 6 & 7**: Build a complete automated `pytest` test suite (`tests/`) and document verification in `docs/TESTING_AND_VERIFICATION.md`.
7. **Phase 8**: Author complete academic documentation package (`README.md`, `ARCHITECTURE.md`, `PROJECT_HANDOVER.md`, `ACADEMIC_SCOPE.md`).

### Changes That Should NOT Be Made
- ❌ Do NOT rewrite the entire application in another framework (e.g. Next.js, Django, Go).
- ❌ Do NOT remove working containers without clear technical rationale.
- ❌ Do NOT introduce distributed orchestration tools (Kubernetes, Helm) or cloud services (AWS, GCP).
- ❌ Do NOT add unrelated artificial complexity (blockchain, computer vision, heavy LLM sidecars).
- ❌ Do NOT fabricate real sensor data; explicitly label simulated data as synthetic.
