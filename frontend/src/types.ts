export interface SensorData {
  ph: number;
  temperature_c: number;
  dissolved_oxygen_mgl: number;
  tan_mgl: number;
}

export interface TelemetryMetadata {
  calculated_nh3_mgl?: number;
  scenario?: string;
  source?: string;
  sim_step?: number;
  biofloc_density_mll?: number;
  fish_biomass_kg?: number;
  stocking_density_kg_m3?: number;
  required_aeration_lpm?: number;
  water_level_liters?: number;
  water_level_pct?: number;
  actuator_states?: Record<string, string>;
}

export interface TelemetryPayload {
  timestamp: string;
  tank_id: string;
  sensors: SensorData;
  metadata?: TelemetryMetadata;
}

export interface ChartDataPoint {
  time: string;
  timestamp: string;
  ph: number;
  temperature_c: number;
  dissolved_oxygen_mgl: number;
  tan_mgl: number;
  calculated_nh3_mgl?: number;
}

export interface MLForecast {
  predicted_do_2h: number;
  current_do: number;
  delta: number;
  status: 'Optimal' | 'Warning' | 'Critical';
  prediction_interval: [number, number];
  persistence_baseline?: number;
  persistence_error?: number;
  concept_drift_status: 'STABLE' | 'DRIFT_DETECTED';
  model_engine: string;
  do_slope_per_hour?: number;
}

export interface MLMetadata {
  model_type: string;
  target: string;
  features: string[];
  n_features: number;
  trained_at: string;
  benchmarks: {
    persistence_baseline: { rmse: number; mae: number; r2: number };
    diurnal_mean_baseline: { rmse: number; mae: number; r2: number };
    lightgbm_regressor: { rmse: number; mae: number; r2: number; improvement_over_persistence_pct: number };
    uncertainty_quantification: {
      method: string;
      target_coverage_pct: number;
      empirical_coverage_pct: number;
      average_interval_width_mgl: number;
    };
  };
}

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export type ActiveView =
  | 'overview'
  | 'monitoring'
  | 'control'
  | 'analytics'
  | 'forecast'
  | 'water-quality'
  | 'scenarios'
  | 'technology'
  | 'research';

export type ControlMode = 'AUTO' | 'MANUAL' | 'SIMULATION';

export interface ActuatorDetail {
  id: string;
  name: string;
  state: string;
  power_pct: number;
  mode: 'auto' | 'manual' | 'simulation';
  reason: string;
  safety_status: 'ok' | 'interlocked_blocked' | 'warning';
  last_change: string;
  interlock_message?: string | null;
}

export interface WaterLevelState {
  current_level_liters: number;
  tank_capacity_liters: number;
  level_percentage: number;
  min_safe_level_liters: number;
  max_safe_level_liters: number;
  inlet_blocked: boolean;
  outlet_blocked: boolean;
}

export interface ControlEvent {
  id: string;
  timestamp: string;
  actuator: string;
  action: string;
  previous_state: string;
  new_state: string;
  trigger: string;
  blocked: boolean;
  blocked_reason?: string | null;
}

export interface ControlStatusResponse {
  mode: ControlMode;
  actuators: Record<string, ActuatorDetail>;
  water_level: WaterLevelState;
  safety_interlocks: {
    inlet_blocked: boolean;
    outlet_blocked: boolean;
    aeration_emergency: boolean;
  };
  interlock_messages: string[];
  recent_events: ControlEvent[];
  operational_references: {
    stocking_density_limit_kg_m3: number;
    aeration_lpm_per_10kg: number;
    oxygen_demand_g_per_kg_hr: number;
    biofloc_solids_target_mll: string;
    biofloc_drain_threshold_mll: string;
    ammonia_feed_fraction_pct: number;
  };
}

