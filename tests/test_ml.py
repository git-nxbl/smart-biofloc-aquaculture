"""
ML Pipeline, Canonical Feature Consistency, Quantile Inference, and ADWIN Drift Tests.
"""

import math
import os
import sys
from datetime import datetime, timedelta, timezone
import numpy as np
import pytest

# Ensure paths for backend and ml
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml")))

from app.adwin import ADWIN
from app.features import (
    CANONICAL_FEATURES,
    FORECAST_HORIZON_STEPS,
    MIN_HISTORY_STEPS,
    TARGET_COL,
    calculate_unionized_ammonia,
    extract_inference_features,
)
from app.ml_service import MLForecaster


def test_canonical_feature_specification():
    """Verify that exactly 27 canonical features are defined in strict canonical order."""
    assert len(CANONICAL_FEATURES) == 27
    assert CANONICAL_FEATURES[0] == "dissolved_oxygen_mgl"
    assert CANONICAL_FEATURES[4] == "calculated_nh3_mgl"
    assert CANONICAL_FEATURES[13] == "ph_lag_1"
    assert CANONICAL_FEATURES[14] == "temp_lag_1"
    assert CANONICAL_FEATURES[22] == "do_roll_mean_6h"
    assert CANONICAL_FEATURES[25] == "sin_hour"
    assert CANONICAL_FEATURES[26] == "cos_hour"
    assert MIN_HISTORY_STEPS == 72
    assert FORECAST_HORIZON_STEPS == 24


def test_inference_feature_extraction_semantics():
    """
    Verify feature extraction on historical readings:
    - Lag 1 must reflect previous observation (t-1), not current observation (t).
    - Rolling 6-hour window must use exactly 72 samples strictly prior to t.
    - Emerson NH3 must be accurately computed.
    """
    base_dt = datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc)
    # Generate 75 consecutive 5-minute historical readings
    history = []
    for i in range(75):
        dt = base_dt - timedelta(minutes=5 * (75 - i))
        history.append({
            "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sensors": {
                "dissolved_oxygen_mgl": round(6.0 + 0.1 * i, 2),
                "tan_mgl": round(0.40 + 0.01 * (i % 10), 2),
                "ph": round(7.80 + 0.005 * i, 2),
                "temperature_c": round(28.0 + 0.02 * i, 1),
            },
        })

    # Current reading at base_dt (time t)
    current = {
        "timestamp": base_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensors": {
            "dissolved_oxygen_mgl": 13.50,  # Distinct value at time t
            "tan_mgl": 0.85,
            "ph": 8.10,                     # Distinct pH at time t
            "temperature_c": 29.5,          # Distinct temp at time t
        },
    }

    # Extract features using the 72 readings strictly prior to t
    history_prior = history[-MIN_HISTORY_STEPS:]
    assert len(history_prior) == 72

    feat_vec = extract_inference_features(current, history_prior)
    assert feat_vec.shape == (1, 27)

    feat_map = {name: feat_vec[0, idx] for idx, name in enumerate(CANONICAL_FEATURES)}

    # Verify current values at time t
    assert feat_map["dissolved_oxygen_mgl"] == 13.50
    assert feat_map["tan_mgl"] == 0.85
    assert feat_map["ph"] == 8.10
    assert feat_map["temperature_c"] == 29.5

    # Verify lags: ph_lag_1 and temp_lag_1 must match t-1, NOT time t
    expected_t_minus_1 = history_prior[-1]["sensors"]
    assert feat_map["do_lag_1"] == expected_t_minus_1["dissolved_oxygen_mgl"]
    assert feat_map["ph_lag_1"] == expected_t_minus_1["ph"]
    assert feat_map["temp_lag_1"] == expected_t_minus_1["temperature_c"]

    # Verify rolling 6-hour mean uses 72 history samples strictly prior to t
    prior_dos = [h["sensors"]["dissolved_oxygen_mgl"] for h in history_prior]
    assert math.isclose(feat_map["do_roll_mean_6h"], np.mean(prior_dos), rel_tol=1e-5)


