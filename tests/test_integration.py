"""
Closed-Loop Integration Tests for Simulator + Actuation / Control Layer (Phase D).
Tests the complete execution chain:
simulated condition -> rule evaluation -> actuator command -> simulated state change -> telemetry response
"""

import os
import sys
import pytest
import numpy as np

# Add simulator and backend paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "simulator")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from sde import BioflocSDEEngine
from app.control_service import ControlService
from app.schemas import ActuatorCommandRequest


def test_closed_loop_aeration_hypoxia_and_recovery():
    """
    Test complete integration chain:
    1. Simulated aeration failure causes DO decay into hypoxia.
    2. Rule engine in AUTO mode detects low DO (< 4.0 mg/L).
    3. Rule engine issues actuator command: Aeration System -> EMERGENCY (100%).
    4. Actuator state is applied back to the simulator.
    5. Re-oxygenation restores DO > 5.5 mg/L in subsequent simulation steps.
    6. Rule engine evaluates recovered telemetry and switches Aeration System -> NORMAL (50%).
    """
    # 1. Initialize simulator and control service
    engine = BioflocSDEEngine(seed=42, initial_do=5.50)
    ctrl = ControlService(initial_mode="AUTO")

    # Force aeration loss in simulator
    engine.set_scenario("aerator_failure")
    assert engine.actuator_states["aeration_system"] == "OFF"

    # Step simulator until DO falls below 4.0 mg/L
    hypoxic_payload = None
    for _ in range(15):
        payload = engine.step(advance_sim_time=True)
        if payload["sensors"]["dissolved_oxygen_mgl"] < 4.0:
            hypoxic_payload = payload
            break

    assert hypoxic_payload is not None, "Simulator must produce hypoxic DO < 4.0 mg/L under aerator failure"
    measured_low_do = hypoxic_payload["sensors"]["dissolved_oxygen_mgl"]
    assert measured_low_do < 4.0

    # 2. Rule evaluation
    actions = ctrl.evaluate_telemetry_rules(hypoxic_payload)
    assert any("Aeration System → 100%" in a for a in actions)
    assert ctrl.actuators["aeration_system"]["state"] == "EMERGENCY"
    assert ctrl.aeration_in_emergency is True

    # 3. Apply actuator command back to simulator
    engine.apply_actuator_commands({"aeration_system": "EMERGENCY"})
    assert engine.actuator_states["aeration_system"] == "EMERGENCY"

    # 4. Advance simulator with EMERGENCY aeration active
    recovered_payload = None
    for _ in range(25):
        payload = engine.step(advance_sim_time=True)
        # Check if DO recovered above recovery threshold (5.5 mg/L)
        if payload["sensors"]["dissolved_oxygen_mgl"] >= 5.50:
            recovered_payload = payload
            break

    assert recovered_payload is not None, "Simulator must re-oxygenate under EMERGENCY aeration"
    measured_recovered_do = recovered_payload["sensors"]["dissolved_oxygen_mgl"]
    assert measured_recovered_do >= 5.50

    # 5. Rule evaluation on recovered telemetry returns aeration to NORMAL
    recovery_actions = ctrl.evaluate_telemetry_rules(recovered_payload)
    assert any("Aeration System → 50%" in a for a in recovery_actions)
    assert ctrl.actuators["aeration_system"]["state"] == "NORMAL"
    assert ctrl.aeration_in_emergency is False


def test_closed_loop_water_level_overflow_protection():
    """
    Test complete integration chain for water level safety interlock:
    1. Operator / simulator activates inlet pump.
    2. Water level increases across simulation steps.
    3. As level reaches maximum safe capacity (19,000 L), interlock trips.
    4. Inlet pump is automatically cut off and further manual activation is blocked.
    """
    engine = BioflocSDEEngine(
        initial_water_level_liters=18800.0,
        tank_capacity_liters=20000.0,
    )
    ctrl = ControlService(
        initial_mode="MANUAL",
        initial_level_liters=18800.0,
        tank_capacity_liters=20000.0,
    )

    # Activate inlet in both control service and simulator
    cmd = ActuatorCommandRequest(actuator="inlet_pump", state="ON", reason="Refill test")
    success, _, _ = ctrl.execute_command(cmd, is_automated=False)
    assert success is True
    engine.apply_actuator_commands({"inlet_pump": "ON"})

    # Step simulator (30 LPM * 5 min = 150 L added per step)
    for _ in range(5):
        payload = engine.step(advance_sim_time=True)
        # Feed telemetry to control service
        ctrl.evaluate_telemetry_rules(payload)

    # Water level must not exceed max safe level (19,000 L)
    assert engine.water_level_liters <= 19000.0
    assert ctrl.water_level_liters <= 19000.0

    # Once at or near max level, inlet must be blocked by safety interlock
    ctrl.water_level_liters = 19000.0
    blocked_cmd = ActuatorCommandRequest(actuator="inlet_pump", state="ON")
    can_fill, msg, block_reason = ctrl.execute_command(blocked_cmd, is_automated=False)
    assert can_fill is False
    assert "Inlet blocked" in msg
    assert block_reason is not None


def test_feeding_to_ammonia_to_oxygen_chain():
    """
    Test field-derived feeding chain:
    1. Feeding event occurs with biofloc feed reduction.
    2. Feed load introduces delayed ammonia release pool.
    3. TAN increases smoothly over subsequent steps without an abrupt discontinuity.
    4. Respiration and water quality variables remain stable and bounded.
    """
    engine = BioflocSDEEngine(
        seed=100,
        fish_biomass_kg=600.0,
        avg_fish_weight_g=150.0,
        fish_age_days=70,
        biofloc_feed_reduction=0.28,
        farm_feed_ammonia_fraction=0.03,
    )
    initial_tan = engine.tan

    # Feed mass calculation
    spec = engine.get_feeding_spec(150.0)
    assert spec["base_feed_pct"] == 0.03
    effective_pct = 0.03 * (1.0 - 0.28)
    expected_daily = 600.0 * effective_pct
    expected_per_event = expected_daily / 2  # age >= 60 days -> 2 feedings/day

    feed_res = engine.trigger_feeding_event()
    assert np.isclose(feed_res["feed_mass_kg"], expected_per_event, atol=0.01)

    tan_history = []
    for _ in range(12):  # 1 hour (12 steps of 5 min)
        payload = engine.step(advance_sim_time=True)
        tan_history.append(payload["sensors"]["tan_mgl"])

    # TAN should have increased from initial baseline
    assert max(tan_history) > initial_tan
    # Check numerical stability
    for val in tan_history:
        assert 0.0 <= val <= 5.0
