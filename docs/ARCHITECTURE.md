# System Architecture and Dataflow Specification

**Project Title:** Smart Aquaculture Water Quality Management System for Zero-Water-Exchange Biofloc Technology  
**Academic Target:** KTU S7/S8 B.Tech Computer Science and Engineering Major Project  
**System Classification:** Containerized Distributed IoT Telemetry & ML Forecasting Platform  

---

## 1. High-Level Architectural Diagram

The system operates as a containerized microservice suite connected via an isolated Docker bridge network (`aquaculture_net`). It features decoupled ingestion pipelines, append-only time-series persistence, asynchronous real-time streaming, and machine learning inference with concept drift monitoring.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       IoT Ingestion Sources                                            │
├─────────────────────────────────────────────────┬───────────────────────────────────────────────────────┤
│          (A) Simulated Telemetry                │          (B) Physical Hardware (Future)               │
│  [Python SDE Simulator]                         │  [ESP32 / Microcontroller / Edge Gateway]             │
│  • Euler-Maruyama Stochastic Engine             │  • Analog DO, pH, Temp, TAN Sensors                   │
│  • 5 Scenarios (Normal, Aerator Fail, etc.)     │  • JSON Payload over HTTP POST                        │
└───────────────────────┬─────────────────────────┴───────────────────────────┬───────────────────────────┘
                        │ MQTT (1883)                                         │ HTTP REST (8000)
                        ▼                                                     ▼
┌─────────────────────────────────────────────────┐   ┌───────────────────────────────────────────────────┐
│         Eclipse Mosquitto MQTT Broker           │   │                                                   │
│   • Topic: telemetry/tank/1                     │   │                                                   │
│   • Control: telemetry/control/scenario         │   │                                                   │
└───────────────────────┬─────────────────────────┘   │                                                   │
                        │ Async MQTT Sub              │                                                   │
                        ▼                             │                                                   │
┌─────────────────────────────────────────────────────┴───────────────────┐                               │
│                      FastAPI Asynchronous Backend                       │                               │
│  • Pydantic v2 Schema Validation & Ingestion Webhook (/api/telemetry)   │                               │
│  • Emerson et al. (1975) Unionized Ammonia (NH3) Calculation Engine     │                               │
│  • Dynamic Scenario Control (/api/simulator/scenario)                   │                               │
│  • LightGBM Quantile ML Forecasting (/api/ml/forecast)                  │                               │
│  • Streaming Broadcaster (In-Memory Async Queue / Redis Pub-Sub)        │                               │
└──────────────┬───────────────────────────────┬──────────────────────────┘                               │
               │ ILP (9009)                    │ HTTP (9000)                                              │
               ▼                               ▲                                                          │
┌──────────────────────────────────────────────┴──────────┐   ┌───────────────────────────────────────────┐
│         QuestDB Time-Series Engine                      │   │       Redis Pub/Sub (Optional Broker)     │
│  • High-throughput Influx Line Protocol (ILP) Append    │   │  • Multi-worker distributed fanout        │
│  • Relational SQL historical queries via REST API       │   │  • Active when BROADCASTER_BACKEND=redis  │
│  • Volume: questdb_data                                 │   │  • Volume: redis_data                     │
└─────────────────────────────────────────────────────────┘   └───────────────────────────────────────────┘
                                       │
                                       │ SSE Stream (/api/stream) & REST
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          React + TypeScript + Vite + Tailwind Dashboard                                 │
│  • Live Telemetry Stream via EventSource (SSE) with Auto-reconnection & Exponential Backoff             │
│  • Time-Series Hydration (QuestDB REST) & Live Sliding Charts (Recharts)                                │
│  • 2-Hour DO Horizon Forecast with Empirical Quantile Bounds (q05, q95) vs Naive Persistence Baseline   │
│  • Emerson Toxic Unionized Ammonia (NH3) Real-Time Fraction Indicator                                   │
│  • Live Academic Demonstration Scenario Selector (Triggers MQTT state transitions)                     │
│  • Reverse Proxy via Nginx Container (Port 3000 -> 80)                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Microservice Decomposition & Network Topology

The orchestration is defined in `docker-compose.yml`. All communication within Docker occurs on the `aquaculture_net` bridge network:

