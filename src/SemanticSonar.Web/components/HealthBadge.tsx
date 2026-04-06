'use client';

import type { ModelHealthScore } from '@/lib/types';

const gradeColors: Record<string, string> = {
  A: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-700',
  B: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-700',
  C: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-700',
  D: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-700',
  F: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-700',
};

interface Props {
  health: ModelHealthScore;
  compact?: boolean;
}

export function HealthBadge({ health, compact }: Props) {
  const colors = gradeColors[health.grade] ?? gradeColors.F;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${colors}`}
        title={`Health: ${health.score}/100 (${health.grade})`}
      >
        {health.grade}
        <span className="font-normal opacity-75">{health.score}</span>
        {health.isAnomaly && (
          <span className="text-amber-500" title={health.anomalyReason ?? 'Anomaly detected'}>⚠</span>
        )}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${colors}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{health.grade}</span>
          <span className="text-sm font-medium">{health.score}/100</span>
        </div>
        {health.isAnomaly && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-800 dark:text-amber-200">
            Anomaly
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-xs">
        <ScoreBar label="Uptime" value={health.uptimePoints} max={40} />
        <ScoreBar label="Latency" value={health.latencyPoints} max={20} />
        <ScoreBar label="Refresh" value={health.refreshPoints} max={20} />
        <ScoreBar label="Activity" value={health.activityPoints} max={20} />
      </div>
      {health.anomalyReason && (
        <p className="mt-2 text-xs opacity-80">{health.anomalyReason}</p>
      )}
      {health.daysUntilPause != null && (
        <p className="mt-1 text-xs opacity-80">
          {health.daysUntilPause <= 7
            ? `⚠ ${health.daysUntilPause}d until auto-pause`
            : `${health.daysUntilPause}d until auto-pause`}
        </p>
      )}
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span>{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <div className="h-1 rounded-full bg-black/10 dark:bg-white/10">
        <div className="h-1 rounded-full bg-current opacity-60" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
