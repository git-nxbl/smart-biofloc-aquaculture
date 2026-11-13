"""
Machine Learning Forecasting & Concept Drift Service for Biofloc Dissolved Oxygen.

Architectural Guarantees:
- Uses shared canonical 27 features strictly aligned with training (app.features).
- Requires a complete 72-sample (6-hour) lookback history prior to prediction time t.
- Uses documented 'Diurnal–Persistence Hybrid Fallback' when < 72 history samples exist.
- Implements delayed evaluation of true 2-hour forecast residuals for ADWIN concept drift detection.
"""

from datetime import datetime, timedelta, timezone
import json
import logging
import math
import os
from typing import Dict, List, Optional, Tuple
import numpy as np

from .adwin import ADWIN
from .features import (
    CANONICAL_FEATURES,
    FORECAST_HORIZON_STEPS,
    MIN_HISTORY_STEPS,
    calculate_unionized_ammonia,
    extract_inference_features,
)

logger = logging.getLogger("MLService")


def _parse_iso(ts_str: str) -> datetime:
    """Helper to parse ISO-8601 UTC timestamp."""
    try:
        if ts_str.endswith("Z"):
            return datetime.fromisoformat(ts_str[:-1] + "+00:00")
        return datetime.fromisoformat(ts_str)
    except Exception:
        return datetime.now(timezone.utc)


