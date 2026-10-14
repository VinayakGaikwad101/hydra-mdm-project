from src.pricing import compute_discount

def test_discount():
    assert compute_discount(100.0, 20.0) == 80.0
    print("Python tests passed.")

if __name__ == "__main__":
    test_discount()
