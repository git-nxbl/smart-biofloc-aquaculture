import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: number | undefined;
  unit: string;
  icon: React.ReactNode;
  min?: number;
  max?: number;
  optimalRange: string;
  status: 'optimal' | 'warning' | 'critical';
  delta?: number;
  statusLabel?: string;
  subValue?: string | number;
  subLabel?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  icon,
  min,
  max,
  optimalRange,
  status,
  delta,
  statusLabel,
  subValue,
  subLabel,
}) => {
  const accentColor =
    status === 'critical' ? 'border-l-critical' :
    status === 'warning' ? 'border-l-gold' :
    'border-l-aqua';

  const valueColor =
    status === 'critical' ? 'text-critical' :
    status === 'warning' ? 'text-gold' :
    'text-txt-1';

  const statusBg =
    status === 'critical' ? 'bg-critical/10 text-critical' :
    status === 'warning' ? 'bg-gold/10 text-gold' :
    'bg-aqua/10 text-aqua';

  return (
    <div className={`panel p-4 border-l-[3px] ${accentColor} hover:bg-depth-raised/50 transition-colors`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-txt-3">{icon}</span>
          <span className="text-xs font-medium text-txt-2 truncate">{title}</span>
        </div>
        {statusLabel && (
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusBg}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-2">
        <span className={`data-value text-2xl lg:text-3xl ${valueColor}`}>
          {value !== undefined ? value.toFixed(2) : '—'}
        </span>
        <span className="text-xs text-txt-3">{unit}</span>

        {delta !== undefined && (
          <span className="ml-auto flex items-center text-xs font-mono">
            {delta > 0.01 ? (
              <span className="flex items-center text-aqua">
                <ArrowUpRight className="w-3.5 h-3.5" />+{delta.toFixed(2)}
              </span>
            ) : delta < -0.01 ? (
              <span className="flex items-center text-gold">
                <ArrowDownRight className="w-3.5 h-3.5" />{delta.toFixed(2)}
              </span>
            ) : (
              <span className="flex items-center text-txt-3">
                <Minus className="w-3 h-3" />0.00
              </span>
            )}
          </span>
        )}
      </div>

      {/* Sub value */}
      {subValue !== undefined && (
        <div className="mt-2 px-2.5 py-1 rounded bg-depth-abyss/50 flex items-center justify-between text-[11px] font-mono">
          <span className="text-txt-3">{subLabel}</span>
          <span className="text-gold font-semibold">{subValue} mg/L</span>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2.5 border-t border-edge flex items-center justify-between text-[11px] text-txt-3 font-mono">
        <span>Target: <span className="text-txt-2">{optimalRange}</span></span>
        {min !== undefined && max !== undefined && (
          <span>{min.toFixed(2)}–{max.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
};
