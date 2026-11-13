import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, ReferenceArea,
} from 'recharts';
import { ChartDataPoint } from '../types';

interface TelemetryChartProps {
  data: ChartDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const doVal = payload.find((p: any) => p.dataKey === 'dissolved_oxygen_mgl')?.value;
    const tanVal = payload.find((p: any) => p.dataKey === 'tan_mgl')?.value;
    return (
      <div className="bg-depth-mid/95 backdrop-blur-md border border-edge-strong rounded-lg px-4 py-3 shadow-xl">
        <div className="text-[11px] text-txt-3 font-mono mb-2">{label}</div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-aqua" />
              <span className="text-txt-2">Dissolved Oxygen</span>
            </span>
            <span className="data-value text-sm text-aqua">{doVal?.toFixed(2) ?? '—'} <span className="text-txt-3 text-[10px] font-normal">mg/L</span></span>
          </div>
          <div className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-gold" />
              <span className="text-txt-2">TAN</span>
            </span>
            <span className="data-value text-sm text-gold">{tanVal?.toFixed(3) ?? '—'} <span className="text-txt-3 text-[10px] font-normal">mg/L</span></span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ data }) => {
  return (
    <div className="chart-surface">
      {/* Chart header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-txt-1">Primary Telemetry Stream</h3>
          <p className="text-[11px] text-txt-3 mt-0.5">DO & TAN · Sliding {data.length}-point window</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-txt-3">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-[2px] rounded bg-aqua" /> DO
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-[2px] rounded bg-gold" /> TAN
          </span>
        </div>
      </div>

      <div className="h-72 sm:h-80 lg:h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
            <defs>
              <linearGradient id="doGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2dd4a8" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#2dd4a8" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="none" />

            {/* Danger zone: DO < 4 */}
            <ReferenceArea yAxisId="left" y1={2} y2={4} fill="rgba(240,72,72,0.04)" />

            <XAxis
              dataKey="time"
              stroke="transparent"
              tick={{ fontSize: 10, fill: '#5e6e82' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              domain={[2.0, 10.0]}
              stroke="transparent"
              tick={{ fontSize: 10, fill: '#5e6e82' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0.0, 2.5]}
              stroke="transparent"
              tick={{ fontSize: 10, fill: '#5e6e82' }}
              tickLine={false}
              axisLine={false}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(45,212,168,0.2)', strokeWidth: 1 }} />

            <ReferenceLine yAxisId="left" y={5.0} stroke="#2dd4a8" strokeDasharray="6 4" strokeOpacity={0.35} />
            <ReferenceLine yAxisId="left" y={4.0} stroke="#f04848" strokeDasharray="6 4" strokeOpacity={0.3} />
            <ReferenceLine yAxisId="right" y={1.0} stroke="#e8a838" strokeDasharray="6 4" strokeOpacity={0.3} />

            <Line
              yAxisId="left"
              type="monotone"
              dataKey="dissolved_oxygen_mgl"
              stroke="#2dd4a8"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#2dd4a8', stroke: '#111921', strokeWidth: 3 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="tan_mgl"
              stroke="#e8a838"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: '#e8a838', stroke: '#111921', strokeWidth: 3 }}
              isAnimationActive={false}
              strokeOpacity={0.8}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Threshold legend */}
      <div className="flex items-center gap-5 mt-3 pt-3 border-t border-edge text-[10px] text-txt-3 font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-px border-t border-dashed border-aqua opacity-50" /> Optimal DO ≥ 5.0
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-px border-t border-dashed border-critical opacity-50" /> Critical DO &lt; 4.0
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-px border-t border-dashed border-gold opacity-50" /> TAN Warning &gt; 1.0
        </span>
      </div>
    </div>
  );
};
