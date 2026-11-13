import sys
import os

# Ensure project root, backend, simulator, and ml are in sys.path
TEST_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(TEST_DIR, ".."))
APP_DIR = os.path.join(PROJECT_ROOT, "backend")
SIMULATOR_DIR = os.path.join(PROJECT_ROOT, "simulator")
ML_DIR = os.path.join(PROJECT_ROOT, "ml")

# In Docker container, /app contains app/, simulator/, and tests/
CONTAINER_APP = "/app"

paths = [PROJECT_ROOT, APP_DIR, SIMULATOR_DIR, ML_DIR, CONTAINER_APP]
for p in paths:
    if os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)
