"""
AquaSense Software Actuation and Control Layer
Manages logical actuator states, water level safety interlocks, rule evaluation engine,
and event audit history.

Control Modes:
- AUTO: Software evaluates streaming telemetry against field-informed operational rules.
- MANUAL: Human operator issues explicit actuator commands subject to safety interlocks.
- SIMULATION: Safe simulation-only execution manipulating virtual actuators and tank physics.

Safety Interlocks:
- High Level Interlock: Blocks inlet pump when water level >= max safe level (overflow prevention).
- Low Level Interlock: Blocks outlet/sludge pump when water level <= min safe level (underflow prevention).
- Mutual Exclusion Interlock: Manages simultaneous conflicting inlet and outlet operation.
- pH Dosing Mutual Exclusion: Prevents simultaneous acidic and alkaline dosing.
"""

from collections import deque
from datetime import datetime, timezone
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from .schemas import (
    ActuatorCommandRequest,
    ActuatorDetail,
    ControlEvent,
    ControlMode,
    ControlStatusResponse,
    WaterLevelState,
)

logger = logging.getLogger("ControlService")


class ControlService:
    """Authoritative backend service managing the software actuation and rule evaluation layer."""

    def __init__(
        self,
        initial_mode: ControlMode = "AUTO",
        tank_capacity_liters: float = 20000.0,
        initial_level_liters: float = 16000.0,
        min_safe_level_liters: float = 12000.0,
        max_safe_level_liters: float = 19000.0,
    ):
        self.mode: ControlMode = initial_mode

        # Category C: Implementation Safety Limits / Configurable Tank Protection Thresholds
        self.tank_capacity_liters = float(tank_capacity_liters)
        self.water_level_liters = float(initial_level_liters)
        self.min_safe_level_liters = float(min_safe_level_liters)  # 60% capacity floor (underflow interlock)
        self.max_safe_level_liters = float(max_safe_level_liters)  # 95% capacity ceiling (overflow interlock)

        # Actuator physical metadata and current states
        now_iso = datetime.now(timezone.utc).isoformat()
        self.actuators: Dict[str, Dict[str, Any]] = {
            "inlet_pump": {
                "id": "inlet_pump",
                "name": "Inlet / Fresh-Water Pump",
                "state": "OFF",
                "power_pct": 0.0,
                "reason": "System standby — water level optimal",
                "safety_status": "ok",
                "last_change": now_iso,
                "interlock_message": None,
            },
            "outlet_pump": {
                "id": "outlet_pump",
                "name": "Outlet / Sludge-Removal Pump",
                "state": "OFF",
                "power_pct": 0.0,
                "reason": "Solids within normal limits",
                "safety_status": "ok",
                "last_change": now_iso,
                "interlock_message": None,
            },
            "aeration_system": {
                "id": "aeration_system",
                "name": "Aeration System",
                "state": "NORMAL",
                "power_pct": 50.0,
                "reason": "Normal operational baseline aeration (50% capacity)",
                "safety_status": "ok",
                "last_change": now_iso,
                "interlock_message": None,
            },
            "ph_increase_dosing": {
                "id": "ph_increase_dosing",
                "name": "pH Increase / Dosing Actuator",
                "state": "OFF",
                "power_pct": 0.0,
                "reason": "pH within stable biological window",
                "safety_status": "ok",
                "last_change": now_iso,
                "interlock_message": None,
            },
            "ph_decrease_dosing": {
                "id": "ph_decrease_dosing",
                "name": "pH Decrease / Dosing Actuator",
                "state": "OFF",
                "power_pct": 0.0,
                "reason": "pH within stable biological window",
                "safety_status": "ok",
                "last_change": now_iso,
                "interlock_message": None,
            },
            "carbon_source_dosing": {
                "id": "carbon_source_dosing",
                "name": "Carbon Source / Molasses Dosing",
                "state": "IDLE",
                "power_pct": 0.0,
                "reason": "Heterotrophic C:N ratio balanced",
                "safety_status": "ok",
                "last_change": now_iso,
                "interlock_message": None,
            },
        }

        # Configurable biological and control rule thresholds categorized by origin:
        self.rules_config = {
            # --- Category B: Software-Defined Control Thresholds (AquaSense Operational Rules) ---
            "do_emergency_threshold_mgl": 4.00,  # Below this, trigger EMERGENCY 100% aeration
            "do_lethal_threshold_mgl": 2.50,     # Critical hypoxia floor
            "do_recovery_threshold_mgl": 5.50,   # Above this, return to NORMAL 50% aeration (hysteresis)
            "ph_low_threshold": 7.40,            # Project acidification intervention trigger
            "ph_high_threshold": 8.60,           # Project alkaline ceiling intervention trigger
            "nh3_toxicity_critical_mgl": 0.050,  # Toxic unionized ammonia alert threshold

            # --- Category A: Directly Field-Derived Operational References (Supplied Farm Material) ---
            "field_ph_optimal_range": (6.5, 8.0),   # Stated optimal field operating range
            "biofloc_solids_management_mll": 60.0,  # Field reference: > 60 mL/L solids management
            "biofloc_drain_threshold_mll": 100.0,   # Field reference: > 100 mL/L drain excess solids
        }

        # Hysteresis & cooldown tracking
        self.aeration_in_emergency: bool = False
        self.last_ph_dose_time: Optional[datetime] = None
        self.ph_dose_cooldown_seconds: float = 300.0  # 5 min cooldown between chemical dosing

        # Audit event history (bounded memory buffer)
        self.event_history: deque = deque(maxlen=100)
        self._record_event(
            actuator="system",
            action="INITIALIZE",
            previous_state="NONE",
            new_state=self.mode,
            trigger="Control service initialized in AUTO mode",
        )

    def _record_event(
        self,
        actuator: str,
        action: str,
        previous_state: str,
        new_state: str,
        trigger: str,
        blocked: bool = False,
        blocked_reason: Optional[str] = None,
    ) -> ControlEvent:
        event = ControlEvent(
            id=f"evt-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            actuator=actuator,
            action=action,
            previous_state=previous_state,
            new_state=new_state,
            trigger=trigger,
            blocked=blocked,
            blocked_reason=blocked_reason,
        )
        self.event_history.appendleft(event)
        return event

    def set_mode(self, mode: ControlMode) -> ControlMode:
        """Switch operational control mode: AUTO, MANUAL, or SIMULATION."""
        prev = self.mode
        self.mode = mode
        self._record_event(
            actuator="control_mode",
            action="MODE_SWITCH",
            previous_state=prev,
            new_state=mode,
            trigger=f"Operator selected {mode} control mode",
        )
        logger.info(f"Control mode changed from {prev} to {mode}")
        return self.mode

    def check_safety_interlocks(
        self, actuator: str, target_state: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Evaluates software safety interlocks before any actuator state change.
        Returns (is_allowed, block_reason).
        """
        target_upper = target_state.upper()

        # 1. Inlet pump high-level interlock
        if actuator == "inlet_pump" and target_upper == "ON":
            if self.water_level_liters >= self.max_safe_level_liters:
                return False, f"Inlet blocked — tank level at upper safety limit ({self.water_level_liters:,.0f} L / {self.max_safe_level_liters:,.0f} L)"

        # 2. Outlet pump low-level interlock
        if actuator == "outlet_pump" and target_upper == "ON":
            if self.water_level_liters <= self.min_safe_level_liters:
                return False, f"Outlet blocked — tank level at lower safety limit ({self.water_level_liters:,.0f} L / {self.min_safe_level_liters:,.0f} L)"

        # 3. Aeration state validation
        if actuator == "aeration_system" and target_upper not in ("OFF", "NORMAL", "EMERGENCY"):
            return False, f"Invalid aeration state '{target_state}'. Allowed: OFF, NORMAL, EMERGENCY"

        # 4. pH dosing states
        if actuator in ("ph_increase_dosing", "ph_decrease_dosing") and target_upper not in ("OFF", "ON"):
            return False, f"Invalid dosing state '{target_state}'. Allowed: OFF, ON"

        # 5. Carbon source dosing states
        if actuator == "carbon_source_dosing" and target_upper not in ("OFF", "ON", "DISPENSE", "IDLE"):
            return False, f"Invalid carbon dosing state '{target_state}'. Allowed: OFF, ON, DISPENSE, IDLE"

        return True, None

    def execute_command(
        self, req: ActuatorCommandRequest, is_automated: bool = False
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Executes an actuator command after verifying control mode and safety interlocks.
        Returns (success, message, block_reason).
        """
        actuator = req.actuator
        target_upper = req.state.upper()

        if actuator not in self.actuators:
            return False, f"Unknown actuator: {actuator}", "Unknown actuator"

        # In AUTO mode, manual commands are rejected unless mode is switched to MANUAL or SIMULATION
        if not is_automated and self.mode == "AUTO":
            reason = "Manual commands disabled while in AUTO mode. Switch to MANUAL or SIMULATION to override."
            self._record_event(
                actuator=actuator,
                action="COMMAND_REJECTED",
                previous_state=self.actuators[actuator]["state"],
                new_state=target_upper,
                trigger=req.reason or "Manual command attempted",
                blocked=True,
                blocked_reason=reason,
            )
            return False, reason, reason

        # Verify safety interlocks
        allowed, block_reason = self.check_safety_interlocks(actuator, target_upper)
        if not allowed:
            self.actuators[actuator]["safety_status"] = "interlocked_blocked"
            self.actuators[actuator]["interlock_message"] = block_reason
            self._record_event(
                actuator=actuator,
                action="INTERLOCK_BLOCKED",
                previous_state=self.actuators[actuator]["state"],
                new_state=target_upper,
                trigger=req.reason or "Command attempted",
                blocked=True,
                blocked_reason=block_reason,
            )
            return False, block_reason or "Blocked by safety interlock", block_reason

        # Apply state transition
        prev_state = self.actuators[actuator]["state"]
        now_iso = datetime.now(timezone.utc).isoformat()

        # Mutual exclusion logic:
        # - Turning inlet ON turns outlet OFF
        if actuator == "inlet_pump" and target_upper == "ON":
            if self.actuators["outlet_pump"]["state"] == "ON":
                self.actuators["outlet_pump"]["state"] = "OFF"
                self.actuators["outlet_pump"]["power_pct"] = 0.0
                self.actuators["outlet_pump"]["reason"] = "Auto-switched OFF due to conflicting inlet operation"
                self._record_event(
                    actuator="outlet_pump",
                    action="MUTUAL_EXCLUSION_CUTOFF",
                    previous_state="ON",
                    new_state="OFF",
                    trigger="Inlet pump activated; conflicting outlet cut off",
                )

        # - Turning outlet ON turns inlet OFF
        if actuator == "outlet_pump" and target_upper == "ON":
            if self.actuators["inlet_pump"]["state"] == "ON":
                self.actuators["inlet_pump"]["state"] = "OFF"
                self.actuators["inlet_pump"]["power_pct"] = 0.0
                self.actuators["inlet_pump"]["reason"] = "Auto-switched OFF due to conflicting outlet operation"
                self._record_event(
                    actuator="inlet_pump",
                    action="MUTUAL_EXCLUSION_CUTOFF",
                    previous_state="ON",
                    new_state="OFF",
                    trigger="Outlet pump activated; conflicting inlet cut off",
                )

        # - pH Increase and Decrease dosing mutual exclusion
        if actuator == "ph_increase_dosing" and target_upper == "ON":
            if self.actuators["ph_decrease_dosing"]["state"] == "ON":
                self.actuators["ph_decrease_dosing"]["state"] = "OFF"
                self.actuators["ph_decrease_dosing"]["power_pct"] = 0.0

        if actuator == "ph_decrease_dosing" and target_upper == "ON":
            if self.actuators["ph_increase_dosing"]["state"] == "ON":
                self.actuators["ph_increase_dosing"]["state"] = "OFF"
                self.actuators["ph_increase_dosing"]["power_pct"] = 0.0

        # Calculate power percentage
        power_map = {
            "OFF": 0.0,
            "IDLE": 0.0,
            "ON": 100.0,
            "NORMAL": 50.0,
            "EMERGENCY": 100.0,
            "DISPENSE": 100.0,
        }
        power_pct = power_map.get(target_upper, 0.0)

        # Update actuator record
        self.actuators[actuator]["state"] = target_upper
        self.actuators[actuator]["power_pct"] = power_pct
        self.actuators[actuator]["reason"] = req.reason or "Operator command executed"
        self.actuators[actuator]["safety_status"] = "ok"
        self.actuators[actuator]["interlock_message"] = None
        self.actuators[actuator]["last_change"] = now_iso

        self._record_event(
            actuator=actuator,
            action="STATE_CHANGE",
            previous_state=prev_state,
            new_state=target_upper,
            trigger=req.reason or "Command executed",
        )

        logger.info(f"Actuator '{actuator}' transitioned: {prev_state} -> {target_upper} ({req.reason})")
        return True, f"Actuator '{actuator}' successfully set to {target_upper}", None

    def evaluate_telemetry_rules(self, telemetry: Dict[str, Any]) -> List[str]:
        """
        Automatic Rule Evaluation Engine.
        Processes streaming telemetry observations and triggers automated actuator adjustments
        with hysteresis and rate limiting when in AUTO mode.
        """
        actions_taken = []
        sensors = telemetry.get("sensors", {})
        meta = telemetry.get("metadata", {})

        do = float(sensors.get("dissolved_oxygen_mgl", 6.0))
        tan = float(sensors.get("tan_mgl", 0.40))
        ph = float(sensors.get("ph", 7.85))
        temp = float(sensors.get("temperature_c", 28.5))

        # Emerson unionized ammonia
        nh3 = meta.get("calculated_nh3_mgl")
        if nh3 is None:
            from .features import calculate_unionized_ammonia
            nh3 = calculate_unionized_ammonia(tan, ph, temp)

        # Operational telemetry if provided
        water_level = float(meta.get("water_level_liters", self.water_level_liters))
        self.water_level_liters = water_level
        biofloc_density = float(meta.get("biofloc_density_mll", 45.0))

        # -----------------------------------------------------------------
        # RULE 1: Dissolved Oxygen (DO) & Aeration with Hysteresis
        # -----------------------------------------------------------------
        current_aeration = self.actuators["aeration_system"]["state"]

        if do < self.rules_config["do_emergency_threshold_mgl"]:
            # DO is in sub-optimal or lethal zone -> Request EMERGENCY 100% aeration
            if current_aeration != "EMERGENCY":
                self.aeration_in_emergency = True
                if self.mode == "AUTO":
                    cmd = ActuatorCommandRequest(
                        actuator="aeration_system",
                        state="EMERGENCY",
                        reason=f"DO ({do:.2f} mg/L) below emergency threshold ({self.rules_config['do_emergency_threshold_mgl']:.2f} mg/L)",
                    )
                    success, msg, _ = self.execute_command(cmd, is_automated=True)
                    if success:
                        actions_taken.append(f"Aeration System → 100% (Low DO: {do:.2f} mg/L)")
        elif self.aeration_in_emergency and do >= self.rules_config["do_recovery_threshold_mgl"]:
            # DO has recovered above hysteresis threshold -> return to NORMAL 50% aeration
            self.aeration_in_emergency = False
            if self.mode == "AUTO":
                cmd = ActuatorCommandRequest(
                    actuator="aeration_system",
                    state="NORMAL",
                    reason=f"DO ({do:.2f} mg/L) recovered above threshold ({self.rules_config['do_recovery_threshold_mgl']:.2f} mg/L)",
                )
                success, msg, _ = self.execute_command(cmd, is_automated=True)
                if success:
                    actions_taken.append(f"Aeration System → 50% (DO recovered: {do:.2f} mg/L)")

        # -----------------------------------------------------------------
        # RULE 2: pH Acidification & Alkalinity Management
        # -----------------------------------------------------------------
        now = datetime.now(timezone.utc)
        cooldown_elapsed = (
            self.last_ph_dose_time is None
            or (now - self.last_ph_dose_time).total_seconds() > self.ph_dose_cooldown_seconds
        )

        if ph < self.rules_config["ph_low_threshold"]:
            if cooldown_elapsed and self.actuators["ph_increase_dosing"]["state"] == "OFF":
                if self.mode == "AUTO":
                    cmd = ActuatorCommandRequest(
                        actuator="ph_increase_dosing",
                        state="ON",
                        reason=f"pH ({ph:.2f}) below operational range (< {self.rules_config['ph_low_threshold']:.2f})",
                    )
                    success, msg, _ = self.execute_command(cmd, is_automated=True)
                    if success:
                        self.last_ph_dose_time = now
                        actions_taken.append(f"pH Increase Dosing → ON (Acidification: pH {ph:.2f})")
        elif ph > self.rules_config["ph_high_threshold"]:
            if cooldown_elapsed and self.actuators["ph_decrease_dosing"]["state"] == "OFF":
                if self.mode == "AUTO":
                    cmd = ActuatorCommandRequest(
                        actuator="ph_decrease_dosing",
                        state="ON",
                        reason=f"pH ({ph:.2f}) above operational range (> {self.rules_config['ph_high_threshold']:.2f})",
                    )
                    success, msg, _ = self.execute_command(cmd, is_automated=True)
                    if success:
                        self.last_ph_dose_time = now
                        actions_taken.append(f"pH Decrease Dosing → ON (High pH: {ph:.2f})")
        else:
            # pH is within stable biological window: turn off dosing if active
            if self.actuators["ph_increase_dosing"]["state"] == "ON" and self.mode == "AUTO":
                cmd = ActuatorCommandRequest(
                    actuator="ph_increase_dosing",
                    state="OFF",
                    reason=f"pH stabilized at {ph:.2f}",
                )
                self.execute_command(cmd, is_automated=True)
            if self.actuators["ph_decrease_dosing"]["state"] == "ON" and self.mode == "AUTO":
                cmd = ActuatorCommandRequest(
                    actuator="ph_decrease_dosing",
                    state="OFF",
                    reason=f"pH stabilized at {ph:.2f}",
                )
                self.execute_command(cmd, is_automated=True)

        # -----------------------------------------------------------------
        # RULE 3: Biofloc Solids Management & Sludge Removal
        # -----------------------------------------------------------------
        if biofloc_density > self.rules_config["biofloc_drain_threshold_mll"]:
            # Critical excess solids (> 100 mL/L)
            if self.actuators["outlet_pump"]["state"] == "OFF" and self.mode == "AUTO":
                if self.water_level_liters > self.min_safe_level_liters:
                    cmd = ActuatorCommandRequest(
                        actuator="outlet_pump",
                        state="ON",
                        reason=f"Biofloc solids ({biofloc_density:.1f} mL/L) exceed drain reference (> 100 mL/L)",
                    )
                    success, msg, _ = self.execute_command(cmd, is_automated=True)
                    if success:
                        actions_taken.append(f"Outlet/Sludge Pump → ON (Solids removal: {biofloc_density:.1f} mL/L)")

        # -----------------------------------------------------------------
        # RULE 4: Water Level Limit Protection (Active Interlock Enforcement)
        # -----------------------------------------------------------------
        if self.water_level_liters >= self.max_safe_level_liters:
            if self.actuators["inlet_pump"]["state"] == "ON":
                self.actuators["inlet_pump"]["state"] = "OFF"
                self.actuators["inlet_pump"]["power_pct"] = 0.0
                self.actuators["inlet_pump"]["safety_status"] = "interlocked_blocked"
                self.actuators["inlet_pump"]["interlock_message"] = "Inlet blocked — upper safety limit reached"
                self._record_event(
                    actuator="inlet_pump",
                    action="INTERLOCK_CUTOFF",
                    previous_state="ON",
                    new_state="OFF",
                    trigger="Tank level reached maximum safe limit",
                    blocked=True,
                    blocked_reason="Upper safety limit reached (19,000 L)",
                )
                actions_taken.append("Inlet Pump cut off by upper level interlock")

        if self.water_level_liters <= self.min_safe_level_liters:
            if self.actuators["outlet_pump"]["state"] == "ON":
                self.actuators["outlet_pump"]["state"] = "OFF"
                self.actuators["outlet_pump"]["power_pct"] = 0.0
                self.actuators["outlet_pump"]["safety_status"] = "interlocked_blocked"
                self.actuators["outlet_pump"]["interlock_message"] = "Outlet blocked — lower safety limit reached"
                self._record_event(
                    actuator="outlet_pump",
                    action="INTERLOCK_CUTOFF",
                    previous_state="ON",
                    new_state="OFF",
                    trigger="Tank level reached minimum safe limit",
                    blocked=True,
                    blocked_reason="Lower safety limit reached (12,000 L)",
                )
                actions_taken.append("Outlet Pump cut off by lower level interlock")

        return actions_taken

    def get_status(self) -> ControlStatusResponse:
        """Returns the full control system status payload."""
        pct_full = round((self.water_level_liters / max(1.0, self.tank_capacity_liters)) * 100.0, 1)

        inlet_blocked = self.water_level_liters >= self.max_safe_level_liters
        outlet_blocked = self.water_level_liters <= self.min_safe_level_liters

        interlock_messages = []
        if inlet_blocked:
            interlock_messages.append("Inlet pump blocked — tank level at upper safety limit (19,000 L)")
        if outlet_blocked:
            interlock_messages.append("Outlet pump blocked — tank level at lower safety limit (12,000 L)")

        actuator_details = {}
        for act_id, item in self.actuators.items():
            actuator_details[act_id] = ActuatorDetail(
                id=item["id"],
                name=item["name"],
                state=item["state"],
                power_pct=item["power_pct"],
                mode=self.mode.lower(),
                reason=item["reason"],
                safety_status=item["safety_status"],
                last_change=item["last_change"],
                interlock_message=item["interlock_message"],
            )

        return ControlStatusResponse(
            mode=self.mode,
            actuators=actuator_details,
            water_level=WaterLevelState(
                current_level_liters=round(self.water_level_liters, 1),
                tank_capacity_liters=self.tank_capacity_liters,
                level_percentage=pct_full,
                min_safe_level_liters=self.min_safe_level_liters,
                max_safe_level_liters=self.max_safe_level_liters,
                inlet_blocked=inlet_blocked,
                outlet_blocked=outlet_blocked,
            ),
            safety_interlocks={
                "inlet_blocked": inlet_blocked,
                "outlet_blocked": outlet_blocked,
                "aeration_emergency": self.aeration_in_emergency,
            },
            interlock_messages=interlock_messages,
            recent_events=list(self.event_history),
            operational_references={
                "stocking_density_limit_kg_m3": 40.0,
                "aeration_lpm_per_10kg": 1.76,
                "oxygen_demand_g_per_kg_hr": 0.30,
                "biofloc_solids_target_mll": "< 60 mL/L",
                "biofloc_drain_threshold_mll": "> 100 mL/L",
                "ammonia_feed_fraction_pct": 3.0,
            },
        )
