# Academic Project Scope and Team Demarcation

**Project Title:** Smart Aquaculture Water Quality Management System for Zero-Water-Exchange Biofloc Technology  
**Curriculum:** APJ Abdul Kalam Technological University (KTU) B.Tech Major Project (S7/S8)  
**Academic Honesty Declaration:** This document explicitly demarcates the software contributions of the software student, the expected physical hardware contributions of engineering teammates, the scientific validity of the simulation environment, and known limitations.

---

## 1. Division of Project Responsibilities

In university engineering projects, hardware-software integration is frequently divided across multi-disciplinary teammates. This codebase represents the **software, data engineering, machine learning, and containerization subsystem**.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           Full System Architecture                                │
├─────────────────────────────────────────┬─────────────────────────────────────────┤
│    [Subsystem 1: Software & ML]         │    [Subsystem 2: Physical Hardware]     │
│    Primary Student Scope (This Repo)    │    Teammate / Future Engineering Scope  │
├─────────────────────────────────────────┼─────────────────────────────────────────┤
│ • Stochastic SDE Biokinetic Simulator   │ • Physical Sensor Selection & Sourcing  │
│ • MQTT Broker Orchestration             │   (Galvanic DO, Glass pH, Thermistor)   │
│ • FastAPI Backend & Asynchronous I/O    │ • ESP32 / STM32 Edge Microcontroller    │
│ • QuestDB Time-Series Engine (ILP/SQL)  │ • Analog Signal Conditioning & ADC      │
│ • Real-Time SSE Streaming Broadcaster   │ • Edge Firmware (C++ / FreeRTOS)        │
│ • LightGBM DO Forecasting Pipeline      │ • Power Supply & Battery Backup Circuit │
│ • ADWIN Concept Drift Detection         │ • IP67 Waterproof Field Enclosure       │
│ • React + TypeScript Dashboard          │ • Field Probe Calibration Solutions     │
│ • Docker Compose Multi-Container DevOps │ • Optical / Membrane Sensor Maintenance │
│ • Comprehensive Automated Test Suite    │                                         │
└─────────────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 2. Detailed Software Contributions (Primary Student Scope)

The primary student is directly responsible for designing, auditing, implementing, and verifying the following components:

1. **Biophysical Water Quality Simulator (`simulator/sde.py`):**
   - Implemented Euler-Maruyama discretization of coupled Ornstein-Uhlenbeck stochastic differential equations.
   - Incorporated diurnal solar radiation curves for dissolved oxygen and temperature.
   - Implemented the Emerson et al. (1975) chemical equilibrium formulation to compute toxic unionized ammonia ($NH_3$).
   - Designed a deterministic scenario engine (`normal`, `feeding`, `aerator_failure`, `aerator_recovery`, `organic_overload`) with fixed random seed reproducibility.
2. **IoT Ingestion & Asynchronous Backend (`backend/app/`):**
   - Engineered an asynchronous FastAPI service using non-blocking I/O.
   - Developed an MQTT background worker using `aiomqtt` to ingest high-frequency telemetry.
   - Built a high-throughput TCP socket writer persisting records directly to QuestDB via Influx Line Protocol (ILP).
   - Designed a dual-mode telemetry broadcaster supporting in-memory fanout and Redis distributed pub/sub.
   - Built a hardware ingestion webhook (`POST /api/telemetry`) with Pydantic v2 validation.
3. **Machine Learning & Concept Drift Pipeline (`ml/` and `backend/app/ml_service.py`):**
   - Formulated a 2-hour ahead DO forecasting problem across 6-hour historical lookback windows (72 observations at 5-minute sampling).
   - Engineered 27 canonical features (temporal lags, multi-scale rolling stats, trigonometric cyclical time encoding, Emerson $NH_3$).
   - Implemented and evaluated a **Naive Persistence Baseline** ($DO_{t+24} = DO_t$, RMSE: $0.4963$ mg/L) and a **Diurnal Mean Baseline** (RMSE: $0.1447$ mg/L).
   - Trained a LightGBM Regressor achieving an RMSE of **0.1507 mg/L** on held-out test data (**69.64% RMSE improvement** relative to persistence; diurnal mean baseline achieved slightly lower RMSE on this synthetic dataset).
   - Trained empirical quantile regressors ($\alpha=0.05, 0.95$) providing empirical uncertainty bounds (~74.4% empirical coverage on synthetic held-out data).
   - Implemented the ADWIN (Adaptive Windowing) drift detection algorithm to monitor streaming distributions of true 2-hour delayed forecast residuals.
