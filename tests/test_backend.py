import pytest
import sys
import os
import asyncio
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.schemas import (
    TelemetryPayload,
    SensorData,
    ScenarioControlRequest,
    ActuatorCommandRequest,
    ControlModeRequest,
    ControlStatusResponse,
)
from app.broadcaster import TelemetryBroadcaster
from app.questdb import QuestDBClient
from app.control_service import ControlService


def test_telemetry_payload_valid():
    """Verify valid telemetry schema passes Pydantic validation."""
    payload_data = {
        "timestamp": "2026-09-15T12:00:00Z",
        "tank_id": "tank_01",
        "sensors": {
            "ph": 7.8,
            "temperature_c": 28.5,
            "dissolved_oxygen_mgl": 6.2,
            "tan_mgl": 0.45,
        },
    }
    payload = TelemetryPayload(**payload_data)
    assert payload.tank_id == "tank_01"
    assert payload.sensors.ph == 7.8
    assert payload.sensors.dissolved_oxygen_mgl == 6.2

    # Test Emerson helper method
    nh3 = payload.sensors.calculate_unionized_ammonia()
    assert 0.01 <= nh3 <= 0.20


def test_telemetry_payload_invalid_bounds():
    """Verify out-of-range sensor readings are rejected by Pydantic validation."""
    invalid_data = {
        "timestamp": "2026-09-15T12:00:00Z",
        "tank_id": "tank_01",
        "sensors": {
            "ph": 15.0,  # Invalid: pH > 14
            "temperature_c": 28.5,
            "dissolved_oxygen_mgl": 6.2,
            "tan_mgl": 0.45,
        },
    }
    with pytest.raises(Exception):
        TelemetryPayload(**invalid_data)

    invalid_do = {
        "timestamp": "2026-09-15T12:00:00Z",
        "tank_id": "tank_01",
        "sensors": {
            "ph": 7.5,
            "temperature_c": 28.5,
            "dissolved_oxygen_mgl": -1.0,  # Invalid: DO < 0
            "tan_mgl": 0.45,
        },
    }
    with pytest.raises(Exception):
        TelemetryPayload(**invalid_do)


def test_scenario_control_schema():
    """Verify scenario control schema accepts valid scenarios and rejects invalid."""
    valid = ScenarioControlRequest(scenario="aerator_failure")
    assert valid.scenario == "aerator_failure"

    with pytest.raises(Exception):
        ScenarioControlRequest(scenario="unsupported_chaos_scenario")


@pytest.mark.asyncio
async def test_broadcaster_memory_buffer():
    """Verify in-memory broadcaster buffer maintains bounded history and broadcasts to subscribers."""
    broadcaster = TelemetryBroadcaster(history_buffer_size=5, backend="memory")
    await broadcaster.initialize()

    # Create subscriber queue
    q = await broadcaster.subscribe()
    assert broadcaster.subscriber_count == 1

    # Broadcast 7 messages (more than buffer size of 5)
    for i in range(7):
        await broadcaster.broadcast({"msg_id": i, "tank_id": "tank_01"})

    # Check buffer contains at most 5 items and has the most recent items
    history = broadcaster.get_history()
    assert len(history) == 5
    assert history[-1]["msg_id"] == 6
    assert history[0]["msg_id"] == 2

    # Check subscriber received items
    received_first = await asyncio.wait_for(q.get(), timeout=1.0)
    assert received_first["msg_id"] == 0

    await broadcaster.unsubscribe(q)
    assert broadcaster.subscriber_count == 0
    await broadcaster.close()


def test_questdb_ilp_formatting():
    """Verify ILP line protocol string formatting."""
    payload = TelemetryPayload(
        timestamp="2026-09-15T12:00:00Z",
        tank_id="tank_01",
        sensors=SensorData(
            ph=7.85,
            temperature_c=28.5,
            dissolved_oxygen_mgl=6.25,
            tan_mgl=0.45,
        ),
    )
    client = QuestDBClient()
    line = client.format_ilp_line(payload)

    assert line.startswith("telemetry,tank_id=tank_01 ")
    assert "dissolved_oxygen_mgl=6.25" in line
    assert "ph=7.85" in line
    assert "temperature_c=28.5" in line
    assert "tan_mgl=0.45" in line
    assert line.endswith("\n")


# =========================================================================
# Actuation / Control Service Tests (Phase C)
# =========================================================================

