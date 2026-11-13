from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

try:
    import pandas as pd
except ImportError:
    pd = None

# The exact 27 canonical model features in strict canonical order
CANONICAL_FEATURES: List[str] = [
    "dissolved_oxygen_mgl",
    "tan_mgl",
    "ph",
    "temperature_c",
    "calculated_nh3_mgl",
    "do_lag_1",
    "do_lag_2",
    "do_lag_3",
    "do_lag_6",
    "do_lag_12",
    "tan_lag_1",
    "tan_lag_2",
    "tan_lag_6",
    "ph_lag_1",
    "temp_lag_1",
    "do_roll_mean_1h",
    "do_roll_std_1h",
    "do_roll_min_1h",
    "do_roll_max_1h",
    "do_roll_mean_3h",
    "do_roll_std_3h",
    "tan_roll_mean_3h",
    "do_roll_mean_6h",
    "do_roll_std_6h",
    "tan_roll_mean_6h",
    "sin_hour",
    "cos_hour",
]

TARGET_COL = "target_do_2h"
FORECAST_HORIZON_STEPS = 24  # 2 hours at 5-minute sampling = 24 steps
WINDOW_1H_STEPS = 12         # 1 hour at 5-minute sampling = 12 steps
WINDOW_3H_STEPS = 36         # 3 hours at 5-minute sampling = 36 steps
WINDOW_6H_STEPS = 72         # 6 hours at 5-minute sampling = 72 steps
MIN_HISTORY_STEPS = 72       # Complete 6-hour history required prior to time t


def calculate_unionized_ammonia(tan_mgl: float, ph: float, temp_c: float) -> float:
    """
    Emerson et al. (1975) chemical equilibrium equation.
    Freshwater formulation estimating unionized ammonia (NH3) from TAN, pH, and Temperature.
    Note: Salinity-dependent activity coefficient corrections are not modeled in this freshwater form.
    """
    temp_k = temp_c + 273.15
    pka = (2729.92 / temp_k) + 0.09018
    exponent = pka - ph
    if exponent > 30.0:
        fraction = 0.0
    elif exponent < -30.0:
        fraction = 1.0
    else:
        fraction = 1.0 / (1.0 + math.pow(10.0, exponent))
    return round(float(tan_mgl * fraction), 4)


