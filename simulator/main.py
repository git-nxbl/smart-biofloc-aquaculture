"""
Stochastic Biofloc Telemetry Simulator
Connects asynchronously to Mosquitto MQTT broker and publishes realistic
Ornstein-Uhlenbeck generated water quality telemetry every 5 seconds.
Supports dynamic scenario switching via MQTT control topic 'telemetry/control/scenario'.
"""

import asyncio
import json
import logging
import os
import signal
import sys
from aiomqtt import Client, MqttError
from sde import BioflocSDEEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [SIMULATOR] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("BioflocSimulator")

MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "telemetry/tank/1")
CONTROL_TOPIC = os.getenv("CONTROL_TOPIC", "telemetry/control/scenario")
ACTUATOR_TOPIC = os.getenv("ACTUATOR_TOPIC", "telemetry/control/actuators")
PUBLISH_INTERVAL_SEC = float(os.getenv("PUBLISH_INTERVAL_SEC", "5.0"))
TANK_ID = os.getenv("TANK_ID", "tank_01")
SIM_SEED = int(os.getenv("SIM_SEED", "42")) if os.getenv("SIM_SEED") else 42
INITIAL_SCENARIO = os.getenv("SIM_SCENARIO", "normal")
INTERVAL_MINUTES = float(os.getenv("SIM_INTERVAL_MINUTES", "5.0"))


async def command_listener(client: Client, engine: BioflocSDEEngine):
    """Listens for dynamic scenario and actuator control commands over MQTT."""
    try:
        await client.subscribe(CONTROL_TOPIC)
        await client.subscribe(ACTUATOR_TOPIC)
        logger.info(f"Subscribed to control topics: '{CONTROL_TOPIC}', '{ACTUATOR_TOPIC}'")
        async for message in client.messages:
            if message.topic.matches(CONTROL_TOPIC):
                new_scenario = message.payload.decode("utf-8").strip()
                success = engine.set_scenario(new_scenario)
                if success:
                    logger.warning(f"🎬 Scenario switched to: '{new_scenario.upper()}' via MQTT control!")
                else:
                    logger.warning(f"Rejected unknown scenario: '{new_scenario}'. Valid: {list(engine.SCENARIOS.keys())}")
            elif message.topic.matches(ACTUATOR_TOPIC):
                try:
                    cmd_data = json.loads(message.payload.decode("utf-8"))
                    actuator = cmd_data.get("actuator")
                    state = cmd_data.get("state")
                    if actuator and state:
                        updated = engine.apply_actuator_commands({actuator: state})
                        logger.warning(f"⚡ Actuator '{actuator}' set to '{state}' in simulation engine!")
                except Exception as parse_err:
                    logger.warning(f"Failed to parse actuator MQTT command: {parse_err}")
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error in control listener: {e}")


async def run_simulator():
    engine = BioflocSDEEngine(
        seed=SIM_SEED,
        initial_do=6.20,
        initial_tan=0.40,
        initial_ph=7.85,
        initial_temp=28.5,
        interval_minutes=INTERVAL_MINUTES,
    )
    engine.set_scenario(INITIAL_SCENARIO)

    logger.info("Initializing Biofloc SDE Simulator Engine...")
    logger.info(f"Target Broker: {MQTT_BROKER}:{MQTT_PORT} | Topic: {MQTT_TOPIC} | Interval: {PUBLISH_INTERVAL_SEC}s")
    logger.info(f"Random Seed: {SIM_SEED} | Active Scenario: '{engine.active_scenario}'")

    reconnect_interval = 2.0

    while True:
        try:
            logger.info(f"Connecting to MQTT Broker at {MQTT_BROKER}:{MQTT_PORT}...")
            async with Client(hostname=MQTT_BROKER, port=MQTT_PORT) as client:
                logger.info(f"Connected to Mosquitto. Starting continuous telemetry publishing to '{MQTT_TOPIC}'...")
                reconnect_interval = 2.0

                # Launch concurrent control listener
                listener_task = asyncio.create_task(command_listener(client, engine))

                try:
                    while True:
                        # Generate next stochastic step with biological forcing and actuator state
                        payload = engine.step(advance_sim_time=True)
                        payload["tank_id"] = TANK_ID

                        # Strict JSON payload with sensors and rich operational metadata
                        strict_payload = {
                            "timestamp": payload["timestamp"],
                            "tank_id": payload["tank_id"],
                            "sensors": payload["sensors"],
                            "metadata": payload["metadata"],
                        }
                        payload_bytes = json.dumps(strict_payload).encode("utf-8")

                        await client.publish(MQTT_TOPIC, payload=payload_bytes, qos=1)
                        sensors = strict_payload["sensors"]
                        nh3 = payload["metadata"]["calculated_nh3_mgl"]
                        w_pct = payload["metadata"].get("water_level_pct", 80.0)
                        logger.info(
                            f"[{payload['metadata']['scenario'].upper()}] Tank: {strict_payload['tank_id']} | "
                            f"DO: {sensors['dissolved_oxygen_mgl']:.2f} mg/L | "
                            f"TAN: {sensors['tan_mgl']:.2f} mg/L (NH3: {nh3:.4f}) | "
                            f"pH: {sensors['ph']:.2f} | "
                            f"Water: {w_pct:.1f}%"
                        )

                        await asyncio.sleep(PUBLISH_INTERVAL_SEC)
                finally:
                    listener_task.cancel()
                    try:
                        await listener_task
                    except asyncio.CancelledError:
                        pass

        except MqttError as err:
            logger.warning(f"MQTT Error: {err}. Retrying in {reconnect_interval:.1f}s...")
            await asyncio.sleep(reconnect_interval)
            reconnect_interval = min(reconnect_interval * 1.5, 30.0)
        except asyncio.CancelledError:
            logger.info("Simulator task cancelled. Exiting cleanly.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in simulator loop: {e}. Retrying in {reconnect_interval:.1f}s...", exc_info=True)
            await asyncio.sleep(reconnect_interval)


def handle_shutdown(loop, task):
    logger.info("Received termination signal. Initiating graceful shutdown...")
    task.cancel()


def main():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    task = loop.create_task(run_simulator())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: handle_shutdown(loop, task))
        except NotImplementedError:
            pass

    try:
        loop.run_until_complete(task)
    except asyncio.CancelledError:
        pass
    finally:
        loop.close()
        logger.info("Simulator shutdown complete.")


if __name__ == "__main__":
    main()
