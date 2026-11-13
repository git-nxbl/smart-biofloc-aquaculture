"""
Machine Learning Pipeline for Biofloc Dissolved Oxygen Forecasting & Concept Drift Detection.

Academic Standard Implementation:
- Generates reproducible biofloc telemetry using the BioflocSDEEngine with fixed random seed.
- Uses shared canonical 27 features strictly aligned between training and live inference.
- Evaluates multiple baselines:
    1. Naive Persistence Baseline: DO(t + 2h) = DO(t)
    2. Historical Diurnal Mean Baseline: DO(t + 2h) = DiurnalMean(t + 2h)
    3. LightGBM Point Regressor
- Evaluates LightGBM Quantile Regressors (alpha=0.05 and alpha=0.95) for empirical prediction intervals.
- Evaluates ADWIN on genuine 2-hour forecast residuals during a simulated aerator failure scenario.
- Exports dataset to CSV and serialized model artifacts with comprehensive metadata.
"""

import json
import logging
import math
import os
import shutil
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from adwin import ADWIN
from features import (
    CANONICAL_FEATURES,
    FORECAST_HORIZON_STEPS,
    MIN_HISTORY_STEPS,
    TARGET_COL,
    calculate_unionized_ammonia,
    engineer_training_dataframe,
    extract_inference_features,
)
from sde import BioflocSDEEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [ML-PIPELINE] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("MLTrainer")


def generate_and_save_dataset(
    days: int = 21,
    interval_minutes: int = 5,
    seed: int = 42,
    output_path: str = "ml/data/biofloc_synthetic_telemetry.csv",
) -> pd.DataFrame:
    """
    Generates synthetic biofloc telemetry using the BioflocSDEEngine
    and exports to a versioned CSV.
    """
    logger.info(f"Generating {days} days of biofloc telemetry at {interval_minutes}-min intervals (Seed: {seed})...")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    start_time = datetime(2026, 8, 1, 0, 0, 0)
    engine = BioflocSDEEngine(
        seed=seed,
        start_time=start_time,
        interval_minutes=interval_minutes,
    )

    total_steps = (days * 24 * 60) // interval_minutes
    records = []

    for _ in range(total_steps):
        payload = engine.step(advance_sim_time=True)
        sensors = payload["sensors"]
        meta = payload["metadata"]
        records.append({
            "timestamp": payload["timestamp"],
            "tank_id": payload["tank_id"],
            "ph": sensors["ph"],
            "temperature_c": sensors["temperature_c"],
            "dissolved_oxygen_mgl": sensors["dissolved_oxygen_mgl"],
            "tan_mgl": sensors["tan_mgl"],
            "calculated_nh3_mgl": meta["calculated_nh3_mgl"],
            "scenario": meta["scenario"],
        })

    df = pd.DataFrame(records)
    df.to_csv(output_path, index=False)
    logger.info(f"Exported {len(df)} telemetry records to {output_path}")
    return df


