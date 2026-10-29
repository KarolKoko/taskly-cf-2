export function average(values: number[]): number {
  if (values.length === 0) return 0;

  const sum = values.reduce((total, value) => total + value, 0);

  return sum / values.length;
}