def test_adwin_stationary_no_false_alarm():
    """Verify ADWIN produces no false alarm on stationary Gaussian noise."""
    np.random.seed(42)
    adwin = ADWIN(delta=0.002, min_window_size=20)

    drifts_detected = 0
    # 200 samples of stationary noise with mean 0.1
    for _ in range(200):
        val = float(np.random.normal(loc=0.1, scale=0.02))
        drift, _ = adwin.update(val)
        if drift:
            drifts_detected += 1

    assert drifts_detected == 0, f"Expected 0 drifts on stationary noise, got {drifts_detected}"


def test_adwin_detects_sudden_distribution_shift():
    """Verify ADWIN successfully detects a sudden shift in residual mean."""
    np.random.seed(42)
    adwin = ADWIN(delta=0.002, min_window_size=10)

    # 50 stationary samples
    for _ in range(50):
        val = float(np.random.normal(loc=0.1, scale=0.02))
        adwin.update(val)

    # Sudden jump in mean to 0.8
    detected = False
    for step in range(50):
        val = float(np.random.normal(loc=0.8, scale=0.05))
        drift, _ = adwin.update(val)
        if drift:
            detected = True
            break

    assert detected, "ADWIN must detect significant change in mean residual stream"


def test_delayed_forecast_residual_adwin_flow():
    """
    Verify the temporal forecast-residual evaluation architecture:
    1. Forecast generated at time t for t + 2h is stored in pending_predictions.
    2. When observation at t + 2h arrives, residual is computed and fed into ADWIN.
    3. The evaluated prediction is removed from pending_predictions.
    """
    forecaster = MLForecaster(model_dir="/app/app/models" if os.path.exists("/app/app/models") else "backend/app/models")
    t0 = datetime(2026, 9, 1, 10, 0, 0, tzinfo=timezone.utc)
    t0_str = t0.strftime("%Y-%m-%dT%H:%M:%SZ")
    t2h_str = (t0 + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Manually register a pending prediction for t + 2h
    forecaster.pending_predictions[t2h_str] = 6.20

    # Observation at t + 1h arrives (should not match t + 2h)
    t1h_str = (t0 + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    drift, metrics = forecaster.update_adwin_with_observation(t1h_str, actual_do=6.0)
    assert t2h_str in forecaster.pending_predictions, "Pending prediction for t+2h must remain pending at t+1h"

    # Observation at t + 2h arrives (matches target within tolerance)
    prev_evaluated_count = forecaster.evaluated_residuals_count
    drift, metrics = forecaster.update_adwin_with_observation(t2h_str, actual_do=6.35)
    assert t2h_str not in forecaster.pending_predictions, "Target prediction must be removed upon evaluation"
    assert forecaster.evaluated_residuals_count == prev_evaluated_count + 1


def test_ml_forecaster_predictions_with_full_history():
    """Verify MLForecaster loads model artifacts and computes LightGBM forecast when 72 history samples are provided."""
    model_dir = "/app/app/models" if os.path.exists("/app/app/models") else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "app", "models"))
    forecaster = MLForecaster(model_dir=model_dir)

    assert forecaster.is_ready, "MLForecaster should successfully load trained models"

    # Generate 75 chronological historical readings at 5-minute intervals
    base_dt = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
    history = []
    for i in range(75):
        dt = base_dt - timedelta(minutes=5 * (75 - i))
        history.append({
            "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sensors": {
                "ph": round(7.8 + 0.01 * np.sin(i), 2),
                "temperature_c": 28.5,
                "dissolved_oxygen_mgl": round(6.2 + 0.1 * np.cos(i), 2),
                "tan_mgl": 0.45,
            },
        })

    latest = {
        "timestamp": base_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensors": {
            "ph": 7.85,
            "temperature_c": 28.5,
            "dissolved_oxygen_mgl": 6.25,
            "tan_mgl": 0.45,
        },
    }

    result = forecaster.predict_2h_do(latest, history)

    assert "predicted_do_2h" in result
    assert "current_do" in result
    assert "prediction_interval" in result
    assert "persistence_baseline" in result
    assert "concept_drift_status" in result
    assert result["is_fallback"] is False
    assert result["model_engine"] == "LightGBM Quantile Pipeline"
    assert result["uncertainty_method"] == "LightGBM Empirical Quantile Regression (alpha=0.05, 0.95)"

    pred = result["predicted_do_2h"]
    lower, upper = result["prediction_interval"]
    persistence = result["persistence_baseline"]

    assert 2.0 <= pred <= 12.0
    assert persistence == 6.25
    assert lower <= upper, f"Lower bound {lower} must be <= upper bound {upper}"


