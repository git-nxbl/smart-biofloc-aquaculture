import { useEffect, useState, useRef, useCallback } from 'react';
import { ChartDataPoint, ConnectionStatus, MLForecast, TelemetryPayload } from '../types';

const MAX_POINTS = 50;

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString.slice(11, 19);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoString;
  }
}

function payloadToChartPoint(p: TelemetryPayload): ChartDataPoint {
  return {
    time: formatTime(p.timestamp),
    timestamp: p.timestamp,
    ph: Number(p.sensors.ph.toFixed(2)),
    temperature_c: Number(p.sensors.temperature_c.toFixed(1)),
    dissolved_oxygen_mgl: Number(p.sensors.dissolved_oxygen_mgl.toFixed(2)),
    tan_mgl: Number(p.sensors.tan_mgl.toFixed(2)),
    calculated_nh3_mgl: p.metadata?.calculated_nh3_mgl !== undefined ? Number(p.metadata.calculated_nh3_mgl.toFixed(4)) : undefined,
  };
}

export function useTelemetryStream(streamUrl: string = '/api/stream') {
  const [dataPoints, setDataPoints] = useState<ChartDataPoint[]>([]);
  const [latestPayload, setLatestPayload] = useState<TelemetryPayload | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [mlForecast, setMlForecast] = useState<MLForecast | null>(null);
  const [packetCount, setPacketCount] = useState<number>(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch ML Forecast
  const fetchForecast = useCallback(async () => {
    try {
      const res = await fetch('/api/ml/forecast');
      if (res.ok) {
        const json = await res.json();
        if (json.forecast) {
          setMlForecast(json.forecast);
        }
      }
    } catch {
      // Ignore transient network errors
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus('connecting');
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('connected');
    };

    // Bulk history backfill
    es.addEventListener('history', (event: MessageEvent) => {
      try {
        const historyData: TelemetryPayload[] = JSON.parse(event.data);
        if (Array.isArray(historyData) && historyData.length > 0) {
          const formatted = historyData.map(payloadToChartPoint);
          setDataPoints(formatted.slice(-MAX_POINTS));
          setLatestPayload(historyData[historyData.length - 1]);
          fetchForecast();
        }
      } catch (err) {
        console.error('Failed to parse history SSE event:', err);
      }
    });

    // Real-time telemetry updates
    es.addEventListener('telemetry', (event: MessageEvent) => {
      try {
        const payload: TelemetryPayload = JSON.parse(event.data);
        const point = payloadToChartPoint(payload);

        setLatestPayload(payload);
        setPacketCount((c) => c + 1);

        setDataPoints((prev) => {
          const next = [...prev, point];
          return next.slice(-MAX_POINTS);
        });

        // Trigger ML forecast refresh
        fetchForecast();
      } catch (err) {
        console.error('Failed to parse telemetry SSE event:', err);
      }
    });

    // Error handling
    es.onerror = () => {
      setStatus('reconnecting');
      es.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [streamUrl, fetchForecast]);

  useEffect(() => {
    connect();
    // Initial fetch of forecast
    fetchForecast();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, fetchForecast]);

  return {
    dataPoints,
    latestPayload,
    status,
    mlForecast,
    packetCount,
    reconnect: connect,
  };
}
