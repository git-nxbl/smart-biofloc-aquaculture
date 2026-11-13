import React, { useState } from 'react';
import {
  Sliders, ShieldCheck, ShieldAlert, AlertTriangle, Play, Square,
  Wind, ArrowDownCircle, ArrowUpCircle, Droplets, RefreshCw,
  Info, CheckCircle2, XCircle, Gauge, Activity, Waves, FlaskConical,
  Layers, Sprout, CornerDownRight
} from 'lucide-react';
import { useControlSystem } from '../hooks/useControlSystem';
import { TelemetryPayload, ControlMode } from '../types';

interface ControlCenterViewProps {
  latestPayload: TelemetryPayload | null;
  controlSystem?: ReturnType<typeof useControlSystem>;
}

export const ControlCenterView: React.FC<ControlCenterViewProps> = ({
  latestPayload,
  controlSystem: propControlSystem,
}) => {
  const localControlSystem = useControlSystem(propControlSystem ? 0 : 2500);
  const {
    status,
    isLoading,
    isDispatching,
    lastActionMessage,
    error,
    switchMode,
    sendActuatorCommand,
    evaluateRules,
    refreshStatus,
  } = propControlSystem || localControlSystem;

  const [confirmManualModal, setConfirmManualModal] = useState<boolean>(false);
  const [activeActionFeedback, setActiveActionFeedback] = useState<{
    actuator: string;
    message: string;
    success: boolean;
  } | null>(null);

  // Live telemetry stream fallback
  const sensors = latestPayload?.sensors || {
    dissolved_oxygen_mgl: 6.15,
    tan_mgl: 0.42,
    ph: 7.82,
    temperature_c: 28.5,
  };
  const meta = latestPayload?.metadata || {};
  const nh3 = meta.calculated_nh3_mgl ?? 0.024;
  const bioflocDensity = meta.biofloc_density_mll ?? 45.0;
  const fishBiomassKg = meta.fish_biomass_kg ?? 500.0;
  const stockingDensity = meta.stocking_density_kg_m3 ?? 25.0;
  const reqAerationLpm = meta.required_aeration_lpm ?? 88.0;

  const currentMode = status?.mode || 'AUTO';
  const waterLevel = status?.water_level || {
    current_level_liters: 16000,
    tank_capacity_liters: 20000,
    level_percentage: 80.0,
    min_safe_level_liters: 12000,
    max_safe_level_liters: 19000,
    inlet_blocked: false,
    outlet_blocked: false,
  };

  const actuators = status?.actuators || {};
  const recentEvents = status?.recent_events || [];

  const handleModeChange = (targetMode: ControlMode) => {
    if (targetMode === 'MANUAL' && currentMode === 'AUTO') {
      setConfirmManualModal(true);
    } else {
      switchMode(targetMode);
    }
  };

  const handleCommandWithFeedback = async (
    actuator: string,
    targetState: string,
    reason: string
  ) => {
    const isSim = currentMode === 'SIMULATION';
    const contextualReason = isSim ? `[Simulation] ${reason}` : reason;
    const res = await sendActuatorCommand(actuator, targetState, contextualReason);
    const feedbackMsg = isSim && res.success
      ? `Simulated ${actuator.replace(/_/g, ' ')} transitioned to ${targetState} (virtual environment)`
      : res.message;
    setActiveActionFeedback({
      actuator,
      message: feedbackMsg,
      success: res.success,
    });
    setTimeout(() => {
      setActiveActionFeedback((prev) => (prev?.actuator === actuator ? null : prev));
    }, 4500);
  };

  // Operational Context Warnings
  const isDoLow = sensors.dissolved_oxygen_mgl < 4.0;
  const isDoOptimal = sensors.dissolved_oxygen_mgl >= 5.5;
  const isBioflocWarning = bioflocDensity > 60.0;
  const isBioflocExcessive = bioflocDensity > 100.0;
  const isPhAcidic = sensors.ph < 7.40;
  const isPhAlkaline = sensors.ph > 8.60;
  const isWaterLevelNearMax = waterLevel.current_level_liters >= 18500;
  const isWaterLevelNearMin = waterLevel.current_level_liters <= 12500;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-fade-in text-txt-1">
      {/* ─── Top Console Header & Mode Controller ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-depth-mid border border-edge rounded-panel p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-aqua/15 border border-aqua/30 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-aqua" />
            </div>
            <h1 className="text-xl font-heading font-bold text-txt-1 tracking-tight">
              Action Center
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-depth-raised border border-edge text-txt-2">
              Tank Operations & Actuator Control
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono text-txt-3 bg-depth-deep border border-edge">
              {currentMode === 'SIMULATION'
                ? 'Virtual Environment · Simulated Actuators'
                : 'ControlService Authoritative · Field Interlocks Active'}
            </span>
          </div>
          <p className="text-xs text-txt-3 max-w-3xl leading-relaxed">
            Central console for physical and simulated biofloc tank operations. Evaluates field rules, enforces hydraulic and chemical interlocks, and executes manual or autonomous interventions.
          </p>
        </div>

        {/* Control Mode Segmented Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
          <div className="flex items-center p-1 rounded-lg bg-depth-deep border border-edge">
            {(['AUTO', 'MANUAL', 'SIMULATION'] as ControlMode[]).map((mode) => {
              const active = currentMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  disabled={isDispatching}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-mono font-medium transition-all ${
                    active
                      ? mode === 'AUTO'
                        ? 'bg-aqua text-depth-deep shadow-sm font-semibold'
                        : mode === 'MANUAL'
                        ? 'bg-amber text-depth-deep shadow-sm font-semibold'
                        : 'bg-txt-2 text-depth-deep shadow-sm font-semibold'
                      : 'text-txt-3 hover:text-txt-1'
                  }`}
                  title={
                    mode === 'AUTO'
                      ? 'Automated rule supervision (Backend evaluates configured rules)'
                      : mode === 'MANUAL'
                      ? 'Operator manual control (Interlocks enforced)'
                      : 'Virtual simulation test mode'
                  }
                >
                  {mode}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => evaluateRules()}
            disabled={isDispatching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-edge bg-depth-raised hover:border-edge-accent text-txt-2 hover:text-aqua transition"
            title="Force immediate rule evaluation against latest telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDispatching ? 'animate-spin' : ''}`} />
            <span>Evaluate Rules</span>
          </button>
        </div>
      </div>

      {/* Mode Advisory and Feedback Banner */}
      {lastActionMessage && (
        <div className="px-4 py-2.5 rounded-lg bg-depth-raised border border-edge-accent/40 flex items-center justify-between text-xs text-aqua animate-slide-in">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-aqua" />
            <span>{lastActionMessage}</span>
          </div>
          <button onClick={() => refreshStatus()} className="text-[11px] underline text-txt-3 hover:text-txt-1">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-2.5 rounded-lg bg-critical/10 border border-critical/30 flex items-center gap-2 text-xs text-critical">
          <AlertTriangle className="w-4 h-4 shrink-0 text-critical" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Interlock Global Warning */}
      {(waterLevel.inlet_blocked || waterLevel.outlet_blocked) && (
        <div className="px-4 py-3 rounded-panel bg-amber/10 border border-amber/30 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber shrink-0 animate-pulse" />
          <div className="text-xs">
            <span className="font-semibold text-amber">Active Safety Interlock: </span>
            {waterLevel.inlet_blocked && (
              <span className="text-txt-2">Fresh Water Inlet pump blocked (upper ceiling: {waterLevel.max_safe_level_liters.toLocaleString()} L). </span>
            )}
            {waterLevel.outlet_blocked && (
              <span className="text-txt-2">Sludge Outlet pump blocked (lower safety floor: {waterLevel.min_safe_level_liters.toLocaleString()} L). </span>
            )}
            <span className="text-txt-3">Backend safety interlocks prevent tank overflow or dry running.</span>
          </div>
        </div>
      )}

      {/* ─── SECTION 1: PROMINENT TANK STATUS (Requirement 2) ─── */}
      <div className="bg-depth-mid border border-edge rounded-panel p-5 lg:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-edge pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-aqua" />
              <h2 className="text-base font-heading font-bold text-txt-1 uppercase tracking-wide">
                Tank Operating Status
              </h2>
            </div>
            <p className="text-xs text-txt-3">
              Zero-Water-Exchange Biofloc Vessel · Tank 01 · Authoritative Physical State
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 rounded bg-depth-deep border border-edge text-txt-2">
              Capacity: <strong className="text-txt-1">{waterLevel.tank_capacity_liters.toLocaleString()} L</strong>
            </span>
            <span className={`px-2.5 py-1 rounded border font-semibold ${
              currentMode === 'AUTO'
                ? 'bg-aqua/10 text-aqua border-aqua/30'
                : 'bg-amber/10 text-amber border-amber/30'
            }`}>
              Mode: {currentMode}
            </span>
          </div>
        </div>

        {/* Visual Tank Gauge + Real-Time Telemetry HUD */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Visual Tank Cross-Section (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            <div className="relative h-60 w-full bg-depth-deep border-2 border-edge-accent/50 rounded-xl overflow-hidden p-4 flex flex-col justify-end shadow-inner">
              {/* Upper Safe Limit Line (19,000 L / 95%) */}
              <div
                className="absolute left-0 right-0 border-b border-dashed border-amber/80 z-20 flex items-center justify-between px-3"
                style={{ bottom: '95%' }}
              >
                <span className="text-[9px] font-mono text-amber bg-depth-deep/90 px-1.5 py-0.5 rounded border border-amber/40 uppercase">
                  Max Safe: 19,000 L (95%)
                </span>
                <span className="text-[9px] font-mono text-amber/80">OVERFLOW INTERLOCK</span>
              </div>

              {/* Lower Safe Limit Line (12,000 L / 60%) */}
              <div
                className="absolute left-0 right-0 border-b border-dashed border-critical/80 z-20 flex items-center justify-between px-3"
                style={{ bottom: '60%' }}
              >
                <span className="text-[9px] font-mono text-critical bg-depth-deep/90 px-1.5 py-0.5 rounded border border-critical/40 uppercase">
                  Min Safe: 12,000 L (60%)
                </span>
                <span className="text-[9px] font-mono text-critical/80">DRY-RUN INTERLOCK</span>
              </div>

              {/* Dynamic Water Column with Aeration Bubbles */}
              <div
                className={`absolute left-0 right-0 bottom-0 transition-all duration-700 z-10 ${
                  isWaterLevelNearMax
                    ? 'bg-gradient-to-t from-amber/40 via-amber/25 to-amber/50'
                    : isWaterLevelNearMin
                    ? 'bg-gradient-to-t from-critical/40 via-critical/25 to-critical/50'
                    : 'bg-gradient-to-t from-aqua/30 via-aqua/20 to-aqua/40'
                }`}
                style={{ height: `${Math.min(100, Math.max(10, waterLevel.level_percentage))}%` }}
              >
                {/* Surface Shimmer */}
                <div className={`w-full h-2 opacity-80 animate-pulse ${
                  isWaterLevelNearMax ? 'bg-amber' : isWaterLevelNearMin ? 'bg-critical' : 'bg-aqua'
                }`} />

                {/* Aeration bubble streams when active */}
                {actuators['aeration_system']?.state !== 'OFF' && (
                  <div className="absolute inset-0 flex justify-around opacity-40 pointer-events-none">
                    <div className="w-1 bg-aqua animate-bounce" style={{ height: '70%', animationDuration: '1.2s' }} />
                    <div className="w-1 bg-aqua animate-bounce" style={{ height: '85%', animationDuration: '0.9s' }} />
                    <div className="w-1 bg-aqua animate-bounce" style={{ height: '60%', animationDuration: '1.5s' }} />
                    <div className="w-1 bg-aqua animate-bounce" style={{ height: '80%', animationDuration: '1.1s' }} />
                  </div>
                )}
              </div>

              {/* Overlay HUD Readout */}
              <div className="relative z-30 flex items-end justify-between">
                <div className="bg-depth-deep/90 backdrop-blur-md border border-edge rounded-lg p-3">
                  <span className="text-[10px] uppercase tracking-wider text-txt-3 font-mono block">
                    Current Volume
                  </span>
                  <div className="text-3xl font-mono font-bold text-txt-1">
                    {waterLevel.current_level_liters.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-txt-3">L</span>
                  </div>
                  <div className="text-xs font-mono text-aqua flex items-center gap-1.5 mt-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-aqua" />
                    <strong>{waterLevel.level_percentage.toFixed(1)}%</strong> Water Level
                  </div>
                </div>

                <div className="bg-depth-deep/90 backdrop-blur-md border border-edge rounded-lg p-3 text-right">
                  <span className="text-[10px] uppercase tracking-wider text-txt-3 font-mono block">
                    Stocking & Aeration Demand
                  </span>
                  <div className="text-base font-mono font-semibold text-txt-1">
                    {fishBiomassKg.toFixed(0)} kg fish ({stockingDensity} kg/m³)
                  </div>
                  <div className="text-[11px] font-mono text-txt-2">
                    Min Req: <span className="text-aqua font-bold">{reqAerationLpm} LPM</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Level Safety Status Sub-strip */}
            <div className="flex items-center justify-between text-xs px-2 text-txt-3 font-mono">
              <span className={waterLevel.outlet_blocked ? 'text-critical font-bold' : ''}>
                Floor: 12,000 L {waterLevel.outlet_blocked ? '(BLOCKED)' : '(Safe)'}
              </span>
              <span className="text-txt-2">
                Operating Window: 12,000 L – 19,000 L
              </span>
              <span className={waterLevel.inlet_blocked ? 'text-amber font-bold' : ''}>
                Ceiling: 19,000 L {waterLevel.inlet_blocked ? '(BLOCKED)' : '(Safe)'}
              </span>
            </div>
          </div>

          {/* Key Parameters Matrix (5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            {/* Biofloc Density */}
            <div className={`p-3.5 rounded-lg border bg-depth-deep ${
              isBioflocExcessive ? 'border-critical/60 bg-critical/5' :
              isBioflocWarning ? 'border-amber/60 bg-amber/5' : 'border-edge'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-mono text-txt-3 mb-1">
                <span>Biofloc Density</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isBioflocExcessive ? 'bg-critical/20 text-critical' :
                  isBioflocWarning ? 'bg-amber/20 text-amber' : 'bg-aqua/20 text-aqua'
                }`}>
                  {isBioflocExcessive ? 'EXCESSIVE' : isBioflocWarning ? 'SOLIDS MGMT' : 'TARGET'}
                </span>
              </div>
              <div className="text-2xl font-mono font-bold text-txt-1">
                {bioflocDensity.toFixed(1)} <span className="text-xs text-txt-3">mL/L</span>
              </div>
              <div className="text-[10px] text-txt-3 mt-1 font-mono">
                Target: &lt; 60 mL/L (Tilapia)
              </div>
            </div>

            {/* Dissolved Oxygen */}
            <div className={`p-3.5 rounded-lg border bg-depth-deep ${
              isDoLow ? 'border-critical/60 bg-critical/5 animate-pulse' : 'border-edge'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-mono text-txt-3 mb-1">
                <span>Dissolved Oxygen</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isDoLow ? 'bg-critical/20 text-critical' : 'bg-aqua/20 text-aqua'
                }`}>
                  {isDoLow ? 'HYPOXIA' : 'OPTIMAL'}
                </span>
              </div>
              <div className="text-2xl font-mono font-bold text-txt-1">
                {sensors.dissolved_oxygen_mgl.toFixed(2)} <span className="text-xs text-txt-3">mg/L</span>
              </div>
              <div className="text-[10px] text-txt-3 mt-1 font-mono">
                Rule limit: &lt; 4.00 mg/L
              </div>
            </div>

            {/* pH Value */}
            <div className={`p-3.5 rounded-lg border bg-depth-deep ${
              isPhAcidic || isPhAlkaline ? 'border-amber/60 bg-amber/5' : 'border-edge'
            }`}>
              <div className="flex items-center justify-between text-[11px] font-mono text-txt-3 mb-1">
                <span>pH Reading</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isPhAcidic ? 'bg-amber/20 text-amber' :
                  isPhAlkaline ? 'bg-amber/20 text-amber' : 'bg-aqua/20 text-aqua'
                }`}>
                  {isPhAcidic ? 'ACIDIC' : isPhAlkaline ? 'ALKALINE' : 'STABLE'}
                </span>
              </div>
              <div className="text-2xl font-mono font-bold text-txt-1">
                {sensors.ph.toFixed(2)}
              </div>
              <div className="text-[10px] text-txt-3 mt-1 font-mono">
                Safe window: 7.40 – 8.60
              </div>
            </div>

            {/* Aeration State */}
            <div className="p-3.5 rounded-lg border border-edge bg-depth-deep">
              <div className="flex items-center justify-between text-[11px] font-mono text-txt-3 mb-1">
                <span>Aeration State</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  actuators['aeration_system']?.state === 'EMERGENCY' ? 'bg-critical/20 text-critical' :
                  actuators['aeration_system']?.state === 'NORMAL' ? 'bg-aqua/20 text-aqua' :
                  'bg-depth-raised text-txt-3'
                }`}>
                  {actuators['aeration_system']?.state || 'NORMAL'}
                </span>
              </div>
              <div className="text-2xl font-mono font-bold text-txt-1">
                {actuators['aeration_system']?.power_pct ?? 50}%
              </div>
              <div className="text-[10px] text-txt-3 mt-1 font-mono truncate">
                {actuators['aeration_system']?.state === 'EMERGENCY' ? '100% Emergency Aeration' : '50% Baseline Aeration'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: AERATION SYSTEM (Requirement 4) ─── */}
      <div className="bg-depth-mid border border-edge rounded-panel p-5 lg:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-edge pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-aqua/20 text-aqua">
                <Wind className="w-4 h-4" />
              </div>
              <h2 className="text-base font-heading font-bold text-txt-1 uppercase tracking-wide">
                Aeration System
              </h2>
            </div>
            <p className="text-xs text-txt-3 mt-0.5">
              Primary life-support blower and diffuser manifold. Maintains critical oxygen saturation for dense heterotrophic biofloc.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-txt-3 font-mono">Current State:</span>
            <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
              actuators['aeration_system']?.state === 'EMERGENCY'
                ? 'bg-critical/20 text-critical animate-pulse border border-critical/40'
                : actuators['aeration_system']?.state === 'NORMAL'
                ? 'bg-aqua/20 text-aqua border border-aqua/40'
                : 'bg-depth-deep text-txt-3 border border-edge'
            }`}>
              {actuators['aeration_system']?.state || 'NORMAL'} · {actuators['aeration_system']?.power_pct ?? 50}%
            </span>
          </div>
        </div>

        {/* Action Context Banner (Requirement 8) */}
        {isDoLow ? (
          <div className="p-3 rounded-lg bg-critical/10 border border-critical/30 flex items-center gap-2.5 text-xs text-critical">
            <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
            <div>
              <strong>Hypoxia Warning Active: </strong>
              Dissolved oxygen ({sensors.dissolved_oxygen_mgl.toFixed(2)} mg/L) is below the emergency threshold (4.00 mg/L).
              Increase aeration to restore oxygen availability.
            </div>
          </div>
        ) : isDoOptimal ? (
          <div className="p-2.5 rounded-lg bg-aqua/10 border border-aqua/30 flex items-center gap-2 text-xs text-aqua">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Dissolved oxygen is optimal ({sensors.dissolved_oxygen_mgl.toFixed(2)} mg/L &gt; 5.50 mg/L). Baseline 50% aeration is sufficient.
            </span>
          </div>
        ) : null}

        {/* Aeration 3-State Farmer Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* OFF Button */}
          <button
            onClick={() => handleCommandWithFeedback('aeration_system', 'OFF', 'Operator aeration shutdown')}
            disabled={currentMode === 'AUTO' || isDispatching}
            className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between ${
              actuators['aeration_system']?.state === 'OFF'
                ? 'bg-critical/20 border-critical text-critical shadow-sm'
                : 'bg-depth-deep hover:bg-depth-raised border-edge text-txt-2 hover:text-txt-1 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-heading font-bold text-sm">OFF</span>
              <Square className="w-4 h-4" />
            </div>
            <span className="text-[11px] text-txt-3">Cut off all blowers (0% power)</span>
            <div className="mt-2 pt-2 border-t border-edge/60 text-[10px] font-mono text-txt-3">
              {actuators['aeration_system']?.state === 'OFF' ? '✓ Currently Active' : 'Select to deactivate'}
            </div>
          </button>

          {/* 50% NORMAL Button */}
          <button
            onClick={() => handleCommandWithFeedback('aeration_system', 'NORMAL', 'Operator normal 50% aeration')}
            disabled={currentMode === 'AUTO' || isDispatching}
            className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between ${
              actuators['aeration_system']?.state === 'NORMAL'
                ? 'bg-aqua/20 border-aqua text-aqua shadow-sm'
                : 'bg-depth-deep hover:bg-depth-raised border-edge text-txt-2 hover:text-txt-1 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-heading font-bold text-sm">50% — NORMAL</span>
              <Play className="w-4 h-4" />
            </div>
            <span className="text-[11px] text-txt-3">Standard biofloc continuous supply</span>
            <div className="mt-2 pt-2 border-t border-edge/60 text-[10px] font-mono text-txt-3">
              {actuators['aeration_system']?.state === 'NORMAL' ? '✓ Currently Active' : 'Select to engage 50%'}
            </div>
          </button>

          {/* 100% EMERGENCY Button */}
          <button
            onClick={() => handleCommandWithFeedback('aeration_system', 'EMERGENCY', 'Operator emergency 100% aeration')}
            disabled={currentMode === 'AUTO' || isDispatching}
            className={`p-3.5 rounded-lg border text-left transition flex flex-col justify-between ${
              actuators['aeration_system']?.state === 'EMERGENCY'
                ? 'bg-critical/20 border-critical text-critical shadow-sm'
                : 'bg-depth-deep hover:bg-depth-raised border-edge text-txt-2 hover:text-txt-1 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-heading font-bold text-sm">100% — EMERGENCY</span>
              <Wind className="w-4 h-4" />
            </div>
            <span className="text-[11px] text-txt-3">Maximum blower boost for hypoxic recovery</span>
            <div className="mt-2 pt-2 border-t border-edge/60 text-[10px] font-mono text-txt-3">
              {actuators['aeration_system']?.state === 'EMERGENCY' ? '✓ Currently Active' : 'Select for emergency'}
            </div>
          </button>
        </div>

        {/* Inline Feedback */}
        {activeActionFeedback?.actuator === 'aeration_system' && (
          <div className={`p-2.5 rounded text-xs font-mono flex items-center gap-2 ${
            activeActionFeedback.success ? 'bg-aqua/10 text-aqua border border-aqua/30' : 'bg-critical/10 text-critical border border-critical/30'
          }`}>
            {activeActionFeedback.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span>{activeActionFeedback.message}</span>
          </div>
        )}
      </div>

      {/* ─── SECTION 3: WATER MANAGEMENT (Requirement 3) ─── */}
      <div className="bg-depth-mid border border-edge rounded-panel p-5 lg:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-edge pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-aqua/20 text-aqua">
                <Droplets className="w-4 h-4" />
              </div>
              <h2 className="text-base font-heading font-bold text-txt-1 uppercase tracking-wide">
                Water Management
              </h2>
            </div>
            <p className="text-xs text-txt-3 mt-0.5">
              Fresh water replenishment and solids purge pump controls. Governed by 12,000 L – 19,000 L safety bounds and mutual exclusion.
            </p>
          </div>
          <span className="text-xs font-mono text-txt-3">
            Inlet & Outlet mutually exclusive
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Fresh Water Inlet Pump */}
          <div className={`p-4 rounded-lg border bg-depth-deep flex flex-col justify-between space-y-3 ${
            actuators['inlet_pump']?.state === 'ON' ? 'border-aqua' : 'border-edge'
          }`}>
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    actuators['inlet_pump']?.state === 'ON' ? 'bg-aqua/20 text-aqua' : 'bg-depth-surface text-txt-3'
                  }`}>
                    <ArrowDownCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-heading font-bold text-txt-1">Fresh Water Inlet Pump</h3>
                    <span className="text-[11px] text-txt-3">Rate: 30 LPM · Top-up</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  actuators['inlet_pump']?.state === 'ON' ? 'bg-aqua/20 text-aqua' : 'bg-depth-surface text-txt-3'
                }`}>
                  {actuators['inlet_pump']?.state || 'OFF'}
                </span>
              </div>
              <p className="text-xs text-txt-2 leading-relaxed">
                <strong>Purpose: </strong>Adds fresh water to the tank after water removal.
              </p>
            </div>

            {/* Safety Interlock Warnings */}
            {waterLevel.inlet_blocked ? (
              <div className="p-2 rounded bg-amber/10 border border-amber/30 text-xs text-amber flex items-center gap-1.5 font-mono">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Blocked: Tank level at upper safety limit ({waterLevel.max_safe_level_liters.toLocaleString()} L).</span>
              </div>
            ) : actuators['outlet_pump']?.state === 'ON' ? (
              <div className="p-2 rounded bg-depth-surface border border-edge text-xs text-txt-3 flex items-center gap-1.5 font-mono">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Mutual exclusion: Sludge outlet is currently ON.</span>
              </div>
            ) : null}

            {/* Control Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => handleCommandWithFeedback('inlet_pump', 'ON', 'Operator fresh water refill')}
                disabled={currentMode === 'AUTO' || isDispatching || waterLevel.inlet_blocked || actuators['inlet_pump']?.state === 'ON'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-aqua/15 hover:bg-aqua/25 text-aqua border border-aqua/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                START
              </button>
              <button
                onClick={() => handleCommandWithFeedback('inlet_pump', 'OFF', 'Operator stopped refill')}
                disabled={currentMode === 'AUTO' || isDispatching || actuators['inlet_pump']?.state === 'OFF'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-depth-raised hover:bg-depth-surface text-txt-2 border border-edge disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                STOP
              </button>
            </div>
          </div>

          {/* Sludge / Solids Removal Pump */}
          <div className={`p-4 rounded-lg border bg-depth-deep flex flex-col justify-between space-y-3 ${
            actuators['outlet_pump']?.state === 'ON' ? 'border-amber' : 'border-edge'
          }`}>
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    actuators['outlet_pump']?.state === 'ON' ? 'bg-amber/20 text-amber' : 'bg-depth-surface text-txt-3'
                  }`}>
                    <ArrowUpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-heading font-bold text-txt-1">Sludge / Solids Removal Pump</h3>
                    <span className="text-[11px] text-txt-3">Rate: 30 LPM · Bottom Drain</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  actuators['outlet_pump']?.state === 'ON' ? 'bg-amber/20 text-amber' : 'bg-depth-surface text-txt-3'
                }`}>
                  {actuators['outlet_pump']?.state || 'OFF'}
                </span>
              </div>
              <p className="text-xs text-txt-2 leading-relaxed">
                <strong>Purpose: </strong>Removes excess sludge/solids and water when biofloc concentration becomes excessive.
              </p>
            </div>

            {/* Safety Interlock Warnings */}
            {waterLevel.outlet_blocked ? (
              <div className="p-2 rounded bg-critical/10 border border-critical/30 text-xs text-critical flex items-center gap-1.5 font-mono">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Blocked: Tank level at lower safety limit ({waterLevel.min_safe_level_liters.toLocaleString()} L).</span>
              </div>
            ) : actuators['inlet_pump']?.state === 'ON' ? (
              <div className="p-2 rounded bg-depth-surface border border-edge text-xs text-txt-3 flex items-center gap-1.5 font-mono">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Mutual exclusion: Fresh water inlet is currently ON.</span>
              </div>
            ) : null}

            {/* Control Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => handleCommandWithFeedback('outlet_pump', 'ON', 'Operator solids removal purge')}
                disabled={currentMode === 'AUTO' || isDispatching || waterLevel.outlet_blocked || actuators['outlet_pump']?.state === 'ON'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-amber/15 hover:bg-amber/25 text-amber border border-amber/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                START
              </button>
              <button
                onClick={() => handleCommandWithFeedback('outlet_pump', 'OFF', 'Operator stopped solids purge')}
                disabled={currentMode === 'AUTO' || isDispatching || actuators['outlet_pump']?.state === 'OFF'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-depth-raised hover:bg-depth-surface text-txt-2 border border-edge disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                STOP
              </button>
            </div>
          </div>
        </div>

        {/* Inline Feedback */}
        {(activeActionFeedback?.actuator === 'inlet_pump' || activeActionFeedback?.actuator === 'outlet_pump') && (
          <div className={`p-2.5 rounded text-xs font-mono flex items-center gap-2 ${
            activeActionFeedback.success ? 'bg-aqua/10 text-aqua border border-aqua/30' : 'bg-critical/10 text-critical border border-critical/30'
          }`}>
            {activeActionFeedback.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span>{activeActionFeedback.message}</span>
          </div>
        )}
      </div>

      {/* ─── SECTION 4: WATER CHEMISTRY / pH MANAGEMENT (Requirement 5) ─── */}
      <div className="bg-depth-mid border border-edge rounded-panel p-5 lg:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-edge pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-aqua/20 text-aqua">
                <FlaskConical className="w-4 h-4" />
              </div>
              <h2 className="text-base font-heading font-bold text-txt-1 uppercase tracking-wide">
                Water Chemistry / pH Management
              </h2>
            </div>
            <p className="text-xs text-txt-3 mt-0.5">
              Chemical dosing systems to stabilize alkalinity and nitrification buffering. Dosing actuators are mutually exclusive with a 5-minute cooldown.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-txt-3">Live pH:</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              isPhAcidic || isPhAlkaline ? 'bg-amber/20 text-amber' : 'bg-aqua/20 text-aqua'
            }`}>
              {sensors.ph.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Action Context for pH */}
        {isPhAcidic && (
          <div className="p-2.5 rounded bg-amber/10 border border-amber/30 text-xs text-amber flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Acidification Detected: </strong>pH ({sensors.ph.toFixed(2)}) is below the configured operating threshold (7.40). Apply the available pH-correction intervention.
            </span>
          </div>
        )}
        {isPhAlkaline && (
          <div className="p-2.5 rounded bg-amber/10 border border-amber/30 text-xs text-amber flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Alkaline Drift Detected: </strong>pH ({sensors.ph.toFixed(2)}) is above the configured operating threshold (8.60). Apply the available pH-correction intervention.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* pH Increase Dosing */}
          <div className={`p-4 rounded-lg border bg-depth-deep flex flex-col justify-between space-y-3 ${
            actuators['ph_increase_dosing']?.state === 'ON' ? 'border-aqua' : 'border-edge'
          }`}>
            <div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-heading font-bold text-txt-1">pH Increase Dosing</h3>
                  <span className="text-[11px] text-txt-3">Alkalinity Buffer Replenishment</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  actuators['ph_increase_dosing']?.state === 'ON' ? 'bg-aqua/20 text-aqua' : 'bg-depth-surface text-txt-3'
                }`}>
                  {actuators['ph_increase_dosing']?.state || 'OFF'}
                </span>
              </div>
              <p className="text-xs text-txt-2 leading-relaxed">
                <strong>Purpose: </strong>Adds the configured pH-correction/alkalinity dosing intervention.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => handleCommandWithFeedback('ph_increase_dosing', 'ON', 'Operator alkalinity dose')}
                disabled={currentMode === 'AUTO' || isDispatching || actuators['ph_increase_dosing']?.state === 'ON'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-aqua/15 hover:bg-aqua/25 text-aqua border border-aqua/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ACTIVATE
              </button>
              <button
                onClick={() => handleCommandWithFeedback('ph_increase_dosing', 'OFF', 'Operator stopped dose')}
                disabled={currentMode === 'AUTO' || isDispatching || actuators['ph_increase_dosing']?.state === 'OFF'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-depth-raised hover:bg-depth-surface text-txt-2 border border-edge disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                STOP
              </button>
            </div>
          </div>

          {/* pH Decrease Dosing */}
          <div className={`p-4 rounded-lg border bg-depth-deep flex flex-col justify-between space-y-3 ${
            actuators['ph_decrease_dosing']?.state === 'ON' ? 'border-amber' : 'border-edge'
          }`}>
            <div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-heading font-bold text-txt-1">pH Decrease Dosing</h3>
                  <span className="text-[11px] text-txt-3">Acidic Buffering Intervention</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  actuators['ph_decrease_dosing']?.state === 'ON' ? 'bg-amber/20 text-amber' : 'bg-depth-surface text-txt-3'
                }`}>
                  {actuators['ph_decrease_dosing']?.state || 'OFF'}
                </span>
              </div>
              <p className="text-xs text-txt-2 leading-relaxed">
                <strong>Purpose: </strong>Applies the configured pH-correction intervention for high pH.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => handleCommandWithFeedback('ph_decrease_dosing', 'ON', 'Operator acid dose')}
                disabled={currentMode === 'AUTO' || isDispatching || actuators['ph_decrease_dosing']?.state === 'ON'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-amber/15 hover:bg-amber/25 text-amber border border-amber/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ACTIVATE
              </button>
              <button
                onClick={() => handleCommandWithFeedback('ph_decrease_dosing', 'OFF', 'Operator stopped dose')}
                disabled={currentMode === 'AUTO' || isDispatching || actuators['ph_decrease_dosing']?.state === 'OFF'}
                className="flex-1 py-2 rounded text-xs font-mono font-bold bg-depth-raised hover:bg-depth-surface text-txt-2 border border-edge disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                STOP
              </button>
            </div>
          </div>
        </div>

        {/* Inline Feedback */}
        {(activeActionFeedback?.actuator === 'ph_increase_dosing' || activeActionFeedback?.actuator === 'ph_decrease_dosing') && (
          <div className={`p-2.5 rounded text-xs font-mono flex items-center gap-2 ${
            activeActionFeedback.success ? 'bg-aqua/10 text-aqua border border-aqua/30' : 'bg-critical/10 text-critical border border-critical/30'
          }`}>
            {activeActionFeedback.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <span>{activeActionFeedback.message}</span>
          </div>
        )}
      </div>

      {/* ─── SECTION 5: BIOFLOC / SOLIDS MANAGEMENT & CARBON SOURCE (Requirements 6 & 7) ─── */}
      <div className="bg-depth-mid border border-edge rounded-panel p-5 lg:p-6 space-y-4">
        <div className="border-b border-edge pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-aqua/20 text-aqua">
              <Layers className="w-4 h-4" />
            </div>
            <h2 className="text-base font-heading font-bold text-txt-1 uppercase tracking-wide">
              Biofloc / Solids Management
            </h2>
          </div>
          <p className="text-xs text-txt-3 mt-0.5">
            Imhoff cone floc volume supervision, microbial solids removal purge, and carbohydrate carbon source tracking.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Part A: Biofloc Solids Management & Purge Action */}
          <div className="p-4 rounded-lg border border-edge bg-depth-deep space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-heading font-bold text-txt-1">Floc Volume Status</h3>
                <span className="text-[11px] text-txt-3">Imhoff cone settling measurement</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                isBioflocExcessive ? 'bg-critical/20 text-critical' :
                isBioflocWarning ? 'bg-amber/20 text-amber' : 'bg-aqua/20 text-aqua'
              }`}>
                {bioflocDensity.toFixed(1)} mL/L
              </span>
            </div>

            {/* Threshold Reference Indicator */}
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between text-txt-3">
                <span>Normal Target (&lt; 60 mL/L):</span>
                <span className="text-aqua">{bioflocDensity <= 60 ? '✓ Current' : 'Passed'}</span>
              </div>
              <div className="flex items-center justify-between text-txt-3">
                <span>Solids Warning (60 – 100 mL/L):</span>
                <span className={isBioflocWarning && !isBioflocExcessive ? 'text-amber font-bold' : ''}>
                  {isBioflocWarning && !isBioflocExcessive ? '⚠ Active' : 'Normal'}
                </span>
              </div>
              <div className="flex items-center justify-between text-txt-3">
                <span>Excessive Solids (&gt; 100 mL/L):</span>
                <span className={isBioflocExcessive ? 'text-critical font-bold animate-pulse' : ''}>
                  {isBioflocExcessive ? '⛔ Action Required' : 'Normal'}
                </span>
              </div>
            </div>

            {isBioflocWarning && (
              <p className="text-xs text-amber leading-relaxed bg-amber/10 p-2.5 rounded border border-amber/30">
                {isBioflocExcessive
                  ? 'Excessive biofloc solids (> 100 mL/L). Drain excess solids immediately via sludge pump to prevent nocturnal hypoxia.'
                  : 'Biofloc density is above management threshold (60 mL/L). Consider starting solids removal.'}
              </p>
            )}

            {/* START SOLIDS REMOVAL Action Button */}
            <div className="pt-2 border-t border-edge">
              <button
                onClick={() => handleCommandWithFeedback('outlet_pump', 'ON', 'Operator solids removal purge')}
                disabled={currentMode === 'AUTO' || isDispatching || waterLevel.outlet_blocked || actuators['outlet_pump']?.state === 'ON'}
                className="w-full py-2.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-amber/20 hover:bg-amber/30 text-amber border border-amber/40 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm flex items-center justify-center gap-2"
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>{actuators['outlet_pump']?.state === 'ON' ? 'SOLIDS REMOVAL ACTIVE' : 'START SOLIDS REMOVAL'}</span>
              </button>
            </div>
          </div>

          {/* Part B: Carbon Source Dosing (Logical / Simulated Actuator) */}
          <div className={`p-4 rounded-lg border bg-depth-deep space-y-3 flex flex-col justify-between ${
            actuators['carbon_source_dosing']?.state === 'DISPENSE' ? 'border-aqua shadow-sm' : 'border-edge'
          }`}>
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    actuators['carbon_source_dosing']?.state === 'DISPENSE' ? 'bg-aqua/20 text-aqua' : 'bg-depth-surface text-txt-3'
                  }`}>
                    <Sprout className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-heading font-bold text-txt-1">Carbon Source Dosing</h3>
                    <span className="text-[11px] text-txt-3">Molasses / carbohydrate source</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold block ${
                    currentMode === 'SIMULATION'
                      ? 'bg-txt-2/20 text-txt-1 border border-txt-2/40'
                      : 'bg-aqua/10 text-aqua border border-aqua/30'
                  }`}>
                    {currentMode === 'SIMULATION' ? 'SIMULATED ACTUATOR' : 'LOGICAL ACTUATOR'}
                  </span>
                  <span className={`text-[10px] font-mono mt-0.5 block ${
                    actuators['carbon_source_dosing']?.state === 'DISPENSE' ? 'text-aqua font-bold animate-pulse' : 'text-txt-3'
                  }`}>
                    {actuators['carbon_source_dosing']?.state || 'IDLE'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-txt-2 leading-relaxed">
                <strong>Purpose: </strong>Applies the configured carbohydrate/carbon-source intervention used for biofloc management.
              </p>
            </div>

            {/* Virtual / Simulation Badge & Science Scope Note */}
            <div className="p-2.5 rounded bg-depth-surface border border-edge text-[11px] text-txt-3 space-y-1">
              <div className="font-semibold text-txt-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-aqua shrink-0" />
                <span>Virtual Actuator · {currentMode === 'SIMULATION' ? 'Simulation Mode' : 'Software Model'}</span>
              </div>
              <p className="leading-relaxed">
                Represents operator molasses dispensing for microbial C:N balancing. Dispatches to backend ControlService, transitions logical state, and records chronological audit trail.
              </p>
            </div>

            {/* Control Buttons: DISPENSE and RESET / IDLE */}
            <div className="flex items-center gap-2 pt-2 border-t border-edge">
              <button
                onClick={() => handleCommandWithFeedback('carbon_source_dosing', 'DISPENSE', 'Operator dispensed carbohydrate carbon source for C:N management')}
                disabled={currentMode === 'AUTO' || isDispatching}
                className={`flex-1 py-2 rounded text-xs font-mono font-bold transition shadow-sm flex items-center justify-center gap-1.5 ${
                  actuators['carbon_source_dosing']?.state === 'DISPENSE'
                    ? 'bg-aqua text-depth-deep font-bold'
                    : 'bg-aqua/15 hover:bg-aqua/25 text-aqua border border-aqua/40 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                <span>{actuators['carbon_source_dosing']?.state === 'DISPENSE' ? 'DISPENSE ACTIVE (100%)' : 'DISPENSE'}</span>
              </button>
              <button
                onClick={() => handleCommandWithFeedback('carbon_source_dosing', 'IDLE', 'Operator reset carbon dosing to IDLE')}
                disabled={currentMode === 'AUTO' || isDispatching || actuators['carbon_source_dosing']?.state === 'IDLE'}
                className="py-2 px-3 rounded text-xs font-mono font-bold bg-depth-raised hover:bg-depth-surface text-txt-2 border border-edge disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                RESET / IDLE
              </button>
            </div>

            {/* Inline Feedback */}
            {activeActionFeedback?.actuator === 'carbon_source_dosing' && (
              <div className={`p-2 rounded text-xs font-mono flex items-center gap-2 ${
                activeActionFeedback.success ? 'bg-aqua/10 text-aqua border border-aqua/30' : 'bg-critical/10 text-critical border border-critical/30'
              }`}>
                {activeActionFeedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{activeActionFeedback.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── SECTION 6: ACTION HISTORY & AUDIT LOG (Requirement 12) ─── */}
      <div className="bg-depth-mid border border-edge rounded-panel p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-edge pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-aqua" />
              <h2 className="text-sm font-heading font-bold text-txt-1 uppercase tracking-wide">
                Action History & Interlock Audit Log
              </h2>
            </div>
            <p className="text-xs text-txt-3 mt-0.5">
              Chronological record of automated rule evaluations, operator commands, and safety interlocks.
            </p>
          </div>
          <span className="text-xs font-mono text-txt-3">Showing last {recentEvents.length} events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-edge text-txt-3 font-mono text-[11px]">
                <th className="pb-2.5 font-normal">Timestamp (UTC)</th>
                <th className="pb-2.5 font-normal">Actuator</th>
                <th className="pb-2.5 font-normal">Action</th>
                <th className="pb-2.5 font-normal">Transition</th>
                <th className="pb-2.5 font-normal">Trigger / Reason</th>
                <th className="pb-2.5 font-normal text-right">Interlock Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/50">
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-txt-3 font-mono">
                    No control events recorded yet.
                  </td>
                </tr>
              ) : (
                recentEvents.slice(0, 10).map((event) => {
                  const isBlocked = event.blocked;
                  return (
                    <tr key={event.id} className="hover:bg-depth-deep/40 transition">
                      <td className="py-2.5 font-mono text-[11px] text-txt-3">
                        {event.timestamp.replace('T', ' ').replace('Z', '')}
                      </td>
                      <td className="py-2.5 font-mono text-txt-1">
                        {event.actuator}
                      </td>
                      <td className="py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-depth-raised border border-edge text-txt-2">
                          {event.action}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-[11px]">
                        <span className="text-txt-3">{event.previous_state}</span>
                        <span className="mx-1 text-txt-3">→</span>
                        <span className={isBlocked ? 'text-amber font-semibold' : 'text-aqua font-semibold'}>
                          {event.new_state}
                        </span>
                      </td>
                      <td className="py-2.5 text-txt-2 text-[11px] max-w-xs truncate" title={event.trigger}>
                        {event.trigger}
                      </td>
                      <td className="py-2.5 text-right">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber">
                            <XCircle className="w-3.5 h-3.5" /> Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-aqua">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Executed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Mode Confirmation Modal */}
      {confirmManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-depth-mid border border-amber/40 rounded-panel max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber/20 flex items-center justify-center text-amber">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-heading font-bold text-txt-1">Switch to Manual Mode?</h3>
                <p className="text-xs text-txt-3">Operator manual override confirmation</p>
              </div>
            </div>

            <p className="text-xs text-txt-2 leading-relaxed">
              In <strong className="text-amber">MANUAL mode</strong>, automated biological rule triggers are paused. You will have direct authority to toggle blowers, water pumps, and chemical dosing. Physical safety interlocks (high/low tank level) will remain strictly enforced by the backend ControlService.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmManualModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium border border-edge bg-depth-deep hover:bg-depth-raised text-txt-3 hover:text-txt-1 transition"
              >
                Keep in Auto
              </button>
              <button
                onClick={() => {
                  setConfirmManualModal(false);
                  switchMode('MANUAL');
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber text-depth-deep hover:bg-amber/90 transition shadow-md"
              >
                Confirm Manual Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
