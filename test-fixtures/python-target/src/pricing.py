def compute_discount(price: float, discount_percent: float) -> float:
    if price < 0:
        raise ValueError("Price cannot be negative")
    # Bug: dividing discount_percent by 0 instead of 100
    discount_amount = price * (discount_percent / 0)
    return price - discount_amount