def test_control_service_mode_switching_and_manual_command():
    """Verify control modes (AUTO, MANUAL, SIMULATION) and command permission handling."""
    ctrl = ControlService(initial_mode="AUTO")

    # In AUTO mode, manual commands are safely blocked
    cmd = ActuatorCommandRequest(actuator="inlet_pump", state="ON", reason="Manual fill test")
    success, msg, block_reason = ctrl.execute_command(cmd, is_automated=False)
    assert success is False
    assert "Manual commands disabled while in AUTO mode" in msg

    # Switch to MANUAL mode
    ctrl.set_mode("MANUAL")
    assert ctrl.mode == "MANUAL"

    # Now manual command is permitted (assuming level allows)
    success, msg, _ = ctrl.execute_command(cmd, is_automated=False)
    assert success is True
    assert ctrl.actuators["inlet_pump"]["state"] == "ON"

    # Switch to SIMULATION mode
    ctrl.set_mode("SIMULATION")
    assert ctrl.mode == "SIMULATION"
    cmd_off = ActuatorCommandRequest(actuator="inlet_pump", state="OFF")
    success, msg, _ = ctrl.execute_command(cmd_off, is_automated=False)
    assert success is True
    assert ctrl.actuators["inlet_pump"]["state"] == "OFF"


def test_control_service_water_level_safety_interlocks():
    """Verify high-level and low-level pump interlocks and mutual exclusion."""
    ctrl = ControlService(
        initial_mode="MANUAL",
        initial_level_liters=19000.0,
        max_safe_level_liters=19000.0,
        min_safe_level_liters=12000.0,
    )

    # 1. Inlet pump must be blocked at or above max safe level
    cmd_inlet = ActuatorCommandRequest(actuator="inlet_pump", state="ON")
    success, msg, block_reason = ctrl.execute_command(cmd_inlet, is_automated=False)
    assert success is False
    assert "Inlet blocked" in msg
    assert ctrl.actuators["inlet_pump"]["safety_status"] == "interlocked_blocked"

    # 2. Outlet pump must be blocked at or below min safe level
    ctrl.water_level_liters = 12000.0
    cmd_outlet = ActuatorCommandRequest(actuator="outlet_pump", state="ON")
    success, msg, block_reason = ctrl.execute_command(cmd_outlet, is_automated=False)
    assert success is False
    assert "Outlet blocked" in msg
    assert ctrl.actuators["outlet_pump"]["safety_status"] == "interlocked_blocked"

    # 3. Mutual exclusion: turning inlet ON cuts off outlet
    ctrl.water_level_liters = 15000.0
    ctrl.actuators["outlet_pump"]["state"] = "ON"
    ctrl.actuators["outlet_pump"]["safety_status"] = "ok"

    cmd_inlet_allowed = ActuatorCommandRequest(actuator="inlet_pump", state="ON")
    success, msg, _ = ctrl.execute_command(cmd_inlet_allowed, is_automated=False)
    assert success is True
    assert ctrl.actuators["inlet_pump"]["state"] == "ON"
    # Conflicting outlet must be cut off
    assert ctrl.actuators["outlet_pump"]["state"] == "OFF"


def test_control_service_emergency_aeration_rule_and_hysteresis():
    """Verify rule evaluation triggers emergency aeration on low DO and uses hysteresis for recovery."""
    ctrl = ControlService(initial_mode="AUTO")
    assert ctrl.actuators["aeration_system"]["state"] == "NORMAL"
    assert ctrl.aeration_in_emergency is False

    # Simulate hypoxic telemetry (DO = 3.2 mg/L, below emergency threshold 4.0 mg/L)
    hypoxic_telemetry = {
        "sensors": {"dissolved_oxygen_mgl": 3.20, "tan_mgl": 0.40, "ph": 7.80, "temperature_c": 28.5},
        "metadata": {"water_level_liters": 16000.0, "biofloc_density_mll": 45.0},
    }
    actions = ctrl.evaluate_telemetry_rules(hypoxic_telemetry)
    assert any("Aeration System → 100%" in a for a in actions)
    assert ctrl.actuators["aeration_system"]["state"] == "EMERGENCY"
    assert ctrl.aeration_in_emergency is True

    # Intermediate DO (DO = 4.8 mg/L: above emergency 4.0, but below recovery 5.5) -> must stay EMERGENCY (hysteresis)
    intermediate_telemetry = {
        "sensors": {"dissolved_oxygen_mgl": 4.80, "tan_mgl": 0.40, "ph": 7.80, "temperature_c": 28.5},
        "metadata": {"water_level_liters": 16000.0, "biofloc_density_mll": 45.0},
    }
    actions_inter = ctrl.evaluate_telemetry_rules(intermediate_telemetry)
    assert ctrl.actuators["aeration_system"]["state"] == "EMERGENCY"
    assert ctrl.aeration_in_emergency is True

    # Recovered DO (DO = 5.8 mg/L, above recovery threshold 5.5 mg/L) -> returns to NORMAL
    recovered_telemetry = {
        "sensors": {"dissolved_oxygen_mgl": 5.80, "tan_mgl": 0.40, "ph": 7.80, "temperature_c": 28.5},
        "metadata": {"water_level_liters": 16000.0, "biofloc_density_mll": 45.0},
    }
    actions_rec = ctrl.evaluate_telemetry_rules(recovered_telemetry)
    assert any("Aeration System → 50%" in a for a in actions_rec)
    assert ctrl.actuators["aeration_system"]["state"] == "NORMAL"
    assert ctrl.aeration_in_emergency is False


