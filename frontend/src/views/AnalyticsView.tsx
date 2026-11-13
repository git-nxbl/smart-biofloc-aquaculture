import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

interface HistoryRecord {
  timestamp: string;
  tank_id: string;
  sensors: { ph: number; temperature_c: number; dissolved_oxygen_mgl: number; tan_mgl: number; };
}

export const AnalyticsView: React.FC = () => {
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(100);
  const [selectedParam, setSelectedParam] = useState<'dissolved_oxygen_mgl' | 'tan_mgl' | 'ph' | 'temperature_c'>('dissolved_oxygen_mgl');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/telemetry/history?tank_id=tank_01&limit=${limit}`);
      if (res.ok) { const json = await res.json(); setHistoryData(json.data || []); }
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { fetchHistory(); }, [limit]);

  const chartData = useMemo(() => historyData.map(r => ({
    time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    dissolved_oxygen_mgl: r.sensors.dissolved_oxygen_mgl,
    tan_mgl: r.sensors.tan_mgl,
    ph: r.sensors.ph,
    temperature_c: r.sensors.temperature_c,
  })), [historyData]);

  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const v = chartData.map(d => d[selectedParam]);
    const mn = Math.min(...v), mx = Math.max(...v), avg = v.reduce((a,b) => a+b, 0) / v.length;
    const std = Math.sqrt(v.reduce((a,x) => a + (x-avg)**2, 0) / v.length);
    return { min: mn, max: mx, mean: avg, std, count: v.length };
  }, [chartData, selectedParam]);

  const paramMeta: Record<string, { label: string; color: string; short: string }> = {
    dissolved_oxygen_mgl: { label: 'Dissolved Oxygen (mg/L)', color: '#2dd4a8', short: 'DO' },
    tan_mgl: { label: 'Total Ammonia (mg/L)', color: '#e8a838', short: 'TAN' },
    ph: { label: 'pH', color: '#a78bfa', short: 'pH' },
    temperature_c: { label: 'Temperature (°C)', color: '#fb923c', short: 'Temp' },
  };
  const pm = paramMeta[selectedParam];

  return (
    <div className="animate-fade-in p-4 lg:p-6 space-y-4">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-heading font-bold text-txt-1">Historical Analytics</h1>
          <p className="text-xs text-txt-3 mt-0.5">Explore water quality trends from QuestDB storage</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-depth-surface rounded-lg p-0.5 border border-edge">
            {[50, 100, 200, 500].map(n => (
              <button key={n} onClick={() => setLimit(n)} className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${limit === n ? 'bg-depth-float text-txt-1' : 'text-txt-3 hover:text-txt-2'}`}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={fetchHistory} className="p-2 rounded-lg bg-depth-surface border border-edge text-txt-3 hover:text-txt-1 transition" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Parameter tabs */}
      <div className="flex items-center gap-1">
        {Object.entries(paramMeta).map(([key, val]) => (
          <button key={key} onClick={() => setSelectedParam(key as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              selectedParam === key
                ? 'text-depth-deep font-semibold'
                : 'text-txt-3 hover:text-txt-2 bg-depth-surface border border-edge'
            }`}
            style={selectedParam === key ? { backgroundColor: val.color } : undefined}
          >
            {val.short}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Stats panel */}
        {stats && (
          <div className="panel p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs text-txt-3 mb-1">
              <Clock className="w-3.5 h-3.5" /> Summary
            </div>
            {[
              { label: 'Observations', value: stats.count.toString() },
              { label: 'Minimum', value: stats.min.toFixed(3) },
              { label: 'Maximum', value: stats.max.toFixed(3) },
              { label: 'Mean', value: stats.mean.toFixed(3) },
              { label: 'Std Dev', value: stats.std.toFixed(4) },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[10px] text-txt-3 uppercase tracking-wide">{s.label}</div>
                <div className="data-value text-lg" style={{ color: pm.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Primary chart */}
        <div className="lg:col-span-3 chart-surface">
          <div className="text-sm font-semibold text-txt-1 mb-1">{pm.label}</div>
          <p className="text-[11px] text-txt-3 mb-4">Last {limit} observations from QuestDB</p>
          <div className="h-72 sm:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={pm.color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={pm.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="time" stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
                <YAxis stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111921', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey={selectedParam} stroke={pm.color} fill="url(#areaFill)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Overlay chart */}
      <div className="chart-surface">
        <div className="text-sm font-semibold text-txt-1 mb-1">Multi-Parameter Overlay</div>
        <div className="flex items-center gap-4 text-[11px] text-txt-3 mb-4">
          <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] rounded bg-aqua" /> DO</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] rounded bg-gold" /> TAN</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-[2px] rounded bg-purple-400" /> pH</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
              <YAxis stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#111921', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="dissolved_oxygen_mgl" stroke="#2dd4a8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="tan_mgl" stroke="#e8a838" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="ph" stroke="#a78bfa" strokeWidth={1} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data table */}
      {chartData.length > 0 && (
        <div className="panel p-4">
          <div className="text-sm font-semibold text-txt-1 mb-3">Recent Observations</div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Time</th><th>DO (mg/L)</th><th>TAN (mg/L)</th><th>pH</th><th>Temp (°C)</th></tr></thead>
              <tbody>
                {chartData.slice(-15).reverse().map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-[11px]">{r.time}</td>
                    <td className="font-mono text-aqua">{r.dissolved_oxygen_mgl.toFixed(2)}</td>
                    <td className="font-mono text-gold">{r.tan_mgl.toFixed(3)}</td>
                    <td className="font-mono">{r.ph.toFixed(2)}</td>
                    <td className="font-mono">{r.temperature_c.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
