import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

try:
    from src.pricing import compute_discount
except ImportError:
    from pricing import compute_discount

def test_discount():
    assert compute_discount(100.0, 20.0) == 80.0
    print("Python tests passed.")

if __name__ == "__main__":
    test_discount()
