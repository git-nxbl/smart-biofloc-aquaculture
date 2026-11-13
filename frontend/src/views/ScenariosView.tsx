import React, { useMemo } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Wind,
  Utensils,
  TrendingDown,
  Activity,
  Loader2,
  Cpu,
  Radio,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { ChartDataPoint } from '../types';

interface ScenariosViewProps {
  activeScenario: string;
  onSelectScenario: (scenario: string) => void;
  dataPoints: ChartDataPoint[];
  isDispatching?: boolean;
}

export interface ScenarioItem {
  id: string;
  name: string;
  category: string;
  borderColor: string;
  activeColor: string;
  badgeClass: string;
  icon: React.ElementType;
  desc: string;
  impact: string;
  params: {
    target: string;
    rate: string;
    duration: string;
    driftRisk: string;
  };
}

const scenarios: ScenarioItem[] = [
  {
    id: 'normal',
    name: 'Normal Operation',
    category: 'Baseline',
    borderColor: 'border-l-aqua',
    activeColor: 'bg-aqua/10 border-aqua/40 ring-1 ring-aqua/30',
    badgeClass: 'text-aqua bg-aqua/10 border-aqua/30',
    icon: Activity,
    desc: 'Stable diurnal cycling. Dissolved oxygen fluctuates naturally between 5.0–7.2 mg/L. Heterotrophic and autotrophic biofloc microbes actively assimilate total ammonia nitrogen.',
    impact: 'DO: 5.0–7.2 mg/L | TAN: < 0.50 mg/L | pH: 7.7–8.0',
    params: {
      target: 'μ_DO = 5.80 ± 1.50 mg/L (diurnal)',
      rate: 'θ_DO = 0.40 h⁻¹',
      duration: 'Continuous steady-state',
      driftRisk: 'Low (ADWIN stable)',
    },
  },
  {
    id: 'aerator_failure',
    name: 'Aerator / Blower Failure',
    category: 'Critical Hazard',
    borderColor: 'border-l-critical',
    activeColor: 'bg-critical/10 border-critical/40 ring-1 ring-critical/30',
    badgeClass: 'text-critical bg-critical/10 border-critical/30',
    icon: Wind,
    desc: 'Simulated total mechanical blower blackout. Dense biofloc flocs exert massive biological oxygen demand, causing rapid exponential DO decay toward lethal hypoxia (< 2.5 mg/L).',
    impact: 'DO: Rapid drop to ~1.8 mg/L | Lethal hypoxia risk within 1–2h',
    params: {
      target: 'Hypoxic floor = 1.80 mg/L',
      rate: 'Decay θ = 1.20 h⁻¹',
      duration: 'Sustained until recovery command',
      driftRisk: 'High (Triggers ADWIN drift alert)',
    },
  },
  {
    id: 'aerator_recovery',
    name: 'Aeration Restored',
    category: 'Remediation',
    borderColor: 'border-l-teal-400',
    activeColor: 'bg-teal-500/10 border-teal-400/40 ring-1 ring-teal-400/30',
    badgeClass: 'text-teal-300 bg-teal-500/10 border-teal-400/30',
    icon: RotateCcw,
    desc: 'Emergency backup blowers engaged. System exhibits asymptotic re-oxygenation back toward healthy saturation (> 5.8 mg/L), automatically transitioning back to Normal once stabilized.',
    impact: 'DO: Rapid rebound to > 5.8 mg/L | Self-stabilizing',
    params: {
      target: 'μ_DO = 6.20 mg/L',
      rate: 'Recovery θ = 0.80 h⁻¹',
      duration: 'Auto-resets to Normal after 12 steps',
      driftRisk: 'Transient shift',
    },
  },
  {
    id: 'feeding',
    name: 'Feeding Event (TAN Pulse)',
    category: 'Operational',
    borderColor: 'border-l-gold',
    activeColor: 'bg-gold/10 border-gold/40 ring-1 ring-gold/30',
    badgeClass: 'text-gold bg-gold/10 border-gold/30',
    icon: Utensils,
    desc: 'Scheduled or heavy feed distribution. Shrimp digestion and uneaten feed cause a transient post-prandial total ammonia nitrogen (TAN) spike accompanied by a slight respiratory oxygen dip.',
    impact: 'TAN: Rises to ~1.60 mg/L | DO: Dips -0.60 mg/L | Self-clearing',
    params: {
      target: 'μ_TAN = 1.60 mg/L',
      rate: 'θ_TAN = 0.35 h⁻¹',
      duration: 'Pulse lasts ~2h (24 steps)',
      driftRisk: 'Moderate transient',
    },
  },
  {
    id: 'organic_overload',
    name: 'Organic Overload / pH Crash',
    category: 'Biochemical Drift',
    borderColor: 'border-l-purple-400',
    activeColor: 'bg-purple-500/10 border-purple-400/40 ring-1 ring-purple-400/30',
    badgeClass: 'text-purple-400 bg-purple-500/10 border-purple-400/30',
    icon: TrendingDown,
    desc: 'Cumulative sludge accumulation and biofloc lysis overwhelm nitrifying bacteria. Causes sustained high TAN, severe alkalinity consumption, and dangerous acidification (pH drop).',
    impact: 'TAN: Elevated to > 2.40 mg/L | pH: Depressed -0.35 | Toxic NH₃ danger',
    params: {
      target: 'μ_TAN = 2.40 mg/L, pH -0.35',
      rate: 'θ_TAN = 0.20 h⁻¹',
      duration: 'Persistent until manual intervention',
      driftRisk: 'Severe drift (Triggers ADWIN drift alert)',
    },
  },
];

