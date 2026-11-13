import React, { useState } from 'react';
import {
  X,
  Bell,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RotateCcw,
  Check,
  BookOpen,
  Info,
  Trash2,
} from 'lucide-react';
import { AlarmItem, AlarmSystemState } from '../types/alarms';
import { ControlStatusResponse, ControlMode } from '../types';
import { ActionableAlertButton } from './ActionableAlertButton';

interface AlarmCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alarmState: AlarmSystemState;
  controlStatus?: ControlStatusResponse | null;
  onExecuteAction?: (
    actuator: string,
    targetState: string,
    reason: string
  ) => Promise<{ success: boolean; message: string; blockedReason?: string }>;
  onOpenControlCenter?: () => void;
  onSwitchMode?: (mode: ControlMode) => Promise<void>;
}

export const AlarmCenterDrawer: React.FC<AlarmCenterDrawerProps> = ({
  isOpen,
  onClose,
  alarmState,
  controlStatus,
  onExecuteAction,
  onOpenControlCenter,
  onSwitchMode,
}) => {
  const [tab, setTab] = useState<'active' | 'history' | 'sop'>('active');

  if (!isOpen) return null;

  const {
    activeAlarms,
    unacknowledgedCount,
    alarmHistory,
    acknowledgeAlarm,
    acknowledgeAll,
    clearHistory,
  } = alarmState;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-depth-deep/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className="relative w-full max-w-md sm:max-w-lg bg-depth-surface border-l border-edge shadow-2xl h-full flex flex-col z-10 animate-slide-in">
        {/* Drawer Header */}
        <div className="p-4 border-b border-edge flex items-center justify-between bg-depth-deep/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-aqua/10 border border-aqua/20 text-aqua">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-heading font-bold text-txt-1">
                  Alarm & Notification Center
                </h2>
                {unacknowledgedCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-critical text-depth-deep text-[10px] font-mono font-bold animate-pulse">
                    {unacknowledgedCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-txt-3">
                Biofloc threshold monitoring & Standard Operating Procedures
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-txt-3 hover:text-txt-1 hover:bg-depth-raised transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-edge bg-depth-deep/20 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTab('active')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                tab === 'active'
                  ? 'bg-depth-raised text-aqua border border-edge-accent'
                  : 'text-txt-3 hover:text-txt-1'
              }`}
            >
              Active ({activeAlarms.length})
            </button>
            <button
              onClick={() => setTab('history')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                tab === 'history'
                  ? 'bg-depth-raised text-aqua border border-edge-accent'
                  : 'text-txt-3 hover:text-txt-1'
              }`}
            >
              History ({alarmHistory.length})
            </button>
            <button
              onClick={() => setTab('sop')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                tab === 'sop'
                  ? 'bg-depth-raised text-aqua border border-edge-accent'
                  : 'text-txt-3 hover:text-txt-1'
              }`}
            >
              SOP Rules
            </button>
          </div>

          {tab === 'active' && unacknowledgedCount > 0 && (
            <button
              onClick={acknowledgeAll}
              className="flex items-center gap-1 text-[11px] text-aqua hover:underline"
            >
              <Check className="w-3.5 h-3.5" />
              Acknowledge All
            </button>
          )}

          {tab === 'history' && alarmHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-[11px] text-txt-3 hover:text-critical"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {tab === 'active' && (
            <>
              {activeAlarms.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-txt-3">
                  <ShieldCheck className="w-12 h-12 text-aqua/60 mb-2" />
                  <div className="text-sm font-semibold text-txt-1">All Biological Parameters Normal</div>
                  <p className="text-xs text-txt-3 mt-1 max-w-xs">
                    DO, TAN, toxic NH₃, and pH are within nominal biofloc thresholds. No active safety alarms.
                  </p>
                </div>
              ) : (
                activeAlarms.map((alarm) => {
                  const isCritical = alarm.severity === 'critical';
                  return (
                    <div
                      key={alarm.id}
                      className={`panel p-4 border-l-[4px] space-y-2.5 transition-all ${
                        isCritical
                          ? 'border-l-critical bg-critical/5 border-critical/30'
                          : 'border-l-gold bg-gold/5 border-gold/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isCritical ? (
                            <AlertOctagon className="w-4 h-4 text-critical shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-gold shrink-0" />
                          )}
                          <span className="text-sm font-heading font-bold text-txt-1">
                            {alarm.title}
                          </span>
                          <span
                            className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                              isCritical
                                ? 'bg-critical/20 text-critical border-critical/40'
                                : 'bg-gold/20 text-gold border-gold/40'
                            }`}
                          >
                            {alarm.severity}
                          </span>
                        </div>

                        {!alarm.acknowledged ? (
                          <button
                            onClick={() => acknowledgeAlarm(alarm.id)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-depth-deep border border-edge text-[10px] text-aqua hover:border-aqua/40 transition shrink-0"
                          >
                            <Check className="w-3 h-3" />
                            Ack
                          </button>
                        ) : (
                          <span className="text-[10px] text-txt-3 font-mono">
                            Acknowledged
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-txt-2 leading-relaxed">
                        {alarm.message}
                      </p>

                      <div className="flex items-center justify-between text-[11px] font-mono pt-2 border-t border-edge/40">
                        <span className="text-txt-3">Reading: <strong className="text-txt-1">{alarm.value}</strong></span>
                        <span className="text-txt-3">Threshold: <strong className="text-txt-2">{alarm.threshold}</strong></span>
                      </div>

                      {/* SOP Checklist */}
                      {alarm.sop && alarm.sop.length > 0 && (
                        <div className="p-2.5 rounded bg-depth-deep/80 border border-edge/60 space-y-1 mt-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-aqua">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Standard Operating Procedure (SOP):</span>
                          </div>
                          <ul className="text-[11px] text-txt-3 space-y-1 list-disc list-inside">
                            {alarm.sop.map((step, i) => (
                              <li key={i} className="leading-snug">{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Actionable Actuator Control */}
                      {alarm.action && onExecuteAction && (
                        <ActionableAlertButton
                          action={alarm.action}
                          controlStatus={controlStatus ?? null}
                          onExecuteAction={onExecuteAction}
                          onOpenControlCenter={() => {
                            onClose();
                            onOpenControlCenter?.();
                          }}
                          onSwitchMode={onSwitchMode}
                          isCritical={isCritical}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              {alarmHistory.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-txt-3">
                  <Clock className="w-10 h-10 text-txt-3/50 mb-2" />
                  <div className="text-xs">No resolved alarm events in history</div>
                </div>
              ) : (
                alarmHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-depth-deep/60 border border-edge text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-txt-1">{item.title}</span>
                      <span className="text-[10px] text-aqua flex items-center gap-1 font-mono">
                        <CheckCircle2 className="w-3 h-3" /> Resolved
                      </span>
                    </div>
                    <div className="text-[11px] text-txt-3">
                      Reading reached: <span className="font-mono text-txt-2">{item.value}</span> ({item.threshold})
                    </div>
                    <div className="text-[10px] text-txt-3 font-mono flex items-center justify-between pt-1 border-t border-edge/30">
                      <span>Triggered: {item.timestamp.slice(11, 19)}</span>
                      {item.resolvedAt && <span>Resolved: {item.resolvedAt.slice(11, 19)}</span>}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'sop' && (
            <div className="space-y-4 text-xs">
              <div className="panel p-4 space-y-3">
                <div className="text-sm font-semibold text-txt-1 flex items-center gap-2">
                  <Info className="w-4 h-4 text-aqua" />
                  <span>AquaSense Safety Operating Limits</span>
                </div>
                <div className="space-y-2 text-[11px] text-txt-2">
                  <div className="flex justify-between py-1.5 border-b border-edge/50">
                    <span className="text-txt-3">Lethal Hypoxia Floor (DO)</span>
                    <span className="font-mono font-bold text-critical">&lt; 2.50 mg/L</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-edge/50">
                    <span className="text-txt-3">Optimal Nitrification DO</span>
                    <span className="font-mono font-bold text-aqua">&ge; 5.00 mg/L</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-edge/50">
                    <span className="text-txt-3">Rapid DO Depletion Slope</span>
                    <span className="font-mono font-bold text-critical">&lt; -1.00 mg/L/hr</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-edge/50">
                    <span className="text-txt-3">Toxic Ammonia (NH₃) Limit</span>
                    <span className="font-mono font-bold text-critical">&gt; 0.050 mg/L</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-edge/50">
                    <span className="text-txt-3">Nitrification pH Window</span>
                    <span className="font-mono font-bold text-txt-1">7.40 – 8.60</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-txt-3">ADWIN Concept Drift delta</span>
                    <span className="font-mono font-bold text-txt-1">0.002</span>
                  </div>
                </div>
              </div>

              <div className="panel p-4 space-y-2 text-[11px] text-txt-3 leading-relaxed">
                <span className="text-txt-1 font-semibold block">Protocol Reference:</span>
                In zero-water-exchange biofloc aquaculture, bacterial biomass respires continuously. A total aeration failure causes lethal hypoxia within 60–90 minutes. When any critical alarm fires, standard operating protocol requires immediate start of secondary blower equipment and suspension of feed input.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
