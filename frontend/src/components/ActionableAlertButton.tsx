import React, { useState } from 'react';
import {
  Wind,
  Droplets,
  ArrowDownCircle,
  Play,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { AlarmActionDescriptor } from '../types/alarms';
import { ControlStatusResponse, ControlMode } from '../types';

interface ActionableAlertButtonProps {
  action: AlarmActionDescriptor;
  controlStatus: ControlStatusResponse | null;
  onExecuteAction: (
    actuator: string,
    targetState: string,
    reason: string
  ) => Promise<{ success: boolean; message: string; blockedReason?: string }>;
  onOpenControlCenter?: () => void;
  onSwitchMode?: (mode: ControlMode) => Promise<void>;
  compact?: boolean;
  isCritical?: boolean;
}

export const ActionableAlertButton: React.FC<ActionableAlertButtonProps> = ({
  action,
  controlStatus,
  onExecuteAction,
  onOpenControlCenter,
  onSwitchMode,
  compact = false,
  isCritical = false,
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [showAutoConfirm, setShowAutoConfirm] = useState(false);

  const actuatorKey = action.actuator;
  const actuatorState = controlStatus?.actuators?.[actuatorKey];
  const currentState = actuatorState?.state?.toUpperCase();
  const currentMode = controlStatus?.mode || 'AUTO';

  // Check if actuator is already in the requested state
  const isAlreadyActive =
    currentState === action.targetState.toUpperCase() ||
    (action.actuator === 'aeration_system' && action.targetState === 'EMERGENCY' && currentState === 'EMERGENCY');

  // Check software safety interlocks
  const isOutletBlocked =
    action.actuator === 'outlet_pump' &&
    (controlStatus?.water_level?.outlet_blocked ||
      (controlStatus?.water_level?.current_level_liters ?? 16000) <= (controlStatus?.water_level?.min_safe_level_liters ?? 12000));

  const isInletBlocked =
    action.actuator === 'inlet_pump' &&
    (controlStatus?.water_level?.inlet_blocked ||
      (controlStatus?.water_level?.current_level_liters ?? 16000) >= (controlStatus?.water_level?.max_safe_level_liters ?? 19000));

  const isInterlockBlocked = isOutletBlocked || isInletBlocked;
  const interlockReason = isOutletBlocked
    ? `Outlet blocked — water level at minimum limit (${controlStatus?.water_level?.current_level_liters?.toLocaleString()} L / 12,000 L)`
    : isInletBlocked
    ? `Inlet blocked — water level at maximum limit (${controlStatus?.water_level?.current_level_liters?.toLocaleString()} L / 19,000 L)`
    : null;

  // Actuator icon selector
  const getIcon = () => {
    switch (action.actuator) {
      case 'aeration_system':
        return <Wind className="w-3.5 h-3.5" />;
      case 'outlet_pump':
        return <ArrowDownCircle className="w-3.5 h-3.5" />;
      case 'ph_increase_dosing':
      case 'ph_decrease_dosing':
        return <Droplets className="w-3.5 h-3.5" />;
      default:
        return <Play className="w-3.5 h-3.5" />;
    }
  };

  const handleExecute = async () => {
    // If in AUTO mode and backend rejects manual actions, prompt to switch mode if switchMode handler exists
    if (currentMode === 'AUTO') {
      if (onSwitchMode) {
        setShowAutoConfirm(true);
      } else if (onOpenControlCenter) {
        setFeedback({
          type: 'info',
          message: 'Automatic control active. Switch to MANUAL in Action Center to override.',
        });
      }
      return;
    }

    setIsExecuting(true);
    setFeedback(null);
    try {
      const result = await onExecuteAction(
        action.actuator,
        action.targetState,
        `Actionable Alert Command: ${action.label}`
      );
      if (result.success) {
        setFeedback({
          type: 'success',
          message: result.message || `${action.label} applied successfully`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: result.blockedReason || result.message || 'Action rejected by safety interlock',
        });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: e.message || 'Failed to dispatch command',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConfirmSwitchAndExecute = async () => {
    setShowAutoConfirm(false);
    setIsExecuting(true);
    try {
      if (onSwitchMode) {
        await onSwitchMode('MANUAL');
      }
      const result = await onExecuteAction(
        action.actuator,
        action.targetState,
        `Manual Override: ${action.label}`
      );
      if (result.success) {
        setFeedback({
          type: 'success',
          message: `Switched to MANUAL · ${result.message}`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: result.blockedReason || result.message || 'Action rejected',
        });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: e.message || 'Execution failed',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Compact layout (used in GlobalAlertBanner)
  if (compact) {
    if (isAlreadyActive) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-aqua/15 border border-aqua/30 text-aqua text-[11px] font-mono">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{action.activeLabel}</span>
        </div>
      );
    }

    if (isInterlockBlocked) {
      return (
        <div
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-depth-surface border border-critical/40 text-critical text-[11px] font-mono"
          title={interlockReason || 'Blocked by safety interlock'}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Interlocked Blocked</span>
        </div>
      );
    }

    return (
      <div className="relative inline-flex items-center gap-1.5">
        <button
          onClick={handleExecute}
          disabled={isExecuting}
          className={`flex items-center gap-1.5 px-3 py-1 rounded font-semibold text-[11px] transition shadow-sm ${
            isCritical
              ? 'bg-critical text-depth-deep hover:bg-critical/90'
              : 'bg-gold text-depth-deep hover:bg-gold/90'
          } ${isExecuting ? 'opacity-70 cursor-wait' : ''}`}
          title={
            currentMode === 'AUTO'
              ? 'Click to switch to MANUAL and execute this action'
              : `Execute: ${action.label}`
          }
        >
          {isExecuting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            getIcon()
          )}
          <span>{isExecuting ? 'Applying...' : action.label}</span>
        </button>

        {showAutoConfirm && (
          <div className="absolute top-full right-0 mt-2 z-50 p-3 rounded-lg bg-depth-surface border border-edge-accent shadow-2xl w-64 text-left animate-slide-in">
            <div className="flex items-center gap-1.5 text-gold text-xs font-semibold mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Switch to MANUAL Mode?</span>
            </div>
            <p className="text-[11px] text-txt-2 leading-relaxed mb-2.5">
              Automatic rule evaluation is active. Manual action requires switching to MANUAL mode.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAutoConfirm(false)}
                className="px-2 py-1 text-[10px] text-txt-3 hover:text-txt-1"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSwitchAndExecute}
                className="px-2.5 py-1 text-[10px] font-semibold bg-aqua text-depth-deep rounded hover:bg-aqua-bright transition"
              >
                Switch & Execute
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full card layout (used in AlarmCenterDrawer and telemetry panels)
  return (
    <div className="p-3 rounded-lg bg-depth-deep/90 border border-edge/80 space-y-2 mt-2">
      {/* Recommended Response Heading */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-txt-2 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-aqua" />
          <span>Recommended Response:</span>
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-depth-surface border border-edge text-txt-3">
          Mode: <strong className="text-txt-1">{currentMode}</strong>
        </span>
      </div>

      <p className="text-[11px] text-txt-3 leading-relaxed">
        {action.recommendedResponse}
      </p>

      {/* Actuator Current State Indicator */}
      <div className="flex items-center justify-between p-2 rounded bg-depth-surface/60 border border-edge/40 text-[11px] font-mono">
        <span className="text-txt-3 flex items-center gap-1.5">
          {getIcon()}
          <span>{actuatorState?.name || action.actuator}:</span>
        </span>
        <span
          className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
            isAlreadyActive
              ? 'bg-aqua/20 text-aqua border border-aqua/40'
              : currentState === 'OFF'
              ? 'bg-depth-deep text-txt-3'
              : 'bg-gold/20 text-gold border border-gold/40'
          }`}
        >
          {currentState || 'UNKNOWN'} {actuatorState ? `(${actuatorState.power_pct}%)` : ''}
        </span>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 pt-1">
        {isAlreadyActive ? (
          <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-aqua/10 border border-aqua/30 text-aqua text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>{action.activeLabel}</span>
          </div>
        ) : isInterlockBlocked ? (
          <div
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-critical/10 border border-critical/30 text-critical text-xs font-semibold"
            title={interlockReason || 'Blocked by safety interlock'}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="truncate">{interlockReason || 'Blocked by Safety Interlock'}</span>
          </div>
        ) : (
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded font-semibold text-xs transition shadow-sm ${
              isCritical
                ? 'bg-critical text-depth-deep hover:bg-critical/90'
                : 'bg-gold text-depth-deep hover:bg-gold/90'
            } ${isExecuting ? 'opacity-70 cursor-wait' : ''}`}
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              getIcon()
            )}
            <span>{isExecuting ? 'Applying...' : action.label}</span>
          </button>
        )}

        {onOpenControlCenter && (
          <button
            onClick={onOpenControlCenter}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-depth-surface hover:bg-depth-raised border border-edge text-xs text-txt-2 hover:text-aqua transition shrink-0"
            title="Open dedicated Action Center"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Action Center</span>
          </button>
        )}
      </div>

      {/* Mode Switch Confirmation Modal / Inline Prompt */}
      {showAutoConfirm && (
        <div className="p-2.5 rounded bg-depth-surface border border-gold/40 space-y-2 animate-slide-in text-xs">
          <div className="flex items-center gap-1.5 text-gold font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Automatic Mode is Active</span>
          </div>
          <p className="text-[11px] text-txt-2 leading-relaxed">
            The software rule engine is managing actuators. Manual command requires switching to <strong>MANUAL</strong> mode.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowAutoConfirm(false)}
              className="px-2 py-1 text-[11px] text-txt-3 hover:text-txt-1"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSwitchAndExecute}
              className="px-2.5 py-1 text-[11px] font-semibold bg-aqua text-depth-deep rounded hover:bg-aqua-bright transition"
            >
              Switch to Manual & Execute
            </button>
          </div>
        </div>
      )}

      {/* Backend Action Feedback */}
      {feedback && (
        <div
          className={`p-2 rounded text-[11px] font-mono flex items-start gap-1.5 animate-slide-in ${
            feedback.type === 'success'
              ? 'bg-aqua/10 text-aqua border border-aqua/30'
              : feedback.type === 'error'
              ? 'bg-critical/10 text-critical border border-critical/30'
              : 'bg-gold/10 text-gold border border-gold/30'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <span className="leading-snug">{feedback.message}</span>
        </div>
      )}
    </div>
  );
};