export const ScenariosView: React.FC<ScenariosViewProps> = ({
  activeScenario,
  onSelectScenario,
  dataPoints,
  isDispatching = false,
}) => {
  const chartData = useMemo(
    () =>
      dataPoints.slice(-35).map((d) => ({
        time: d.time,
        DO: d.dissolved_oxygen_mgl,
        TAN: d.tan_mgl,
      })),
    [dataPoints]
  );

  // Normalize active scenario matching (handles aliases if server returns variation)
  const normalizedActiveId = useMemo(() => {
    const s = activeScenario?.toLowerCase().trim();
    if (s === 'blower_failure') return 'aerator_failure';
    if (s === 'feed_spike') return 'feeding';
    if (s === 'ph_crash') return 'organic_overload';
    return s || 'normal';
  }, [activeScenario]);

  const active = scenarios.find((s) => s.id === normalizedActiveId) || scenarios[0];
  const ActiveIcon = active.icon;

  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-edge/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-aqua/10 border border-aqua/25 text-aqua">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-heading font-bold text-txt-1">Scenario Simulation</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-edge font-mono text-txt-3">
                SDE Ornstein-Uhlenbeck
              </span>
            </div>
            <p className="text-xs text-txt-3 mt-0.5">
              Inject dynamic operational disturbances and failure modes via MQTT control pipeline
            </p>
          </div>
        </div>

        {/* Global reset button when abnormal */}
        {normalizedActiveId !== 'normal' && (
          <button
            onClick={() => onSelectScenario('normal')}
            disabled={isDispatching}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-depth-float hover:bg-depth-raised border border-edge hover:border-edge-accent text-xs font-medium text-txt-2 hover:text-txt-1 transition self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5 text-aqua" />
            Reset to Normal Baseline
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Scenario selector — left column (5 cols) */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-txt-3">
              Available Scenarios ({scenarios.length})
            </span>
            <span className="text-[11px] text-txt-3">Click to trigger</span>
          </div>

          {scenarios.map((s) => {
            const isCurrent = normalizedActiveId === s.id;
            const Icon = s.icon;

            return (
              <button
                key={s.id}
                onClick={() => onSelectScenario(s.id)}
                disabled={isDispatching && isCurrent}
                className={`w-full text-left panel p-4 border-l-[4px] ${s.borderColor} transition-all duration-150 relative ${
                  isCurrent
                    ? `${s.activeColor} shadow-md`
                    : 'hover:bg-depth-raised/60 hover:border-edge-accent'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={`w-4 h-4 ${isCurrent ? 'text-txt-1' : 'text-txt-3'}`} />
                    <span className="text-sm font-semibold text-txt-1">{s.name}</span>
                    <span
                      className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${s.badgeClass}`}
                    >
                      {s.category}
                    </span>
                  </div>

                  {isCurrent ? (
                    <div className="flex items-center gap-1 text-aqua text-xs font-semibold shrink-0">
                      {isDispatching ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span className="text-[11px]">Syncing</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[11px] hidden sm:inline">Active</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-txt-3 group-hover:text-txt-1 text-xs shrink-0">
                      <Play className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-txt-3 leading-relaxed mb-2.5">{s.desc}</p>

                <div className="pt-2 border-t border-edge/40 flex items-center justify-between text-[10px]">
                  <span className="font-mono text-txt-2 truncate max-w-[280px]">
                    {s.impact}
                  </span>
                  <span className="text-txt-3 font-mono shrink-0 ml-2">
                    {s.params.duration}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Response chart & diagnostics — dominant right area (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Active scenario status banner */}
          <div className="panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-[4px] border-l-aqua">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-depth-deep border border-edge">
                <ActiveIcon className="w-5 h-5 text-aqua" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-txt-3">Active Operational State:</span>
                  <span className={`text-[10px] font-mono px-2 py-0.2 rounded border ${active.badgeClass}`}>
                    {active.category}
                  </span>
                </div>
                <div className="text-base font-heading font-bold text-txt-1">{active.name}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-depth-deep border border-edge">
                <div className="status-dot live" />
                <span className="text-xs text-txt-2 font-mono">Live SDE Stream</span>
              </div>
            </div>
          </div>

          {/* SDE Mathematical Dynamics Card */}
          <div className="panel p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-aqua" />
                <span className="text-xs font-semibold uppercase tracking-wider text-txt-2">
                  SDE Ornstein-Uhlenbeck Modulation
                </span>
              </div>
              <span className="text-[10px] font-mono text-txt-3">
                dX_t = θ(μ(t) - X_t)dt + σ dW_t
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div className="p-2 rounded bg-depth-deep/80 border border-edge/60">
                <div className="text-[10px] text-txt-3">Mean Target (μ)</div>
                <div className="font-mono font-medium text-txt-1 mt-0.5 text-[11px] truncate">
                  {active.params.target}
                </div>
              </div>
              <div className="p-2 rounded bg-depth-deep/80 border border-edge/60">
                <div className="text-[10px] text-txt-3">Reversion Rate (θ)</div>
                <div className="font-mono font-medium text-txt-1 mt-0.5 text-[11px]">
                  {active.params.rate}
                </div>
              </div>
              <div className="p-2 rounded bg-depth-deep/80 border border-edge/60">
                <div className="text-[10px] text-txt-3">Duration / Reset</div>
                <div className="font-mono font-medium text-txt-1 mt-0.5 text-[11px] truncate">
                  {active.params.duration}
                </div>
              </div>
              <div className="p-2 rounded bg-depth-deep/80 border border-edge/60">
                <div className="text-[10px] text-txt-3">Drift Alert Status</div>
                <div className="font-mono font-medium text-txt-1 mt-0.5 text-[11px]">
                  {active.params.driftRisk}
                </div>
              </div>
            </div>
          </div>

          {/* Response Chart Surface */}
          <div className="chart-surface">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm font-semibold text-txt-1">Live Telemetry Response Window</div>
                <div className="text-[11px] text-txt-3">Streaming last 35 stochastic increments</div>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-txt-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-[3px] rounded bg-aqua" /> DO (mg/L)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-[3px] rounded bg-gold" /> TAN (mg/L)
                </span>
              </div>
            </div>

            <div className="h-72 sm:h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: -10, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="transparent"
                    tick={{ fontSize: 10, fill: '#5e6e82' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="do"
                    domain={[1.0, 9.5]}
                    stroke="transparent"
                    tick={{ fontSize: 10, fill: '#5e6e82' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="tan"
                    orientation="right"
                    domain={[0, 3.5]}
                    stroke="transparent"
                    tick={{ fontSize: 10, fill: '#5e6e82' }}
                    tickLine={false}
                    axisLine={false}
                  />

                  {/* Danger Zone: DO < 4.0 mg/L */}
                  <ReferenceArea
                    yAxisId="do"
                    y1={1.0}
                    y2={4.0}
                    fill="#f04848"
                    fillOpacity={0.07}
                  />

                  {/* Safe DO Minimum Reference */}
                  <ReferenceLine
                    yAxisId="do"
                    y={5.0}
                    stroke="#2dd4a8"
                    strokeDasharray="5 3"
                    strokeOpacity={0.4}
                  />

                  {/* Critical Hypoxia Line */}
                  <ReferenceLine
                    yAxisId="do"
                    y={4.0}
                    stroke="#f04848"
                    strokeDasharray="5 3"
                    strokeOpacity={0.4}
                  />

                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111921',
                      borderColor: 'rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#8899a6', marginBottom: '4px' }}
                    formatter={(val: any, name: string) => [
                      `${Number(val).toFixed(2)} mg/L`,
                      name === 'DO' ? 'Dissolved Oxygen' : 'Total Ammonia Nitrogen',
                    ]}
                  />

                  <Line
                    yAxisId="do"
                    type="monotone"
                    dataKey="DO"
                    stroke="#2dd4a8"
                    strokeWidth={2.2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="tan"
                    type="monotone"
                    dataKey="TAN"
                    stroke="#e8a838"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[10px] text-txt-3 mt-2 px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-critical/60" /> Red shaded zone: Hypoxic danger (DO &lt; 4.0 mg/L)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-aqua/60" /> Dashed line: Target safety floor (5.0 mg/L)
              </span>
            </div>
          </div>

          {/* MQTT Pipeline Documentation Footer */}
          <div className="panel p-4 text-xs text-txt-3 leading-relaxed flex items-start gap-3 border-edge/60">
            <Radio className="w-4 h-4 text-aqua shrink-0 mt-0.5" />
            <div>
              <span className="text-txt-2 font-medium">Bidirectional Control Loop:</span> When you click a scenario, the frontend issues a{' '}
              <code className="px-1.5 py-0.5 rounded bg-depth-deep font-mono text-[11px] text-aqua">
                POST /api/simulator/scenario
              </code>{' '}
              request. FastAPI publishes a QoS 1 control packet to Mosquitto on{' '}
              <code className="px-1.5 py-0.5 rounded bg-depth-deep font-mono text-[11px] text-txt-2">
                telemetry/control/scenario
              </code>
              . The SDE simulator recalculates mean-reversion drift and volatility dynamically, and new telemetry broadcasts back via SSE within the next 5-second interval.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
