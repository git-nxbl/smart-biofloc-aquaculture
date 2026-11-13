import React from 'react';

interface SystemTopologyProps { streamConnected: boolean; }

const pipeline = [
  { label: 'ESP32 / SDE', sub: '5-min intervals', color: 'bg-aqua' },
  { label: 'MQTT', sub: 'Mosquitto :1883', color: 'bg-info' },
  { label: 'FastAPI', sub: 'Async :8000', color: 'bg-aqua' },
  { label: 'QuestDB', sub: 'ILP :9009', color: 'bg-gold' },
  { label: 'LightGBM', sub: 'DO Forecast', color: 'bg-purple-400' },
  { label: 'AquaSense', sub: 'SSE + UI', color: 'bg-aqua' },
];

export const SystemTopology: React.FC<SystemTopologyProps> = () => (
  <div className="flex items-center gap-2 overflow-x-auto py-2">
    {pipeline.map((node, i) => (
      <React.Fragment key={i}>
        <div className="panel px-4 py-3 min-w-[110px] text-center shrink-0">
          <div className={`w-2 h-2 rounded-full ${node.color} mx-auto mb-2`} />
          <div className="text-xs font-semibold text-txt-1">{node.label}</div>
          <div className="text-[10px] text-txt-3 font-mono mt-0.5">{node.sub}</div>
        </div>
        {i < pipeline.length - 1 && (
          <div className="flex items-center shrink-0">
            <div className="w-6 h-px bg-gradient-to-r from-edge-strong to-transparent" />
            <div className="w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-transparent border-l-txt-3/30" />
          </div>
        )}
      </React.Fragment>
    ))}
  </div>
);
