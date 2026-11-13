import React, { useState } from 'react';
import { Wind, FlaskConical, Droplets, Thermometer, Radio, Terminal, ExternalLink } from 'lucide-react';
import { ChartDataPoint, MLForecast, TelemetryPayload, ConnectionStatus, ControlStatusResponse } from '../types';
import { MetricCard } from '../components/MetricCard';
import { TelemetryChart } from '../components/TelemetryChart';
import { SecondaryChart } from '../components/SecondaryChart';
import { MLForecastCard } from '../components/MLForecastCard';

interface MonitoringViewProps {
  latestPayload: TelemetryPayload | null;
  dataPoints: ChartDataPoint[];
  mlForecast: MLForecast | null;
  status: ConnectionStatus;
  packetCount: number;
  controlStatus?: ControlStatusResponse | null;
  onOpenControlCenter?: () => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({
  latestPayload, dataPoints, mlForecast, status, packetCount, controlStatus, onOpenControlCenter,
}) => {
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary' | 'raw'>('primary');
  const cs = latestPayload?.sensors;
  const meta = latestPayload?.metadata;
  const isConnected = status === 'connected';

  const getDOStatus = (v?: number) => { if (!v) return { status: 'optimal' as const, label: 'Optimal' }; if (v < 4) return { status: 'critical' as const, label: 'Critical Hypoxia' }; if (v < 5) return { status: 'warning' as const, label: 'Sub-Optimal' }; return { status: 'optimal' as const, label: 'Optimal Aeration' }; };
  const getTANStatus = (v?: number) => { if (!v) return { status: 'optimal' as const, label: 'Safe' }; if (v > 1.2) return { status: 'critical' as const, label: 'Toxicity Risk' }; if (v > 0.8) return { status: 'warning' as const, label: 'Accumulating' }; return { status: 'optimal' as const, label: 'Safe' }; };
  const getPHStatus = (v?: number) => { if (!v) return { status: 'optimal' as const, label: 'Stable' }; if (v < 7.2 || v > 8.3) return { status: 'warning' as const, label: 'Buffer Shift' }; return { status: 'optimal' as const, label: 'Stable' }; };
  const getTempStatus = (v?: number) => { if (!v) return { status: 'optimal' as const, label: 'Optimal' }; if (v < 25 || v > 31) return { status: 'warning' as const, label: 'Stress' }; return { status: 'optimal' as const, label: 'Optimal' }; };

  const doVals = dataPoints.map(d => d.dissolved_oxygen_mgl);
  const tanVals = dataPoints.map(d => d.tan_mgl);
  const doH = getDOStatus(cs?.dissolved_oxygen_mgl);
  const tanH = getTANStatus(cs?.tan_mgl);
  const phH = getPHStatus(cs?.ph);
  const tempH = getTempStatus(cs?.temperature_c);

  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Radio className={`w-5 h-5 ${isConnected ? 'text-aqua' : 'text-critical'}`} />
          <div>
            <h1 className="text-xl font-heading font-bold text-txt-1">Live Monitoring</h1>
            <p className="text-xs text-txt-3">Real-time telemetry stream — Tank 01</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-depth-surface border border-edge">
            <div className={`status-dot ${isConnected ? 'live' : 'error'}`} />
            <span className="text-txt-2">{isConnected ? 'Connected' : 'Reconnecting'}</span>
          </div>
          <span className="text-txt-3 font-mono">{packetCount} pkts</span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Dissolved Oxygen" value={cs?.dissolved_oxygen_mgl} unit="mg/L" icon={<Wind className="w-4 h-4" />}
          min={doVals.length ? Math.min(...doVals) : undefined} max={doVals.length ? Math.max(...doVals) : undefined}
          optimalRange="> 5.0 mg/L" status={doH.status} statusLabel={doH.label} />
        <MetricCard title="Total Ammonia (TAN)" value={cs?.tan_mgl} unit="mg/L" icon={<FlaskConical className="w-4 h-4" />}
          min={tanVals.length ? Math.min(...tanVals) : undefined} max={tanVals.length ? Math.max(...tanVals) : undefined}
          optimalRange="< 0.80 mg/L" status={tanH.status} statusLabel={tanH.label}
          subValue={meta?.calculated_nh3_mgl !== undefined ? meta.calculated_nh3_mgl.toFixed(4) : undefined} subLabel="Toxic NH₃" />
        <MetricCard title="pH" value={cs?.ph} unit="pH" icon={<Droplets className="w-4 h-4" />}
          optimalRange="7.2 – 8.2" status={phH.status} statusLabel={phH.label} />
        <MetricCard title="Water Temperature" value={cs?.temperature_c} unit="°C" icon={<Thermometer className="w-4 h-4" />}
          optimalRange="26 – 30 °C" status={tempH.status} statusLabel={tempH.label} />
      </div>

      {/* Actuator Operational Status Strip */}
      {controlStatus && (
        <div className="panel p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs bg-depth-surface/60 border border-edge">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 font-semibold text-txt-1 uppercase tracking-wider text-[11px]">
              <span className={`w-2 h-2 rounded-full ${controlStatus.mode === 'AUTO' ? 'bg-aqua animate-pulse' : 'bg-gold'}`} />
              Actuator Status [{controlStatus.mode}]
            </span>

            {/* Aeration */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-depth-float border border-edge font-mono">
              <span className="text-txt-3">Aeration:</span>
              <span className={`font-semibold ${
                controlStatus.actuators.aerator?.state === 'EMERGENCY' ? 'text-critical font-bold animate-pulse' :
                controlStatus.actuators.aerator?.state === 'HIGH' ? 'text-gold' :
                controlStatus.actuators.aerator?.state === 'MEDIUM' ? 'text-aqua' :
                controlStatus.actuators.aerator?.state === 'LOW' ? 'text-txt-2' : 'text-txt-3'
              }`}>
                {controlStatus.actuators.aerator?.state || 'OFF'}
              </span>
              <span className="text-[10px] text-txt-3">
                ({controlStatus.actuators.aerator?.power_pct ?? 0}%)
              </span>
            </div>

            {/* Inlet Pump */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-depth-float border border-edge font-mono">
              <span className="text-txt-3">Inlet:</span>
              <span className={`font-semibold ${controlStatus.actuators.inlet_pump?.state === 'ON' ? 'text-aqua' : 'text-txt-3'}`}>
                {controlStatus.actuators.inlet_pump?.state || 'OFF'}
              </span>
              {controlStatus.water_level?.inlet_blocked && (
                <span className="text-[10px] text-critical">(Blocked)</span>
              )}
            </div>

            {/* Outlet / Sludge Pump */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-depth-float border border-edge font-mono">
              <span className="text-txt-3">Sludge Outlet:</span>
              <span className={`font-semibold ${controlStatus.actuators.outlet_pump?.state === 'ON' ? 'text-aqua' : 'text-txt-3'}`}>
                {controlStatus.actuators.outlet_pump?.state || 'OFF'}
              </span>
              {controlStatus.water_level?.outlet_blocked && (
                <span className="text-[10px] text-critical">(Blocked)</span>
              )}
            </div>

            {/* Water Level */}
            {controlStatus.water_level && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-depth-float border border-edge font-mono text-txt-3">
                <span>Water:</span>
                <span className="text-txt-1">{controlStatus.water_level.current_level_liters.toLocaleString()} L</span>
                <span className="text-[10px]">({controlStatus.water_level.level_percentage.toFixed(0)}%)</span>
              </div>
            )}
          </div>

          {onOpenControlCenter && (
            <button
              onClick={onOpenControlCenter}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-aqua/10 hover:bg-aqua/20 border border-aqua/30 text-aqua text-xs font-medium transition"
            >
              Action Center →
            </button>
          )}
        </div>
      )}

      {/* Forecast */}
      <MLForecastCard forecast={mlForecast} />

      {/* Chart tabs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 bg-depth-surface rounded-lg p-0.5 border border-edge">
            {(['primary', 'secondary', 'raw'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${activeTab === tab ? 'bg-depth-float text-txt-1' : 'text-txt-3 hover:text-txt-2'}`}>
                {tab === 'primary' ? 'DO & TAN' : tab === 'secondary' ? 'pH & Temp' : 'Raw'}
              </button>
            ))}
          </div>
          <a href="http://localhost:9000" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-txt-3 hover:text-aqua transition">
            QuestDB <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {activeTab === 'primary' && <TelemetryChart data={dataPoints} />}
        {activeTab === 'secondary' && <SecondaryChart data={dataPoints} />}
        {activeTab === 'raw' && (
          <div className="panel p-4">
            <div className="flex items-center gap-2 mb-2 text-xs text-txt-3">
              <Terminal className="w-3.5 h-3.5" /> Latest SSE payload
            </div>
            <pre className="p-4 rounded-lg bg-depth-abyss text-xs text-aqua font-mono overflow-x-auto max-h-80 leading-relaxed">
              {JSON.stringify(latestPayload, null, 2) || 'Waiting for telemetry...'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
