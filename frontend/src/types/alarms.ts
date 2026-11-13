export type AlarmSeverity = 'critical' | 'warning' | 'advisory';

export type AlarmType =
  | 'lethal_hypoxia'
  | 'low_do_warning'
  | 'rapid_do_plummet'
  | 'ammonia_toxicity'
  | 'ph_stress'
  | 'concept_drift'
  | 'predicted_hypoxia'
  | 'excessive_biofloc';

export interface AlarmActionDescriptor {
  actuator:
    | 'aeration_system'
    | 'outlet_pump'
    | 'inlet_pump'
    | 'ph_increase_dosing'
    | 'ph_decrease_dosing'
    | 'carbon_source_dosing';
  targetState: string;
  label: string;
  activeLabel: string;
  recommendedResponse: string;
}

export interface AlarmItem {
  id: string;
  type: AlarmType;
  severity: AlarmSeverity;
  title: string;
  message: string;
  value: string;
  threshold: string;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt?: string;
  sop: string[];
  action?: AlarmActionDescriptor;
}

export interface AlarmSystemState {
  activeAlarms: AlarmItem[];
  unacknowledgedCount: number;
  criticalCount: number;
  warningCount: number;
  alarmHistory: AlarmItem[];
  acknowledgeAlarm: (id: string) => void;
  acknowledgeAll: () => void;
  clearHistory: () => void;
}