| Service Name | Container Name | Base Image | Internal Port | Exposed Host Port | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **mosquitto** | `aquaculture_mosquitto` | `eclipse-mosquitto:2.0` | 1883, 9001 | 1883, 9001 | MQTT broker for IoT telemetry and control signals |
| **questdb** | `aquaculture_questdb` | `questdb/questdb:latest` | 9000, 9009, 8812 | 9000, 9009, 8812 | Time-series database (ILP insertion + SQL queries) |
| **redis** | `aquaculture_redis` | `redis:7-alpine` | 6379 | 6379 | Distributed pub/sub message broker for multi-replica scaling |
| **simulator** | `aquaculture_simulator` | Python 3.11 slim | — | — | Stochastic SDE telemetry generator & scenario engine |
| **backend** | `aquaculture_backend` | Python 3.11 slim | 8000 | 8000 | FastAPI REST API, MQTT worker, ML inference, and SSE stream |
| **ml** | `aquaculture_ml` | Python 3.11 slim | — | — | Synthetic data generation, model training, and ADWIN validation |
| **frontend** | `aquaculture_frontend` | `nginx:alpine` | 80 | 3000 | Production-compiled React TypeScript SPA |

---

## 3. Data Pipelines & Communication Protocols

### 3.1 Pipeline A: Synthetic IoT Telemetry (MQTT)
1. **Generation:** `simulator/sde.py` simulates water quality state every $\Delta t$ seconds (default 5.0s) using Euler-Maruyama discretized coupled SDEs.
2. **Publishing:** `simulator/main.py` serializes reading to JSON and publishes to MQTT topic `telemetry/tank/1` (QoS 0).
3. **Consumption:** `backend/app/mqtt_worker.py` maintains an asynchronous client loop (`aiomqtt.Client`), parsing incoming packets.
4. **Enrichment:** Backend applies the Emerson et al. (1975) chemical equilibrium equation to derive toxic unionized ammonia ($NH_3$) from TAN, pH, and temperature.
5. **Persistence:** Worker formats the record into Influx Line Protocol (ILP) and writes over non-blocking TCP socket to QuestDB port 9009:
   ```text
   telemetry,tank_id=tank_01 ph=7.85,temperature_c=28.5,dissolved_oxygen_mgl=6.20,tan_mgl=0.45 1789473600000000000
   ```
6. **Broadcasting:** Worker forwards enriched dictionary to `TelemetryBroadcaster.broadcast()`.

### 3.2 Pipeline B: Physical Edge Microcontroller Ingestion (HTTP Webhook)
1. **Edge MCU:** An ESP32 or field microcontroller posts telemetry directly to `POST /api/telemetry`.
2. **Validation:** Pydantic v2 `TelemetryPayload` validates timestamp format and enforces physical boundary constraints ($pH \in [0, 14]$, $DO \in [0, 25]$ mg/L, $T \in [5, 55]$ °C, $TAN \in [0, 30]$ mg/L).
3. **Persistence & Streaming:** Enriches payload with Emerson $NH_3$, inserts into QuestDB via ILP, and broadcasts to active SSE subscribers.

### 3.3 Dynamic Scenario Control Pipeline (MQTT Feedback Loop)
1. **Trigger:** Academic evaluator selects a scenario on the React UI (e.g. "Aerator Failure").
2. **API:** Frontend issues `POST /api/simulator/scenario` with `{"scenario": "aerator_failure"}`.
3. **Dispatch:** Backend connects to Mosquitto and publishes the scenario string to `telemetry/control/scenario`.
4. **Actuation:** Simulator's asynchronous MQTT listener receives command, logs transition, and switches internal kinetic equations instantaneously.
5. **Observation:** Dashboard graphs show real-time biological impact (exponential DO decline toward hypoxic floor < 2.0 mg/L).

---

## 4. Broadcaster Architecture: Dual-Mode Fanout

To reconcile academic simplicity with scalable software design, `backend/app/broadcaster.py` implements a pluggable dual-mode architecture controlled by the environment variable `BROADCASTER_BACKEND`:

```
┌─────────────────────────────────────────────────────────────┐
│                    TelemetryBroadcaster                     │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
       (A) backend="memory"            (B) backend="redis"
       (Default, Low Overhead)         (Horizontal Scale)
               │                               │
       ┌───────▼────────┐              ┌───────▼────────┐
       │ In-Memory FIFO │              │ Redis Channel  │
       │ Deque Buffer   │              │ Pub/Sub        │
       │ (50 Records)   │              └───────┬────────┘
       └───────┬────────┘                      │
               │ Local Dispatch                │ Redis Worker Task
               └───────────────┬───────────────┘
                               ▼
               ┌───────────────────────────────┐
               │    Local Subscriber Queues    │
               │    (asyncio.Queue per client) │
               └───────────────┬───────────────┘
                               ▼
               ┌───────────────────────────────┐
               │    StreamingResponse (SSE)    │
               │    text/event-stream          │
               └───────────────────────────────┘
```