def engineer_training_dataframe(
    df: pd.DataFrame,
    forecast_horizon_steps: int = FORECAST_HORIZON_STEPS,
) -> pd.DataFrame:
    """
    Constructs canonical 27 features and future target column for model training.
    Strictly aligns with the inference feature extractor.
    """
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    # 1. Target variable: DO at t + 2h (24 steps ahead)
    df[TARGET_COL] = df["dissolved_oxygen_mgl"].shift(-forecast_horizon_steps)

    # 2. Emerson Unionized Ammonia at current step t
    if "calculated_nh3_mgl" not in df.columns:
        df["calculated_nh3_mgl"] = df.apply(
            lambda r: calculate_unionized_ammonia(r["tan_mgl"], r["ph"], r["temperature_c"]),
            axis=1,
        )

    # 3. Temporal Lag Features (observation at t - lag)
    for lag in [1, 2, 3, 6, 12]:
        df[f"do_lag_{lag}"] = df["dissolved_oxygen_mgl"].shift(lag)
    for lag in [1, 2, 6]:
        df[f"tan_lag_{lag}"] = df["tan_mgl"].shift(lag)

    # Previous observation (t - 1) for pH and Temperature
    df["ph_lag_1"] = df["ph"].shift(1)
    df["temp_lag_1"] = df["temperature_c"].shift(1)

    # 4. Multi-Scale Rolling Statistics strictly EXCLUDING current step t (shift(1))
    df["do_roll_mean_1h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_1H_STEPS).mean()
    df["do_roll_std_1h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_1H_STEPS).std()
    df["do_roll_min_1h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_1H_STEPS).min()
    df["do_roll_max_1h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_1H_STEPS).max()

    df["do_roll_mean_3h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_3H_STEPS).mean()
    df["do_roll_std_3h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_3H_STEPS).std()
    df["tan_roll_mean_3h"] = df["tan_mgl"].shift(1).rolling(WINDOW_3H_STEPS).mean()

    df["do_roll_mean_6h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_6H_STEPS).mean()
    df["do_roll_std_6h"] = df["dissolved_oxygen_mgl"].shift(1).rolling(WINDOW_6H_STEPS).std()
    df["tan_roll_mean_6h"] = df["tan_mgl"].shift(1).rolling(WINDOW_6H_STEPS).mean()

    # 5. Cyclical Diurnal Embeddings evaluated at prediction time t
    hour_float = df["timestamp"].dt.hour + df["timestamp"].dt.minute / 60.0
    df["sin_hour"] = np.sin(2.0 * np.pi * hour_float / 24.0)
    df["cos_hour"] = np.cos(2.0 * np.pi * hour_float / 24.0)

    # Drop NaNs created by 72-step lookback and 24-step forward target shift
    clean_df = df.dropna(subset=CANONICAL_FEATURES + [TARGET_COL]).reset_index(drop=True)
    return clean_df


def extract_inference_features(
    current_reading: dict,
    history_prior: List[dict],
) -> np.ndarray:
    """
    Extracts the canonical 27-feature vector for real-time model inference.
    
    Parameters:
    - current_reading: telemetry dictionary at prediction time t containing 'timestamp' and 'sensors'.
    - history_prior: chronologically ordered list of at least 72 observations strictly PRIOR to time t.
      If the list contains the current reading at the end, it must be sliced out before passing.
    
    Returns:
    - 2D numpy array of shape (1, 27) in CANONICAL_FEATURES order.
    
    Raises:
    - ValueError if history_prior contains fewer than 72 historical observations.
    """
    if len(history_prior) < MIN_HISTORY_STEPS:
        raise ValueError(
            f"Insufficient history for 6-hour rolling features: received {len(history_prior)}, "
            f"required at least {MIN_HISTORY_STEPS}."
        )

    # 1. Current sensor values at time t
    curr_sensors = current_reading.get("sensors", {})
    curr_do = float(curr_sensors["dissolved_oxygen_mgl"])
    curr_tan = float(curr_sensors["tan_mgl"])
    curr_ph = float(curr_sensors["ph"])
    curr_temp = float(curr_sensors["temperature_c"])
    curr_nh3 = calculate_unionized_ammonia(curr_tan, curr_ph, curr_temp)

    # 2. Historical time series strictly prior to t
    # Ensure chronological order (oldest -> newest) based on timestamp
    try:
        sorted_history = sorted(history_prior, key=lambda h: h.get("timestamp", ""))
    except Exception:
        sorted_history = list(history_prior)

    # Order: index -1 is t-1, index -2 is t-2, ..., index -72 is t-72
    do_hist = [float(h["sensors"]["dissolved_oxygen_mgl"]) for h in sorted_history]
    tan_hist = [float(h["sensors"]["tan_mgl"]) for h in sorted_history]
    ph_hist = [float(h["sensors"]["ph"]) for h in sorted_history]
    temp_hist = [float(h["sensors"]["temperature_c"]) for h in sorted_history]

    # Lags (observation at t - lag)
    do_lag_1 = do_hist[-1]
    do_lag_2 = do_hist[-2]
    do_lag_3 = do_hist[-3]
    do_lag_6 = do_hist[-6]
    do_lag_12 = do_hist[-12]

    tan_lag_1 = tan_hist[-1]
    tan_lag_2 = tan_hist[-2]
    tan_lag_6 = tan_hist[-6]

    # Previous observation at t - 1
    ph_lag_1 = ph_hist[-1]
    temp_lag_1 = temp_hist[-1]

    # 3. Rolling window statistics strictly prior to t (ddof=1 matching pandas)
    do_1h = do_hist[-WINDOW_1H_STEPS:]
    do_roll_mean_1h = float(np.mean(do_1h))
    do_roll_std_1h = float(np.std(do_1h, ddof=1))
    do_roll_min_1h = float(np.min(do_1h))
    do_roll_max_1h = float(np.max(do_1h))

    do_3h = do_hist[-WINDOW_3H_STEPS:]
    tan_3h = tan_hist[-WINDOW_3H_STEPS:]
    do_roll_mean_3h = float(np.mean(do_3h))
    do_roll_std_3h = float(np.std(do_3h, ddof=1))
    tan_roll_mean_3h = float(np.mean(tan_3h))

    do_6h = do_hist[-WINDOW_6H_STEPS:]
    tan_6h = tan_hist[-WINDOW_6H_STEPS:]
    do_roll_mean_6h = float(np.mean(do_6h))
    do_roll_std_6h = float(np.std(do_6h, ddof=1))
    tan_roll_mean_6h = float(np.mean(tan_6h))

    # 4. Cyclical Diurnal Embeddings evaluated at prediction time t
    ts_str = current_reading.get("timestamp", "")
    if ts_str.endswith("Z"):
        dt = datetime.fromisoformat(ts_str[:-1] + "+00:00")
    else:
        dt = datetime.fromisoformat(ts_str)

    hour_float = dt.hour + dt.minute / 60.0
    sin_hour = float(math.sin(2.0 * math.pi * hour_float / 24.0))
    cos_hour = float(math.cos(2.0 * math.pi * hour_float / 24.0))

    # Assemble dictionary mapping
    feat_dict: Dict[str, float] = {
        "dissolved_oxygen_mgl": curr_do,
        "tan_mgl": curr_tan,
        "ph": curr_ph,
        "temperature_c": curr_temp,
        "calculated_nh3_mgl": curr_nh3,
        "do_lag_1": do_lag_1,
        "do_lag_2": do_lag_2,
        "do_lag_3": do_lag_3,
        "do_lag_6": do_lag_6,
        "do_lag_12": do_lag_12,
        "tan_lag_1": tan_lag_1,
        "tan_lag_2": tan_lag_2,
        "tan_lag_6": tan_lag_6,
        "ph_lag_1": ph_lag_1,
        "temp_lag_1": temp_lag_1,
        "do_roll_mean_1h": do_roll_mean_1h,
        "do_roll_std_1h": do_roll_std_1h,
        "do_roll_min_1h": do_roll_min_1h,
        "do_roll_max_1h": do_roll_max_1h,
        "do_roll_mean_3h": do_roll_mean_3h,
        "do_roll_std_3h": do_roll_std_3h,
        "tan_roll_mean_3h": tan_roll_mean_3h,
        "do_roll_mean_6h": do_roll_mean_6h,
        "do_roll_std_6h": do_roll_std_6h,
        "tan_roll_mean_6h": tan_roll_mean_6h,
        "sin_hour": sin_hour,
        "cos_hour": cos_hour,
    }

    # Format vector in exact CANONICAL_FEATURES order
    vector = np.array([[feat_dict[k] for k in CANONICAL_FEATURES]], dtype=np.float64)
    return vector
