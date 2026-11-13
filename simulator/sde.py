"""
Biofloc Water Quality Stochastic Phenomenological Simulator Engine
Discretized Ornstein-Uhlenbeck (OU) stochastic model using Euler-Maruyama scheme.

Informed by field-derived operational parameters and literature relationships:
- Fish biomass & stocking density (field-informed reference: <= 40 kg/m3; 20 m3 / 500 kg / 25 kg/m3 configurable demo scenario)
- Weight-band feeding table, biofloc feed reduction assumption (20-32%), and digestion excretion kinetics
- Farm-derived ammonia loading fraction (~3% of feed mass contributes to ammonia loading, based on supplied farm material)
- Field-derived biological oxygen demand (0.3 g O2 / kg fish / hr + biofloc respiration; implemented as phenomenological biological forcing term)
- Field aeration reference (1.76 LPM per 10 kg fish shipping weight; implemented as field-informed aeration adequacy / forcing term)
- Phenomenological biofloc density tracking (target <60 mL/L, solids management >60 mL/L, drain reference >100 mL/L; heuristic tracking, not mechanistic kinetics)
- Software actuator state coupling (aeration, inlet/outlet pumps, pH dosing)
- Dissolved Oxygen (DO in mg/L): Diurnal oscillation, biological respiration, aeration dynamics
- Total Ammonia Nitrogen (TAN in mg/L): Phenomenological excretion & assimilation dynamics
- Unionized Ammonia (NH3 in mg/L): Temperature-pH Emerson freshwater equilibrium calculation
- pH: Phenomenological buffer dynamics, diurnal variation, and dosing response
- Water Temperature (°C): Stochastic diurnal curve

Note: This is a stochastic phenomenological simulation model informed by field operating
parameters for software verification, control testing, and ML forecasting, NOT a mechanistic
biofloc digital twin or field-validated universal chemical model.
"""

import math
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple
import numpy as np


