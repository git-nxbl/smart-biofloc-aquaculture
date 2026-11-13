import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import logging
import os
from typing import Optional

from aiomqtt import Client
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .broadcaster import TelemetryBroadcaster
from .control_service import ControlService
from .ml_service import MLForecaster
from .mqtt_worker import run_mqtt_worker
from .questdb import QuestDBClient
from .schemas import (
    ActuatorCommandRequest,
    ControlModeRequest,
    ControlStatusResponse,
    ScenarioControlRequest,
    TelemetryPayload,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [BACKEND] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("AquacultureBackend")

# Configuration from environment
QUESTDB_HOST = os.getenv("QUESTDB_HOST", "questdb")
QUESTDB_ILP_PORT = int(os.getenv("QUESTDB_ILP_PORT", "9009"))
QUESTDB_HTTP_PORT = int(os.getenv("QUESTDB_HTTP_PORT", "9000"))
MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
BROADCASTER_BACKEND = os.getenv("BROADCASTER_BACKEND", "memory")

# Global singletons
questdb_client = QuestDBClient(
    host=QUESTDB_HOST,
    ilp_port=QUESTDB_ILP_PORT,
    http_port=QUESTDB_HTTP_PORT,
)
broadcaster = TelemetryBroadcaster(history_buffer_size=100, backend=BROADCASTER_BACKEND)
ml_forecaster = MLForecaster(model_dir="app/models")
control_service = ControlService(initial_mode="AUTO")
shutdown_event = asyncio.Event()
mqtt_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Aquaculture Water Quality Backend...")
    await questdb_client.connect_ilp()
    await broadcaster.initialize()

    shutdown_event.clear()
    global mqtt_task
    mqtt_task = asyncio.create_task(
        run_mqtt_worker(
            questdb=questdb_client,
            broadcaster=broadcaster,
            shutdown_event=shutdown_event,
            ml_forecaster=ml_forecaster,
            control_service=control_service,
        )
    )
    logger.info("Background MQTT ingestion worker started with active control service.")

    yield

    logger.info("Shutting down backend services...")
    shutdown_event.set()
    if mqtt_task:
        mqtt_task.cancel()
        try:
            await asyncio.wait_for(mqtt_task, timeout=3.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    await broadcaster.close()
    await questdb_client.close()
    logger.info("Shutdown completed.")


app = FastAPI(
    title="Smart Biofloc Aquaculture Water Quality Management System",
    version="1.1.0",
    description="IoT telemetry ingestion, time-series persistence, ML forecasting with ADWIN drift detection, and real-time streaming for zero-water-exchange biofloc systems.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    """System health check endpoint verifying database, broadcaster, and worker status."""
    qdb_healthy = await questdb_client.check_health()
    return {
        "status": "healthy" if qdb_healthy else "degraded",
        "questdb": "connected" if qdb_healthy else "unreachable",
        "mqtt_worker": "running" if mqtt_task and not mqtt_task.done() else "stopped",
        "broadcaster_backend": broadcaster.backend,
    }


@app.post(
    "/api/telemetry",
    status_code=status.HTTP_201_CREATED,
    summary="Hardware Ingestion Webhook (ESP32 / Edge MCU)",
    description="Accepts JSON telemetry from edge microcontrollers or simulated sensors. "
                "Persists to QuestDB and broadcasts to live SSE clients.",
)
async def ingest_telemetry(payload: TelemetryPayload):
    """
    Direct HTTP Webhook for physical ESP32 microcontrollers.
    Validates strictly with Pydantic v2 and persists to QuestDB.
    """
    try:
        # 1. Non-blocking ILP insert to QuestDB
        inserted = await questdb_client.insert_telemetry(payload)
        if not inserted:
            logger.warning("QuestDB insertion reported false, buffer retained in memory.")

        # 2. Enrich with calculated Emerson unionized ammonia
        payload_dict = payload.model_dump()
        nh3 = payload.sensors.calculate_unionized_ammonia()
        payload_dict["metadata"] = {
            "calculated_nh3_mgl": nh3,
            "source": "http_webhook_esp32",
        }

        # 3. Evaluate software control rules if in AUTO mode
        try:
            control_service.evaluate_telemetry_rules(payload_dict)
        except Exception as ctrl_err:
            logger.debug(f"Webhook control rule evaluation: {ctrl_err}")

        # 4. Broadcast live to connected frontend clients
        await broadcaster.broadcast(payload_dict)

        # 5. Stream observation to unified ML processing pipeline
        if ml_forecaster is not None:
            try:
                hist = broadcaster.get_history()
                ml_forecaster.process_observation(payload_dict, hist)
            except Exception as ml_err:
                logger.debug(f"Webhook ML observation error: {ml_err}")

        return {
            "status": "success",
            "message": "Telemetry received and persisted",
            "tank_id": payload.tank_id,
            "timestamp": payload.timestamp,
            "calculated_nh3_mgl": nh3,
        }
    except Exception as e:
        logger.error(f"Failed to process telemetry: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Telemetry ingestion failed: {str(e)}",
        )


@app.get(
    "/api/stream",
    summary="Server-Sent Events (SSE) Live Telemetry Stream",
    description="Real-time SSE stream yielding sensor updates. Re-uses Python async generators with keepalive pings.",
)
async def stream_telemetry():
    """Yields live Server-Sent Events containing real-time telemetry packets."""
    return StreamingResponse(
        broadcaster.event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get(
    "/api/telemetry/history",
    summary="Query Historical Telemetry",
    description="Retrieves the most recent telemetry readings from QuestDB for chart hydration.",
)
async def get_telemetry_history(
    tank_id: str = Query(default="tank_01", description="Tank identifier"),
    limit: int = Query(default=50, ge=1, le=500, description="Number of historical records"),
):
    """Fetch recent records from QuestDB or memory buffer."""
    records = await questdb_client.query_history(tank_id=tank_id, limit=limit)
    if not records:
        buffered = broadcaster.get_history()
        records = [r for r in buffered if r.get("tank_id") == tank_id][-limit:]
    return {"tank_id": tank_id, "count": len(records), "data": records}


@app.get(
    "/api/ml/forecast",
    summary="2-Hour Dissolved Oxygen ML Forecast",
    description="Calculates real-time LightGBM 2-hour ahead DO prediction with quantile bounds and ADWIN drift status.",
)
async def get_ml_forecast(tank_id: str = "tank_01"):
    recent = broadcaster.get_history()
    # If buffer has fewer than 72 samples, attempt to hydrate from QuestDB
    if len(recent) < 72:
        db_records = await questdb_client.query_history(tank_id=tank_id, limit=100)
        if db_records:
            seen_ts = set()
            merged = []
            for r in db_records + recent:
                ts = r.get("timestamp")
                if ts and ts not in seen_ts:
                    seen_ts.add(ts)
                    merged.append(r)
            recent = merged

    latest = recent[-1] if recent else {
        "timestamp": "2026-09-15T23:00:00Z",
        "tank_id": tank_id,
        "sensors": {"ph": 7.85, "temperature_c": 28.5, "dissolved_oxygen_mgl": 6.2, "tan_mgl": 0.45}
    }
    forecast = ml_forecaster.predict_2h_do(latest, recent)
    return {
        "tank_id": tank_id,
        "forecast": forecast,
        "metadata": ml_forecaster.metadata,
    }


@app.get(
    "/api/scenarios",
    summary="List Supported Simulation Scenarios",
    description="Returns the list of operational biofloc scenarios available for demonstration.",
)
async def get_scenarios():
    return {
        "scenarios": {
            "normal": "Standard operational baseline with diurnal DO variation and healthy biofloc assimilation",
            "feeding": "Feeding event pulse resulting in elevated TAN excretion and slight microbial respiration spike",
            "aerator_failure": "Mechanical blower failure: rapid exponential DO decay toward lethal hypoxia (< 2.5 mg/L)",
            "aerator_recovery": "Aeration restored: asymptotic re-oxygenation recovery to healthy saturation",
            "organic_overload": "High organic loading: elevated TAN accumulation and depressed pH buffer",
        }
    }


@app.get(
    "/api/alarms",
    summary="Active System Alarms & Safety Rules",
    description="Evaluates real-time biological safety thresholds and returns active alarm conditions and SOP guidance.",
)
async def get_active_alarms(tank_id: str = "tank_01"):
    recent = broadcaster.get_history()
    latest = recent[-1] if recent else None

    alarms = []
    system_status = "NORMAL"

    if latest:
        sensors = latest.get("sensors", {})
        do = float(sensors.get("dissolved_oxygen_mgl", 6.0))
        tan = float(sensors.get("tan_mgl", 0.40))
        ph = float(sensors.get("ph", 7.80))
        temp = float(sensors.get("temperature_c", 28.5))
        ts = latest.get("timestamp", datetime.now(timezone.utc).isoformat())

        # Emerson unionized ammonia
        nh3 = latest.get("metadata", {}).get("calculated_nh3_mgl")
        if nh3 is None:
            from .features import calculate_unionized_ammonia
            nh3 = calculate_unionized_ammonia(tan, ph, temp)

        # 1. Lethal Hypoxia
        if do < 2.5:
            alarms.append({
                "id": f"hypoxia-lethal-{ts}",
                "type": "lethal_hypoxia",
                "severity": "critical",
                "title": "Lethal Hypoxia Condition",
                "message": f"Dissolved oxygen dropped to {do:.2f} mg/L, below the 2.50 mg/L lethal threshold.",
                "value": f"{do:.2f} mg/L",
                "threshold": "< 2.50 mg/L",
                "timestamp": ts,
                "sop": [
                    "Engage auxiliary backup aeration blowers immediately.",
                    "Verify power supply to primary air compressor / diffusers.",
                    "Suspend feeding until DO recovers above 5.0 mg/L.",
                ],
            })
            system_status = "CRITICAL"
        elif do < 4.0:
            alarms.append({
                "id": f"hypoxia-warning-{ts}",
                "type": "low_do_warning",
                "severity": "warning",
                "title": "Sub-Optimal Hypoxia Warning",
                "message": f"Dissolved oxygen is {do:.2f} mg/L, below optimal biofloc operational baseline (4.00 mg/L).",
                "value": f"{do:.2f} mg/L",
                "threshold": "< 4.00 mg/L",
                "timestamp": ts,
                "sop": [
                    "Inspect air delivery manifolds and sub-surface diffusers.",
                    "Check blower motor RPM and filter intake.",
                ],
            })
            if system_status != "CRITICAL":
                system_status = "WARNING"

        # 2. Toxic Ammonia Spike
        if nh3 > 0.05:
            alarms.append({
                "id": f"nh3-critical-{ts}",
                "type": "ammonia_toxicity",
                "severity": "critical",
                "title": "Toxic Unionized Ammonia Spike",
                "message": f"Calculated NH₃ is {nh3:.4f} mg/L, exceeding the chronic toxicity limit (0.050 mg/L).",
                "value": f"{nh3:.4f} mg/L",
                "threshold": "> 0.050 mg/L",
                "timestamp": ts,
                "sop": [
                    "Immediately halt feeding to prevent post-prandial excretion.",
                    "Add supplementary molasses/carbon source to stimulate heterotrophic assimilation.",
                    "Verify water exchange or biofloc density.",
                ],
            })
            system_status = "CRITICAL"

        # 3. Severe Acidification / pH Crash
        if ph < 7.40 or ph > 8.60:
            alarms.append({
                "id": f"ph-buffer-{ts}",
                "type": "ph_stress",
                "severity": "warning",
                "title": "Alkalinity Buffer Depletion / pH Stress",
                "message": f"pH reading is {ph:.2f}, outside the stable biofloc nitrification window (7.40 - 8.60).",
                "value": f"{ph:.2f}",
                "threshold": "7.40 - 8.60",
                "timestamp": ts,
                "sop": [
                    "Dose sodium bicarbonate (NaHCO₃) or agricultural lime to replenish alkalinity.",
                    "Inspect organic sediment loading.",
                ],
            })
            if system_status != "CRITICAL":
                system_status = "WARNING"

        # 4. Concept Drift / Distribution Shift
        if ml_forecaster.latest_drift_status == "DRIFT_DETECTED":
            alarms.append({
                "id": f"drift-{ts}",
                "type": "concept_drift",
                "severity": "warning",
                "title": "ADWIN Concept Drift Detected",
                "message": "Streaming 2-hour forecast residual error distribution has shifted significantly.",
                "value": "Residual Shift Flagged",
                "threshold": "ADWIN delta = 0.002",
                "timestamp": ts,
                "sop": [
                    "Check whether system is operating under an active perturbation scenario.",
                    "Verify physical sensor calibration and membrane biofouling status.",
                ],
            })
            if system_status != "CRITICAL":
                system_status = "WARNING"

    return {
        "tank_id": tank_id,
        "system_status": system_status,
        "active_count": len(alarms),
        "alarms": alarms,
        "threshold_rules": {
            "hypoxia_lethal_mgl": 2.5,
            "hypoxia_warning_mgl": 4.0,
            "nh3_toxicity_critical_mgl": 0.05,
            "ph_min": 7.4,
            "ph_max": 8.6,
        },
    }


@app.post(
    "/api/simulator/scenario",
    summary="Switch Operational Simulation Scenario",
    description="Publishes a scenario control command over MQTT to dynamically switch the simulator state.",
)
async def set_simulator_scenario(req: ScenarioControlRequest):
    try:
        async with Client(hostname=MQTT_BROKER, port=MQTT_PORT) as client:
            await client.publish("telemetry/control/scenario", payload=req.scenario.encode("utf-8"), qos=1)
        return {
            "status": "success",
            "message": f"Scenario command '{req.scenario}' dispatched via MQTT control",
            "scenario": req.scenario,
        }
    except Exception as e:
        logger.error(f"Failed to publish scenario command: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to dispatch scenario command to MQTT broker: {str(e)}",
        )


# =========================================================================
# Control Center & Software Actuation Layer Endpoints (Phase C)
# =========================================================================

@app.get(
    "/api/control/status",
    response_model=ControlStatusResponse,
    summary="Get Actuation System Status",
    description="Returns current control mode, actuator states, tank water level, safety interlocks, and event history.",
)
async def get_control_status():
    return control_service.get_status()


@app.post(
    "/api/control/mode",
    summary="Switch Control Mode",
    description="Switches operational control mode between AUTO, MANUAL, and SIMULATION.",
)
async def set_control_mode(req: ControlModeRequest):
    new_mode = control_service.set_mode(req.mode)
    return {
        "status": "success",
        "message": f"Control mode switched to {new_mode}",
        "mode": new_mode,
    }


@app.post(
    "/api/control/actuator",
    summary="Execute Actuator Command",
    description="Issues an actuator state command subject to safety interlocks and control mode validation.",
)
async def execute_actuator_command(req: ActuatorCommandRequest):
    success, message, block_reason = control_service.execute_command(req, is_automated=False)

    # In SIMULATION mode, also forward command to MQTT for simulator sync if broker available
    if success and control_service.mode == "SIMULATION":
        try:
            async with Client(hostname=MQTT_BROKER, port=MQTT_PORT) as client:
                payload = json.dumps({"actuator": req.actuator, "state": req.state}).encode("utf-8")
                await client.publish("telemetry/control/actuators", payload=payload, qos=1)
        except Exception as e:
            logger.debug(f"Could not forward simulation command to MQTT: {e}")

    if not success:
        return {
            "status": "blocked" if block_reason else "error",
            "success": False,
            "message": message,
            "blocked_reason": block_reason,
            "actuator": req.actuator,
            "requested_state": req.state,
        }

    return {
        "status": "success",
        "success": True,
        "message": message,
        "actuator": req.actuator,
        "new_state": req.state,
    }


@app.get(
    "/api/control/history",
    summary="Get Actuator Action History",
    description="Returns chronological audit log of recent actuator state transitions and safety blocks.",
)
async def get_control_history(limit: int = Query(default=50, ge=1, le=100)):
    events = list(control_service.event_history)[:limit]
    return {
        "count": len(events),
        "events": events,
    }


@app.post(
    "/api/control/evaluate",
    summary="Evaluate Telemetry Against Control Rules",
    description="Forces evaluation of current tank telemetry against operational rules.",
)
async def evaluate_control_rules():
    recent = broadcaster.get_history()
    latest = recent[-1] if recent else None
    if not latest:
        return {"status": "skipped", "message": "No active telemetry to evaluate", "actions": []}

    actions = control_service.evaluate_telemetry_rules(latest)
    return {
        "status": "evaluated",
        "mode": control_service.mode,
        "actions_taken": actions,
        "status_summary": control_service.get_status(),
    }