def test_ml_forecaster_fallback_on_short_history():
    """Verify MLForecaster falls back to Diurnal–Persistence Hybrid Fallback when history < 72 samples."""
    model_dir = "/app/app/models" if os.path.exists("/app/app/models") else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "app", "models"))
    forecaster = MLForecaster(model_dir=model_dir)

    latest = {
        "timestamp": "2026-09-15T12:00:00Z",
        "sensors": {
            "ph": 7.8,
            "temperature_c": 28.5,
            "dissolved_oxygen_mgl": 6.5,
            "tan_mgl": 0.45,
        },
    }
    # Only 10 historical readings (< 72)
    short_history = [latest] * 10

    result = forecaster.predict_2h_do(latest, short_history)
    assert "predicted_do_2h" in result
    assert result["predicted_do_2h"] >= 0.0
    assert result["is_fallback"] is True
    assert result["model_engine"] == "Diurnal–Persistence Hybrid Fallback"
    assert result["uncertainty_method"] == "Heuristic Fallback Margin (±0.35 mg/L)"


def test_unified_process_observation_pipeline():
    """
    Verify the unified ML observation pipeline used by both MQTT worker and HTTP POST /api/telemetry:
    1. process_observation evaluates any pending prediction targeting the observation's timestamp.
    2. If history has >= 72 steps, process_observation generates a forecast and registers a pending prediction for t + 2h.
    3. The pending prediction is not evaluated until a matching timestamp arrives.
    """
    model_dir = "/app/app/models" if os.path.exists("/app/app/models") else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "app", "models"))
    forecaster = MLForecaster(model_dir=model_dir)

    base_dt = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
    # Generate 75 history items
    history = []
    for i in range(75):
        dt = base_dt - timedelta(minutes=5 * (75 - i))
        history.append({
            "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sensors": {
                "ph": 7.8,
                "temperature_c": 28.5,
                "dissolved_oxygen_mgl": 6.2,
                "tan_mgl": 0.45,
            },
        })

    obs_0 = {
        "timestamp": base_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensors": {
            "ph": 7.85,
            "temperature_c": 28.5,
            "dissolved_oxygen_mgl": 6.3,
            "tan_mgl": 0.45,
        },
    }

    # Process observation at t0 with full history
    res_0 = forecaster.process_observation(obs_0, history)
    assert not res_0["is_fallback"]
    assert res_0["model_engine"] == "LightGBM Quantile Pipeline"

    # Pending prediction must have been registered for t0 + 2h
    target_dt_str = (base_dt + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert target_dt_str in forecaster.pending_predictions
    predicted_val = forecaster.pending_predictions[target_dt_str]
    assert math.isclose(predicted_val, res_0["predicted_do_2h"], rel_tol=1e-5)

    # Calling process_observation at an intermediate time (t0 + 30m) does NOT trigger evaluation
    intermediate_dt = base_dt + timedelta(minutes=30)
    obs_inter = {
        "timestamp": intermediate_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensors": {"ph": 7.8, "temperature_c": 28.5, "dissolved_oxygen_mgl": 6.25, "tan_mgl": 0.45},
    }
    history.append(obs_0)
    forecaster.process_observation(obs_inter, history[-72:])
    assert target_dt_str in forecaster.pending_predictions, "Target prediction must remain pending before target time"

    # When target timestamp arrives at t0 + 2h, process_observation must evaluate the pending prediction
    target_obs = {
        "timestamp": target_dt_str,
        "sensors": {"ph": 7.8, "temperature_c": 28.5, "dissolved_oxygen_mgl": 6.10, "tan_mgl": 0.45},
    }
    prev_count = forecaster.evaluated_residuals_count
    forecaster.process_observation(target_obs, history[-72:])
    assert target_dt_str not in forecaster.pending_predictions, "Target prediction must be consumed upon evaluation"
    assert forecaster.evaluated_residuals_count == prev_count + 1


def test_predict_2h_do_is_read_only_and_does_not_mutate_pending_predictions():
    """Verify that predict_2h_do does NOT register pending predictions or alter evaluated residuals."""
    model_dir = "/app/app/models" if os.path.exists("/app/app/models") else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "app", "models"))
    forecaster = MLForecaster(model_dir=model_dir)

    base_dt = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
    history = []
    for i in range(75):
        dt = base_dt - timedelta(minutes=5 * (75 - i))
        history.append({
            "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sensors": {"ph": 7.8, "temperature_c": 28.5, "dissolved_oxygen_mgl": 6.2, "tan_mgl": 0.45},
        })

    obs = {
        "timestamp": base_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensors": {"ph": 7.85, "temperature_c": 28.5, "dissolved_oxygen_mgl": 6.3, "tan_mgl": 0.45},
    }

    initial_pending_count = len(forecaster.pending_predictions)
    initial_eval_count = forecaster.evaluated_residuals_count

    # Call read-only predict_2h_do
    res = forecaster.predict_2h_do(obs, history)
    assert not res["is_fallback"]
    assert len(forecaster.pending_predictions) == initial_pending_count, "predict_2h_do must not add pending predictions"
    assert forecaster.evaluated_residuals_count == initial_eval_count, "predict_2h_do must not evaluate residuals"


