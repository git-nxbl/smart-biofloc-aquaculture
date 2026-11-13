import math
from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class SensorData(BaseModel):
    ph: float = Field(
        ...,
        ge=0.0,
        le=14.0,
        description="Acidity/Alkalinity pH (Freshwater/Saline scale 0-14)",
    )
    temperature_c: float = Field(
        ...,
        ge=5.0,
        le=55.0,
        description="Water temperature in Celsius (°C)",
    )
    dissolved_oxygen_mgl: float = Field(
        ...,
        ge=0.0,
        le=25.0,
        description="Dissolved Oxygen concentration in mg/L",
    )
    tan_mgl: float = Field(
        ...,
        ge=0.0,
        le=30.0,
        description="Total Ammonia Nitrogen concentration in mg/L (NH3 + NH4+)",
    )

    def calculate_unionized_ammonia(self) -> float:
        """
        Emerson et al. (1975) chemical equilibrium equation.
        Calculates toxic unionized ammonia (NH3) from TAN, pH, and Temperature.
        """
        temp_k = self.temperature_c + 273.15
        pka = (2729.92 / temp_k) + 0.09018
        exponent = pka - self.ph
        if exponent > 30:
            fraction = 0.0
        elif exponent < -30:
            fraction = 1.0
        else:
            fraction = 1.0 / (1.0 + math.pow(10.0, exponent))
        return round(float(self.tan_mgl * fraction), 4)


class OperationalMetadata(BaseModel):
    calculated_nh3_mgl: Optional[float] = None
    scenario: Optional[str] = None
    sim_step: Optional[int] = None
    fish_biomass_kg: Optional[float] = None
    stocking_density_kg_m3: Optional[float] = None
    required_aeration_lpm: Optional[float] = None
    biofloc_density_mll: Optional[float] = None
    water_level_liters: Optional[float] = None
    water_level_pct: Optional[float] = None
    actuator_states: Optional[dict[str, str]] = None
    source: Optional[str] = None


class TelemetryPayload(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp e.g. 2026-09-15T18:00:00Z")
    tank_id: str = Field(..., min_length=1, max_length=50, description="Biofloc culture tank identifier")
    sensors: SensorData
    metadata: Optional[dict[str, Any]] = Field(
        default=None,
        description="Structured operational and scientific metadata",
    )

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, v: str) -> str:
        try:
            if v.endswith("Z"):
                datetime.fromisoformat(v[:-1] + "+00:00")
            else:
                datetime.fromisoformat(v)
        except Exception as e:
            raise ValueError(f"Invalid ISO-8601 UTC timestamp '{v}': {e}")
        return v


class ScenarioControlRequest(BaseModel):
    scenario: Literal[
        "normal",
        "feeding",
        "aerator_failure",
        "aerator_recovery",
        "organic_overload",
    ] = Field(..., description="Target operational simulation scenario")

    @field_validator("scenario", mode="before")
    @classmethod
    def normalize_scenario(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        val = v.lower().strip()
        alias_map = {
            "blower_failure": "aerator_failure",
            "aerator_fail": "aerator_failure",
            "blower_fail": "aerator_failure",
            "feed_spike": "feeding",
            "feed": "feeding",
            "ph_crash": "organic_overload",
            "overload": "organic_overload",
            "recovery": "aerator_recovery",
        }
        return alias_map.get(val, val)


class MLForecastResult(BaseModel):
    predicted_do_2h: float
    current_do: float
    delta: float
    status: Literal["Optimal", "Warning", "Critical"]
    prediction_interval: tuple[float, float]
    baseline_persistence_error: float
    concept_drift_status: Literal["STABLE", "DRIFT_DETECTED"]
    model_engine: str
    do_slope_per_hour: Optional[float] = 0.0


# =========================================================================
# Actuation / Control System Schemas (Phase C)
# =========================================================================

ControlMode = Literal["AUTO", "MANUAL", "SIMULATION"]


class ActuatorCommandRequest(BaseModel):
    actuator: Literal[
        "inlet_pump",
        "outlet_pump",
        "aeration_system",
        "ph_increase_dosing",
        "ph_decrease_dosing",
        "carbon_source_dosing",
    ] = Field(..., description="Target actuator identifier")
    state: str = Field(..., description="Requested state e.g. ON, OFF, NORMAL, EMERGENCY, DISPENSE, IDLE")
    reason: Optional[str] = Field(default="Manual Operator Command", description="Operational justification")


class ControlModeRequest(BaseModel):
    mode: ControlMode = Field(..., description="Target control mode: AUTO, MANUAL, or SIMULATION")


class WaterLevelState(BaseModel):
    current_level_liters: float
    tank_capacity_liters: float
    level_percentage: float
    min_safe_level_liters: float
    max_safe_level_liters: float
    inlet_blocked: bool
    outlet_blocked: bool


class ControlEvent(BaseModel):
    id: str
    timestamp: str
    actuator: str
    action: str
    previous_state: str
    new_state: str
    trigger: str
    blocked: bool = False
    blocked_reason: Optional[str] = None


class ActuatorDetail(BaseModel):
    id: str
    name: str
    state: str
    power_pct: float
    mode: Literal["auto", "manual", "simulation"]
    reason: str
    safety_status: Literal["ok", "interlocked_blocked", "warning"]
    last_change: str
    interlock_message: Optional[str] = None


class ControlStatusResponse(BaseModel):
    mode: ControlMode
    actuators: dict[str, ActuatorDetail]
    water_level: WaterLevelState
    safety_interlocks: dict[str, bool]
    interlock_messages: list[str]
    recent_events: list[ControlEvent]
    operational_references: dict[str, Any]

