import type { Todo } from './types.js';

export type Urgency = 'completed' | 'none' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming';

export const DUE_SOON_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getUrgency(todo: Pick<Todo, 'completed' | 'due_date'>, now: Date = new Date()): Urgency {
  if (todo.completed) return 'completed';
  if (!todo.due_date) return 'none';

  const dueDay = Date.parse(`${todo.due_date}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysLeft = Math.round((dueDay - today) / MS_PER_DAY);

  if (daysLeft < 0) return 'overdue';
  if (daysLeft === 0) return 'due_today';
  if (daysLeft <= DUE_SOON_DAYS) return 'due_soon';
  return 'upcoming';
}