1. **In-Memory Mode (`memory`)**:
   - Zero external dependency.
   - Ideal for local single-process development, grading, and standard deployment.
   - Directly fans out events to local `asyncio.Queue` subscribers with zero network serialization overhead.
2. **Redis Mode (`redis`)**:
   - Designed for multi-worker production deployments (e.g. `gunicorn -k uvicorn.workers.UvicornWorker -w 4`).
   - Telemetry broadcast publishes to Redis channel `aquaculture:telemetry`.
   - Each Uvicorn worker runs a Redis listener task that forwards messages to its locally connected SSE clients.

---

## 5. Machine Learning & Drift Detection Pipeline

The machine learning component is designed to address a critical operational challenge: **anticipating nocturnal dissolved-oxygen depletion 2 hours in advance**.

```
┌────────────────────────────────────────────────────────────────────────┐
│         Canonical Feature Engineering (Lookback: 6 Hours, 72 Steps)    │
├────────────────────────────────────────────────────────────────────────┤
│ • Lag variables: DO (t-1..3,6,12), TAN (t-1,2,6), pH (t-1), Temp (t-1)  │
│ • Rolling aggregations: DO (1h, 3h, 6h stats), TAN (3h, 6h mean/std)   │
│ • Trigonometric diurnal cycle encoding: sin(2π·hr/24), cos(2π·hr/24)   │
│ • Biochemical coupling: Emerson unionized ammonia (NH3)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Feature Vector (27 Dimensions)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Inference & Uncertainty Engine                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Point Prediction: LightGBM Regressor (RMSE: 0.138, MAE: 0.109 mg/L) │
│ 2. Quantile Lower Bound: LightGBM α=0.05 Regressor                     │
│ 3. Quantile Upper Bound: LightGBM α=0.95 Regressor                     │
│    (Empirical coverage: ~78.5% on synthetic held-out test data)        │
│ 4. Benchmarks: Persistence (RMSE 0.496); Diurnal Mean (RMSE 0.145)     │
│    -> 72.27% RMSE reduction vs persistence on synthetic telemetry      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Streaming Prediction Residuals
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│      ADWIN-Inspired Adaptive-Window Residual Distribution Monitor      │
├────────────────────────────────────────────────────────────────────────┤
│ • Dynamically monitors delayed residual: e_t = |y_{t+2h} - y_pred|     │
│ • Hoeffding-style sub-window bound: ε_cut = sqrt(1/(2m) * ln(4/δ))     │
│ • 0 Drift detections on 893 stationary held-out operational steps      │
│ • Scenario detection delay: flagged residual shift at step 15 (75 min) │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Software Actuation & Control Layer Architecture

To bridge telemetry monitoring with physical control capabilities, the system incorporates an authoritative backend control layer ([`backend/app/control_service.py`](file:///Users/nxbl/Documents/Project/backend/app/control_service.py)) and an operator-facing Control Center dashboard ([`frontend/src/views/ControlCenterView.tsx`](file:///Users/nxbl/Documents/Project/frontend/src/views/ControlCenterView.tsx)).

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                             Control System Architecture                               │
├──────────────────────────────────────────┬────────────────────────────────────────────┤
│          Operator Web Dashboard          │            FastAPI Backend Service         │
│  [ControlCenterView.tsx]                 │  [control_service.py]                      │
│  • Tank Cross-Section Water Level HUD    │  • Authoritative State Machine             │
│  • Mode Switch (AUTO/MANUAL/SIMULATION)  │  • Rule Evaluation Engine (DO Hysteresis)  │
│  • 5 Actuator Cards with Power Controls  │  • Hardware Safety Interlocks              │
│  • Real-Time Audit Log Table (10 Events) │  • 100-Event Audit History Deque           │
└────────────────────┬─────────────────────┴─────────────────────┬──────────────────────┘
                     │ REST API Requests                         │ Simulator / Hardware Sync
                     ▼                                           ▼
┌──────────────────────────────────────────┐   ┌────────────────────────────────────────┐
│       REST Endpoints (/api/control/*)    │   │      Actuator Coupling & Hydraulics    │
│  • GET /status: Full system status & HUD │   │  • Inlet Pump (30 LPM, Upper Cutoff)   │
│  • POST /mode: Safe mode transitions     │   │  • Outlet / Sludge Pump (30 LPM)       │
│  • POST /actuator: Manual state commands │   │  • Aeration System (0% / 50% / 100%)   │
│  • GET /history: Chronological audit log │   │  • pH Increase / Decrease Dosing       │
└──────────────────────────────────────────┘   └────────────────────────────────────────┘
```

