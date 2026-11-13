import asyncio
import json
import logging
import os
from typing import Any, Optional
from aiomqtt import Client, MqttError
from .questdb import QuestDBClient
from .broadcaster import TelemetryBroadcaster
from .schemas import TelemetryPayload

logger = logging.getLogger("MQTTWorker")

MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "telemetry/tank/#")


async def run_mqtt_worker(
    questdb: QuestDBClient,
    broadcaster: TelemetryBroadcaster,
    shutdown_event: asyncio.Event,
    ml_forecaster: Optional[Any] = None,
    control_service: Optional[Any] = None,
):
    """
    Background asyncio worker that subscribes to Mosquitto MQTT broker,
    validates incoming telemetry via Pydantic v2, stores it into QuestDB,
    evaluates rule-based control logic, updates ADWIN on streaming forecast residuals,
    and broadcasts to SSE clients.
    """
    reconnect_interval = 2.0
    logger.info(f"Starting MQTT worker targeting {MQTT_BROKER}:{MQTT_PORT} on topic '{MQTT_TOPIC}'...")

    while not shutdown_event.is_set():
        try:
            async with Client(hostname=MQTT_BROKER, port=MQTT_PORT) as client:
                await client.subscribe(MQTT_TOPIC)
                logger.info(f"Subscribed to MQTT topic '{MQTT_TOPIC}'. Ingestion active.")
                reconnect_interval = 2.0

                async for message in client.messages:
                    if shutdown_event.is_set():
                        break

                    try:
                        raw_payload = message.payload.decode("utf-8")
                        data_dict = json.loads(raw_payload)

                        # Validate with Pydantic v2
                        payload = TelemetryPayload.model_validate(data_dict)

                        # 1. Store in QuestDB via non-blocking ILP
                        await questdb.insert_telemetry(payload)

                        # 2. Enrich with calculated unionized ammonia and operational metadata
                        payload_dict = payload.model_dump()
                        nh3 = payload.sensors.calculate_unionized_ammonia()
                        existing_meta = data_dict.get("metadata", {})
                        payload_dict["metadata"] = {
                            **existing_meta,
                            "calculated_nh3_mgl": nh3,
                        }

                        # 3. Evaluate software control rules if in AUTO mode
                        if control_service is not None:
                            try:
                                control_service.evaluate_telemetry_rules(payload_dict)
                            except Exception as ctrl_err:
                                logger.debug(f"Streaming control rule evaluation: {ctrl_err}")

                        # 4. Fan out to active SSE subscribers
                        await broadcaster.broadcast(payload_dict)

                        # 5. Stream observation to unified ML processing pipeline
                        if ml_forecaster is not None:
                            try:
                                hist = broadcaster.get_history()
                                ml_forecaster.process_observation(payload_dict, hist)
                            except Exception as ml_err:
                                logger.debug(f"Streaming ML observation processing: {ml_err}")

                        logger.debug(f"Ingested & Broadcast -> Tank: {payload.tank_id}, DO: {payload.sensors.dissolved_oxygen_mgl}, NH3: {nh3}")

                    except Exception as parse_err:
                        logger.warning(f"Error parsing MQTT payload on {message.topic}: {parse_err}")

        except MqttError as err:
            if shutdown_event.is_set():
                break
            logger.warning(f"MQTT connection lost: {err}. Reconnecting in {reconnect_interval:.1f}s...")
            try:
                await asyncio.wait_for(shutdown_event.wait(), timeout=reconnect_interval)
            except asyncio.TimeoutError:
                pass
            reconnect_interval = min(reconnect_interval * 1.5, 30.0)
        except asyncio.CancelledError:
            break
        except Exception as e:
            if shutdown_event.is_set():
                break
            logger.error(f"Unexpected MQTT worker error: {e}", exc_info=True)
            await asyncio.sleep(reconnect_interval)

    logger.info("MQTT worker stopped.")
