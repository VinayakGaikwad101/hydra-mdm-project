function calculateAverage(numbers) {
  if (!numbers) return 0;
  // Bug: fails when array is empty or elements undefined
  const sum = numbers.reduce((acc, curr) => acc + curr, 0);
  return sum / numbers.length;
}

module.exports = { calculateAverage };