### 6.1 Operational Control Modes
1. **`AUTO` (Automated Rule Evaluation)**:
   - Backend evaluates streaming telemetry observations against biological thresholds on every tick.
   - Automatically triggers emergency aeration if $DO < 4.0\text{ mg/L}$, and returns to baseline 50% aeration once $DO \ge 5.5\text{ mg/L}$ (hysteresis).
   - In AUTO mode, arbitrary manual operator commands are rejected by the backend to prevent conflicting control actions.
2. **`MANUAL` (Supervised Human Control)**:
   - Human operator can explicitly trigger actuators (e.g., initiating water top-up or chemical dosing).
   - All manual commands are strictly validated against software safety interlocks before execution.
3. **`SIMULATION` (Virtual Sandbox Execution)**:
   - Isolated simulation mode allowing researchers to safely manipulate virtual tank parameters without issuing commands to physical actuators.
   - Enforces the same interlock logic and rule semantics for reproducible verification.

### 6.2 Software Safety Interlocks & Mutual Exclusion
- **High-Level Overflow Interlock**: Inlet pump is unconditionally blocked when water level reaches $19,000\text{ L}$ (95% of tank capacity).
- **Low-Level Underflow Interlock**: Outlet/sludge pump is unconditionally blocked when water level drops to $12,000\text{ L}$ (60% of tank capacity).
- **Pump Mutual Exclusion**: Activating the inlet pump automatically forces the outlet pump OFF; activating the outlet pump automatically forces the inlet pump OFF.
- **pH Dosing Mutual Exclusion & Cooldown**: Activating acidic dosing immediately cuts off alkaline dosing and vice versa. An automated 300-second cooldown period is enforced between dosing events to prevent chemical overshoot.

### 6.3 Scientific & Engineering Parameter Taxonomy
To maintain rigorous scientific and academic honesty, all parameters and thresholds are categorized into four distinct classes:

| Class | Parameter | Value | Origin / Academic Scope |
| :--- | :--- | :--- | :--- |
| **Field-Informed Parameters** | Feeding table weight bands | 3.0g to >400g | Attributed directly to supplied farm operational material |
| | Feed ammonia loading fraction | $\sim 3\%$ of feed mass | Supplied farm material assumption (not chemical $NH_3\text{-N}$) |
| | Biological oxygen demand | $0.30\text{ g } O_2\text{/kg fish/h}$ | Supplied farm operational material |
| | Aeration requirement | $1.76\text{ LPM} / 10\text{ kg}$ | Supplied farm operational material |
| | Stocking density reference | $\le 40\text{ kg/m}^3$ | Field operational guideline, not universal biological limit |
| | Biofloc solids reference | $<60\text{ mL/L}$, drain $>100\text{ mL/L}$ | Field Imhoff cone operational management targets |
| **Simulator Assumptions** | Ammonia excretion rate | $k_{\text{excretion}} = 0.65\text{ h}^{-1}$ | Phenomenological project parameter, not farm-derived |
| | SDE mean reversion speeds | $\theta \in [0.25, 0.40]\text{ h}^{-1}$ | Stochastic calibration for synthetic data generation |
| | Biofloc solids turnover | Linear settle / feed scaling | Heuristic particulate model, not mechanistic microbial kinetics |
| **Software Control Rules** | DO emergency aeration trigger | $\text{DO} < 4.00\text{ mg/L}$ | AquaSense software hysteresis rule |
| | DO baseline recovery trigger | $\text{DO} \ge 5.50\text{ mg/L}$ | AquaSense software hysteresis rule |
| | pH dosing triggers | $<7.40\text{ (up)}, >8.60\text{ (down)}$ | AquaSense software water quality rules |
| **Implementation Safety Limits** | Water level bounds | $12,000\text{ L} \le V \le 19,000\text{ L}$ | Configurable tank protection limits ($60\%\text{--}95\%$) |
| | Flow rates | $30\text{ LPM}$ | Tank hydraulics specification |