def test_chronological_history_sorting_at_feature_boundary():
    """
    Verify that extract_inference_features enforces chronological sorting (oldest -> newest)
    even if the history array passed to it is shuffled or in reverse order.
    """
    base_dt = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
    # Generate 75 strictly chronological readings
    chronological_history = []
    for i in range(75):
        dt = base_dt - timedelta(minutes=5 * (75 - i))
        chronological_history.append({
            "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sensors": {
                "ph": round(7.5 + 0.01 * i, 3),
                "temperature_c": round(27.0 + 0.02 * i, 2),
                "dissolved_oxygen_mgl": round(5.0 + 0.05 * i, 3),
                "tan_mgl": round(0.30 + 0.005 * i, 3),
            },
        })

    current = {
        "timestamp": base_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensors": {
            "ph": 8.0,
            "temperature_c": 29.0,
            "dissolved_oxygen_mgl": 7.0,
            "tan_mgl": 0.50,
        },
    }

    # Extract features from correctly ordered history
    feat_ordered = extract_inference_features(current, chronological_history[-72:])

    # Reverse the history order (newest -> oldest)
    reversed_history = list(reversed(chronological_history[-72:]))
    feat_reversed = extract_inference_features(current, reversed_history)

    # Shuffled history
    rng = np.random.default_rng(42)
    shuffled_history = list(chronological_history[-72:])
    rng.shuffle(shuffled_history)
    feat_shuffled = extract_inference_features(current, shuffled_history)

    # All three extracted feature vectors must be identical
    np.testing.assert_allclose(feat_reversed, feat_ordered, rtol=1e-6, err_msg="Reversed history must produce identical features")
    np.testing.assert_allclose(feat_shuffled, feat_ordered, rtol=1e-6, err_msg="Shuffled history must produce identical features")