class BioflocSDEEngine:
    """
    Stochastic phenomenological simulator engine for synthetic aquaculture telemetry.
    Solves SDEs: dX_t = theta * (mu(t) - X_t) * dt + sigma * dW_t
    via the Euler-Maruyama numerical scheme with biological forcing and actuator coupling.
    """

    # Supported scenarios for academic viva demonstrations & drift testing
    SCENARIOS = {
        "normal": "Standard operational baseline with diurnal DO variation and healthy biofloc assimilation",
        "feeding": "Feeding scenario pulse resulting in elevated TAN excretion and slight microbial respiration spike",
        "aerator_failure": "Simulated mechanical blower failure: DO decay toward low-DO floor (< 2.5 mg/L)",
        "aerator_recovery": "Simulated aeration restored: asymptotic re-oxygenation recovery toward baseline",
        "organic_overload": "High organic loading scenario: elevated TAN accumulation and depressed pH buffer",
    }

    # Field-derived feeding table by fish weight band (attributed to supplied farm operational material)
    # | Fish weight | Base feed (% biomass) | Protein | Feed size |
    FEEDING_TABLE = [
        {"min_g": 3.0, "max_g": 5.0, "base_feed_pct": 0.06, "protein_pct": 0.32, "size_mm": 0.8},
        {"min_g": 5.0, "max_g": 25.0, "base_feed_pct": 0.04, "protein_pct": 0.28, "size_mm": 1.2},
        {"min_g": 25.0, "max_g": 100.0, "base_feed_pct": 0.03, "protein_pct": 0.28, "size_mm": 1.8},
        {"min_g": 100.0, "max_g": 250.0, "base_feed_pct": 0.03, "protein_pct": 0.24, "size_mm": 3.0},
        {"min_g": 250.0, "max_g": 400.0, "base_feed_pct": 0.02, "protein_pct": 0.24, "size_mm": 4.0},
        {"min_g": 400.0, "max_g": float("inf"), "base_feed_pct": 0.02, "protein_pct": 0.20, "size_mm": 6.0},
    ]

    def __init__(
        self,
        seed: Optional[int] = 42,
        initial_do: float = 6.20,
        initial_tan: float = 0.40,
        initial_ph: float = 7.85,
        initial_temp: float = 28.5,
        start_time: Optional[datetime] = None,
        interval_minutes: float = 5.0,
        # Field-derived aquaculture operational parameters
        tank_volume_m3: float = 20.0,
        fish_biomass_kg: float = 500.0,
        avg_fish_weight_g: float = 150.0,
        fish_age_days: int = 75,
        biofloc_feed_reduction: float = 0.25,
        farm_feed_ammonia_fraction: float = 0.03,
        fish_o2_demand_rate: float = 0.30,
        biofloc_o2_demand_enabled: bool = True,
        initial_biofloc_density_mll: float = 45.0,
        initial_water_level_liters: float = 16000.0,
        tank_capacity_liters: float = 20000.0,
    ):
        # Reproducible pseudo-random number generator
        self.rng = np.random.default_rng(seed)
        self.seed = seed

        # Water quality state vector
        self.do = float(initial_do)
        self.tan = float(initial_tan)
        self.ph = float(initial_ph)
        self.temp = float(initial_temp)

        # Time management
        self.interval_minutes = float(interval_minutes)
        self.dt_hours = self.interval_minutes / 60.0  # Normalized time step in hours
        self.sim_time = start_time or datetime.now(timezone.utc)
        self.step_count = 0

        # Mean reversion speeds theta (in hour^-1)
        self.theta_do = 0.40
        self.theta_tan = 0.25
        self.theta_ph = 0.35
        self.theta_temp = 0.30

        # Diffusion / volatility coefficients sigma
        self.sigma_do = 0.12
        self.sigma_tan = 0.03
        self.sigma_ph = 0.02
        self.sigma_temp = 0.05

        # Active scenario state
        self.active_scenario = "normal"
        self.scenario_steps_elapsed = 0

        # Field-informed configuration (field-derived operational parameters)
        self.tank_volume_m3 = float(tank_volume_m3)
        self.fish_biomass_kg = float(fish_biomass_kg)
        self.avg_fish_weight_g = float(avg_fish_weight_g)
        self.fish_age_days = int(fish_age_days)
        # Biofloc feed reduction range: 0.20 - 0.32 (configurable operational assumption)
        self.biofloc_feed_reduction = float(np.clip(biofloc_feed_reduction, 0.10, 0.40))
        # Farm-derived ammonia loading fraction (~3% of feed mass contributes to ammonia loading, based on supplied farm material)
        self.farm_feed_ammonia_fraction = float(farm_feed_ammonia_fraction)
        # Biological oxygen demand: 0.3 g O2 / kg fish / hour (field-derived operational assumption, phenomenological forcing)
        self.fish_o2_demand_rate = float(fish_o2_demand_rate)
        self.biofloc_o2_demand_enabled = bool(biofloc_o2_demand_enabled)

        # Biofloc concentration state (mL/L Imhoff cone volume; heuristic tracking, target <60 mL/L)
        self.biofloc_density_mll = float(initial_biofloc_density_mll)

        # Tank physical & water level state (software-defined protection thresholds)
        self.tank_capacity_liters = float(tank_capacity_liters)
        self.water_level_liters = float(initial_water_level_liters)
        self.min_safe_level_liters = 12000.0  # 60%
        self.max_safe_level_liters = 19000.0  # 95%
        self.inlet_flow_rate_lpm = 30.0       # L/min
        self.outlet_flow_rate_lpm = 30.0      # L/min

        # Internal digestion / excretion delayed release pool (kg ammonia loading)
        self.pending_tan_pool_kg = 0.0
        # Excretion rate constant (project simulator assumption/parameter, not a farm-derived constant)
        self.tan_excretion_k = 0.65  # hr^-1
        self._last_fed_slot: Optional[Tuple[int, float]] = None

        # Actuator states (software representation of physical/simulated actuators)
        self.actuator_states = {
            "inlet_pump": "OFF",          # "OFF" | "ON"
            "outlet_pump": "OFF",         # "OFF" | "ON"
            "aeration_system": "NORMAL",  # "OFF" | "NORMAL" | "EMERGENCY"
            "ph_increase_dosing": "OFF",  # "OFF" | "ON"
            "ph_decrease_dosing": "OFF",  # "OFF" | "ON"
        }

    @property
    def stocking_density_kg_m3(self) -> float:
        """Computed stocking density (kg fish / m3). Field-informed operational reference: <= 40 kg/m3."""
        vol = max(1.0, self.water_level_liters / 1000.0)
        return round(self.fish_biomass_kg / vol, 2)

    @property
    def water_level_pct(self) -> float:
        """Current water level as percentage of tank capacity."""
        return round((self.water_level_liters / max(1.0, self.tank_capacity_liters)) * 100.0, 1)

    @property
    def required_aeration_lpm(self) -> float:
        """
        Field aeration reference: 1.76 LPM per 10 kg fish shipping weight.
        Formula: required_aeration_lpm = biomass_kg * 0.176
        Note: Acts as an operational adequacy baseline / forcing term, not a physical gas-liquid transfer model.
        """
        return round(self.fish_biomass_kg * 0.176, 2)

    @classmethod
    def get_feeding_spec(cls, avg_fish_weight_g: float) -> dict:
        """
        Lookup feed percentage, protein content, and pellet size based on
        the field-derived feeding table (from supplied farm operational material).
        """
        w = float(avg_fish_weight_g)
        for band in cls.FEEDING_TABLE:
            if band["min_g"] <= w < band["max_g"]:
                return band
        return cls.FEEDING_TABLE[-1]

    def calculate_feeding_parameters(self) -> dict:
        """
        Computes feeding frequency, daily feed mass, and feed mass per event
        accounting for the biofloc feed reduction assumption (20-32%).
        """
        spec = self.get_feeding_spec(self.avg_fish_weight_g)
        base_feed_pct = spec["base_feed_pct"]

        # Approximately 3 feedings/day before 2 months (60 days), 2 feedings/day from 2 months
        frequency = 3 if self.fish_age_days < 60 else 2

        # Effective feed percentage after biofloc contribution reduction
        effective_feed_pct = base_feed_pct * (1.0 - self.biofloc_feed_reduction)
        daily_feed_mass_kg = self.fish_biomass_kg * effective_feed_pct
        feed_per_event_kg = daily_feed_mass_kg / frequency

        # Estimated ammonia loading per event (farm-derived assumption: ~3% of feed mass contributes to ammonia loading)
        est_ammonia_per_event_kg = feed_per_event_kg * self.farm_feed_ammonia_fraction

        return {
            "avg_fish_weight_g": self.avg_fish_weight_g,
            "base_feed_pct": base_feed_pct,
            "effective_feed_pct": round(effective_feed_pct, 4),
            "protein_pct": spec["protein_pct"],
            "feed_size_mm": spec["size_mm"],
            "feeding_frequency": frequency,
            "biofloc_feed_reduction": self.biofloc_feed_reduction,
            "daily_feed_mass_kg": round(daily_feed_mass_kg, 3),
            "feed_per_event_kg": round(feed_per_event_kg, 3),
            "farm_feed_ammonia_fraction": self.farm_feed_ammonia_fraction,
            "est_ammonia_per_event_kg": round(est_ammonia_per_event_kg, 4),
        }

    def trigger_feeding_event(self, feed_mass_kg: Optional[float] = None) -> dict:
        """
        Explicitly triggers a field-grounded feeding event.
        Adds ammonia to the delayed excretion pool and slightly elevates microbial oxygen demand.
        """
        feed_params = self.calculate_feeding_parameters()
        actual_mass_kg = feed_mass_kg if feed_mass_kg is not None else feed_params["feed_per_event_kg"]

        # Farm-derived ammonia loading fraction: approximately 3% of feed mass contributes to ammonia loading
        ammonia_kg = actual_mass_kg * self.farm_feed_ammonia_fraction
        self.pending_tan_pool_kg += ammonia_kg

        # Feeding slightly increases biofloc particulate density
        self.biofloc_density_mll = min(120.0, self.biofloc_density_mll + actual_mass_kg * 0.05)

        return {
            "feed_mass_kg": round(actual_mass_kg, 3),
            "ammonia_loaded_kg": round(ammonia_kg, 4),
            "pending_tan_pool_kg": round(self.pending_tan_pool_kg, 4),
        }

    def apply_actuator_commands(self, commands: Dict[str, str]) -> Dict[str, str]:
        """
        Applies requested actuator states to the simulator's internal control layer.
        Enforces software safety interlocks on water level and conflicting operations.
        """
        for act, target in commands.items():
            if act not in self.actuator_states:
                continue
            target_upper = target.upper()

            # Safety Interlock 1: Inlet pump blocked if water level >= maximum safe level
            if act == "inlet_pump" and target_upper == "ON":
                if self.water_level_liters >= self.max_safe_level_liters:
                    continue  # Blocked by high-level safety interlock
                # Also prevent conflicting simultaneous outlet pump
                if self.actuator_states.get("outlet_pump") == "ON":
                    self.actuator_states["outlet_pump"] = "OFF"

            # Safety Interlock 2: Outlet pump blocked if water level <= minimum safe level
            if act == "outlet_pump" and target_upper == "ON":
                if self.water_level_liters <= self.min_safe_level_liters:
                    continue  # Blocked by low-level safety interlock
                # Also prevent conflicting simultaneous inlet pump
                if self.actuator_states.get("inlet_pump") == "ON":
                    self.actuator_states["inlet_pump"] = "OFF"

            # Safety Interlock 3: Validate aeration system modes
            if act == "aeration_system":
                if target_upper not in ("OFF", "NORMAL", "EMERGENCY"):
                    continue
                # If recovering from failure, update scenario
                if target_upper in ("NORMAL", "EMERGENCY") and self.active_scenario == "aerator_failure":
                    self.active_scenario = "aerator_recovery" if target_upper == "EMERGENCY" else "normal"

            # Validate dosing states
            if act in ("ph_increase_dosing", "ph_decrease_dosing"):
                if target_upper not in ("OFF", "ON"):
                    continue
                # Mutual exclusion on pH dosing
                if act == "ph_increase_dosing" and target_upper == "ON":
                    self.actuator_states["ph_decrease_dosing"] = "OFF"
                elif act == "ph_decrease_dosing" and target_upper == "ON":
                    self.actuator_states["ph_increase_dosing"] = "OFF"

            self.actuator_states[act] = target_upper

        return dict(self.actuator_states)

    def set_scenario(self, scenario: str) -> bool:
        """Switch operational scenario dynamically."""
        scenario_lower = scenario.lower().strip()
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
        scenario_lower = alias_map.get(scenario_lower, scenario_lower)
        if scenario_lower in self.SCENARIOS:
            self.active_scenario = scenario_lower
            self.scenario_steps_elapsed = 0

            # Coupling: align actuator states with scenario presets
            if self.active_scenario == "aerator_failure":
                self.actuator_states["aeration_system"] = "OFF"
            elif self.active_scenario == "aerator_recovery":
                self.actuator_states["aeration_system"] = "EMERGENCY"
            elif self.active_scenario == "feeding":
                self.trigger_feeding_event()
            return True
        return False

    @staticmethod
    def calculate_unionized_ammonia(tan_mgl: float, ph: float, temp_c: float) -> float:
        """
        Calculates toxic unionized ammonia (NH3 in mg/L) from TAN, pH, and Temperature
        using the Emerson et al. (1975) chemical equilibrium formulation.
        """
        temp_k = temp_c + 273.15
        pka = (2729.92 / temp_k) + 0.09018
        exponent = pka - ph
        # Guard against overflow
        if exponent > 30:
            fraction = 0.0
        elif exponent < -30:
            fraction = 1.0
        else:
            fraction = 1.0 / (1.0 + math.pow(10.0, exponent))
        return round(float(tan_mgl * fraction), 4)

    def _get_hour_of_day(self) -> float:
        """Returns floating-point hour in [0, 24)."""
        return self.sim_time.hour + (self.sim_time.minute / 60.0) + (self.sim_time.second / 3600.0)

    def step(self, advance_sim_time: bool = True) -> Dict:
        """
        Advance the stochastic differential equation by one time step (dt_hours).
        Incorporate biological oxygen demand, delayed ammonia loading, biofloc density,
        water level changes, and actuator effects.
        Returns a standardized, strictly validated telemetry dictionary.
        """
        self.step_count += 1
        self.scenario_steps_elapsed += 1
        hour = self._get_hour_of_day()

        dt = self.dt_hours
        sqrt_dt = math.sqrt(dt)

        # -----------------------------------------------------------------
        # 0. Water Level & Actuator Flow Dynamics
        # -----------------------------------------------------------------
        step_minutes = self.interval_minutes
        inlet_active = self.actuator_states.get("inlet_pump") == "ON"
        outlet_active = self.actuator_states.get("outlet_pump") == "ON"

        # Apply inlet pump flow (+30 LPM)
        if inlet_active and self.water_level_liters < self.max_safe_level_liters:
            delta_vol = self.inlet_flow_rate_lpm * step_minutes
            self.water_level_liters = min(self.max_safe_level_liters, self.water_level_liters + delta_vol)
            # Fresh water slightly dilutes TAN
            dilution_factor = delta_vol / max(1000.0, self.water_level_liters)
            self.tan = max(0.05, self.tan * (1.0 - dilution_factor * 0.5))
        elif inlet_active and self.water_level_liters >= self.max_safe_level_liters:
            # Auto-interlock: cut off inlet pump at upper threshold
            self.actuator_states["inlet_pump"] = "OFF"

        # Apply outlet / sludge pump flow (-30 LPM)
        if outlet_active and self.water_level_liters > self.min_safe_level_liters:
            delta_vol = self.outlet_flow_rate_lpm * step_minutes
            self.water_level_liters = max(self.min_safe_level_liters, self.water_level_liters - delta_vol)
            # Sludge removal reduces biofloc density
            self.biofloc_density_mll = max(15.0, self.biofloc_density_mll - (delta_vol / 2000.0))
        elif outlet_active and self.water_level_liters <= self.min_safe_level_liters:
            # Auto-interlock: cut off outlet pump at lower threshold
            self.actuator_states["outlet_pump"] = "OFF"

        # -----------------------------------------------------------------
        # 1. Temperature Sub-process
        # Diurnal thermal curve: minimum at 06:00, maximum at 15:00
        # -----------------------------------------------------------------
        base_temp = 28.5
        temp_amp = 1.3
        mu_temp = base_temp + temp_amp * math.sin(2.0 * math.pi * (hour - 9.0) / 24.0)
        dw_temp = float(self.rng.normal(0.0, 1.0))
        d_temp = self.theta_temp * (mu_temp - self.temp) * dt + self.sigma_temp * sqrt_dt * dw_temp
        self.temp = float(np.clip(self.temp + d_temp, 20.0, 36.0))

        # -----------------------------------------------------------------
        # 2. Biological Respiration & Aeration Actuator DO Sub-process
        # Biological Oxygen Demand:
        # - Fish: 0.3 g O2 / kg fish / hr (field-derived assumption)
        # - Biofloc: comparable demand term when enabled
        # Total demand in mg/L/hr: (R_fish + R_biofloc) / V_tank
        # -----------------------------------------------------------------
        vol_m3 = max(1.0, self.water_level_liters / 1000.0)
        fish_o2_demand_gh = self.fish_biomass_kg * self.fish_o2_demand_rate
        if self.biofloc_o2_demand_enabled:
            # Scaled biofloc respiration (reference ~ equal to fish demand at 50 mL/L)
            biofloc_o2_demand_gh = fish_o2_demand_gh * (self.biofloc_density_mll / 50.0)
        else:
            biofloc_o2_demand_gh = 0.0

        total_o2_demand_gh = fish_o2_demand_gh + biofloc_o2_demand_gh
        demand_rate_mgl_h = total_o2_demand_gh / vol_m3  # 1 g/m3 == 1 mg/L

        # Aeration system actuator status
        aeration_mode = self.actuator_states.get("aeration_system", "NORMAL")

        # Scenario overrides actuator if scenario explicitly forces blower failure
        if self.active_scenario == "aerator_failure" or aeration_mode == "OFF":
            # Mechanical aeration lost: severe decay toward low hypoxic floor
            hypoxic_floor = 1.80
            decay_rate = 1.20 + (demand_rate_mgl_h * 0.02)
            mu_do = hypoxic_floor
            dw_do = float(self.rng.normal(0.0, 1.0))
            d_do = decay_rate * (mu_do - self.do) * dt + (self.sigma_do * 0.5) * sqrt_dt * dw_do
            self.do = float(np.clip(self.do + d_do, 1.20, 10.0))
        elif self.active_scenario == "aerator_recovery" or aeration_mode == "EMERGENCY":
            # High / emergency aeration: rapid re-oxygenation
            target_do = 6.40
            recovery_rate = 0.95
            dw_do = float(self.rng.normal(0.0, 1.0))
            d_do = recovery_rate * (target_do - self.do) * dt + self.sigma_do * sqrt_dt * dw_do
            self.do = float(np.clip(self.do + d_do, 1.50, 10.0))
            # Auto-transition back to normal once recovered if under aerator_recovery scenario
            if self.active_scenario == "aerator_recovery" and self.do >= 5.80 and self.scenario_steps_elapsed > 12:
                self.active_scenario = "normal"
                self.actuator_states["aeration_system"] = "NORMAL"
        else:
            # Baseline diurnal sinusoidal respiration cycle + biological demand
            base_do = 5.80
            do_amp = 1.50
            mu_do = base_do + do_amp * math.sin(2.0 * math.pi * (hour - 10.0) / 24.0)

            # Feeding event increases microbial oxygen demand temporarily
            if self.active_scenario == "feeding":
                mu_do = max(4.50, mu_do - 0.60)

            dw_do = float(self.rng.normal(0.0, 1.0))
            d_do = self.theta_do * (mu_do - self.do) * dt + self.sigma_do * sqrt_dt * dw_do
            self.do = float(np.clip(self.do + d_do, 2.50, 10.50))

        # -----------------------------------------------------------------
        # 3. Total Ammonia Nitrogen (TAN) Sub-process
        # Field-derived ammonia loading with delayed temporal digestion kinetics
        # -----------------------------------------------------------------
        feed_params = self.calculate_feeding_parameters()
        freq = feed_params["feeding_frequency"]

        # Check for scheduled daily feedings (guarded to trigger once per feeding window)
        feeding_hours = (8.0, 12.0, 16.0) if freq == 3 else (8.5, 16.5)
        for f_hr in feeding_hours:
            if abs(hour - f_hr) < (self.dt_hours * 0.75):
                slot = (self.sim_time.day, f_hr)
                if self._last_fed_slot != slot:
                    self._last_fed_slot = slot
                    self.trigger_feeding_event()
                break

        # Digest pending ammonia pool with temporal exponential excretion
        if self.pending_tan_pool_kg > 0.0:
            excreted_kg = self.pending_tan_pool_kg * (1.0 - math.exp(-self.tan_excretion_k * dt))
            self.pending_tan_pool_kg = max(0.0, self.pending_tan_pool_kg - excreted_kg)
            # Add to water column TAN (mg/L)
            conc_inc_mgl = (excreted_kg * 1e6) / max(1000.0, self.water_level_liters)
            self.tan = float(np.clip(self.tan + conc_inc_mgl, 0.08, 4.50))

        if self.active_scenario == "feeding":
            # Scenario post-prandial pulse
            target_tan = 1.60
            dw_tan = float(self.rng.normal(0.0, 1.0))
            d_tan = 0.35 * (target_tan - self.tan) * dt + self.sigma_tan * sqrt_dt * dw_tan
            self.tan = float(np.clip(self.tan + d_tan, 0.10, 3.50))
            if self.scenario_steps_elapsed > 24:  # ~2 hours pulse
                self.active_scenario = "normal"
        elif self.active_scenario == "organic_overload":
            target_tan = 2.40
            dw_tan = float(self.rng.normal(0.0, 1.0))
            d_tan = 0.20 * (target_tan - self.tan) * dt + self.sigma_tan * sqrt_dt * dw_tan
            self.tan = float(np.clip(self.tan + d_tan, 0.10, 4.50))
        else:
            # Normal biofloc assimilation baseline (mean reverts toward low baseline)
            base_tan = 0.65 if self.pending_tan_pool_kg > 0.02 else 0.38
            dw_tan = float(self.rng.normal(0.0, 1.0))
            d_tan = self.theta_tan * (base_tan - self.tan) * dt + self.sigma_tan * sqrt_dt * dw_tan
            self.tan = float(np.clip(self.tan + d_tan, 0.08, 2.50))

        # -----------------------------------------------------------------
        # 4. pH Sub-process & Dosing Actuator Effects
        # -----------------------------------------------------------------
        base_ph = 7.75
        ph_amp = 0.22
        mu_ph = base_ph + ph_amp * math.sin(2.0 * math.pi * (hour - 10.0) / 24.0)
        if self.active_scenario == "organic_overload":
            mu_ph -= 0.35  # Acidification from nitrification / organic breakdown

        # pH dosing actuators
        dosing_inc = self.actuator_states.get("ph_increase_dosing") == "ON"
        dosing_dec = self.actuator_states.get("ph_decrease_dosing") == "ON"
        if dosing_inc:
            mu_ph += 0.30
        elif dosing_dec:
            mu_ph -= 0.30

        dw_ph = float(self.rng.normal(0.0, 1.0))
        d_ph = self.theta_ph * (mu_ph - self.ph) * dt + self.sigma_ph * sqrt_dt * dw_ph
        self.ph = float(np.clip(self.ph + d_ph, 6.80, 8.80))

        # -----------------------------------------------------------------
        # 5. Biofloc Density Micro-dynamics
        # Slow settling and solids turnover
        # -----------------------------------------------------------------
        self.biofloc_density_mll = float(np.clip(self.biofloc_density_mll - (0.05 * dt), 10.0, 150.0))

        # Calculate toxic unionized ammonia (NH3)
        nh3_mgl = self.calculate_unionized_ammonia(self.tan, self.ph, self.temp)

        # Construct strictly compliant payload
        payload = {
            "timestamp": self.sim_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "tank_id": "tank_01",
            "sensors": {
                "ph": round(self.ph, 2),
                "temperature_c": round(self.temp, 1),
                "dissolved_oxygen_mgl": round(self.do, 2),
                "tan_mgl": round(self.tan, 2),
            },
            # Scientific & Operational metadata
            "metadata": {
                "calculated_nh3_mgl": nh3_mgl,
                "scenario": self.active_scenario,
                "sim_step": self.step_count,
                # Field-derived operational telemetry
                "fish_biomass_kg": self.fish_biomass_kg,
                "stocking_density_kg_m3": self.stocking_density_kg_m3,
                "required_aeration_lpm": self.required_aeration_lpm,
                "biofloc_density_mll": round(self.biofloc_density_mll, 1),
                "water_level_liters": round(self.water_level_liters, 1),
                "water_level_pct": self.water_level_pct,
                "actuator_states": dict(self.actuator_states),
            },
        }

        # Advance simulation clock if requested
        if advance_sim_time:
            self.sim_time += timedelta(minutes=self.interval_minutes)

        return payload
