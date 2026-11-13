import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, List, Optional
import httpx
from .schemas import TelemetryPayload

logger = logging.getLogger("QuestDBClient")


class QuestDBClient:
    """
    Asynchronous QuestDB client supporting:
    - High-throughput Influx Line Protocol (ILP) over TCP (Port 9009)
    - Non-blocking SQL queries via HTTP REST API (Port 9000)
    """

    def __init__(
        self,
        host: str = "questdb",
        ilp_port: int = 9009,
        http_port: int = 9000,
    ):
        self.host = host
        self.ilp_port = ilp_port
        self.http_port = http_port
        self._writer: Optional[asyncio.StreamWriter] = None
        self._reader: Optional[asyncio.StreamReader] = None
        self._lock = asyncio.Lock()
        self._http_client = httpx.AsyncClient(
            base_url=f"http://{self.host}:{self.http_port}",
            timeout=5.0,
        )

    async def connect_ilp(self):
        """Establish non-blocking TCP socket to QuestDB ILP port."""
        if self._writer and not self._writer.is_closing():
            return
        try:
            self._reader, self._writer = await asyncio.open_connection(
                self.host, self.ilp_port
            )
            logger.info(f"Connected to QuestDB ILP at {self.host}:{self.ilp_port}")
        except Exception as e:
            logger.warning(f"Failed to connect to QuestDB ILP at {self.host}:{self.ilp_port}: {e}")
            self._writer = None
            self._reader = None

    def format_ilp_line(self, payload: TelemetryPayload) -> str:
        """Format a TelemetryPayload into Influx Line Protocol string."""
        try:
            ts_str = payload.timestamp
            if ts_str.endswith("Z"):
                dt = datetime.fromisoformat(ts_str[:-1] + "+00:00")
            else:
                dt = datetime.fromisoformat(ts_str)
            ns = int(dt.timestamp() * 1_000_000_000)
        except Exception:
            ns = int(datetime.now(timezone.utc).timestamp() * 1_000_000_000)

        sensors = payload.sensors
        return (
            f"telemetry,tank_id={payload.tank_id} "
            f"ph={sensors.ph},"
            f"temperature_c={sensors.temperature_c},"
            f"dissolved_oxygen_mgl={sensors.dissolved_oxygen_mgl},"
            f"tan_mgl={sensors.tan_mgl} "
            f"{ns}\n"
        )

    async def insert_telemetry(self, payload: TelemetryPayload) -> bool:
        """
        Insert telemetry record into QuestDB via Influx Line Protocol.
        Format:
        telemetry,tank_id=tank_01 ph=7.85,temperature_c=28.5,dissolved_oxygen_mgl=6.2,tan_mgl=0.45 <nanoseconds>
        """
        line = self.format_ilp_line(payload)

        async with self._lock:
            for attempt in range(2):
                try:
                    if self._writer is None or self._writer.is_closing():
                        await self.connect_ilp()
                    if self._writer:
                        self._writer.write(line.encode("utf-8"))
                        await self._writer.drain()
                        return True
                except Exception as e:
                    logger.warning(f"QuestDB ILP write attempt {attempt + 1} failed: {e}")
                    if self._writer:
                        try:
                            self._writer.close()
                            await self._writer.wait_closed()
                        except Exception:
                            pass
                    self._writer = None
                    self._reader = None
                    if attempt == 0:
                        await asyncio.sleep(0.2)
        return False

    async def query_history(self, tank_id: str = "tank_01", limit: int = 50) -> List[dict]:
        """
        Query the most recent telemetry rows for a tank asynchronously via QuestDB SQL REST API.
        """
        query = (
            f"SELECT timestamp, tank_id, ph, temperature_c, dissolved_oxygen_mgl, tan_mgl "
            f"FROM telemetry WHERE tank_id = '{tank_id}' "
            f"ORDER BY timestamp DESC LIMIT {limit};"
        )
        try:
            resp = await self._http_client.get("/exec", params={"query": query})
            if resp.status_code == 200:
                data = resp.json()
                columns = [c["name"] for c in data.get("columns", [])]
                dataset = data.get("dataset", [])
                records = []
                for row in reversed(dataset):  # Chronological order
                    row_dict = dict(zip(columns, row))
                    records.append({
                        "timestamp": row_dict.get("timestamp"),
                        "tank_id": row_dict.get("tank_id"),
                        "sensors": {
                            "ph": round(float(row_dict.get("ph", 0)), 2),
                            "temperature_c": round(float(row_dict.get("temperature_c", 0)), 1),
                            "dissolved_oxygen_mgl": round(float(row_dict.get("dissolved_oxygen_mgl", 0)), 2),
                            "tan_mgl": round(float(row_dict.get("tan_mgl", 0)), 2),
                        }
                    })
                return records
            else:
                logger.warning(f"QuestDB query returned status {resp.status_code}: {resp.text}")
                return []
        except Exception as e:
            logger.warning(f"QuestDB query failed: {e}")
            return []

    async def check_health(self) -> bool:
        """Check QuestDB REST connectivity."""
        try:
            resp = await self._http_client.get("/exec", params={"query": "SELECT 1;"})
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self):
        """Close connections."""
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        await self._http_client.aclose()
