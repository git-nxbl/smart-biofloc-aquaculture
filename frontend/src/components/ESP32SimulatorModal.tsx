import React, { useState } from 'react';
import { X, Send, Cpu, CheckCircle, AlertTriangle } from 'lucide-react';
import { TelemetryPayload } from '../types';

interface ESP32SimulatorModalProps { isOpen: boolean; onClose: () => void; }

export const ESP32SimulatorModal: React.FC<ESP32SimulatorModalProps> = ({ isOpen, onClose }) => {
  const [tankId, setTankId] = useState('tank_01');
  const [doVal, setDoVal] = useState('6.20');
  const [tanVal, setTanVal] = useState('0.45');
  const [phVal, setPhVal] = useState('7.85');
  const [tempVal, setTempVal] = useState('28.5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const loadPreset = (d: string, t: string, p: string, tp: string) => { setDoVal(d); setTanVal(t); setPhVal(p); setTempVal(tp); setResult(null); };

  const handleTransmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setResult(null);
    const payload: TelemetryPayload = {
      timestamp: new Date().toISOString(), tank_id: tankId,
      sensors: { ph: parseFloat(phVal), temperature_c: parseFloat(tempVal), dissolved_oxygen_mgl: parseFloat(doVal), tan_mgl: parseFloat(tanVal) },
    };
    try {
      const res = await fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { setResult({ success: true, message: 'HTTP 201: Ingested & persisted to QuestDB.' }); }
      else { const err = await res.text(); setResult({ success: false, message: `HTTP ${res.status}: ${err}` }); }
    } catch (err: any) { setResult({ success: false, message: `Network: ${err.message}` }); }
    finally { setIsSubmitting(false); }
  };

  const inputCls = "w-full bg-depth-abyss border border-edge rounded-lg px-3 py-2 text-sm text-txt-1 font-mono focus:outline-none focus:border-aqua/50 focus:ring-1 focus:ring-aqua/20 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg panel p-6 shadow-2xl relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-aqua/10 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-aqua" />
            </div>
            <div>
              <h3 className="text-base font-heading font-bold text-txt-1">ESP32 Webhook Test</h3>
              <p className="text-[11px] text-txt-3 font-mono">POST /api/telemetry</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-txt-3 hover:text-txt-1 transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <button type="button" onClick={() => loadPreset('6.80','0.40','7.90','28.6')} className="px-2.5 py-2 rounded-lg bg-aqua/5 hover:bg-aqua/10 border border-aqua/20 text-aqua text-xs font-medium transition">Optimal</button>
          <button type="button" onClick={() => loadPreset('3.30','0.75','7.40','27.5')} className="px-2.5 py-2 rounded-lg bg-critical/5 hover:bg-critical/10 border border-critical/20 text-critical text-xs font-medium transition">Hypoxia</button>
          <button type="button" onClick={() => loadPreset('5.50','1.85','8.20','29.2')} className="px-2.5 py-2 rounded-lg bg-gold/5 hover:bg-gold/10 border border-gold/20 text-gold text-xs font-medium transition">TAN Spike</button>
        </div>

        <form onSubmit={handleTransmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[11px] text-txt-3 block mb-1">Tank ID</label><input type="text" value={tankId} onChange={e=>setTankId(e.target.value)} className={inputCls} required /></div>
            <div><label className="text-[11px] text-txt-3 block mb-1">Temp (°C)</label><input type="number" step="0.1" value={tempVal} onChange={e=>setTempVal(e.target.value)} className={inputCls} required /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-[11px] text-txt-3 block mb-1">DO (mg/L)</label><input type="number" step="0.01" value={doVal} onChange={e=>setDoVal(e.target.value)} className={inputCls} required /></div>
            <div><label className="text-[11px] text-txt-3 block mb-1">TAN (mg/L)</label><input type="number" step="0.01" value={tanVal} onChange={e=>setTanVal(e.target.value)} className={inputCls} required /></div>
            <div><label className="text-[11px] text-txt-3 block mb-1">pH</label><input type="number" step="0.01" value={phVal} onChange={e=>setPhVal(e.target.value)} className={inputCls} required /></div>
          </div>
          {result && (
            <div className={`p-3 rounded-lg flex items-start gap-2 text-xs ${result.success ? 'bg-aqua/5 text-aqua border border-aqua/20' : 'bg-critical/5 text-critical border border-critical/20'}`}>
              {result.success ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{result.message}</span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-txt-3 hover:text-txt-1 transition">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-5 py-2 bg-aqua hover:bg-aqua-bright text-depth-deep text-sm font-semibold rounded-lg transition disabled:opacity-50">
              <Send className="w-3.5 h-3.5" />{isSubmitting ? 'Sending...' : 'Transmit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
