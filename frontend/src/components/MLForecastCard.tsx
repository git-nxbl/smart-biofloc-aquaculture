import React from 'react';
import { TrendingUp, ShieldCheck, AlertOctagon } from 'lucide-react';
import { MLForecast } from '../types';

interface MLForecastCardProps { forecast: MLForecast | null; }

export const MLForecastCard: React.FC<MLForecastCardProps> = ({ forecast }) => {
  if (!forecast) {
    return (
      <div className="panel p-5 animate-pulse">
        <div className="h-4 w-40 bg-depth-float rounded mb-3" />
        <div className="h-8 w-24 bg-depth-float rounded" />
      </div>
    );
  }

  const isOptimal = forecast.status === 'Optimal';
  const isWarning = forecast.status === 'Warning';
  const isStable = forecast.concept_drift_status === 'STABLE';
  const interval = forecast.prediction_interval || [forecast.predicted_do_2h - 0.25, forecast.predicted_do_2h + 0.25];

  const statusColor = isOptimal ? 'text-aqua' : isWarning ? 'text-gold' : 'text-critical';
  const statusBg = isOptimal ? 'bg-aqua/10' : isWarning ? 'bg-gold/10' : 'bg-critical/10';

  // Visual gauge: map DO from 2-10 range to 0-100%
  const gaugePercent = Math.max(0, Math.min(100, ((forecast.predicted_do_2h - 2) / 8) * 100));
  const currentPercent = Math.max(0, Math.min(100, ((forecast.current_do - 2) / 8) * 100));

  return (
    <div className="panel p-5 border-l-[3px] border-l-aqua relative overflow-hidden">
      {/* Subtle prediction glow */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-aqua/[0.03] rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-aqua" />
        <h3 className="text-sm font-semibold text-txt-1">2-Hour DO Forecast</h3>
        <span className="ml-auto flex items-center gap-1.5 text-xs font-mono">
          {isStable ? (
            <><ShieldCheck className="w-3.5 h-3.5 text-aqua" /><span className="text-aqua">Stable</span></>
          ) : (
            <><AlertOctagon className="w-3.5 h-3.5 text-critical" /><span className="text-critical animate-breathe">Drift</span></>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Predicted DO — the hero value */}
        <div>
          <div className="text-[11px] text-txt-3 mb-1">Predicted (t+2h)</div>
          <div className={`data-value text-3xl ${statusColor}`}>
            {forecast.predicted_do_2h.toFixed(2)}
          </div>
          <div className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${statusBg} ${statusColor}`}>
            {forecast.status}
          </div>
        </div>

        {/* Current DO */}
        <div>
          <div className="text-[11px] text-txt-3 mb-1">Current DO</div>
          <div className="data-value text-2xl text-txt-1">{forecast.current_do.toFixed(2)}</div>
          <div className="text-[11px] text-txt-3 mt-1.5 font-mono">
            Δ {forecast.delta >= 0 ? '+' : ''}{forecast.delta.toFixed(2)} mg/L
          </div>
        </div>

        {/* Prediction interval */}
        <div>
          <div className="text-[11px] text-txt-3 mb-1">90% Interval</div>
          <div className="data-value text-lg text-txt-2">
            {interval[0].toFixed(2)}–{interval[1].toFixed(2)}
          </div>
          <div className="text-[11px] text-txt-3 mt-1.5 font-mono">
            Width: {(interval[1] - interval[0]).toFixed(2)} mg/L
          </div>
        </div>

        {/* Visual gauge */}
        <div>
          <div className="text-[11px] text-txt-3 mb-1">DO Range</div>
          <div className="mt-2 h-2 bg-depth-abyss rounded-full overflow-hidden relative">
            {/* Danger zone */}
            <div className="absolute inset-y-0 left-0 bg-critical/20" style={{ width: '25%' }} />
            {/* Current marker */}
            <div className="absolute inset-y-0 w-0.5 bg-txt-3/50" style={{ left: `${currentPercent}%` }} />
            {/* Predicted fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${gaugePercent}%`,
                background: `linear-gradient(90deg, ${isOptimal ? '#2dd4a8' : isWarning ? '#e8a838' : '#f04848'}66, ${isOptimal ? '#2dd4a8' : isWarning ? '#e8a838' : '#f04848'})`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-txt-3 font-mono mt-1">
            <span>2.0</span>
            <span>10.0</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-edge text-[10px] text-txt-3 font-mono">
        LightGBM · RMSE 0.1507 mg/L · 69.6% improvement over persistence · 27 features
      </div>
    </div>
  );
};
