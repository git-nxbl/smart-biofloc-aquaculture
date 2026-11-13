"""
ADWIN-inspired adaptive-window drift detector using Hoeffding-style sub-window comparisons.
Inspired by Bifet & Gavalda (2007).
Evaluates prediction residuals e_t = |y_t - y_hat_t| in streaming telemetry.
Note: This is a simplified educational implementation, not a drop-in reference implementation of standard ADWIN.
"""

import math
from collections import deque
from typing import Dict, Optional, Tuple


class ADWIN:
    """
    ADWIN-inspired adaptive-window drift detector using Hoeffding-style sub-window comparisons.
    Maintains a sliding window of real-valued residuals and monitors for statistically
    significant differences between sub-windows using Hoeffding-style bounds.
    The delta parameter (default 0.002) is a detector confidence/control parameter.
    """

    def __init__(self, delta: float = 0.002, max_window_size: int = 1000, min_window_size: int = 30):
        self.delta = delta  # Confidence parameter (e.g. 99.8% confidence)
        self.max_window_size = max_window_size
        self.min_window_size = min_window_size
        self.window: deque[float] = deque(maxlen=max_window_size)
        self.total: float = 0.0
        self.variance: float = 0.0
        self.drift_count: int = 0
        self.last_drift_index: int = 0
        self.step_count: int = 0

    def update(self, value: float) -> Tuple[bool, dict]:
        """
        Add a new sample (e.g. absolute prediction error |y_true - y_pred|)
        to the window and evaluate whether concept drift occurred.

        Returns:
            (drift_detected, metrics_dict)
        """
        self.step_count += 1
        self.window.append(value)
        n = len(self.window)

        if n < self.min_window_size:
            return False, {
                "drift_detected": False,
                "window_size": n,
                "window_mean": sum(self.window) / n if n > 0 else 0.0,
                "cut_diff": 0.0,
                "threshold": 0.0,
            }

        drift_detected = False
        max_diff = 0.0
        applied_threshold = 0.0

        # Evaluate candidate cut points in the window
        # We test splits at multiple sub-window partitions
        step_size = max(5, n // 20)
        window_list = list(self.window)

        for cut in range(self.min_window_size // 2, n - self.min_window_size // 2, step_size):
            w0 = window_list[:cut]
            w1 = window_list[cut:]

            n0 = len(w0)
            n1 = len(w1)
            if n0 < 10 or n1 < 10:
                continue

            mean0 = sum(w0) / n0
            mean1 = sum(w1) / n1
            diff = abs(mean0 - mean1)

            # Harmonic mean of sample sizes
            m = 1.0 / (1.0 / n0 + 1.0 / n1)

            # Hoeffding bound threshold with confidence delta
            # delta_prime = delta / n
            delta_prime = self.delta / max(1, n)
            threshold = math.sqrt((1.0 / (2.0 * m)) * math.log(4.0 / delta_prime))

            if diff > max_diff:
                max_diff = diff
                applied_threshold = threshold

            if diff > threshold:
                drift_detected = True
                self.drift_count += 1
                self.last_drift_index = self.step_count

                # Shrink window: drop the older sub-window w0
                for _ in range(n0):
                    if self.window:
                        self.window.popleft()
                break

        current_n = len(self.window)
        current_mean = sum(self.window) / current_n if current_n > 0 else 0.0

        return drift_detected, {
            "drift_detected": drift_detected,
            "window_size": current_n,
            "window_mean": round(current_mean, 4),
            "cut_diff": round(max_diff, 4),
            "threshold": round(applied_threshold, 4),
            "drift_count": self.drift_count,
        }
