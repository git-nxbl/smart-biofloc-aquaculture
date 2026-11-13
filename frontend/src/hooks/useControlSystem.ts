import { useState, useEffect, useCallback } from 'react';
import { ControlStatusResponse, ControlMode } from '../types';

export function useControlSystem(refreshIntervalMs: number = 3000) {
  const [status, setStatus] = useState<ControlStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/control/status');
      if (res.ok) {
        const data: ControlStatusResponse = await res.json();
        setStatus(data);
        setError(null);
      } else {
        setError(`Failed to fetch control status: ${res.statusText}`);
      }
    } catch (e: any) {
      setError(e.message || 'Network error fetching control status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (refreshIntervalMs <= 0) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchStatus, refreshIntervalMs]);

  const switchMode = useCallback(async (mode: ControlMode) => {
    setIsDispatching(true);
    try {
      const res = await fetch('/api/control/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        setLastActionMessage(`Switched control mode to ${mode}`);
        await fetchStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Failed to switch control mode');
      }
    } catch (e: any) {
      setError(e.message || 'Error switching control mode');
    } finally {
      setIsDispatching(false);
    }
  }, [fetchStatus]);

  const sendActuatorCommand = useCallback(async (
    actuator: string,
    state: string,
    reason: string = 'Operator command from Control Center'
  ): Promise<{ success: boolean; message: string; blockedReason?: string }> => {
    setIsDispatching(true);
    try {
      const res = await fetch('/api/control/actuator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actuator, state, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const msg = data.message || `Actuator command executed: ${actuator} → ${state}`;
        setLastActionMessage(msg);
        setError(null);
        await fetchStatus();
        return { success: true, message: msg };
      } else {
        const errMsg = data.blocked_reason || data.message || 'Command blocked or failed';
        setError(errMsg);
        setLastActionMessage(errMsg);
        await fetchStatus();
        return { success: false, message: errMsg, blockedReason: data.blocked_reason };
      }
    } catch (e: any) {
      const msg = e.message || 'Network error executing actuator command';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsDispatching(false);
    }
  }, [fetchStatus]);

  const evaluateRules = useCallback(async () => {
    try {
      const res = await fetch('/api/control/evaluate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.actions_taken && data.actions_taken.length > 0) {
          setLastActionMessage(`Automated actions: ${data.actions_taken.join('; ')}`);
        }
        await fetchStatus();
      }
    } catch (e) {
      console.debug('Rule evaluation ping error:', e);
    }
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    isDispatching,
    lastActionMessage,
    error,
    switchMode,
    sendActuatorCommand,
    evaluateRules,
    refreshStatus: fetchStatus,
  };
}
