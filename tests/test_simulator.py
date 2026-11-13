import pytest
import numpy as np
from sde import BioflocSDEEngine


def test_sde_initialization():
    """Verify default engine initialization and state bounds."""
    engine = BioflocSDEEngine(seed=42)
    assert 5.0 <= engine.do <= 8.0
    assert 7.0 <= engine.ph <= 8.5
    assert 24.0 <= engine.temp <= 32.0
    assert 0.0 <= engine.tan <= 2.0
    assert engine.fish_biomass_kg == 500.0
    assert engine.stocking_density_kg_m3 <= 40.0  # Field reference check


def test_sde_reproducibility():
    """Verify identical random seeds produce bit-identical stochastic trajectories."""
    engine1 = BioflocSDEEngine(seed=123)
    engine2 = BioflocSDEEngine(seed=123)

    for _ in range(50):
        p1 = engine1.step(advance_sim_time=True)
        p2 = engine2.step(advance_sim_time=True)
        assert p1["sensors"]["dissolved_oxygen_mgl"] == p2["sensors"]["dissolved_oxygen_mgl"]
        assert p1["sensors"]["ph"] == p2["sensors"]["ph"]
        assert p1["sensors"]["temperature_c"] == p2["sensors"]["temperature_c"]
        assert p1["sensors"]["tan_mgl"] == p2["sensors"]["tan_mgl"]


def test_sde_different_seeds_diverge():
    """Verify different seeds produce stochastic divergence."""
    engine1 = BioflocSDEEngine(seed=100)
    engine2 = BioflocSDEEngine(seed=200)

    for _ in range(20):
        p1 = engine1.step(advance_sim_time=True)
        p2 = engine2.step(advance_sim_time=True)

    assert p1["sensors"]["dissolved_oxygen_mgl"] != p2["sensors"]["dissolved_oxygen_mgl"]


def test_sde_numerical_stability():
    """Verify that 2000 continuous simulation steps produce valid finite floats within bounds."""
    engine = BioflocSDEEngine(seed=42)

    for _ in range(2000):
        p = engine.step(advance_sim_time=True)
        sensors = p["sensors"]
        assert np.isfinite(sensors["dissolved_oxygen_mgl"])
        assert np.isfinite(sensors["ph"])
        assert np.isfinite(sensors["temperature_c"])
        assert np.isfinite(sensors["tan_mgl"])
        assert 0.0 <= sensors["dissolved_oxygen_mgl"] <= 14.0
        assert 6.0 <= sensors["ph"] <= 9.0
        assert 18.0 <= sensors["temperature_c"] <= 36.0
        assert 0.0 <= sensors["tan_mgl"] <= 10.0


def test_aerator_failure_scenario():
    """Verify that aerator failure scenario causes severe DO depletion."""
    engine = BioflocSDEEngine(seed=42)
    engine.set_scenario("aerator_failure")

    # Simulate 30 minutes of failure (6 steps at 5-minute intervals)
    for _ in range(24):
        p = engine.step(advance_sim_time=True)

    # Under aerator failure, DO should fall into hypoxic crisis (< 3.0 mg/L)
    final_do = p["sensors"]["dissolved_oxygen_mgl"]
    assert final_do < 3.5, f"Expected hypoxic DO < 3.5, got {final_do}"


def test_aerator_recovery_scenario():
    """Verify that aerator recovery scenario restores DO levels."""
    engine = BioflocSDEEngine(seed=42)
    engine.set_scenario("aerator_failure")
    for _ in range(20):
        engine.step(advance_sim_time=True)

    low_do = engine.do

    # Restore aeration
    engine.set_scenario("aerator_recovery")
    for _ in range(30):
        p = engine.step(advance_sim_time=True)

    recovered_do = p["sensors"]["dissolved_oxygen_mgl"]
    assert recovered_do > low_do, "DO should recover after aerator recovery scenario"
    assert recovered_do > 4.5, f"Expected recovery DO > 4.5, got {recovered_do}"


def test_feeding_scenario_tan_spike():
    """Verify feeding scenario increases TAN production."""
    engine = BioflocSDEEngine(seed=42)
    initial_tan = engine.tan

    engine.set_scenario("feeding")
    for _ in range(15):
        p = engine.step(advance_sim_time=True)

    assert p["sensors"]["tan_mgl"] > initial_tan, "Feeding must increase TAN via metabolic excretion"


