import React, { useState, useEffect } from 'react';
import { RefreshCw, Cpu, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

interface TechnologyViewProps { onOpenESP32Modal: () => void; }

interface ServiceHealth { status: string; questdb: string; mqtt_worker: string; broadcaster_backend: string; }

const layers = [
  { num: '01', title: 'Edge Ingestion & Simulation', tech: 'Python 3.11 · NumPy · aiomqtt', color: 'border-l-aqua',
    desc: 'Coupled Ornstein-Uhlenbeck SDEs generate mean-reverting environmental telemetry via Euler-Maruyama. HTTP webhook (POST /api/telemetry) supports physical ESP32 MCUs.' },
  { num: '02', title: 'IoT Message Broker', tech: 'Eclipse Mosquitto 2.0 · Port 1883', color: 'border-l-info',
    desc: 'MQTT broker handling telemetry/tank/# subscription and bidirectional scenario dispatch (telemetry/control/scenario). QoS 1 at-least-once delivery.' },
  { num: '03', title: 'Telemetry Core & Chemical Engine', tech: 'FastAPI · Uvicorn · Port 8000', color: 'border-l-aqua',
    desc: 'Async event loop with Pydantic v2 validation, Emerson 1975 NH₃ derivation, FIFO broadcast fanout, and SSE streaming (/api/stream).' },
  { num: '04', title: 'Time-Series Database', tech: 'QuestDB · ILP 9009 · HTTP 9000', color: 'border-l-gold',
    desc: 'Columnar storage via Influx Line Protocol over raw TCP. Partition-pruned SQL for historical analytics and ML feature extraction.' },
  { num: '05', title: 'Predictive Intelligence', tech: 'LightGBM · Scikit-Learn · ADWIN', color: 'border-l-purple-400',
    desc: '27-feature gradient-boosted regressor with quantile intervals (α=0.05, 0.95). ADWIN-inspired delayed forecast-residual drift detection.' },
  { num: '06', title: 'Client Application', tech: 'React 18 · TypeScript · Vite · Nginx', color: 'border-l-aqua',
    desc: 'Reactive UI consuming SSE, rendering sliding-window Recharts, interactive Emerson calculator, and scenario simulation controllers.' },
];

export const TechnologyView: React.FC<TechnologyViewProps> = ({ onOpenESP32Modal }) => {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try { const r = await fetch('/api/health'); if (r.ok) setHealth(await r.json()); }
    catch {} finally { setLoading(false); }
  };
  useEffect(() => { fetchHealth(); const t = setInterval(fetchHealth, 10000); return () => clearInterval(t); }, []);

  const services = [
    { label: 'Backend Core', value: health?.status === 'healthy' ? 'Healthy' : '—', port: 'FastAPI :8000', ok: health?.status === 'healthy' },
    { label: 'Time-Series DB', value: health?.questdb ?? '—', port: 'QuestDB :9009', ok: health?.questdb === 'connected' },
    { label: 'MQTT Worker', value: health?.mqtt_worker ?? '—', port: 'Mosquitto :1883', ok: health?.mqtt_worker === 'running' },
    { label: 'Broadcaster', value: health?.broadcaster_backend ?? '—', port: 'Async FIFO', ok: !!health },
  ];

  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-aqua" />
          <div>
            <h1 className="text-xl font-heading font-bold text-txt-1">Platform Architecture</h1>
            <p className="text-xs text-txt-3 mt-0.5">Containerized microservices, async messaging, time-series storage</p>
          </div>
        </div>
        <button onClick={onOpenESP32Modal} className="flex items-center gap-2 px-4 py-2 bg-depth-surface border border-edge rounded-lg text-sm text-txt-2 hover:text-aqua hover:border-edge-accent transition">
          <Cpu className="w-4 h-4" /> ESP32 Test
        </button>
      </div>

      {/* Service health matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {services.map((s, i) => (
          <div key={i} className="panel p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-txt-3">{s.label}</span>
              {s.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-aqua" /> : <XCircle className="w-3.5 h-3.5 text-critical" />}
            </div>
            <div className={`data-value text-lg ${s.ok ? 'text-aqua' : 'text-critical'}`}>{s.value}</div>
            <div className="text-[10px] text-txt-3 font-mono mt-1">{s.port}</div>
          </div>
        ))}
      </div>

      {/* Pipeline flow */}
      <div className="panel p-5 overflow-x-auto">
        <div className="text-xs text-txt-3 mb-3">End-to-end data flow</div>
        <div className="flex items-center gap-3 min-w-max">
          {['ESP32 / SDE', 'MQTT Broker', 'FastAPI Core', 'QuestDB', 'LightGBM + ADWIN', 'AquaSense UI'].map((node, i, a) => (
            <React.Fragment key={i}>
              <div className="px-4 py-2.5 rounded-lg bg-depth-raised border border-edge text-xs font-medium text-txt-1 text-center shrink-0">
                {node}
              </div>
              {i < a.length - 1 && (
                <ArrowRight className="w-4 h-4 text-aqua/50 shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Architecture layers */}
      <div className="space-y-2">
        {layers.map((layer, i) => (
          <div key={i} className={`panel p-5 border-l-[3px] ${layer.color}`}>
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="shrink-0">
                <span className="data-value text-lg text-txt-3">{layer.num}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                  <h3 className="text-sm font-semibold text-txt-1">{layer.title}</h3>
                  <span className="text-[10px] font-mono text-txt-3">{layer.tech}</span>
                </div>
                <p className="text-xs text-txt-2 leading-relaxed">{layer.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button onClick={fetchHealth} disabled={loading} className="flex items-center gap-1.5 text-xs text-txt-3 hover:text-txt-1 transition">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh health
        </button>
        <a href="http://localhost:9000" target="_blank" rel="noreferrer" className="text-xs text-aqua hover:text-aqua-bright transition">
          Open QuestDB Console →
        </a>
      </div>
    </div>
  );
};
