import React, { useMemo } from 'react';
import { TrendingUp, ShieldCheck, AlertOctagon, Target } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
} from 'recharts';
import { ChartDataPoint, MLForecast } from '../types';

interface ForecastViewProps {
  dataPoints: ChartDataPoint[];
  mlForecast: MLForecast | null;
}

export const ForecastView: React.FC<ForecastViewProps> = ({ dataPoints, mlForecast }) => {
  const forecastChartData = useMemo(() => {
    const recent = dataPoints.slice(-20);
    if (recent.length === 0) return [];
    const last = recent[recent.length - 1];
    const points = recent.map(d => ({
      time: d.time,
      observedDO: d.dissolved_oxygen_mgl,
      projectedDO: null as number | null,
      intervalLow: null as number | null,
      intervalHigh: null as number | null,
    }));
    if (mlForecast) {
      const interval = mlForecast.prediction_interval || [mlForecast.predicted_do_2h - 0.2, mlForecast.predicted_do_2h + 0.2];
      points[points.length - 1].projectedDO = last.dissolved_oxygen_mgl;
      points.push({
        time: '+1h', observedDO: null as any,
        projectedDO: Number(((last.dissolved_oxygen_mgl + mlForecast.predicted_do_2h) / 2).toFixed(2)),
        intervalLow: Number(((last.dissolved_oxygen_mgl + interval[0]) / 2).toFixed(2)),
        intervalHigh: Number(((last.dissolved_oxygen_mgl + interval[1]) / 2).toFixed(2)),
      });
      points.push({
        time: '+2h', observedDO: null as any,
        projectedDO: Number(mlForecast.predicted_do_2h.toFixed(2)),
        intervalLow: Number(interval[0].toFixed(2)),
        intervalHigh: Number(interval[1].toFixed(2)),
      });
    }
    return points;
  }, [dataPoints, mlForecast]);

  const isOptimal = mlForecast?.status === 'Optimal';
  const isStable = mlForecast?.concept_drift_status === 'STABLE';
  const statusColor = isOptimal ? 'text-aqua' : mlForecast?.status === 'Warning' ? 'text-gold' : 'text-critical';

  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="w-5 h-5 text-aqua" />
        <div>
          <h1 className="text-xl font-heading font-bold text-txt-1">Dissolved Oxygen Forecast</h1>
          <p className="text-xs text-txt-3 mt-0.5">LightGBM 2-hour prediction with quantile intervals</p>
        </div>
      </div>

      {/* Prediction hero panel */}
      {mlForecast ? (
        <div className="panel p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-60 h-60 rounded-full blur-3xl pointer-events-none" style={{ background: isOptimal ? 'rgba(45,212,168,0.04)' : 'rgba(232,168,56,0.04)' }} />

          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Predicted value — hero */}
            <div className="col-span-2 lg:col-span-1">
              <div className="text-[11px] text-txt-3 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Target className="w-3 h-3" /> Predicted DO
              </div>
              <div className={`data-value text-5xl lg:text-6xl ${statusColor}`}>
                {mlForecast.predicted_do_2h.toFixed(2)}
              </div>
              <div className="text-xs text-txt-3 mt-1 font-mono">mg/L at t+2h</div>
              <div className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded text-xs font-semibold ${isOptimal ? 'bg-aqua/10 text-aqua' : 'bg-gold/10 text-gold'}`}>
                {mlForecast.status}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-txt-3 uppercase tracking-wide mb-2">Current DO</div>
              <div className="data-value text-3xl text-txt-1">{mlForecast.current_do.toFixed(2)}</div>
              <div className="text-xs text-txt-3 mt-1 font-mono">mg/L</div>
            </div>

            <div>
              <div className="text-[11px] text-txt-3 uppercase tracking-wide mb-2">Delta</div>
              <div className={`data-value text-3xl ${mlForecast.delta >= 0 ? 'text-aqua' : 'text-gold'}`}>
                {mlForecast.delta >= 0 ? '+' : ''}{mlForecast.delta.toFixed(2)}
              </div>
              <div className="text-xs text-txt-3 mt-1 font-mono">mg/L change</div>
            </div>

            <div>
              <div className="text-[11px] text-txt-3 uppercase tracking-wide mb-2">90% Interval</div>
              <div className="data-value text-2xl text-txt-2">
                {mlForecast.prediction_interval[0].toFixed(2)}–{mlForecast.prediction_interval[1].toFixed(2)}
              </div>
              <div className="text-xs text-txt-3 mt-1 font-mono">
                Width: {(mlForecast.prediction_interval[1] - mlForecast.prediction_interval[0]).toFixed(2)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-txt-3 uppercase tracking-wide mb-2">Drift Monitor</div>
              <div className="flex items-center gap-2 mt-1">
                {isStable ? <ShieldCheck className="w-5 h-5 text-aqua" /> : <AlertOctagon className="w-5 h-5 text-critical animate-breathe" />}
                <span className={`text-sm font-semibold ${isStable ? 'text-aqua' : 'text-critical'}`}>
                  {isStable ? 'STABLE' : 'DRIFT'}
                </span>
              </div>
              <div className="text-xs text-txt-3 mt-1">ADWIN residual monitor</div>
            </div>
          </div>

          {/* Visual gauge bar */}
          <div className="mt-6 pt-4 border-t border-edge">
            <div className="flex items-center justify-between text-[10px] text-txt-3 font-mono mb-1">
              <span>Critical &lt; 4.0</span>
              <span>Optimal &gt; 5.0</span>
            </div>
            <div className="h-3 bg-depth-abyss rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-critical/20 rounded-l-full" style={{ width: '25%' }} />
              <div className="absolute inset-y-0 bg-gold/15" style={{ left: '25%', width: '12.5%' }} />
              <div className="absolute inset-y-0 w-0.5 bg-txt-3/30 z-10" style={{ left: `${Math.max(0, Math.min(100, ((mlForecast.current_do - 2) / 8) * 100))}%` }} title="Current" />
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max(0, Math.min(100, ((mlForecast.predicted_do_2h - 2) / 8) * 100))}%`,
                  background: `linear-gradient(90deg, transparent 60%, ${isOptimal ? '#2dd4a8' : '#e8a838'})`,
                }}
              />
              <div className="absolute inset-y-0 flex items-center z-20" style={{ left: `${Math.max(0, Math.min(96, ((mlForecast.predicted_do_2h - 2) / 8) * 100))}%` }}>
                <div className="w-3 h-3 rounded-full border-2 border-depth-surface" style={{ backgroundColor: isOptimal ? '#2dd4a8' : '#e8a838' }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel p-8 text-center">
          <TrendingUp className="w-8 h-8 text-txt-3 mx-auto mb-3 animate-pulse" />
          <div className="text-sm text-txt-3">Loading forecast model...</div>
        </div>
      )}

      {/* Forecast chart */}
      <div className="chart-surface">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-txt-1">Observed → Projected Trajectory</h3>
            <p className="text-[11px] text-txt-3 mt-0.5">Historical data with 2-hour forward projection and quantile bounds</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-txt-3">
            <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] rounded bg-info" /> Observed</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] rounded bg-aqua" style={{ borderTop: '1px dashed' }} /> Projected</span>
          </div>
        </div>
        <div className="h-72 sm:h-80 lg:h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={forecastChartData} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
              <defs>
                <linearGradient id="intervalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4a8" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#2dd4a8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
              <YAxis domain={['auto', 'auto']} stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#111921', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
              <ReferenceLine y={5.0} stroke="#2dd4a8" strokeDasharray="6 4" strokeOpacity={0.3} />
              <ReferenceLine y={4.0} stroke="#f04848" strokeDasharray="6 4" strokeOpacity={0.25} />
              <Area dataKey="intervalHigh" stroke="none" fill="url(#intervalFill)" isAnimationActive={false} />
              <Area dataKey="intervalLow" stroke="none" fill="#172028" isAnimationActive={false} />
              <Line type="monotone" dataKey="observedDO" name="Observed" stroke="#4c8dff" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="projectedDO" name="Projected" stroke="#2dd4a8" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: '#2dd4a8', stroke: '#172028', strokeWidth: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Benchmarks */}
      <div className="panel p-5">
        <h3 className="text-sm font-semibold text-txt-1 mb-4">Model Benchmark Comparison</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Model</th><th>RMSE (mg/L)</th><th>MAE (mg/L)</th><th>R²</th><th>Improvement</th></tr></thead>
            <tbody>
              <tr><td>Naive Persistence</td><td className="font-mono">0.4963</td><td className="font-mono">0.4457</td><td className="font-mono">0.6989</td><td className="text-txt-3">Baseline</td></tr>
              <tr><td>Historical Diurnal Mean</td><td className="font-mono text-aqua">0.1447</td><td className="font-mono">0.1159</td><td className="font-mono">0.9744</td><td className="font-mono text-aqua">+70.85%</td></tr>
              <tr className="!bg-aqua/5"><td className="font-semibold text-aqua">LightGBM Regressor</td><td className="font-mono font-semibold text-aqua">0.1507</td><td className="font-mono text-aqua">0.1184</td><td className="font-mono text-aqua">0.9722</td><td className="font-mono font-semibold text-aqua">+69.64%</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-txt-3 mt-3 leading-relaxed max-w-3xl">
          27 canonical features: lag values (5m–60m), rolling statistics (1h, 3h, 6h), Emerson-derived toxic NH₃, and cyclical time embeddings (sin/cos hour). Empirical 90% interval coverage: 74.4%.
        </p>
      </div>
    </div>
  );
};