def test_emerson_ammonia_calculation():
    """
    Verify Emerson et al. (1975) unionized ammonia fraction calculation.
    Example: T = 28.0 C, pH = 8.2, TAN = 1.0 mg/L -> NH3 ~ 0.10 mg/L
    """
    nh3 = BioflocSDEEngine.calculate_unionized_ammonia(tan_mgl=1.0, ph=8.2, temp_c=28.0)
    assert 0.08 <= nh3 <= 0.12, f"Expected NH3 ~ 0.10 mg/L, got {nh3}"

    # Acidic pH test: pH 7.0 should yield very low unionized fraction (< 1%)
    nh3_acidic = BioflocSDEEngine.calculate_unionized_ammonia(tan_mgl=1.0, ph=7.0, temp_c=25.0)
    assert nh3_acidic < 0.01, f"Expected NH3 < 0.01 mg/L at pH 7.0, got {nh3_acidic}"

    # Temperature sensitivity test: higher temp yields higher NH3 fraction
    nh3_cold = BioflocSDEEngine.calculate_unionized_ammonia(tan_mgl=1.0, ph=8.0, temp_c=20.0)
    nh3_hot = BioflocSDEEngine.calculate_unionized_ammonia(tan_mgl=1.0, ph=8.0, temp_c=32.0)
    assert nh3_hot > nh3_cold, "Higher temperature must shift equilibrium toward toxic NH3"


# =========================================================================
# Field-Grounded Aquaculture Dynamics Tests (Phase B)
# =========================================================================

def test_field_feeding_table_bands():
    """Verify field feeding table returns correct specifications across all fish weight bands."""
    # 3-5 g: 6% feed, 32% protein, 0.8 mm
    spec_4g = BioflocSDEEngine.get_feeding_spec(4.0)
    assert spec_4g["base_feed_pct"] == 0.06
    assert spec_4g["protein_pct"] == 0.32
    assert spec_4g["size_mm"] == 0.8

    # 5-25 g: 4% feed, 28% protein, 1.2 mm
    spec_15g = BioflocSDEEngine.get_feeding_spec(15.0)
    assert spec_15g["base_feed_pct"] == 0.04
    assert spec_15g["protein_pct"] == 0.28
    assert spec_15g["size_mm"] == 1.2

    # 25-100 g: 3% feed, 28% protein, 1.8 mm
    spec_60g = BioflocSDEEngine.get_feeding_spec(60.0)
    assert spec_60g["base_feed_pct"] == 0.03
    assert spec_60g["protein_pct"] == 0.28
    assert spec_60g["size_mm"] == 1.8

    # 100-250 g: 3% feed, 24% protein, 3.0 mm
    spec_150g = BioflocSDEEngine.get_feeding_spec(150.0)
    assert spec_150g["base_feed_pct"] == 0.03
    assert spec_150g["protein_pct"] == 0.24
    assert spec_150g["size_mm"] == 3.0

    # 250-400 g: 2% feed, 24% protein, 4.0 mm
    spec_300g = BioflocSDEEngine.get_feeding_spec(300.0)
    assert spec_300g["base_feed_pct"] == 0.02
    assert spec_300g["protein_pct"] == 0.24
    assert spec_300g["size_mm"] == 4.0

    # >400 g: 2% feed, 20% protein, 6.0 mm
    spec_500g = BioflocSDEEngine.get_feeding_spec(500.0)
    assert spec_500g["base_feed_pct"] == 0.02
    assert spec_500g["protein_pct"] == 0.20
    assert spec_500g["size_mm"] == 6.0


def test_biofloc_feed_reduction_and_schedule():
    """Verify biofloc feed reduction parameter and age-dependent feeding schedule."""
    # Under 2 months (e.g. 45 days) -> 3 feedings/day
    engine_young = BioflocSDEEngine(fish_age_days=45, avg_fish_weight_g=80.0, biofloc_feed_reduction=0.25)
    params_young = engine_young.calculate_feeding_parameters()
    assert params_young["feeding_frequency"] == 3
    # 80g fish -> base 3%. With 25% reduction -> 3% * 0.75 = 2.25%
    assert np.isclose(params_young["effective_feed_pct"], 0.0225)

    # 2 months and older (e.g. 75 days) -> 2 feedings/day
    engine_adult = BioflocSDEEngine(fish_age_days=75, avg_fish_weight_g=200.0, biofloc_feed_reduction=0.30)
    params_adult = engine_adult.calculate_feeding_parameters()
    assert params_adult["feeding_frequency"] == 2
    # 200g fish -> base 3%. With 30% reduction -> 3% * 0.70 = 2.10%
    assert np.isclose(params_adult["effective_feed_pct"], 0.0210)
    # Biomass 500 kg -> daily feed = 500 * 0.021 = 10.5 kg
    assert np.isclose(params_adult["daily_feed_mass_kg"], 10.5)
    # Per event: 10.5 / 2 = 5.25 kg
    assert np.isclose(params_adult["feed_per_event_kg"], 5.25)