def evaluate_models_and_baselines(df: pd.DataFrame):
    """
    Compares LightGBM Regressor against Persistence and Diurnal Mean Baselines.
    Trains empirical quantile models (5% and 95%) for prediction intervals.
    """
    feature_cols = CANONICAL_FEATURES
    target_col = TARGET_COL

    # Strict Chronological Partition: 70% Train, 15% Validation, 15% Test
    n = len(df)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    train_df = df.iloc[:train_end].copy()
    val_df = df.iloc[train_end:val_end].copy()
    test_df = df.iloc[val_end:].copy()

    X_train, y_train = train_df[feature_cols], train_df[target_col]
    X_val, y_val = val_df[feature_cols], val_df[target_col]
    X_test, y_test = test_df[feature_cols], test_df[target_col]

    logger.info(f"Dataset Partitions: Train={len(X_train)}, Val={len(X_val)}, Test={len(X_test)}")

    # -------------------------------------------------------------
    # Baseline 1: Naive Persistence (Future DO at t+2h = Current DO at t)
    # -------------------------------------------------------------
    y_pred_persist = X_test["dissolved_oxygen_mgl"].values
    rmse_persist = math.sqrt(mean_squared_error(y_test, y_pred_persist))
    mae_persist = mean_absolute_error(y_test, y_pred_persist)
    r2_persist = r2_score(y_test, y_pred_persist)

    # -------------------------------------------------------------
    # Baseline 2: Historical Diurnal Mean Baseline
    # Historical mean DO grouped by target hour of day (evaluated on train set)
    # -------------------------------------------------------------
    train_df["hour_int"] = ((train_df["timestamp"].dt.hour + 2) % 24).astype(int)
    hourly_means = train_df.groupby("hour_int")[target_col].mean().to_dict()
    test_target_hours = ((test_df["timestamp"].dt.hour + 2) % 24).astype(int)
    y_pred_diurnal = test_target_hours.map(hourly_means).values
    rmse_diurnal = math.sqrt(mean_squared_error(y_test, y_pred_diurnal))
    mae_diurnal = mean_absolute_error(y_test, y_pred_diurnal)
    r2_diurnal = r2_score(y_test, y_pred_diurnal)

    # -------------------------------------------------------------
    # Model 1: LightGBM Point Regressor
    # -------------------------------------------------------------
    logger.info("Fitting LightGBM Point Regressor with early stopping...")
    point_model = lgb.LGBMRegressor(
        objective="regression",
        n_estimators=350,
        learning_rate=0.04,
        num_leaves=31,
        max_depth=6,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=42,
        verbose=-1,
    )
    point_model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[lgb.early_stopping(stopping_rounds=30, verbose=False)],
    )
    y_pred_lgbm = point_model.predict(X_test)
    rmse_lgbm = math.sqrt(mean_squared_error(y_test, y_pred_lgbm))
    mae_lgbm = mean_absolute_error(y_test, y_pred_lgbm)
    r2_lgbm = r2_score(y_test, y_pred_lgbm)

    # -------------------------------------------------------------
    # Models 2 & 3: LightGBM Quantile Regressors (alpha=0.05 & alpha=0.95)
    # -------------------------------------------------------------
    logger.info("Fitting LightGBM Quantile Regressors (5th and 95th percentiles)...")
    q05_model = lgb.LGBMRegressor(
        objective="quantile",
        alpha=0.05,
        n_estimators=200,
        learning_rate=0.04,
        num_leaves=31,
        random_state=42,
        verbose=-1,
    )
    q05_model.fit(X_train, y_train)
    y_pred_q05 = q05_model.predict(X_test)

    q95_model = lgb.LGBMRegressor(
        objective="quantile",
        alpha=0.95,
        n_estimators=200,
        learning_rate=0.04,
        num_leaves=31,
        random_state=42,
        verbose=-1,
    )
    q95_model.fit(X_train, y_train)
    y_pred_q95 = q95_model.predict(X_test)

    # Calculate empirical test coverage of the 90% prediction interval
    within_interval = (y_test.values >= y_pred_q05) & (y_test.values <= y_pred_q95)
    empirical_coverage = float(np.mean(within_interval)) * 100.0

    # Calculate average interval width
    avg_interval_width = float(np.mean(y_pred_q95 - y_pred_q05))

    # Standard deviation of test residuals
    residuals = y_test.values - y_pred_lgbm
    residual_std = float(np.std(residuals))

    # Improvement over persistence baseline
    rmse_improvement_pct = ((rmse_persist - rmse_lgbm) / rmse_persist) * 100.0

    logger.info("=" * 65)
    logger.info("MODEL BENCHMARK RESULTS ON HELD-OUT TEST SET (2-Hour DO Horizon):")
    logger.info(f"1. Persistence Baseline:   RMSE={rmse_persist:.4f} mg/L | MAE={mae_persist:.4f} | R²={r2_persist:.4f}")
    logger.info(f"2. Diurnal Mean Baseline:  RMSE={rmse_diurnal:.4f} mg/L | MAE={mae_diurnal:.4f} | R²={r2_diurnal:.4f}")
    logger.info(f"3. LightGBM Regressor:     RMSE={rmse_lgbm:.4f} mg/L | MAE={mae_lgbm:.4f} | R²={r2_lgbm:.4f}")
    logger.info(f"   -> LightGBM Improvement over Persistence: {rmse_improvement_pct:.2f}%")
    logger.info(f"   -> Empirical 90% Interval Coverage:       {empirical_coverage:.1f}%")
    logger.info(f"   -> Average 90% Interval Width:           {avg_interval_width:.3f} mg/L")
    logger.info(f"   -> Test Residual Std Dev:                 {residual_std:.4f} mg/L")
    logger.info("=" * 65)

    evaluation_report = {
        "dataset_split": {
            "total_usable_samples": len(df),
            "train_samples": len(X_train),
            "val_samples": len(X_val),
            "test_samples": len(X_test),
            "sampling_interval_minutes": 5,
            "forecast_horizon_hours": 2.0,
        },
        "persistence_baseline": {
            "rmse": round(rmse_persist, 4),
            "mae": round(mae_persist, 4),
            "r2": round(r2_persist, 4),
        },
        "diurnal_mean_baseline": {
            "rmse": round(rmse_diurnal, 4),
            "mae": round(mae_diurnal, 4),
            "r2": round(r2_diurnal, 4),
        },
        "lightgbm_regressor": {
            "rmse": round(rmse_lgbm, 4),
            "mae": round(mae_lgbm, 4),
            "r2": round(r2_lgbm, 4),
            "improvement_over_persistence_pct": round(rmse_improvement_pct, 2),
        },
        "uncertainty_quantification": {
            "method": "LightGBM Quantile Regression (alpha=0.05, 0.95)",
            "nominal_coverage_pct": 90.0,
            "empirical_coverage_pct": round(empirical_coverage, 2),
            "average_interval_width_mgl": round(avg_interval_width, 4),
            "residual_std_mgl": round(residual_std, 4),
            "calibration_note": f"Nominal 90% interval achieved approximately {empirical_coverage:.1f}% empirical coverage on synthetic test data; further calibration required before interpreting as calibrated 90% prediction intervals.",
        },
    }

    return (
        point_model, q05_model, q95_model,
        feature_cols, evaluation_report,
        test_df, y_test.values, y_pred_lgbm,
    )


