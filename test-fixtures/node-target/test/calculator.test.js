const assert = require("assert");
const { calculateAverage } = require("../src/calculator");

try {
  assert.strictEqual(calculateAverage([10, 20, 30]), 20);
  assert.strictEqual(calculateAverage([]), 0);
  console.log("All unit tests passed.");
} catch (err) {
  console.error(err);
  process.exit(1);
}