def test_control_service_ph_dosing_rules_and_cooldown():
    """Verify pH stress triggers correct dosing actuator with cooldown and stabilization cutoff."""
    ctrl = ControlService(initial_mode="AUTO")

    # Acidic reading (pH 7.10, below threshold 7.40) -> triggers pH Increase Dosing ON
    acidic_telemetry = {
        "sensors": {"dissolved_oxygen_mgl": 6.2, "tan_mgl": 0.40, "ph": 7.10, "temperature_c": 28.5},
        "metadata": {"water_level_liters": 16000.0, "biofloc_density_mll": 45.0},
    }
    actions = ctrl.evaluate_telemetry_rules(acidic_telemetry)
    assert any("pH Increase Dosing → ON" in a for a in actions)
    assert ctrl.actuators["ph_increase_dosing"]["state"] == "ON"
    assert ctrl.actuators["ph_decrease_dosing"]["state"] == "OFF"

    # Stabilized reading (pH 7.85) -> auto turns off dosing
    stabilized_telemetry = {
        "sensors": {"dissolved_oxygen_mgl": 6.2, "tan_mgl": 0.40, "ph": 7.85, "temperature_c": 28.5},
        "metadata": {"water_level_liters": 16000.0, "biofloc_density_mll": 45.0},
    }
    ctrl.evaluate_telemetry_rules(stabilized_telemetry)
    assert ctrl.actuators["ph_increase_dosing"]["state"] == "OFF"


def test_control_service_event_audit_history():
    """Verify control service maintains chronological audit history."""
    ctrl = ControlService(initial_mode="MANUAL")
    ctrl.execute_command(ActuatorCommandRequest(actuator="inlet_pump", state="ON", reason="Audit test"))
    ctrl.execute_command(ActuatorCommandRequest(actuator="inlet_pump", state="OFF", reason="Audit finish"))

    status = ctrl.get_status()
    assert isinstance(status, ControlStatusResponse)
    assert len(status.recent_events) >= 2
    recent_actions = [e.action for e in status.recent_events]
    assert "STATE_CHANGE" in recent_actions


def test_control_service_carbon_source_dosing_actuator():
    """Verify carbon_source_dosing logical actuator operations, states, and audit tracking."""
    ctrl = ControlService(initial_mode="MANUAL")
    status = ctrl.get_status()
    assert "carbon_source_dosing" in status.actuators
    assert status.actuators["carbon_source_dosing"].state == "IDLE"

    # Dispense in MANUAL mode
    cmd_dispense = ActuatorCommandRequest(
        actuator="carbon_source_dosing",
        state="DISPENSE",
        reason="Operator dispensed molasses for C:N ratio",
    )
    success, msg, _ = ctrl.execute_command(cmd_dispense, is_automated=False)
    assert success is True
    assert ctrl.actuators["carbon_source_dosing"]["state"] == "DISPENSE"
    assert ctrl.actuators["carbon_source_dosing"]["power_pct"] == 100.0

    # Reset to IDLE
    cmd_idle = ActuatorCommandRequest(actuator="carbon_source_dosing", state="IDLE")
    success, msg, _ = ctrl.execute_command(cmd_idle, is_automated=False)
    assert success is True
    assert ctrl.actuators["carbon_source_dosing"]["state"] == "IDLE"
    assert ctrl.actuators["carbon_source_dosing"]["power_pct"] == 0.0

    # In AUTO mode, manual dispensing should be blocked
    ctrl.set_mode("AUTO")
    success, msg, _ = ctrl.execute_command(cmd_dispense, is_automated=False)
    assert success is False
    assert "Manual commands disabled while in AUTO mode" in msg

    # In SIMULATION mode, dispensing is permitted
    ctrl.set_mode("SIMULATION")
    success, msg, _ = ctrl.execute_command(cmd_dispense, is_automated=False)
    assert success is True
    assert ctrl.actuators["carbon_source_dosing"]["state"] == "DISPENSE"

