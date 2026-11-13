import asyncio
from collections import deque
import json
import logging
import os
from typing import AsyncGenerator, Deque, Dict, Optional, Set

logger = logging.getLogger("TelemetryBroadcaster")

BROADCASTER_BACKEND = os.getenv("BROADCASTER_BACKEND", "memory").lower()
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


class TelemetryBroadcaster:
    """
    Dual-mode asynchronous pub-sub broadcaster for Server-Sent Events (SSE).
    
    Modes:
    1. 'memory' (Default): Pure in-memory asyncio.Queue fanout. Lightweight, zero-overhead,
       ideal for local single-process development and academic demonstration.
    2. 'redis': Distributed Pub/Sub via Redis for horizontal multi-worker scaling across
       multiple FastAPI Uvicorn replicas.
    """

    def __init__(self, history_buffer_size: int = 50, backend: str = BROADCASTER_BACKEND):
        self.backend = backend
        self._subscribers: Set[asyncio.Queue] = set()
        self._history: Deque[dict] = deque(maxlen=history_buffer_size)
        self._lock = asyncio.Lock()
        self._redis_client = None
        self._redis_pubsub = None
        self._redis_listener_task: Optional[asyncio.Task] = None

    async def initialize(self):
        """Initialize backend connection if configured for Redis."""
        if self.backend == "redis":
            try:
                import redis.asyncio as aioredis
                self._redis_client = aioredis.Redis(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    decode_responses=True,
                )
                await self._redis_client.ping()
                logger.info(f"Connected to Redis Pub/Sub at {REDIS_HOST}:{REDIS_PORT} for telemetry fanout.")
                
                # Start background listener for distributed messages
                self._redis_pubsub = self._redis_client.pubsub()
                await self._redis_pubsub.subscribe("aquaculture:telemetry")
                self._redis_listener_task = asyncio.create_task(self._listen_redis())
            except Exception as e:
                logger.warning(f"Failed to connect to Redis at {REDIS_HOST}:{REDIS_PORT}: {e}. Falling back to 'memory' backend.")
                self.backend = "memory"
        else:
            logger.info("Using in-memory asyncio pub-sub broadcaster (Single-instance mode).")

    async def _listen_redis(self):
        """Listen to Redis channel and dispatch to local subscriber queues."""
        try:
            async for message in self._redis_pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await self._dispatch_local(data)
                    except Exception as parse_err:
                        logger.warning(f"Error parsing Redis message: {parse_err}")
        except asyncio.CancelledError:
            pass
        except Exception as err:
            logger.error(f"Redis listener encountered error: {err}")

    async def _dispatch_local(self, data: dict):
        """Dispatches data to local subscriber queues."""
        async with self._lock:
            self._history.append(data)
            dead_queues = set()
            for queue in self._subscribers:
                try:
                    queue.put_nowait(data)
                except asyncio.QueueFull:
                    try:
                        queue.get_nowait()
                        queue.put_nowait(data)
                    except Exception:
                        dead_queues.add(queue)
            for dead in dead_queues:
                self._subscribers.discard(dead)

    async def broadcast(self, data: dict):
        """Broadcast telemetry data to active subscribers."""
        if self.backend == "redis" and self._redis_client:
            try:
                await self._redis_client.publish("aquaculture:telemetry", json.dumps(data))
                return
            except Exception as e:
                logger.warning(f"Redis publish failed: {e}. Falling back to local dispatch.")

        await self._dispatch_local(data)

    def get_history(self) -> list[dict]:
        """Return the buffered recent telemetry history."""
        return list(self._history)

    @property
    def subscriber_count(self) -> int:
        """Return the count of active subscribers."""
        return len(self._subscribers)

    async def subscribe(self) -> asyncio.Queue:
        """Register a new SSE subscriber."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers.add(queue)
            logger.info(f"New SSE client connected. Active subscribers: {len(self._subscribers)} (Mode: {self.backend})")
        return queue

    async def unsubscribe(self, queue: asyncio.Queue):
        """Unregister an SSE subscriber."""
        async with self._lock:
            self._subscribers.discard(queue)
            logger.info(f"SSE client disconnected. Active subscribers: {len(self._subscribers)}")

    async def close(self):
        """Clean shutdown."""
        if self._redis_listener_task:
            self._redis_listener_task.cancel()
        if self._redis_pubsub:
            await self._redis_pubsub.unsubscribe("aquaculture:telemetry")
        if self._redis_client:
            await self._redis_client.aclose()

    async def event_generator(self) -> AsyncGenerator[str, None]:
        """
        Asynchronous generator yielding Server-Sent Events (SSE).
        Emits historical buffer on initial connection, then real-time updates.
        Emits periodic keepalive comments to prevent proxy timeouts.
        """
        queue = await self.subscribe()
        try:
            initial_history = self.get_history()
            if initial_history:
                yield f"event: history\ndata: {json.dumps(initial_history)}\n\n"

            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: telemetry\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            await self.unsubscribe(queue)
