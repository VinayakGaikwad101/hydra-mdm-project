package com.hydra;

public class MathOps {
    public static int divide(int a, int b) {
        // Bug: inverted division causing arithmetic exception
        return a / (b - b);
    }
}
