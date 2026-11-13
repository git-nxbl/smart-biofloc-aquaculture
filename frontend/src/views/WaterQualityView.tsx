import React, { useState } from 'react';
import { Droplets, Thermometer, FlaskConical, Gauge } from 'lucide-react';

export const WaterQualityView: React.FC = () => {
  const [calcTAN, setCalcTAN] = useState(0.80);
  const [calcPH, setCalcPH] = useState(7.85);
  const [calcTemp, setCalcTemp] = useState(28.5);

  const tempK = calcTemp + 273.15;
  const pKa = 0.09018 + 2729.92 / tempK;
  const f = 1.0 / (Math.pow(10, pKa - calcPH) + 1.0);
  const calcNH3 = calcTAN * f;

  const tox = calcNH3 < 0.02
    ? { level: 'Safe', color: 'text-aqua', bg: 'bg-aqua/10 border-aqua/20', desc: 'Below threshold for L. vannamei and tilapia.' }
    : calcNH3 < 0.05
    ? { level: 'Elevated', color: 'text-gold', bg: 'bg-gold/10 border-gold/20', desc: 'Sub-lethal stress may begin at sustained exposure.' }
    : { level: 'Dangerous', color: 'text-critical', bg: 'bg-critical/10 border-critical/20', desc: 'Acute toxicity risk. Immediate intervention required.' };

  const params = [
    { title: 'Dissolved Oxygen', icon: <Gauge className="w-4 h-4" />, target: '> 5.0 mg/L', color: 'border-l-aqua',
      body: 'The most critical parameter. Heterotrophic bacteria in the biofloc matrix create massive oxygen demand. A mechanical aeration failure causes exponential DO decay, reaching hypoxic levels within 1–2 hours.' },
    { title: 'Total Ammonia (TAN)', icon: <FlaskConical className="w-4 h-4" />, target: '< 0.80 mg/L', color: 'border-l-gold',
      body: 'TAN is the sum of ionized NH₄⁺ and toxic unionized NH₃. In biofloc systems, heterotrophic bacteria assimilate ammonia into single-cell protein when sufficient carbon is available.' },
    { title: 'pH Buffer', icon: <Droplets className="w-4 h-4" />, target: '7.2 – 8.2', color: 'border-l-purple-400',
      body: 'pH governs the carbonate-bicarbonate buffering and directly influences the ammonia equilibrium. Photosynthetic activity elevates pH during daylight, shifting the toxic NH₃ fraction upward.' },
    { title: 'Water Temperature', icon: <Thermometer className="w-4 h-4" />, target: '26 – 30 °C', color: 'border-l-orange-400',
      body: 'Temperature governs metabolic rate (Q₁₀ ≈ 2.0), doubling biological oxygen demand per 10°C elevation. Physical DO saturation drops from ~8.2 mg/L at 24°C to ~7.4 mg/L at 32°C.' },
  ];

  const sliderCls = "w-full h-1.5 rounded-full appearance-none bg-depth-float accent-aqua cursor-pointer";

  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Droplets className="w-5 h-5 text-aqua" />
        <div>
          <h1 className="text-xl font-heading font-bold text-txt-1">Water Quality Parameters</h1>
          <p className="text-xs text-txt-3 mt-0.5">Biofloc water chemistry — thresholds, interactions, and equilibria</p>
        </div>
      </div>

      {/* Parameter panels — 2-column with colored accent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {params.map((p, i) => (
          <div key={i} className={`panel p-5 border-l-[3px] ${p.color}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-txt-3">{p.icon}</span>
              <h3 className="text-sm font-semibold text-txt-1">{p.title}</h3>
              <span className="ml-auto text-[10px] font-mono text-txt-3">{p.target}</span>
            </div>
            <p className="text-xs text-txt-2 leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>

      {/* Emerson Calculator */}
      <div className="panel p-6 relative overflow-hidden">
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gold/[0.03] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <FlaskConical className="w-5 h-5 text-gold" />
            <div>
              <h2 className="text-lg font-heading font-bold text-txt-1">Emerson NH₃ Equilibrium Calculator</h2>
              <p className="text-[11px] text-txt-3">Emerson et al. (1975) temperature-pH model for toxic unionized ammonia</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Controls */}
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-txt-2">Total Ammonia (TAN)</span>
                  <span className="data-value text-gold">{calcTAN.toFixed(2)} <span className="text-txt-3 text-xs font-normal">mg/L</span></span>
                </div>
                <input type="range" min={0.05} max={3.0} step={0.05} value={calcTAN} onChange={e => setCalcTAN(Number(e.target.value))} className={sliderCls} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-txt-2">pH</span>
                  <span className="data-value text-purple-400">{calcPH.toFixed(2)}</span>
                </div>
                <input type="range" min={6.5} max={9.5} step={0.05} value={calcPH} onChange={e => setCalcPH(Number(e.target.value))} className={sliderCls} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-txt-2">Temperature</span>
                  <span className="data-value text-orange-400">{calcTemp.toFixed(1)} <span className="text-txt-3 text-xs font-normal">°C</span></span>
                </div>
                <input type="range" min={20.0} max={36.0} step={0.5} value={calcTemp} onChange={e => setCalcTemp(Number(e.target.value))} className={sliderCls} />
              </div>

              <div className="text-[11px] text-txt-3 font-mono pt-2 border-t border-edge">
                pKa = 0.09018 + 2729.92 / T(K) = {pKa.toFixed(4)}
              </div>
            </div>

            {/* Results */}
            <div className="space-y-4">
              <div>
                <div className="text-[11px] text-txt-3 uppercase tracking-wide mb-2">Calculated Toxic NH₃</div>
                <div className={`data-value text-5xl ${tox.color}`}>{calcNH3.toFixed(4)}</div>
                <div className="text-xs text-txt-3 font-mono mt-1">mg/L unionized ammonia</div>
              </div>

              <div>
                <div className="text-[11px] text-txt-3 uppercase tracking-wide mb-2">NH₃ Molar Fraction</div>
                <div className="data-value text-2xl text-txt-1">{(f * 100).toFixed(2)}%</div>
              </div>

              <div className={`p-3 rounded-lg border ${tox.bg}`}>
                <div className={`text-sm font-semibold ${tox.color}`}>{tox.level}</div>
                <div className="text-xs text-txt-2 mt-1">{tox.desc}</div>
              </div>

              {/* Visual NH3 gauge */}
              <div>
                <div className="h-2 bg-depth-abyss rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-aqua via-gold to-critical rounded-full" style={{ width: `${Math.min(100, (calcNH3 / 0.1) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-txt-3 font-mono mt-1">
                  <span>0</span>
                  <span className="text-aqua">0.02 Safe</span>
                  <span className="text-gold">0.05 Elevated</span>
                  <span className="text-critical">0.10+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
