# Machine Learning Pipeline Validation & Drift Detection Report

**Document ID**: `DOC-ML-001`  
**Project**: Smart Aquaculture Water Quality Management System for Zero-Water-Exchange Biofloc Technology  
**Target Context**: KTU S7/S8 B.Tech Engineering Group Project  
**Date**: September 2026  

---

## 1. Executive Summary

This report provides the formal academic validation of the predictive intelligence and streaming concept drift detection modules. The objective is to forecast Dissolved Oxygen (DO) concentration **2 hours into the future** ($t + 2\text{h}$) to provide proactive lead time for farm operators and automated aerator controllers before biological hypoxia occurs.

To maintain strict scientific and academic defensibility:
1. The LightGBM model is rigorously benchmarked against a **Naive Persistence Baseline** ($DO_{t+2h} = DO_t$) and a **Historical Diurnal Mean Baseline**.
2. Arbitrary heuristic confidence margins ($\pm 0.35$) have been eliminated and replaced with **Empirical Quantile Regression** ($\alpha = 0.05$ and $\alpha = 0.95$).
3. The **ADWIN-inspired adaptive-window drift detector** (using Hoeffding-style sub-window comparisons) is evaluated against both stationary operation and a simulated mechanical aerator failure scenario.

---

## 2. Dataset Architecture & Generation

### 2.1 Synthetic Biofloc Time-Series Telemetry
To ensure consistency across the entire software stack, training data was generated directly using the refactored, reproducible `BioflocSDEEngine(seed=42)`:
- **Duration**: 21 contiguous simulation days ($2026\text{-}08\text{-}01\text{ to }2026\text{-}08\text{-}21$).
- **Sampling Frequency**: $5\text{ minutes}$ ($\Delta t = 0.0833\text{ hours}$).
- **Total Generated Observations**: $6,048\text{ rows}$.
- **Export Artifact**: Versioned CSV stored at `ml/data/biofloc_synthetic_telemetry.csv`.

### 2.2 Variables Generated
- `timestamp`: Chronological ISO-8601 UTC timestamp.
- `tank_id`: Culture raceway identifier (`tank_01`).
- `dissolved_oxygen_mgl`: Continuous dissolved oxygen concentration ($mg/L$).
- `tan_mgl`: Total Ammonia Nitrogen ($mg/L$).
- `ph`: Water acidity/alkalinity ($pH$).
- `temperature_c`: Water temperature ($^\circ\text{C}$).
- `calculated_nh3_mgl`: Emerson equilibrium unionized ammonia ($mg/L$).

---

## 3. Feature Engineering & Target Formulation

### 3.1 Target Variable Definition
At a 5-minute sampling interval, a 2-hour forecast horizon corresponds to **24 time steps** ahead:

$$y_t = \text{target\_do\_2h} = DO_{t + 24}$$

```
Time Step:  t-12 ... t-3  t-2  t-1   [ t: Current Observation ]   t+1 ... t+23  [ t+24: Target DO (+2h) ]
Features:   <---- Historical Lags & Rolling Windows ---->
```

### 3.2 Feature Matrix (27 Features)
To prevent temporal data leakage, all features are derived strictly from information available at or before time $t$:

| Feature Category | Features | Physical / Biological Rationale |
| :--- | :--- | :--- |
| **Instantaneous Sensors** | `dissolved_oxygen_mgl`, `tan_mgl`, `ph`, `temperature_c`, `calculated_nh3_mgl` | Current water quality state vector and chemical ammonia equilibrium. |
| **Temporal Lags** | `do_lag_1` (5m), `do_lag_2` (10m), `do_lag_3` (15m), `do_lag_6` (30m), `do_lag_12` (60m) | Captures short-term rate of change ($dDO/dt$) and momentum. |
| **Nitrogen & Temp Lags**| `tan_lag_1`, `tan_lag_2`, `tan_lag_6`, `ph_lag_1`, `temp_lag_1` | Captures metabolic excretion lag and diurnal thermal trajectory. |
| **1-Hour Rolling Stats** | `do_roll_mean_1h`, `do_roll_std_1h`, `do_roll_min_1h`, `do_roll_max_1h` | Filters high-frequency probe noise; detects rapid oxygen drop. |
| **3-Hour Rolling Stats** | `do_roll_mean_3h`, `do_roll_std_3h`, `tan_roll_mean_3h` | Medium-term biological trend and post-prandial ammonia accumulation. |
| **6-Hour Rolling Stats** | `do_roll_mean_6h`, `do_roll_std_6h`, `tan_roll_mean_6h` | Captures diurnal half-cycle baseline transition. |
| **Diurnal Cyclic Embeddings**| $\sin(2\pi \cdot \text{hour}/24)$, $\cos(2\pi \cdot \text{hour}/24)$ | Provides continuous cyclic time representation across midnight (hour 23 to 0). |

