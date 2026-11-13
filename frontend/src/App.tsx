import React, { useState, useEffect } from 'react';
import { useTelemetryStream } from './hooks/useTelemetryStream';
import { useAlarmSystem } from './hooks/useAlarmSystem';
import { useControlSystem } from './hooks/useControlSystem';
import { Header } from './components/Header';
import { ESP32SimulatorModal } from './components/ESP32SimulatorModal';
import { GlobalAlertBanner } from './components/GlobalAlertBanner';
import { AlarmCenterDrawer } from './components/AlarmCenterDrawer';
import { ActiveView } from './types';

import { OverviewView } from './views/OverviewView';
import { MonitoringView } from './views/MonitoringView';
import { ControlCenterView } from './views/ControlCenterView';
import { AnalyticsView } from './views/AnalyticsView';
import { ForecastView } from './views/ForecastView';
import { WaterQualityView } from './views/WaterQualityView';
import { ScenariosView } from './views/ScenariosView';
import { TechnologyView } from './views/TechnologyView';
import { ResearchView } from './views/ResearchView';

export const App: React.FC = () => {
  const { dataPoints, latestPayload, status, mlForecast, packetCount, reconnect } =
    useTelemetryStream('/api/stream');

  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [isESP32ModalOpen, setIsESP32ModalOpen] = useState(false);
  const [isAlarmCenterOpen, setIsAlarmCenterOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [isDispatchingScenario, setIsDispatchingScenario] = useState(false);

  // Global Control & Actuator Management
  const controlSystem = useControlSystem(2500);

  // Global Alarm Evaluation Engine
  const alarmState = useAlarmSystem(latestPayload, dataPoints, mlForecast);

  const currentMeta = latestPayload?.metadata;
  const activeScenario = selectedScenario || currentMeta?.scenario || 'normal';

  // Automatically clear optimistic selection once telemetry confirms scenario match
  useEffect(() => {
    if (selectedScenario && currentMeta?.scenario?.toLowerCase() === selectedScenario.toLowerCase()) {
      setSelectedScenario(null);
    }
  }, [currentMeta?.scenario, selectedScenario]);

  const handleSelectScenario = async (scenario: string) => {
    setSelectedScenario(scenario);
    setIsDispatchingScenario(true);
    try {
      const res = await fetch('/api/simulator/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotification(`Scenario "${scenario}" dispatched`);
        setTimeout(() => setNotification(null), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setSelectedScenario(null);
        setNotification(`Failed to dispatch: ${err.detail?.[0]?.msg || err.detail || 'Server error'}`);
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e: any) {
      setSelectedScenario(null);
      console.error('Failed to dispatch scenario:', e);
      setNotification('Network error dispatching scenario');
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsDispatchingScenario(false);
    }
  };

  return (
    <div className="min-h-screen bg-depth-deep">
      <Header
        activeView={activeView}
        onNavigate={setActiveView}
        status={status}
        packetCount={packetCount}
        onOpenESP32Modal={() => setIsESP32ModalOpen(true)}
        onReconnect={reconnect}
        unreadAlarmCount={alarmState.unacknowledgedCount}
        onOpenAlarmCenter={() => setIsAlarmCenterOpen(true)}
      />

      {/* Content area: offset by sidebar on desktop, top bar on mobile */}
      <main className="md:pl-sidebar pt-[88px] md:pt-0 min-h-screen">
        {/* Global sticky emergency alert banner */}
        <GlobalAlertBanner
          activeAlarms={alarmState.activeAlarms}
          onAcknowledge={alarmState.acknowledgeAlarm}
          onOpenAlarmCenter={() => setIsAlarmCenterOpen(true)}
          controlStatus={controlSystem.status}
          onExecuteAction={controlSystem.sendActuatorCommand}
          onOpenControlCenter={() => setActiveView('control')}
          onSwitchMode={controlSystem.switchMode}
        />

        {/* Notification toast */}
        {notification && (
          <div className="fixed top-4 right-4 z-50 px-4 py-2.5 bg-depth-raised border border-edge-accent rounded-panel text-sm text-aqua animate-slide-in shadow-lg">
            {notification}
          </div>
        )}

        {activeView === 'overview' && (
          <OverviewView
            latestPayload={latestPayload}
            dataPoints={dataPoints}
            mlForecast={mlForecast}
            onNavigate={setActiveView}
            onSelectScenario={handleSelectScenario}
            activeScenario={activeScenario}
          />
        )}
        {activeView === 'monitoring' && (
          <MonitoringView
            latestPayload={latestPayload}
            dataPoints={dataPoints}
            mlForecast={mlForecast}
            status={status}
            packetCount={packetCount}
            controlStatus={controlSystem.status}
            onOpenControlCenter={() => setActiveView('control')}
          />
        )}
        {activeView === 'control' && (
          <ControlCenterView
            latestPayload={latestPayload}
            controlSystem={controlSystem}
          />
        )}
        {activeView === 'analytics' && <AnalyticsView />}
        {activeView === 'forecast' && (
          <ForecastView dataPoints={dataPoints} mlForecast={mlForecast} />
        )}
        {activeView === 'water-quality' && <WaterQualityView />}
        {activeView === 'scenarios' && (
          <ScenariosView
            activeScenario={activeScenario}
            onSelectScenario={handleSelectScenario}
            dataPoints={dataPoints}
            isDispatching={isDispatchingScenario}
          />
        )}
        {activeView === 'technology' && (
          <TechnologyView onOpenESP32Modal={() => setIsESP32ModalOpen(true)} />
        )}
        {activeView === 'research' && <ResearchView />}
      </main>

      <ESP32SimulatorModal
        isOpen={isESP32ModalOpen}
        onClose={() => setIsESP32ModalOpen(false)}
      />

      <AlarmCenterDrawer
        isOpen={isAlarmCenterOpen}
        onClose={() => setIsAlarmCenterOpen(false)}
        alarmState={alarmState}
        controlStatus={controlSystem.status}
        onExecuteAction={controlSystem.sendActuatorCommand}
        onOpenControlCenter={() => {
          setIsAlarmCenterOpen(false);
          setActiveView('control');
        }}
        onSwitchMode={controlSystem.switchMode}
      />
    </div>
  );
};

export default App;
