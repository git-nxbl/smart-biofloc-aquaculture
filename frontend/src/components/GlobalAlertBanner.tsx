import React from 'react';
import { AlertOctagon, AlertTriangle, Check, ArrowRight, ShieldAlert, Sliders } from 'lucide-react';
import { AlarmItem } from '../types/alarms';
import { ControlStatusResponse, ControlMode } from '../types';
import { ActionableAlertButton } from './ActionableAlertButton';

interface GlobalAlertBannerProps {
  activeAlarms: AlarmItem[];
  onAcknowledge: (id: string) => void;
  onOpenAlarmCenter: () => void;
  controlStatus?: ControlStatusResponse | null;
  onExecuteAction?: (
    actuator: string,
    targetState: string,
    reason: string
  ) => Promise<{ success: boolean; message: string; blockedReason?: string }>;
  onOpenControlCenter?: () => void;
  onSwitchMode?: (mode: ControlMode) => Promise<void>;
}

export const GlobalAlertBanner: React.FC<GlobalAlertBannerProps> = ({
  activeAlarms,
  onAcknowledge,
  onOpenAlarmCenter,
  controlStatus,
  onExecuteAction,
  onOpenControlCenter,
  onSwitchMode,
}) => {
  if (activeAlarms.length === 0) return null;

  // Prioritize unacknowledged critical alarms first, then unacknowledged warnings
  const unacknowledged = activeAlarms.filter((a) => !a.acknowledged);
  const critical = unacknowledged.filter((a) => a.severity === 'critical');
  const targetAlarm = critical[0] || unacknowledged[0] || activeAlarms[0];

  const isCritical = targetAlarm.severity === 'critical';
  const isAcknowledged = targetAlarm.acknowledged;

  return (
    <div
      className={`w-full transition-all duration-200 z-40 border-b relative ${
        isCritical
          ? 'bg-critical/15 border-critical/40 text-critical'
          : 'bg-gold/15 border-gold/40 text-gold'
      } ${isAcknowledged ? 'opacity-80 py-1.5' : 'py-2.5 shadow-lg'}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-1.5 rounded-md shrink-0 ${
              isCritical ? 'bg-critical/20 text-critical animate-pulse' : 'bg-gold/20 text-gold'
            }`}
          >
            {isCritical ? <AlertOctagon className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                  isCritical
                    ? 'bg-critical/20 text-critical border-critical/40'
                    : 'bg-gold/20 text-gold border-gold/40'
                }`}
              >
                {targetAlarm.severity} ALARM
              </span>
              <span className="font-heading font-bold text-txt-1 truncate">
                {targetAlarm.title}
              </span>
              <span className="font-mono text-txt-2 text-[11px]">
                [{targetAlarm.value}]
              </span>
              {activeAlarms.length > 1 && (
                <span className="text-[10px] text-txt-3 font-mono">
                  (+{activeAlarms.length - 1} more alert{activeAlarms.length > 2 ? 's' : ''})
                </span>
              )}
            </div>
            <p className="text-[11px] text-txt-2 truncate mt-0.5 max-w-2xl">
              {targetAlarm.message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
          {/* Actionable Button if supported */}
          {targetAlarm.action && onExecuteAction && (
            <ActionableAlertButton
              action={targetAlarm.action}
              controlStatus={controlStatus ?? null}
              onExecuteAction={onExecuteAction}
              onOpenControlCenter={onOpenControlCenter}
              onSwitchMode={onSwitchMode}
              compact={true}
              isCritical={isCritical}
            />
          )}

          {!isAcknowledged && (
            <button
              onClick={() => onAcknowledge(targetAlarm.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-depth-surface hover:bg-depth-raised border border-edge text-[11px] text-txt-2 hover:text-txt-1 transition"
              title="Acknowledge alarm"
            >
              <Check className="w-3.5 h-3.5 text-aqua" />
              <span>Ack</span>
            </button>
          )}

          <button
            onClick={onOpenAlarmCenter}
            className={`flex items-center gap-1.5 px-3 py-1 rounded font-semibold text-[11px] transition ${
              isCritical
                ? 'bg-critical/80 text-depth-deep hover:bg-critical'
                : 'bg-gold/80 text-depth-deep hover:bg-gold'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>SOP</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