def evaluate_adwin_on_aerator_failure(point_model, test_residuals: np.ndarray):
    """
    Validates the ADWIN-inspired drift detector using genuine 2-hour forecast residuals:
    1. Evaluates on stationary operational residuals from the held-out test set
       (records stationary drift detections, if any).
    2. Simulates an operational mechanical aerator failure scenario using BioflocSDEEngine:
       - Accumulates complete 72-step (6-hour) history under normal operation.
       - Triggers aerator failure at step 72.
       - Generates true 2-hour ahead LightGBM forecasts along the stream.
       - When t + 24 arrives, evaluates actual 2-hour forecast residual |actual_do - predicted_do|.
       - Feeds actual forecast residuals into a fresh ADWIN detector instance.
    """
    logger.info("Evaluating ADWIN on genuine LightGBM forecast residuals...")

    # 1. Stationary Baseline Evaluation on true test residuals
    adwin_stationary = ADWIN(delta=0.002, min_window_size=30, max_window_size=600)
    stationary_detections = 0
    abs_test_residuals = np.abs(test_residuals)
    for res in abs_test_residuals:
        drift, _ = adwin_stationary.update(float(res))
        if drift:
            stationary_detections += 1
    logger.info(
        f"ADWIN Stationary Evaluation: {stationary_detections} drift detections across "
        f"{len(abs_test_residuals)} actual test residuals (delta=0.002)."
    )

    # 2. Simulated Physical Aerator Failure Scenario Evaluation
    adwin_failure = ADWIN(delta=0.002, min_window_size=30, max_window_size=600)

    # Initialize simulator with fixed seed
    engine = BioflocSDEEngine(
        seed=101,
        start_time=datetime(2026, 9, 1, 6, 0, 0),
        interval_minutes=5.0,
    )

    # Step 1-72: Warmup history to establish initial 6-hour lookback buffer
    history_buffer = []
    for _ in range(MIN_HISTORY_STEPS):
        p = engine.step(advance_sim_time=True)
        history_buffer.append(p)

    pending_predictions: Dict[int, float] = {}  # {target_sim_step: predicted_do}

    # Step 73 to 112 (40 steps normal): Generate predictions and evaluate normal residuals
    # This establishes the baseline operational residual distribution in ADWIN's window
    normal_eval_steps = 40
    current_sim_step = MIN_HISTORY_STEPS
    for _ in range(normal_eval_steps):
        current_payload = engine.step(advance_sim_time=True)
        current_do = float(current_payload["sensors"]["dissolved_oxygen_mgl"])
        current_sim_step += 1

        if current_sim_step in pending_predictions:
            pred_do_2h = pending_predictions.pop(current_sim_step)
            residual = abs(current_do - pred_do_2h)
            adwin_failure.update(float(residual))

        features = extract_inference_features(current_payload, history_buffer[-MIN_HISTORY_STEPS:])
        pred_do = float(point_model.predict(features)[0])
        pending_predictions[current_sim_step + FORECAST_HORIZON_STEPS] = pred_do
        history_buffer.append(current_payload)

    # Step 113 onwards: Trigger simulated mechanical aerator failure
    engine.set_scenario("aerator_failure")
    failure_duration_steps = 60  # 5 hours of failure
    drift_detected_step = None
    drift_metrics = {}
    failure_residual_step = 0

    for f_step in range(1, failure_duration_steps + 1):
        current_payload = engine.step(advance_sim_time=True)
        current_do = float(current_payload["sensors"]["dissolved_oxygen_mgl"])
        current_sim_step += 1

        if current_sim_step in pending_predictions:
            pred_do_2h = pending_predictions.pop(current_sim_step)
            residual = abs(current_do - pred_do_2h)
            failure_residual_step += 1

            drift, metrics = adwin_failure.update(float(residual))
            if drift and drift_detected_step is None:
                drift_detected_step = failure_residual_step
                drift_metrics = metrics
                logger.warning(
                    f"🚨 ADWIN DRIFT DETECTED: Residual distribution shift flagged at "
                    f"failure evaluation step {drift_detected_step} "
                    f"({drift_detected_step * 5} min post-failure evaluated residual)! "
                    f"Window Mean: {metrics.get('window_mean', 0):.3f} mg/L | "
                    f"Threshold: {metrics.get('threshold', 0):.3f}"
                )

        features = extract_inference_features(current_payload, history_buffer[-MIN_HISTORY_STEPS:])
        pred_do = float(point_model.predict(features)[0])
        pending_predictions[current_sim_step + FORECAST_HORIZON_STEPS] = pred_do
        history_buffer.append(current_payload)

    drift_validation_report = {
        "delta_confidence_parameter": 0.002,
        "stationary_detections": stationary_detections,
        "stationary_samples_evaluated": len(abs_test_residuals),
        "failure_scenario_drift_detected": drift_detected_step is not None,
        "detection_evaluated_residual_step": drift_detected_step,
        "detection_delay_minutes": drift_detected_step * 5 if drift_detected_step else None,
        "window_mean_at_drift": round(drift_metrics.get("window_mean", 0.0), 4) if drift_metrics else None,
        "threshold_at_drift": round(drift_metrics.get("threshold", 0.0), 4) if drift_metrics else None,
        "evaluation_observation": f"{stationary_detections} drift detections were observed across {len(abs_test_residuals)} stationary synthetic test residuals.",
        "methodological_note": (
            "ADWIN monitors changes in the streaming distribution of true 2-hour forecast residuals. "
            "Detection delay is specific to the simulated aerator-failure scenario and experimental parameters."
        ),
    }
    return drift_validation_report


