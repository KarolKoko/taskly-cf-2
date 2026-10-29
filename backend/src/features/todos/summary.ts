import type { Todo } from './types.js';
import { percentOf } from './percent.js';

/**
 * Returns the percentage (0-100, rounded to the nearest integer) of todos that are completed.
 * Business rule: an empty list has a completion rate of 0.
 * Example: 1 completed out of 3 todos -> 33; 2 out of 3 -> 67.
 */
export function completionRate(todos: Pick<Todo, 'completed'>[]): number {
  const done = todos.filter((todo) => todo.completed).length;
  return percentOf(done, todos.length);
}