> [!IMPORTANT]
> **Academic Scope & Validation Delineation:**  
> The system is a *stochastic phenomenological aquaculture simulator informed by field operational parameters*. Synthetic evaluation on simulated data does **not** constitute empirical field validation. No empirical field validation was performed, as real synchronized physical farm telemetry was not collected. The physical farm hardware remains separate from the simulator unless an edge hardware connection is explicitly configured.

---

## 6.5 Actionable Control UX Architecture (Phase H)

AquaSense couples continuous monitoring with operational control through a closed feedback loop:

$$\text{Monitoring} \longrightarrow \text{Alerts} \longrightarrow \text{Operator/Automatic Response} \longrightarrow \text{Actuator Control} \longrightarrow \text{Safety Interlocks} \longrightarrow \text{Audit Trail}$$

### Core Operational Principles
1. **Telemetry & Detection**: Streaming sensor metrics (DO, TAN, pH, Temp) and biological metadata (water level, biofloc density, calculated Emerson $\text{NH}_3$) feed the global alarm engine.
2. **Clear Conceptual Delineation**:
   - **Alert Condition**: The biological anomaly detected (e.g., toxic $\text{NH}_3 > 0.05\text{ mg/L}$ or $\text{DO} < 4.0\text{ mg/L}$).
   - **Recommended Response**: Agronomic operational guidance (e.g., stimulate heterotrophic assimilation, suspend feeding).
   - **Actual Actuator Action**: The software-supported actuator command (e.g., `Increase Aeration`, `Start Solids Removal`). The UI never conflates aeration with direct chemical removal of ammonia.
3. **Backend Authoritative Control & Safety Interlocks**:
   - The backend `ControlService` remains the sole authority for actuator states, interlocks, and mode enforcement.
   - Water level boundaries ($12,000\text{ L} \le V \le 19,000\text{ L}$) strictly gate inlet and outlet pumps. Any command violating water level safety is rejected by the backend and displayed to the operator with the specific interlock reason.
   - Chemical dosing enforces mutual exclusion and cooldowns.
   - In `AUTO` mode, the backend rejects manual override commands. The frontend provides a one-click confirmation modal allowing the operator to switch to `MANUAL` mode before executing the command.
4. **Action Feedback & Button States**:
   - **Available**: `[Increase Aeration]`
   - **Executing**: `[Applying...]`
   - **Successful**: `[Aeration → EMERGENCY]`
   - **Rejected / Interlocked**: `[Blocked: Low Water Level (<= 12,000 L)]`
   - **Already Active**: `[Already Active: 100%]` (prevents redundant duplicate commands)
5. **Traceable Audit Trail**: All commands, automatic rule firings, and interlock blocks are recorded chronologically in the control event log.

---

## 7. Security Posture & Academic Deployment Considerations

### Current Academic Configuration (Development-First)
- **Mosquitto MQTT:** Configured with `allow_anonymous true` for seamless local evaluation without certificate generation overhead.
- **QuestDB:** REST API exposed on port 9000 without TLS; default administrative credentials (`admin/quest`).
- **CORS:** FastAPI configured with `allow_origins=["*"]` to allow flexible browser development.
- **Docker Compose:** Ports 1883, 3000, 8000, 9000, 9009 are exposed directly to `localhost`.

### Production Hardening Roadmap (Real Farm Deployment)
For production installation on a commercial aquaculture farm, the following security upgrades must be applied:
1. **MQTT Authentication & Encryption:**
   - Enforce TLS 1.3 (port 8883) using Let's Encrypt or private CA certificates.
   - Disable anonymous access; issue unique username/password or X.509 client certificates per physical tank controller.
2. **API Authentication:**
   - Protect hardware ingestion `/api/telemetry` with rotating pre-shared API keys (`X-API-Key` header) or HMAC SHA-256 signatures.
   - Require JWT authentication (OAuth2 / OIDC) for scenario control and administrative endpoints.
3. **Database Security:**
   - Place QuestDB behind private Docker network only (remove exposed host ports 8812, 9000, 9009).
   - Enforce ILP authentication over TCP with cryptographic auth tokens.
4. **CORS & Reverse Proxy:**
   - Restrict CORS origins strictly to the production frontend domain.
   - Terminate TLS via Nginx / Traefik with HTTP/2 and automated renewal.
