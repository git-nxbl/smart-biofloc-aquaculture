import React from 'react';
import { BookOpen, Target, Layers, Scale, ShieldAlert, AlertTriangle } from 'lucide-react';

export const ResearchView: React.FC = () => {
  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BookOpen className="w-5 h-5 text-aqua" />
        <div>
          <h1 className="text-xl font-heading font-bold text-txt-1">Scientific Methodology</h1>
          <p className="text-xs text-txt-3 mt-0.5">ML validation, feature engineering, quantile regression, and concept drift</p>
        </div>
      </div>

      {/* Problem statement */}
      <div className="panel p-6 border-l-[3px] border-l-aqua relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-aqua/[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs text-aqua font-semibold uppercase tracking-wide mb-2">
            <Target className="w-3.5 h-3.5" /> Domain Problem
          </div>
          <h2 className="text-lg font-heading font-bold text-txt-1 mb-3">
            Predictive DO Management in Zero-Water-Exchange Biofloc
          </h2>
          <p className="text-sm text-txt-2 leading-relaxed max-w-3xl">
            Zero-water-exchange biofloc aquaculture operates at elevated stocking densities. Heterotrophic bacteria create massive biological oxygen demand. Aeration disruption causes acute DO decay within 1–2 hours. Proactive 2-hour forecasting provides the lead time necessary for backup aeration and operator intervention.
          </p>
        </div>
      </div>

      {/* ML Pipeline + Features */}
      <div className="panel p-6">
        <div className="flex items-center gap-2 text-xs text-info font-semibold uppercase tracking-wide mb-4">
          <Layers className="w-3.5 h-3.5" /> Machine Learning Pipeline
        </div>

        {/* Chronological split */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Training (70%)', value: '4,166', sub: 'Days 1–14.5', color: 'border-l-txt-3' },
            { label: 'Validation (15%)', value: '893', sub: 'Days 14.5–17.5', color: 'border-l-info' },
            { label: 'Held-Out Test (15%)', value: '893', sub: 'Days 17.5–21', color: 'border-l-aqua' },
          ].map((p, i) => (
            <div key={i} className={`panel-raised p-4 border-l-[3px] ${p.color}`}>
              <div className="text-[10px] text-txt-3 uppercase tracking-wide mb-1">{p.label}</div>
              <div className="data-value text-xl text-txt-1">{p.value}</div>
              <div className="text-[10px] text-txt-3 mt-1">{p.sub}</div>
            </div>
          ))}
        </div>

        {/* Feature table */}
        <h3 className="text-sm font-semibold text-txt-1 mb-3">27 Canonical Features</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Category</th><th>Count</th><th>Features</th></tr></thead>
            <tbody>
              <tr><td className="font-medium">Instantaneous</td><td className="font-mono text-aqua">5</td><td className="text-txt-2">DO, TAN, pH, temperature, calculated NH₃ (Emerson)</td></tr>
              <tr><td className="font-medium">Temporal Lags</td><td className="font-mono text-info">10</td><td className="text-txt-2">DO lags (t-1…t-12), TAN lags (t-1, t-2, t-6), pH lag, temp lag</td></tr>
              <tr><td className="font-medium">Rolling Windows</td><td className="font-mono text-gold">10</td><td className="text-txt-2">1h (mean, std, min, max), 3h (DO mean/std, TAN mean), 6h (DO mean/std, TAN mean)</td></tr>
              <tr><td className="font-medium">Cyclical Embeddings</td><td className="font-mono text-purple-400">2</td><td className="text-txt-2">sin_hour, cos_hour (harmonic midnight continuity)</td></tr>
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-txt-3 mt-2">All features computed identically during training and online inference — zero train/serve skew.</div>
      </div>

      {/* Benchmarks */}
      <div className="panel p-6">
        <div className="flex items-center gap-2 text-xs text-aqua font-semibold uppercase tracking-wide mb-4">
          <Scale className="w-3.5 h-3.5" /> Generalization Benchmarks
        </div>

        <div className="overflow-x-auto mb-4">
          <table className="data-table">
            <thead><tr><th>Model</th><th>RMSE (mg/L)</th><th>MAE (mg/L)</th><th>R²</th><th>RMSE Reduction</th></tr></thead>
            <tbody>
              <tr><td>Naive Persistence</td><td className="font-mono">0.4963</td><td className="font-mono">0.4457</td><td className="font-mono">0.6989</td><td className="text-txt-3">Baseline</td></tr>
              <tr><td>Historical Diurnal Mean</td><td className="font-mono text-aqua">0.1447</td><td className="font-mono">0.1159</td><td className="font-mono">0.9744</td><td className="font-mono text-aqua">+70.85%</td></tr>
              <tr className="!bg-aqua/5"><td className="font-semibold text-aqua">LightGBM Regressor</td><td className="font-mono font-semibold text-aqua">0.1507</td><td className="font-mono text-aqua">0.1184</td><td className="font-mono text-aqua">0.9722</td><td className="font-mono font-semibold text-aqua">+69.64%</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-txt-3 leading-relaxed max-w-3xl">
          LightGBM reduces RMSE by 69.64% over persistence. The diurnal mean achieves slightly lower RMSE because the simulator's normal operation uses a smooth periodic cycle. LightGBM provides critical value during non-stationary transitions where static averages fail.
        </p>
      </div>

      {/* ADWIN */}
      <div className="panel p-6">
        <div className="flex items-center gap-2 text-xs text-gold font-semibold uppercase tracking-wide mb-4">
          <ShieldAlert className="w-3.5 h-3.5" /> Concept Drift Detection
        </div>

        <div className="panel-raised p-4 mb-4 text-center font-mono text-sm text-aqua">
          e<sub>t</sub> = |y<sub>t+2h</sub> − ŷ<sub>t+2h</sub>|, &nbsp; ε<sub>cut</sub> = √[ (1/2m) · ln(4|W|/δ) ]
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="panel-raised p-4 border-l-[3px] border-l-aqua">
            <div className="text-[10px] text-txt-3 uppercase tracking-wide mb-1">Stationary Baseline</div>
            <div className="data-value text-xl text-aqua">0 Detections</div>
            <div className="text-[11px] text-txt-3 mt-1">893 test residuals, δ=0.002</div>
          </div>
          <div className="panel-raised p-4 border-l-[3px] border-l-critical">
            <div className="text-[10px] text-txt-3 uppercase tracking-wide mb-1">Aerator Failure</div>
            <div className="data-value text-xl text-critical">Flagged Step 15</div>
            <div className="text-[11px] text-txt-3 mt-1">75-min detection delay</div>
          </div>
        </div>
      </div>

      {/* Limitations */}
      <div className="panel p-6 border-l-[3px] border-l-gold">
        <div className="flex items-center gap-2 text-xs text-gold font-semibold uppercase tracking-wide mb-4">
          <AlertTriangle className="w-3.5 h-3.5" /> Scientific Limitations
        </div>

        <div className="space-y-3">
          {[
            { title: 'Synthetic Simulation', body: 'All telemetry is SDE-generated. Microbial kinetics, rainfall, and biofouling are phenomenological. Not validated on commercial ponds.' },
            { title: 'Quantile Calibration', body: 'Empirical 90% interval coverage is 74.36%. Conformal prediction needed before treating intervals as calibrated.' },
            { title: 'Detection Latency', body: '75-minute figure is scenario-specific. Not an advance warning guarantee for all failure modes.' },
            { title: 'Hardware Boundary', body: 'Physical sensors and ESP32 firmware are the hardware scope. POST /api/telemetry webhook is tested and ready for field integration.' },
          ].map((item, i) => (
            <div key={i} className="panel-raised p-3.5">
              <h4 className="text-xs font-semibold text-txt-1 mb-1">{i + 1}. {item.title}</h4>
              <p className="text-[11px] text-txt-3 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
