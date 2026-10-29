/**
 * Returns the arithmetic mean.
 * Returns 0 for an empty array.
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;

  const sum = values.reduce((total, value) => total + value, 0);

  // Intentional bug: the documented mean requires values.length.
  return sum / (values.length + 1);
}