def main():
    os.makedirs("ml/models", exist_ok=True)
    os.makedirs("backend/app/models", exist_ok=True)
    os.makedirs("ml/data", exist_ok=True)

    # 1. Generate & save dataset
    dataset_path = "ml/data/biofloc_synthetic_telemetry.csv"
    df = generate_and_save_dataset(
        days=21,
        interval_minutes=5,
        seed=42,
        output_path=dataset_path,
    )

    # 2. Canonical feature engineering
    clean_df = engineer_training_dataframe(df, forecast_horizon_steps=FORECAST_HORIZON_STEPS)

    # 3. Model training & baseline evaluation
    (
        point_model, q05_model, q95_model,
        feature_cols, evaluation_report,
        test_df, y_test, y_pred,
    ) = evaluate_models_and_baselines(clean_df)

    # 4. ADWIN drift validation on actual forecast residuals
    test_residuals = y_test - y_pred
    drift_report = evaluate_adwin_on_aerator_failure(point_model, test_residuals)

    # 5. Export artifacts
    model_path = "ml/models/lgbm_do_model.joblib"
    q05_path = "ml/models/lgbm_do_lower_q05.joblib"
    q95_path = "ml/models/lgbm_do_upper_q95.joblib"
    metadata_path = "ml/models/model_metadata.json"

    joblib.dump(point_model, model_path)
    joblib.dump(q05_model, q05_path)
    joblib.dump(q95_model, q95_path)

    metadata = {
        "model_type": "LightGBM Regressor with Empirical Quantile Prediction Intervals",
        "target": "dissolved_oxygen_mgl_2h_ahead",
        "features": feature_cols,
        "n_features": len(feature_cols),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "benchmarks": evaluation_report,
        "concept_drift_validation": drift_report,
    }

    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    # Copy to backend/app/models
    shutil.copy(model_path, "backend/app/models/lgbm_do_model.joblib")
    shutil.copy(q05_path, "backend/app/models/lgbm_do_lower_q05.joblib")
    shutil.copy(q95_path, "backend/app/models/lgbm_do_upper_q95.joblib")
    shutil.copy(metadata_path, "backend/app/models/model_metadata.json")

    logger.info("Model pipeline completed successfully. Artifacts synced to backend/app/models/")


if __name__ == "__main__":
    main()