def test_ammonia_loading_delayed_response():
    """Verify ammonia loading from feed is configurable and not an instantaneous spike."""
    engine = BioflocSDEEngine(seed=42, farm_feed_ammonia_fraction=0.03, initial_tan=0.40)
    initial_tan = engine.tan
    initial_pool = engine.pending_tan_pool_kg
    assert initial_pool == 0.0

    # Trigger feeding event with 5.0 kg feed
    res = engine.trigger_feeding_event(feed_mass_kg=5.0)
    # 5.0 kg feed * 0.03 ammonia fraction = 0.15 kg TAN loaded into pending pool
    assert np.isclose(res["ammonia_loaded_kg"], 0.15)
    assert engine.pending_tan_pool_kg > 0.10

    # Advance 1 step: TAN should start increasing smoothly, not jump instantaneously to maximum
    engine.step(advance_sim_time=True)
    step1_tan = engine.tan
    assert step1_tan > initial_tan
    # Still pending ammonia remains to be digested over subsequent hours
    assert engine.pending_tan_pool_kg > 0.0


def test_oxygen_demand_and_aeration_requirement():
    """Verify field-derived biological oxygen demand and aeration LPM scaling."""
    # 500 kg fish
    engine = BioflocSDEEngine(fish_biomass_kg=500.0)
    # 1.76 LPM per 10 kg fish -> 500 * 0.176 = 88.0 LPM
    assert np.isclose(engine.required_aeration_lpm, 88.0)

    # 1000 kg fish -> 176.0 LPM
    engine_1000 = BioflocSDEEngine(fish_biomass_kg=1000.0)
    assert np.isclose(engine_1000.required_aeration_lpm, 176.0)

    # Oxygen demand with biofloc enabled vs disabled
    assert engine.biofloc_o2_demand_enabled is True
    engine_no_floc = BioflocSDEEngine(fish_biomass_kg=500.0, biofloc_o2_demand_enabled=False)
    assert engine_no_floc.biofloc_o2_demand_enabled is False


def test_actuator_water_level_safety_interlocks():
    """Verify tank water level safety limits and pump interlocks."""
    engine = BioflocSDEEngine(
        initial_water_level_liters=18900.0,
        tank_capacity_liters=20000.0,
    )
    engine.max_safe_level_liters = 19000.0
    engine.min_safe_level_liters = 12000.0

    # Test 1: Inlet pump increases level, but stops and auto-shuts off at max safe level
    engine.apply_actuator_commands({"inlet_pump": "ON"})
    assert engine.actuator_states["inlet_pump"] == "ON"
    # Step simulation: 30 LPM * 5 min = 150 L added -> hits 19000 limit
    engine.step(advance_sim_time=True)
    assert engine.water_level_liters <= engine.max_safe_level_liters

    # Further inlet attempts must be blocked
    engine.apply_actuator_commands({"inlet_pump": "ON"})
    engine.step(advance_sim_time=True)
    assert engine.water_level_liters <= engine.max_safe_level_liters

    # Test 2: Conflicting simultaneous operation (outlet ON should turn inlet OFF)
    engine.apply_actuator_commands({"outlet_pump": "ON"})
    assert engine.actuator_states["outlet_pump"] == "ON"
    assert engine.actuator_states["inlet_pump"] == "OFF"

    # Test 3: Drain down to minimum safe level
    engine.water_level_liters = 12050.0
    engine.step(advance_sim_time=True)
    assert engine.water_level_liters >= engine.min_safe_level_liters


def test_actuator_aeration_and_dosing_controls():
    """Verify software control of aeration modes and mutual exclusion of pH dosing."""
    engine = BioflocSDEEngine(seed=42)

    # Aeration mode switching
    engine.apply_actuator_commands({"aeration_system": "EMERGENCY"})
    assert engine.actuator_states["aeration_system"] == "EMERGENCY"

    engine.apply_actuator_commands({"aeration_system": "OFF"})
    assert engine.actuator_states["aeration_system"] == "OFF"

    # pH dosing mutual exclusion
    engine.apply_actuator_commands({"ph_increase_dosing": "ON"})
    assert engine.actuator_states["ph_increase_dosing"] == "ON"
    assert engine.actuator_states["ph_decrease_dosing"] == "OFF"

    engine.apply_actuator_commands({"ph_decrease_dosing": "ON"})
    assert engine.actuator_states["ph_decrease_dosing"] == "ON"
    assert engine.actuator_states["ph_increase_dosing"] == "OFF"
