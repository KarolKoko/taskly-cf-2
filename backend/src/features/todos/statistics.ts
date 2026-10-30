export interface TaskInput {
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  /** Calendar date in YYYY-MM-DD format, or null. */
  due_date: string | null;
}

export interface TaskStatistics {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  dueToday: number;
  completionRate: number;
  pendingByPriority: Record<TaskInput['priority'], number>;
}

function parseCalendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Invalid calendar date');
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Invalid calendar date');
  }

  return timestamp;
}

export function summarizeTasks(
  tasks: readonly TaskInput[],
  today: string,
): TaskStatistics {
  const todayTimestamp = parseCalendarDate(today);

  const result: TaskStatistics = {
    total: tasks.length,
    completed: 0,
    pending: 0,
    overdue: 0,
    dueToday: 0,
    completionRate: 0,
    pendingByPriority: {
      low: 0,
      medium: 0,
      high: 0,
    },
  };

  for (const task of tasks) {
    const dueTimestamp =
      task.due_date === null
        ? null
        : parseCalendarDate(task.due_date);

    if (task.completed) {
      result.completed++;
      continue;
    }

    result.pending++;
    result.pendingByPriority[task.priority]++;

    if (dueTimestamp === null) continue;

    if (dueTimestamp < todayTimestamp) {
      result.overdue++;
    } else if (dueTimestamp === todayTimestamp) {
      result.dueToday++;
    }
  }

  result.completionRate =
    result.total === 0
      ? 0
      : Math.round((result.completed / result.total) * 100);

  return result;
}