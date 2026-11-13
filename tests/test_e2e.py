import unittest
import urllib.request
import json
import time


class TestLiveAquacultureSystem(unittest.TestCase):
    """
    End-to-End Live Integration Tests.
    Executes HTTP queries against running Docker microservices on localhost ports:
    - QuestDB: 9000
    - Backend: 8000
    - Frontend: 3000
    """

    def test_01_questdb_live_health(self):
        """Verify QuestDB container is accessible and responding to SQL queries."""
        url = "http://localhost:9000/exec?query=SELECT+1"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn("dataset", data)
            self.assertEqual(data["dataset"][0][0], 1)

    def test_02_backend_live_health(self):
        """Verify FastAPI backend /api/health endpoint returns healthy status and DB connected."""
        url = "http://localhost:8000/api/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn(data["status"], ["healthy", "degraded"])
            self.assertEqual(data["questdb"], "connected")
            self.assertEqual(data["mqtt_worker"], "running")

    def test_03_frontend_live_serving(self):
        """Verify Nginx frontend container serves index.html on port 3000."""
        url = "http://localhost:3000/"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            content = response.read().decode("utf-8")
            self.assertTrue("<title>Smart Biofloc Aquaculture" in content or "AquaBFT" in content or "<div id=\"root\">" in content)

    def test_04_backend_telemetry_history(self):
        """Verify /api/telemetry/history returns structured telemetry records."""
        url = "http://localhost:8000/api/telemetry/history?tank_id=tank_01&limit=5"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertEqual(data["tank_id"], "tank_01")
            self.assertIn("data", data)

    def test_05_backend_ml_forecast(self):
        """Verify /api/ml/forecast returns valid LightGBM prediction and quantile bounds."""
        url = "http://localhost:8000/api/ml/forecast?tank_id=tank_01"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn("forecast", data)
            forecast = data["forecast"]
            self.assertIn("predicted_do_2h", forecast)
            self.assertIn("current_do", forecast)
            self.assertIn("prediction_interval", forecast)
            self.assertIn("concept_drift_status", forecast)
            lower, upper = forecast["prediction_interval"]
            self.assertLessEqual(lower, upper)

    def test_06_hardware_webhook_ingestion(self):
        """Verify POST /api/telemetry ingests edge ESP32 reading, computes Emerson NH3, and returns 201."""
        url = "http://localhost:8000/api/telemetry"
        payload = {
            "timestamp": "2026-09-15T12:30:00Z",
            "tank_id": "tank_01",
            "sensors": {
                "ph": 8.0,
                "temperature_c": 29.0,
                "dissolved_oxygen_mgl": 5.8,
                "tan_mgl": 0.8,
            },
        }
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 201)
            res = json.loads(response.read().decode("utf-8"))
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["tank_id"], "tank_01")
            self.assertIn("calculated_nh3_mgl", res)
            self.assertGreaterEqual(res["calculated_nh3_mgl"], 0.01)
            self.assertLessEqual(res["calculated_nh3_mgl"], 0.20)

    def test_07_simulator_scenario_switching(self):
        """Verify POST /api/simulator/scenario dispatches scenario change via MQTT."""
        url = "http://localhost:8000/api/simulator/scenario"
        payload = {"scenario": "feeding"}
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            res = json.loads(response.read().decode("utf-8"))
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["scenario"], "feeding")


if __name__ == "__main__":
    unittest.main()
