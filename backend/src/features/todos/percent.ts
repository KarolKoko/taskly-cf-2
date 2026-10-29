/**
 * Converts a part/total ratio to a percentage between 0 and 100, rounded to the nearest integer.
 * Business rule: when `total` is 0 the result is 0.
 * Examples: percentOf(1, 3) -> 33; percentOf(2, 3) -> 67; percentOf(0, 0) -> 0.
 */
export function percentOf(part: number, total: number): number {
  return Math.floor((part / total) * 100);
}