After rolling window alignment and forward shifting, $5,952$ complete feature rows remain.

---

## 4. Chronological Validation Methodology

In time-series forecasting, standard random $K$-fold cross-validation is invalid because it introduces temporal lookahead leakage. A strict chronological partition was implemented:
- **Training Partition (70%)**: First $4,166\text{ samples}$ ($14.5\text{ days}$).
- **Validation Partition (15%)**: Next $893\text{ samples}$ ($3.1\text{ days}$), used strictly for early stopping.
- **Held-Out Test Partition (15%)**: Final $893\text{ samples}$ ($3.1\text{ days}$), evaluated once to report final generalization metrics.

---

## 5. Baseline Models & Benchmark Results

### 5.1 Evaluated Baselines
1. **Naive Persistence Baseline**:
   $$\hat{y}_{t+2h} = DO_t$$
   Assumes dissolved oxygen 2 hours from now will equal the current measurement. Essential baseline for all time-series tasks.
2. **Historical Diurnal Mean Baseline**:
   $$\hat{y}_{t+2h} = \bar{y}_{diurnal}(t + 2h)$$
   Predicts the average DO concentration observed for that specific hour of day across the training set (grouped hour-of-day mean, not a harmonic regression).
3. **LightGBM Gradient Boosted Decision Tree Regressor**:
   Trained with early stopping (30 rounds on validation set), learning rate $\eta = 0.04$, 31 leaves, subsample ratio 0.85.

### 5.2 Comparative Results Table (Held-Out Test Set)

| Model / Baseline | RMSE (mg/L) | MAE (mg/L) | $R^2$ Score | Improvement vs Persistence |
| :--- | :---: | :---: | :---: | :---: |
| **1. Naive Persistence Baseline** | $0.4963$ | $0.4457$ | $0.6989$ | Reference Baseline |
| **2. Historical Diurnal Mean Baseline** | $0.1447$ | $0.1159$ | $0.9744$ | $+70.85\%$ |
| **3. LightGBM Regressor** | **$0.1376$** | **$0.1092$** | **$0.9768$** | **$+72.27\%$** |

### 5.3 Academic Interpretation of Benchmark Results
1. **Improvement vs Persistence**: The LightGBM regressor reduces root-mean-square error by **$72.27\%$** relative to the persistence baseline (RMSE drops from $0.4963\text{ mg/L}$ to $0.1376\text{ mg/L}$). This demonstrates that the 27 engineered features capture temporal rates of change and metabolic forcing rather than simply repeating the latest value.
2. **Comparison with Diurnal Mean Baseline**: LightGBM outperforms the static Historical Diurnal Mean baseline ($0.1376\text{ mg/L}$ vs $0.1447\text{ mg/L}$ RMSE, $R^2 = 0.9768$ vs $0.9744$). While the static diurnal mean captures undisturbed cyclic variation, LightGBM dynamically adapts to scheduled feeding events, respiration variations, and multivariate interactions across its 27 canonical features.

---

## 6. Empirical Quantile Prediction Intervals & Uncertainty Analysis

### 6.1 Formulation of Quantile Regressors
To quantify forecast uncertainty without relying on arbitrary hardcoded offsets, two dedicated **LightGBM Quantile Regressors** were trained:
- **Lower Bound Model**: `objective="quantile"`, $\alpha = 0.05$ (5th percentile).
- **Upper Bound Model**: `objective="quantile"`, $\alpha = 0.95$ (95th percentile).
- Minimizes the asymmetric pinball loss function:
  $$\mathcal{L}_{q}(y, \hat{y}) = \max(q(y - \hat{y}), (q - 1)(y - \hat{y}))$$

### 6.2 Empirical Coverage on Synthetic Held-Out Test Set
- **Nominal Coverage Target**: $90.0\%$ (span between $5^{\text{th}}$ and $95^{\text{th}}$ percentiles).
- **Observed Empirical Coverage**: **$78.50\%$**.
- **Average Prediction Interval Width**: **$0.4030\text{ mg/L}$**.
- **Residual Standard Deviation**: $\sigma_{\text{res}} = 0.1376\text{ mg/L}$.

