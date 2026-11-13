import { useState, useEffect, useCallback, useMemo } from 'react';
import { TelemetryPayload, ChartDataPoint, MLForecast } from '../types';
import { AlarmItem, AlarmSystemState } from '../types/alarms';

export function useAlarmSystem(
  latestPayload: TelemetryPayload | null,
  dataPoints: ChartDataPoint[],
  mlForecast: MLForecast | null
): AlarmSystemState {
  const [activeAlarms, setActiveAlarms] = useState<AlarmItem[]>([]);
  const [alarmHistory, setAlarmHistory] = useState<AlarmItem[]>([]);

  // Evaluate alarms whenever latestPayload or mlForecast updates
  useEffect(() => {
    if (!latestPayload?.sensors) return;

    const s = latestPayload.sensors;
    const doVal = s.dissolved_oxygen_mgl;
    const nh3Val = latestPayload.metadata?.calculated_nh3_mgl ?? 0.01;
    const phVal = s.ph;
    const bioflocVal = latestPayload.metadata?.biofloc_density_mll;
    const ts = latestPayload.timestamp || new Date().toISOString();

    // Calculate 15-min DO velocity across recent dataPoints
    let doVelocity = 0.0;
    if (dataPoints.length >= 3) {
      const recent = dataPoints.slice(-4);
      const first = recent[0].dissolved_oxygen_mgl;
      const last = recent[recent.length - 1].dissolved_oxygen_mgl;
      // Sampling is 5 minutes per step
      const hours = ((recent.length - 1) * 5) / 60;
      doVelocity = hours > 0 ? (last - first) / hours : 0;
    }

    const detectedTypes: {
      type: AlarmItem['type'];
      severity: AlarmItem['severity'];
      title: string;
      message: string;
      value: string;
      threshold: string;
      sop: string[];
      action?: AlarmItem['action'];
    }[] = [];

    // 1. Rapid DO Plummet / Velocity Alarm (earliest warning of blower cut)
    if (doVelocity < -1.0) {
      detectedTypes.push({
        type: 'rapid_do_plummet',
        severity: 'critical',
        title: 'Rapid Aeration Loss Detected',
        message: `Dissolved oxygen is falling rapidly at ${Math.abs(doVelocity).toFixed(2)} mg/L/hr. Suspected blower blackout or mechanical failure.`,
        value: `${doVelocity.toFixed(2)} mg/L/hr`,
        threshold: '< -1.00 mg/L/hr',
        sop: [
          'Inspect blower circuit breakers and power distribution board immediately.',
          'Verify pressure gauges on sub-surface air manifolds.',
          'Engage secondary backup blower or generator set.',
        ],
        action: {
          actuator: 'aeration_system',
          targetState: 'EMERGENCY',
          label: 'Increase Aeration',
          activeLabel: 'Emergency Aeration Active',
          recommendedResponse: 'Engage 100% emergency mechanical aeration',
        },
      });
    }

    // 2. Lethal Hypoxia Condition
    if (doVal < 2.50) {
      detectedTypes.push({
        type: 'lethal_hypoxia',
        severity: 'critical',
        title: 'Emergency: Lethal Hypoxia',
        message: `Dissolved oxygen is at ${doVal.toFixed(2)} mg/L, below the lethal asphyxiation limit (2.50 mg/L). Mass shrimp mortality imminent within 60 minutes.`,
        value: `${doVal.toFixed(2)} mg/L`,
        threshold: '< 2.50 mg/L',
        sop: [
          'Emergency: Start auxiliary mechanical aerators and oxygen diffusers immediately.',
          'Halt all feeding activities.',
          'Check water circulation for dead zones.',
        ],
        action: {
          actuator: 'aeration_system',
          targetState: 'EMERGENCY',
          label: 'Increase Aeration',
          activeLabel: 'Emergency Aeration Active',
          recommendedResponse: 'Start emergency 100% mechanical aeration immediately',
        },
      });
    } else if (doVal < 4.00) {
      detectedTypes.push({
        type: 'low_do_warning',
        severity: 'warning',
        title: 'Sub-Optimal Dissolved Oxygen',
        message: `Dissolved oxygen is ${doVal.toFixed(2)} mg/L, below optimal biofloc nitrification threshold (4.00 mg/L).`,
        value: `${doVal.toFixed(2)} mg/L`,
        threshold: '< 4.00 mg/L',
        sop: [
          'Increase blower throttle or check clogged air diffusers.',
          'Verify biofloc settleable solids level (Floc Volume Index).',
        ],
        action: {
          actuator: 'aeration_system',
          targetState: 'EMERGENCY',
          label: 'Increase Aeration',
          activeLabel: 'Emergency Aeration Active',
          recommendedResponse: 'Boost aeration capacity to emergency 100%',
        },
      });
    }

    // 3. Toxic Unionized Ammonia (NH3) Spike
    if (nh3Val > 0.050) {
      detectedTypes.push({
        type: 'ammonia_toxicity',
        severity: 'critical',
        title: 'Toxic Ammonia (NH₃) Surge',
        message: `Toxic unionized ammonia is ${nh3Val.toFixed(4)} mg/L, exceeding the chronic safe aquaculture ceiling (0.050 mg/L).`,
        value: `${nh3Val.toFixed(4)} mg/L`,
        threshold: '> 0.050 mg/L',
        sop: [
          'Halt feeding immediately to reduce nitrogenous metabolic excretion.',
          'Increase aeration to stimulate heterotrophic assimilation into single-cell protein.',
          'Monitor alkalinity and water pH balance.',
        ],
        action: {
          actuator: 'aeration_system',
          targetState: 'EMERGENCY',
          label: 'Increase Aeration',
          activeLabel: 'Emergency Aeration Active',
          recommendedResponse: 'Boost aeration to support heterotrophic microbial assimilation',
        },
      });
    }

    // 4. Acidification / pH Buffer Depletion
    if (phVal < 7.40 || phVal > 8.60) {
      const isLow = phVal < 7.40;
      detectedTypes.push({
        type: 'ph_stress',
        severity: 'warning',
        title: isLow ? 'Carbonate Buffer Depletion / Acidification' : 'Alkaline Stress / High pH',
        message: `pH is ${phVal.toFixed(2)}, breaching the stable biofloc nitrification window (7.40 – 8.60).`,
        value: `${phVal.toFixed(2)}`,
        threshold: '7.40 – 8.60',
        sop: [
          isLow ? 'Add sodium bicarbonate (NaHCO₃) to replenish alkalinity.' : 'Add acidic buffer or increase water exchange.',
          'Verify that inorganic carbon is sufficient for autotrophic nitrifiers.',
        ],
        action: {
          actuator: isLow ? 'ph_increase_dosing' : 'ph_decrease_dosing',
          targetState: 'ON',
          label: isLow ? 'Increase pH' : 'Decrease pH',
          activeLabel: isLow ? 'pH Increase Dosing Active' : 'pH Decrease Dosing Active',
          recommendedResponse: isLow ? 'Dispense alkaline dosing (carbonate buffer)' : 'Dispense acidic dosing to lower pH',
        },
      });
    }

    // 5. Excessive Biofloc Solids (>60 mL/L or >100 mL/L)
    if (bioflocVal !== undefined && bioflocVal > 100.0) {
      detectedTypes.push({
        type: 'excessive_biofloc',
        severity: 'critical',
        title: 'Excessive Biofloc Density (Drain Threshold)',
        message: `Biofloc density is ${bioflocVal.toFixed(1)} mL/L, exceeding the operational drain reference (> 100 mL/L). Sludge buildup risks oxygen starvation and gill clogging.`,
        value: `${bioflocVal.toFixed(1)} mL/L`,
        threshold: '> 100.0 mL/L',
        sop: [
          'Activate sludge outlet pump to remove settled microbial solids.',
          'Verify tank water level is above minimum safe limit (12,000 L).',
          'Monitor settleable floc volume in Imhoff cone.',
        ],
        action: {
          actuator: 'outlet_pump',
          targetState: 'ON',
          label: 'Start Solids Removal',
          activeLabel: 'Solids Removal Active',
          recommendedResponse: 'Activate sludge outlet pump to drain excess particulate biofloc',
        },
      });
    } else if (bioflocVal !== undefined && bioflocVal > 60.0) {
      detectedTypes.push({
        type: 'excessive_biofloc',
        severity: 'warning',
        title: 'Elevated Biofloc Solids',
        message: `Biofloc density is ${bioflocVal.toFixed(1)} mL/L, exceeding the target management reference (60.0 mL/L).`,
        value: `${bioflocVal.toFixed(1)} mL/L`,
        threshold: '> 60.0 mL/L',
        sop: [
          'Initiate periodic solids removal via sludge drain.',
          'Inspect clarifier and settling cone accumulation.',
        ],
        action: {
          actuator: 'outlet_pump',
          targetState: 'ON',
          label: 'Start Solids Removal',
          activeLabel: 'Solids Removal Active',
          recommendedResponse: 'Activate outlet pump for solids management',
        },
      });
    }

    // 6. Concept Drift / System Disturbance
    if (mlForecast?.concept_drift_status === 'DRIFT_DETECTED') {
      detectedTypes.push({
        type: 'concept_drift',
        severity: 'warning',
        title: 'ADWIN Concept Drift Detected',
        message: 'Streaming forecast residual error distribution has shifted significantly from the training baseline.',
        value: 'Residual Shift Flagged',
        threshold: 'ADWIN delta = 0.002',
        sop: [
          'Verify if an operational disturbance or failure scenario is currently running.',
          'Inspect physical sensor probe for biofouling or calibration drift.',
        ],
      });
    }

    // 7. Proactive 2-Hour Predicted Hypoxia Warning
    if (mlForecast && mlForecast.predicted_do_2h < 4.00 && doVal >= 4.00) {
      detectedTypes.push({
        type: 'predicted_hypoxia',
        severity: 'warning',
        title: 'Proactive 2-Hour Hypoxia Forecast',
        message: `ML model forecasts DO will drop to ${mlForecast.predicted_do_2h.toFixed(2)} mg/L within 2 hours.`,
        value: `${mlForecast.predicted_do_2h.toFixed(2)} mg/L (in 2h)`,
        threshold: '< 4.00 mg/L in 2h',
        sop: [
          'Proactive alert: Schedule aerator power boost before biological hypoxia occurs.',
          'Verify feeding rate and biofloc respiration load.',
        ],
        action: {
          actuator: 'aeration_system',
          targetState: 'EMERGENCY',
          label: 'Increase Aeration',
          activeLabel: 'Emergency Aeration Active',
          recommendedResponse: 'Proactively increase aeration to 100% before hypoxia occurs',
        },
      });
    }

    setActiveAlarms((prevActive) => {
      const nowIso = new Date().toISOString();
      const detectedMap = new Map(detectedTypes.map((d) => [d.type, d]));
      const nextActive: AlarmItem[] = [];
      const resolvedList: AlarmItem[] = [];

      // Check previously active alarms
      for (const old of prevActive) {
        if (detectedMap.has(old.type)) {
          // Still active: update value/message, preserve acknowledged state
          const updated = detectedMap.get(old.type)!;
          nextActive.push({
            ...old,
            value: updated.value,
            message: updated.message,
            severity: updated.severity,
            action: updated.action,
          });
          detectedMap.delete(old.type);
        } else {
          // Condition resolved!
          resolvedList.push({
            ...old,
            resolved: true,
            resolvedAt: nowIso,
          });
        }
      }

      // Add newly detected alarms
      for (const [type, item] of detectedMap.entries()) {
        nextActive.push({
          id: `${type}-${Date.now()}`,
          type: item.type,
          severity: item.severity,
          title: item.title,
          message: item.message,
          value: item.value,
          threshold: item.threshold,
          timestamp: nowIso,
          acknowledged: false,
          resolved: false,
          sop: item.sop,
          action: item.action,
        });
      }

      // Move resolved items to history
      if (resolvedList.length > 0) {
        setAlarmHistory((h) => [...resolvedList, ...h].slice(0, 50));
      }

      return nextActive;
    });
  }, [latestPayload, dataPoints, mlForecast]);

  const acknowledgeAlarm = useCallback((id: string) => {
    setActiveAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  }, []);

  const acknowledgeAll = useCallback(() => {
    setActiveAlarms((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  }, []);

  const clearHistory = useCallback(() => {
    setAlarmHistory([]);
  }, []);

  const unacknowledgedCount = useMemo(
    () => activeAlarms.filter((a) => !a.acknowledged).length,
    [activeAlarms]
  );

  const criticalCount = useMemo(
    () => activeAlarms.filter((a) => a.severity === 'critical').length,
    [activeAlarms]
  );

  const warningCount = useMemo(
    () => activeAlarms.filter((a) => a.severity === 'warning').length,
    [activeAlarms]
  );

  return {
    activeAlarms,
    unacknowledgedCount,
    criticalCount,
    warningCount,
    alarmHistory,
    acknowledgeAlarm,
    acknowledgeAll,
    clearHistory,
  };
}
