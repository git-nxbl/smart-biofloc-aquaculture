import React from 'react';
import { ArrowRight, Radio, TrendingUp, BarChart3, ShieldCheck, Droplets, Sliders } from 'lucide-react';
import { ChartDataPoint, MLForecast, TelemetryPayload, ActiveView } from '../types';
import { TelemetryChart } from '../components/TelemetryChart';

interface OverviewViewProps {
  latestPayload: TelemetryPayload | null;
  dataPoints: ChartDataPoint[];
  mlForecast: MLForecast | null;
  onNavigate: (view: ActiveView) => void;
  onSelectScenario: (scenario: string) => void;
  activeScenario: string;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  latestPayload, dataPoints, mlForecast, onNavigate,
}) => {
  const s = latestPayload?.sensors;
  const nh3 = latestPayload?.metadata?.calculated_nh3_mgl;
  const isOptimal = mlForecast?.status === 'Optimal';

  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-4">
      {/* ─── Hero strip: brand + live status ─── */}
      <div className="panel p-6 lg:p-8 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-aqua/[0.04] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-info/[0.03] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="w-5 h-5 text-aqua" />
              <span className="text-xs font-semibold text-aqua tracking-wide uppercase">AquaSense Platform</span>
            </div>
            <h1 className="font-heading text-3xl lg:text-4xl font-bold text-txt-1 leading-tight">
              Predictive water quality intelligence
            </h1>
            <p className="text-sm text-txt-2 mt-3 leading-relaxed max-w-md">
              Continuous monitoring, 2-hour DO forecasting, and adaptive drift detection for zero-water-exchange biofloc aquaculture.
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => onNavigate('monitoring')} className="flex items-center gap-2 px-4 py-2 bg-aqua hover:bg-aqua-bright text-depth-deep text-sm font-semibold rounded-lg transition">
                <Radio className="w-4 h-4" />Live Monitoring
              </button>
              <button onClick={() => onNavigate('forecast')} className="flex items-center gap-2 px-4 py-2 bg-depth-float hover:bg-depth-raised border border-edge text-txt-2 hover:text-txt-1 text-sm font-medium rounded-lg transition">
                <TrendingUp className="w-4 h-4" />Forecast
              </button>
            </div>
          </div>

          {/* Live metrics panel */}
          <div className="panel-raised p-5 min-w-[280px]">
            <div className="flex items-center gap-2 mb-3">
              <div className="status-dot live" />
              <span className="text-xs text-txt-2 font-medium">Live — Tank 01</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <div className="data-value text-xl text-aqua">{s?.dissolved_oxygen_mgl?.toFixed(2) ?? '—'}</div>
                <div className="text-[11px] text-txt-3">DO · mg/L</div>
              </div>
              <div>
                <div className="data-value text-xl text-gold">{s?.tan_mgl?.toFixed(2) ?? '—'}</div>
                <div className="text-[11px] text-txt-3">TAN · mg/L</div>
              </div>
              <div>
                <div className="data-value text-xl text-txt-1">{s?.ph?.toFixed(2) ?? '—'}</div>
                <div className="text-[11px] text-txt-3">pH</div>
              </div>
              <div>
                <div className="data-value text-xl text-txt-1">{s?.temperature_c?.toFixed(1) ?? '—'}</div>
                <div className="text-[11px] text-txt-3">Temp · °C</div>
              </div>
            </div>
            {nh3 !== undefined && (
              <div className="mt-3 pt-2.5 border-t border-edge text-[11px] font-mono">
                <span className="text-txt-3">Toxic NH₃: </span>
                <span className="text-gold">{nh3.toFixed(4)} mg/L</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main grid: chart + forecast + quicklinks ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart — dominant, spans 2 cols */}
        <div className="lg:col-span-2">
          <TelemetryChart data={dataPoints} />
        </div>

        {/* Right column: forecast + quick actions */}
        <div className="space-y-4">
          {/* Forecast preview */}
          <div className="panel p-5 border-l-[3px] border-l-aqua">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-aqua" />
              <span className="text-xs font-semibold text-txt-2">2h DO Forecast</span>
            </div>
            {mlForecast ? (
              <>
                <div className={`data-value text-4xl ${isOptimal ? 'text-aqua' : 'text-gold'}`}>
                  {mlForecast.predicted_do_2h.toFixed(2)}
                </div>
                <div className="text-xs text-txt-3 font-mono mt-1">
                  [{mlForecast.prediction_interval[0].toFixed(2)} – {mlForecast.prediction_interval[1].toFixed(2)}] mg/L
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${mlForecast.concept_drift_status === 'STABLE' ? 'bg-aqua' : 'bg-critical animate-breathe'}`} />
                  <span className="text-txt-3">{mlForecast.concept_drift_status === 'STABLE' ? 'System stable' : 'Drift detected'}</span>
                </div>
                <button onClick={() => onNavigate('forecast')} className="flex items-center gap-1 mt-3 text-xs text-aqua hover:text-aqua-bright transition">
                  View forecast engine <ArrowRight className="w-3 h-3" />
                </button>
              </>
            ) : (
              <div className="text-sm text-txt-3 animate-pulse">Loading forecast...</div>
            )}
          </div>

          {/* Quick navigation */}
          <div className="space-y-2">
            {[
              { label: 'Action Center', desc: 'Tank operations & actuator control', icon: <Sliders className="w-4 h-4" />, view: 'control' as ActiveView },
              { label: 'Historical Analytics', desc: 'Explore trends from QuestDB', icon: <BarChart3 className="w-4 h-4" />, view: 'analytics' as ActiveView },
              { label: 'Scenario Simulation', desc: 'Test failure conditions', icon: <ShieldCheck className="w-4 h-4" />, view: 'scenarios' as ActiveView },
            ].map(item => (
              <button key={item.view} onClick={() => onNavigate(item.view)} className="panel w-full p-3.5 text-left flex items-center gap-3 group hover:border-edge-accent transition">
                <span className="text-txt-3 group-hover:text-aqua transition">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-txt-1 group-hover:text-aqua transition">{item.label}</div>
                  <div className="text-[11px] text-txt-3 truncate">{item.desc}</div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-txt-3 group-hover:text-aqua group-hover:translate-x-0.5 transition" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Challenge + pipeline ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-6">
          <h2 className="text-lg font-heading font-bold text-txt-1 mb-3">The Biofloc Challenge</h2>
          <p className="text-sm text-txt-2 leading-relaxed mb-3">
            In zero-water-exchange aquaculture, dense heterotrophic biofloc creates massive oxygen demand. A blower failure causes exponential DO decay within 1–2 hours.
          </p>
          <p className="text-sm text-txt-2 leading-relaxed">
            AquaSense predicts dissolved oxygen two hours ahead, providing operators proactive lead time before hypoxic events threaten stock.
          </p>
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-heading font-bold text-txt-1 mb-3">System Architecture</h2>
          <p className="text-xs text-txt-3 mb-3">End-to-end telemetry pipeline</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {['ESP32/SDE', 'MQTT', 'FastAPI', 'QuestDB', 'LightGBM', 'UI'].map((n, i, a) => (
              <React.Fragment key={i}>
                <span className="px-2.5 py-1 rounded bg-depth-float text-txt-2 font-medium">{n}</span>
                {i < a.length - 1 && <span className="text-txt-3">→</span>}
              </React.Fragment>
            ))}
          </div>
          <button onClick={() => onNavigate('technology')} className="flex items-center gap-1 mt-4 text-xs text-aqua hover:text-aqua-bright transition">
            Architecture details <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