*Academic Honesty Statement:* The empirical coverage of approximately 78.5% demonstrates that while quantile regressors capture meaningful uncertainty bands, they do not achieve the nominal 90% coverage on this dataset. Further calibration (such as conformal prediction or post-hoc scaling) would be required before these intervals could be claimed as calibrated 90% prediction intervals.

---

## 7. Streaming Residual Distribution Monitoring (ADWIN-Inspired Detector)

### 7.1 Mathematical Formulation & Methodology
An **ADWIN-inspired adaptive-window drift detector using Hoeffding-style sub-window comparisons** monitors the streaming distribution of true delayed 2-hour forecast residuals:

$$e_t = |y_{t+2h} - \hat{y}_{t+2h}|$$

A forecast generated at time $t$ for target horizon $t+2\text{h}$ is maintained in a pending register. When the true observation at $t+2\text{h}$ arrives, the absolute residual is computed and fed into the detector.

The detector dynamically maintains a variable-length window $W$ of recent residuals. When any split of $W$ into $W_0$ and $W_1$ exhibits a difference in means $|\mu_{W_0} - \mu_{W_1}| > \epsilon_{\text{cut}}$, a distributional shift is declared:

$$\epsilon_{\text{cut}} = \sqrt{\frac{1}{2m} \ln\left(\frac{4 |W|}{\delta}\right)}, \quad m = \frac{1}{\frac{1}{|W_0|} + \frac{1}{|W_1|}}$$

Where $\delta = 0.002$ is a detector confidence/control parameter. Note: $\delta = 0.002$ is a theoretical upper bound parameter in the Hoeffding inequality, **not** an empirical 0.2% false-positive rate. Furthermore, the implementation is an ADWIN-inspired sub-window comparison detector, not claimed as mathematically identical to the full reference implementation of standard ADWIN.

### 7.2 Experimental Validation Results

```
Stationary Regime (893 Held-Out Steps)          Simulated Aerator Failure Scenario
[====================================] --------> [==============================]
Residual Mean: ~0.118 mg/L                       Residual Mean: Jumps to >2.5 mg/L
Stationary Detections: 0 / 893 steps             Shift Flagged at Residual Step 15 (75 min)
Status: STABLE                                   Status: DRIFT DETECTED
```

1. **Stationary Baseline Evaluation**:
   - Evaluated across all **$893\text{ steps}$** of the held-out test partition using true delayed residuals.
   - **Stationary Detections**: **0**. No drift detections were observed during this particular 893-step stationary synthetic evaluation. (This does not establish a general 0% false-positive rate).
2. **Simulated Aerator Failure Scenario**:
   - Evaluated on a separate, fresh detector instance monitoring delayed residuals during an acute aerator failure scenario.
   - As aeration was lost and DO dropped toward the scenario floor, true residuals diverged substantially from the model's normal expectations.
   - **Result**: The detector flagged a distribution shift at **evaluated residual step 15 (a 75-minute scenario-specific detection delay in the evaluated residual stream post-failure)**, when the sub-window residual mean reached $2.96\text{ mg/L}$, exceeding the threshold $\epsilon_{\text{cut}} = 0.84\text{ mg/L}$.
   - *Academic Scope & Warning Qualification:* The 75-minute figure is a scenario-specific detection delay in the evaluated residual stream under simulated acute failure; it is **NOT** a 75-minute advance warning, warning time, or guaranteed lead time. Concept drift monitors changes in streaming forecast residuals rather than directly diagnosing physical hardware health.

---

## 8. Scientific Limitations of Synthetic ML Evaluation

To ensure full transparency during project evaluation and university viva:
1. **Synthetic Data Simplicity**: The LightGBM model was trained on data generated from a stochastic phenomenological simulator (sinusoidal diurnal terms + mean-reverting Ornstein-Uhlenbeck SDE noise). In a physical commercial aquaculture pond, unmodeled environmental dynamics (e.g. sudden rainfall runoff, plankton die-offs, turbidity spikes, sensor calibration drift) would introduce greater residual variance.
2. **Horizon Trade-off**: A 2-hour forecast horizon ($24\text{ steps}$) was chosen because it provides sufficient time for farm personnel to respond to impending nocturnal hypoxia. Longer horizons ($>6\text{ hours}$) without real-time weather forecasts (solar irradiance, cloud cover) would decay toward the historical diurnal mean.
3. **Physical Sensor Recalibration**: In real deployment, physical galvanic or optical dissolved oxygen probes require weekly membrane cleaning and zero-point calibration; concept drift detection in that context would monitor sensor biofouling as well as biological regime changes.