class MLForecaster:
    """
    Inference service for 2-hour Dissolved Oxygen forecasting and ADWIN concept drift monitoring.
    Uses LightGBM point and quantile regression models trained on canonical features,
    and monitors streaming forecast residuals for distribution shifts.
    """

    def __init__(self, model_dir: str = "app/models"):
        self.model_dir = model_dir
        self.point_model = None
        self.q05_model = None
        self.q95_model = None
        self.metadata = None
        self.feature_names: List[str] = CANONICAL_FEATURES
        self.adwin = ADWIN(delta=0.002, min_window_size=30, max_window_size=600)
        self.pending_predictions: Dict[str, float] = {}  # {target_timestamp_iso: predicted_do}
        self.evaluated_residuals_count: int = 0
        self.latest_drift_status = "STABLE"
        self.latest_drift_metrics = {}
        self._load_artifacts()

    @property
    def is_ready(self) -> bool:
        """Indicates whether the ML model artifacts are loaded and ready for inference."""
        return self.point_model is not None and self.metadata is not None

    @staticmethod
    def _predict(model, features: np.ndarray) -> np.ndarray:
        """Robust prediction using native booster or scikit-learn API."""
        if hasattr(model, "booster_"):
            return model.booster_.predict(features)
        elif hasattr(model, "predict"):
            return model.predict(features)
        raise AttributeError("Model has neither booster_ nor predict attribute")

    def _load_artifacts(self):
        try:
            import joblib
            point_path = os.path.join(self.model_dir, "lgbm_do_model.joblib")
            q05_path = os.path.join(self.model_dir, "lgbm_do_lower_q05.joblib")
            q95_path = os.path.join(self.model_dir, "lgbm_do_upper_q95.joblib")
            meta_path = os.path.join(self.model_dir, "model_metadata.json")

            if os.path.exists(point_path):
                self.point_model = joblib.load(point_path)
                logger.info(f"Loaded LightGBM point model from {point_path}")

            if os.path.exists(q05_path) and os.path.exists(q95_path):
                self.q05_model = joblib.load(q05_path)
                self.q95_model = joblib.load(q95_path)
                logger.info("Loaded LightGBM quantile regression models (Q05, Q95).")

            if os.path.exists(meta_path):
                with open(meta_path, "r") as f:
                    self.metadata = json.load(f)
                    self.feature_names = self.metadata.get("features", CANONICAL_FEATURES)
                logger.info(f"Loaded model metadata with {len(self.feature_names)} features.")
        except Exception as e:
            logger.warning(f"Could not load ML artifacts: {e}. Analytical fallback active.")

    def update_adwin_with_observation(self, observation_timestamp_iso: str, actual_do: float) -> Tuple[bool, dict]:
        """
        Delayed evaluation of 2-hour forecast residuals for ADWIN concept drift detection.
        When an observation arrives at time t, checks if a prediction was made at time t - 2h
        targeting timestamp t. If found, computes actual residual |actual_do - predicted_do|
        and feeds it into ADWIN.
        """
        obs_dt = _parse_iso(observation_timestamp_iso)
        matched_target = None
        min_diff_sec = 180.0  # 3-minute matching tolerance for 5-minute sampling

        for target_iso in list(self.pending_predictions.keys()):
            target_dt = _parse_iso(target_iso)
            diff_sec = abs((target_dt - obs_dt).total_seconds())
            if diff_sec <= min_diff_sec:
                matched_target = target_iso
                break
            # Prune stale pending predictions older than 1 hour
            if (obs_dt - target_dt).total_seconds() > 3600.0:
                self.pending_predictions.pop(target_iso, None)

        if matched_target is not None:
            predicted_do = self.pending_predictions.pop(matched_target)
            residual = abs(actual_do - predicted_do)
            self.evaluated_residuals_count += 1

            drift, metrics = self.adwin.update(float(residual))
            if drift:
                self.latest_drift_status = "DRIFT_DETECTED"
                self.latest_drift_metrics = metrics
                logger.warning(
                    f"🚨 ADWIN Concept Drift Flagged on 2-hour forecast residual: {residual:.3f} mg/L | "
                    f"Window Mean: {metrics.get('window_mean', 0.0):.3f} mg/L"
                )
            elif self.adwin.step_count > 30 and metrics.get("window_mean", 0.0) < 0.40:
                self.latest_drift_status = "STABLE"
                self.latest_drift_metrics = metrics

            return drift, metrics

        return False, {}

    def process_observation(self, current_payload: dict, history: Optional[List[dict]] = None) -> dict:
        """
        Unified entry point for incoming telemetry observations (shared by MQTT worker and HTTP POST /api/telemetry).
        1. Evaluates pending 2-hour predictions whose target timestamp has arrived against ADWIN.
        2. If sufficient history (>= 72 observations) exists, generates and stores a new 2-hour prediction.
        Returns the prediction result dictionary.
        """
        curr_sensors = current_payload.get("sensors", {})
        curr_do = float(curr_sensors.get("dissolved_oxygen_mgl", 6.0))
        curr_ts_str = current_payload.get("timestamp", "")

        # 1. Delayed residual evaluation: evaluate any pending forecast for this timestamp
        if curr_ts_str:
            self.update_adwin_with_observation(curr_ts_str, curr_do)

        # 2. Extract and predict, storing the new prediction for t + 2h if history >= 72
        return self._predict_forecast(current_payload, history or [], register_pending=True)

    def predict_2h_do(self, current_payload: dict, history: List[dict]) -> dict:
        """
        Generate 2-hour DO forecast and uncertainty prediction interval without mutating ADWIN observation state.
        Safe for read-only forecast queries (e.g. GET /api/ml/forecast).
        """
        return self._predict_forecast(current_payload, history or [], register_pending=False)

    def _predict_forecast(self, current_payload: dict, history: List[dict], register_pending: bool = False) -> dict:
        """Internal forecast calculation and optional pending prediction registration."""
        curr_sensors = current_payload.get("sensors", {})
        curr_do = float(curr_sensors.get("dissolved_oxygen_mgl", 6.0))
        curr_tan = float(curr_sensors.get("tan_mgl", 0.4))
        curr_ph = float(curr_sensors.get("ph", 7.8))
        curr_temp = float(curr_sensors.get("temperature_c", 28.5))

        curr_ts_str = current_payload.get("timestamp", "")
        curr_dt = _parse_iso(curr_ts_str)

        # Baseline analytical diurnal target (used for hybrid fallback or comparison)
        target_hour = (curr_dt.hour + (curr_dt.minute / 60.0) + 2.0) % 24.0
        diurnal_target = 5.8 + 1.5 * math.sin(2.0 * math.pi * (target_hour - 10.0) / 24.0)

        # Extract historical observations strictly prior to current reading
        history_prior = [
            h for h in history
            if h.get("timestamp") != curr_ts_str
        ]

        model_engine = "Diurnal–Persistence Hybrid Fallback"
        uncertainty_method = "Heuristic Fallback Margin (±0.35 mg/L)"
        is_fallback = True

        # Default fallback values
        pred_do = round(0.4 * curr_do + 0.6 * diurnal_target, 2)
        lower_bound = round(pred_do - 0.35, 2)
        upper_bound = round(pred_do + 0.35, 2)

        # If LightGBM models and full 6-hour history (>= 72 steps) are available, run inference
        if self.is_ready and len(history_prior) >= MIN_HISTORY_STEPS:
            try:
                features = extract_inference_features(current_payload, history_prior[-MIN_HISTORY_STEPS:])
                pred_do = round(float(self._predict(self.point_model, features)[0]), 2)

                if self.q05_model is not None and self.q95_model is not None:
                    lower_bound = round(float(self._predict(self.q05_model, features)[0]), 2)
                    upper_bound = round(float(self._predict(self.q95_model, features)[0]), 2)
                    uncertainty_method = "LightGBM Empirical Quantile Regression (alpha=0.05, 0.95)"
                else:
                    res_std = self.metadata.get("benchmarks", {}).get("uncertainty_quantification", {}).get("residual_std_mgl", 0.15)
                    lower_bound = round(pred_do - 1.645 * res_std, 2)
                    upper_bound = round(pred_do + 1.645 * res_std, 2)
                    uncertainty_method = "Gaussian Residual Approximation"

                model_engine = "LightGBM Quantile Pipeline"
                is_fallback = False

                # Register pending prediction for target time t + 2 hours for delayed evaluation
                if register_pending:
                    target_dt = curr_dt + timedelta(hours=2)
                    target_iso = target_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                    self.pending_predictions[target_iso] = pred_do

            except Exception as e:
                import traceback
                logger.warning(f"Feature extraction or inference failed: {e}\n{traceback.format_exc()}. Falling back to analytical model.")

        # Compute recent DO velocity across the last 3-4 steps (15-20 min window)
        recent_dos = [
            float(h.get("sensors", {}).get("dissolved_oxygen_mgl", curr_do))
            for h in history_prior[-3:]
        ] + [curr_do]

        if len(recent_dos) >= 2:
            time_delta_hours = (len(recent_dos) - 1) * (5.0 / 60.0)
            do_slope_per_hour = (recent_dos[-1] - recent_dos[0]) / max(time_delta_hours, 1e-4)
        else:
            do_slope_per_hour = 0.0

        # Physical biofloc phenomenological respiration constraint
        # Normal microbial biofloc has theta_decay ~ 1.20 h^-1, hypoxic floor ~ 1.80 mg/L
        hypoxic_floor = 1.80
        is_decaying = do_slope_per_hour < -0.80 or (curr_do < 4.50 and do_slope_per_hour < -0.20)
        is_recovering = do_slope_per_hour > 0.80 and curr_do < 5.80

        if is_decaying:
            # Physical exponential decay under un-aerated biofloc biological oxygen demand
            respiration_decay_2h = hypoxic_floor + max(0.0, (curr_do - hypoxic_floor)) * math.exp(-1.20 * 2.0)
            physical_bound = round(respiration_decay_2h, 2)
            # Bound prediction to physically realistic respiration floor
            if pred_do > physical_bound:
                pred_do = physical_bound
                lower_bound = round(max(1.20, pred_do - 0.35), 2)
                upper_bound = round(min(curr_do, pred_do + 0.40), 2)
                if not is_fallback:
                    model_engine = "Physics-Informed LightGBM (Decay Constrained)"
                    uncertainty_method = "Hypoxic Decay Regime Interval"
        elif is_recovering:
            # Physical re-oxygenation asymptotic rebound toward saturation (6.20 mg/L)
            recovery_target = 6.20
            physical_recovery_2h = recovery_target - max(0.0, (recovery_target - curr_do)) * math.exp(-0.80 * 2.0)
            physical_bound = round(physical_recovery_2h, 2)
            if pred_do < physical_bound:
                pred_do = physical_bound
                lower_bound = round(pred_do - 0.35, 2)
                upper_bound = round(pred_do + 0.35, 2)
                if not is_fallback:
                    model_engine = "Physics-Informed LightGBM (Recovery Rebound)"
                    uncertainty_method = "Re-aeration Asymptotic Interval"

        # Project operational status categorization (based on typical biofloc thresholds)
        # Optimal: >= 5.0 mg/L | Warning: 4.0 - 5.0 mg/L | Critical: < 4.0 mg/L
        status = "Optimal" if pred_do >= 5.0 else ("Warning" if pred_do >= 4.0 else "Critical")

        persistence_baseline = round(curr_do, 2)
        persistence_error = round(abs(pred_do - persistence_baseline), 2)

        return {
            "predicted_do_2h": pred_do,
            "current_do": round(curr_do, 2),
            "delta": round(pred_do - curr_do, 2),
            "status": status,
            "prediction_interval": [lower_bound, upper_bound],
            "persistence_baseline": persistence_baseline,
            "persistence_error": persistence_error,
            "concept_drift_status": self.latest_drift_status,
            "model_engine": model_engine,
            "uncertainty_method": uncertainty_method,
            "is_fallback": is_fallback,
            "do_slope_per_hour": round(do_slope_per_hour, 2),
        }
