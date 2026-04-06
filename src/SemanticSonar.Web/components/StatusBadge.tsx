'use client';

interface Props {
  isActive: boolean;
  consecutiveFailureCount: number;
  lastRunSuccess?: boolean;
}

export function StatusBadge({ isActive, consecutiveFailureCount, lastRunSuccess }: Props) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-400" role="status" aria-label="Status: Disabled">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
        Disabled
      </span>
    );
  }

  if (consecutiveFailureCount >= 10) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" role="status" aria-label="Status: At risk">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        At risk
      </span>
    );
  }

  if (lastRunSuccess === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" role="status" aria-label="Status: Failing">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden="true" />
        Failing
      </span>
    );
  }

  if (lastRunSuccess === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400" role="status" aria-label="Status: OK">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" aria-hidden="true" />
        OK
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400" role="status" aria-label="Status: Pending">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" aria-hidden="true" />
      Pending
    </span>
  );
}