4. **Real-Time Web Dashboard (`frontend/`):**
   - Built a responsive single-page application using React 18, TypeScript, and Vite.
   - Consumed live telemetry via Server-Sent Events (SSE) with automated reconnection handling.
   - Visualized dynamic time-series trends using sliding Recharts with project operational threshold bands.
   - Built an interactive scenario control selector enabling live demonstration of simulated scenario transitions during project evaluation.
5. **DevOps, Quality Assurance, and Testing:**
   - Authored multi-container Docker Compose orchestration (7 services) with health checks.
   - Developed 27 automated unit, verification, and live integration tests achieving 100% pass rates.

---

## 3. Teammate Physical Hardware Scope (Not Claimed as Software Scope)

The software student explicitly **does not claim** to have physically manufactured, calibrated, or wired the hardware sensor probes. Teammates assigned to the hardware domain are responsible for:

1. **Sensor Probe Selection:**
   - Dissolved Oxygen: Galvanic or optical luminescent DO sensor (e.g. DFRobot Gravity Analog DO Sensor).
   - pH: Industrial glass-bulb combination electrode with BNC interface and signal conditioning board.
   - Temperature: Waterproof DS18B20 digital 1-Wire temperature probe.
   - Ammonia/TAN: Colorimetric or Ion-Selective Electrode (ISE) probe module.
2. **Microcontroller & Embedded Firmware:**
   - ESP32-WROOM-32 or ESP32-S3 microcontroller board.
   - Firmware written in C++ (Arduino IDE or ESP-IDF) to sample analog voltages, apply calibration slopes/offsets, and format JSON payloads.
   - WiFi connection management and HTTP POST transmission to `http://<server-ip>:8000/api/telemetry`.
3. **Field Enclosure and Power:**
   - Weatherproof IP67 enclosure to protect sensitive circuitry from saline biofloc aerosol spray.
   - Regulated power supply (12V/5V DC) with battery backup to sustain monitoring during power outages.

---

## 4. Scientific Assumptions and Research Limitations

Examiners should note the following scientific boundaries:

1. **Synthetic Telemetry Origin:**
   - The telemetry analyzed by the ML pipeline and displayed on the dashboard is generated by an Euler-Maruyama stochastic differential equation model informed by literature relationships and operational scenarios.
   - It is **not** harvested from live biological shrimp tanks at a commercial farm.
   - While the SDE incorporates diurnal cycling, microbial respiration, feeding pulses, and aeration scenario dynamics, real pond ecosystems exhibit biofouling, sediment stratification, and turbulent non-homogeneous mixing that require empirical field calibration.
   - **Real-world farm/field validation has not been performed.**
2. **Ammonia Chemical Equilibrium:**
   - The model computes unionized ammonia ($NH_3$) from TAN using the Emerson et al. (1975) freshwater equation. Hypersaline biofloc systems require salinity activity coefficient adjustments (e.g. Bower & Bidwell, 1978).
3. **ML Evaluation on Synthetic Telemetry:**
   - The reported LightGBM metrics (RMSE 0.1507 mg/L, 69.64% reduction vs persistence) demonstrate modeling capability on the project's synthetic stochastic biofloc data.
   - The diurnal-mean baseline achieved slightly lower RMSE (0.1447 mg/L) on this synthetic test set due to the periodic nature of the simulated diurnal cycle.
   - These metrics reflect synthetic telemetry evaluation and must be re-evaluated on empirical field telemetry before drawing conclusions about real-world performance.

---

## 5. Future Work Roadmap

For future S8 continuation or postgraduate research:
1. **Edge Deployment:** Flash TinyML or ONNX quantized models directly onto edge gateways (Raspberry Pi 5) for offline localized inference without server connectivity.
2. **Automated Aerator Relay Actuation:** Extend the backend to send MQTT control signals to smart relays or Variable Frequency Drives (VFDs) to automatically spin up backup aerators upon hypoxia alert.
3. **Multi-Tank Scalability:** Provision multi-tenant schemas in QuestDB and dynamic tank tabs on the React dashboard for commercial farms operating 10 to 50 tanks simultaneously.
4. **Physical Probe Validation:** Conduct a 30-day continuous trial in a university research aquaculture tank comparing simulated SDE trajectories with physical optical DO sensor readings.
