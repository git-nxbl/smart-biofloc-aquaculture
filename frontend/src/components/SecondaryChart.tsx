import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ChartDataPoint } from '../types';

interface SecondaryChartProps { data: ChartDataPoint[]; }

export const SecondaryChart: React.FC<SecondaryChartProps> = ({ data }) => (
  <div className="chart-surface">
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-semibold text-txt-1">Physicochemical Parameters</h3>
        <p className="text-[11px] text-txt-3 mt-0.5">pH buffer stability & diurnal water temperature</p>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-txt-3">
        <span className="flex items-center gap-1.5"><span className="w-5 h-[2px] rounded bg-purple-400" /> pH</span>
        <span className="flex items-center gap-1.5"><span className="w-5 h-[2px] rounded bg-orange-400" /> Temp</span>
      </div>
    </div>
    <div className="h-56 sm:h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="time" stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="ph" domain={[6.5, 9.0]} stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="temp" orientation="right" domain={[20, 36]} stroke="transparent" tick={{ fontSize: 10, fill: '#5e6e82' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: '#111921', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} labelStyle={{ color: '#5e6e82' }} />
          <Line yAxisId="ph" type="monotone" dataKey="ph" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line yAxisId="temp" type="monotone" dataKey="temperature_c" stroke="#fb923c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);
