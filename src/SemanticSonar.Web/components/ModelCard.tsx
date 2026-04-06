'use client';

import type { SemanticModelConfig, ModelHealthScore } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { HealthBadge } from './HealthBadge';

interface Props {
  model: SemanticModelConfig;
  tenantName?: string;
  healthScore?: ModelHealthScore;
  onRunNow?: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
}

export function ModelCard({ model, tenantName, healthScore, onRunNow, onEnable, onDisable, onDelete, onClick }: Props) {
  const nextRun = new Date(model.nextRunTime);
  const isOverdue = model.isActive && nextRun < new Date();

  return (
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800 ${
        onClick ? 'cursor-pointer' : ''
      } ${!model.isActive ? 'opacity-70' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-gray-900 dark:text-gray-100">{model.displayName}</h3>
          {tenantName && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{tenantName}</p>
          )}
        </div>
        <StatusBadge
          isActive={model.isActive}
          consecutiveFailureCount={model.consecutiveFailureCount}
          lastRunSuccess={model.lastRunSuccess}
        />
        {healthScore && <HealthBadge health={healthScore} compact />}
      </div>

      <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
        {model.tags && model.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {model.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: tagColor(tag, 0.15), color: tagColor(tag, 0.9) }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-gray-400 dark:text-gray-500">Interval</span>
          <span>{formatInterval(model.intervalMinutes)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 dark:text-gray-500">Next run</span>
          <span className={isOverdue ? 'text-amber-600 font-medium' : ''}>
            {model.isActive ? formatRelativeTime(nextRun) : '—'}
          </span>
        </div>
        {model.lastRunAt && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 dark:text-gray-500">Last run</span>
            <span>{formatRelativeTime(new Date(model.lastRunAt))}</span>
          </div>
        )}
        {model.consecutiveFailureCount > 0 && (
          <div className="flex items-center justify-between text-red-600">
            <span>Consecutive failures</span>
            <span className="font-semibold">{model.consecutiveFailureCount} / 30</span>
          </div>
        )}
        {healthScore?.daysUntilPause != null && (
          <div className={`flex items-center justify-between ${healthScore.daysUntilPause <= 14 ? 'text-red-600 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
            <span>Auto-pause in</span>
            <span>{healthScore.daysUntilPause}d</span>
          </div>
        )}
      </div>

      {/* Failure progress bar */}
      {model.consecutiveFailureCount > 0 && (
        <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700" role="progressbar" aria-valuenow={model.consecutiveFailureCount} aria-valuemin={0} aria-valuemax={30} aria-label={`${model.consecutiveFailureCount} of 30 failures before auto-disable`}>
          <div
            className={`h-1.5 rounded-full transition-all ${
              model.consecutiveFailureCount >= 25
                ? 'bg-red-500'
                : model.consecutiveFailureCount >= 10
                ? 'bg-amber-400'
                : 'bg-yellow-300'
            }`}
            style={{ width: `${Math.min((model.consecutiveFailureCount / 30) * 100, 100)}%` }}
          />
        </div>
      )}

      {/* Action buttons */}
      {(onRunNow || onEnable || onDisable || onDelete) && (
        <div
          className="mt-3 flex gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {onRunNow && model.isActive && (
            <button
              onClick={onRunNow}
              aria-label={`Run ${model.displayName} now`}
              className="flex-1 rounded border border-brand-500 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 transition dark:text-brand-400 dark:hover:bg-brand-950"
            >
              Run now
            </button>
          )}
          {onDisable && model.isActive && (
            <button
              onClick={onDisable}
              aria-label={`Disable ${model.displayName}`}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Disable
            </button>
          )}
          {onEnable && !model.isActive && (
            <button
              onClick={onEnable}
              aria-label={`Re-enable ${model.displayName}`}
              className="flex-1 rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 transition"
            >
              Re-enable
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              aria-label={`Remove ${model.displayName}`}
              className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}h`;
  if (minutes < 10080) return `${minutes / 1440}d`;
  if (minutes < 43200) return `${Math.round(minutes / 10080)}w`;
  return '1 month';
}

function formatRelativeTime(date: Date): string {
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  if (abs < 60_000) return past ? 'just now' : 'in <1m';
  if (abs < 3_600_000) return `${past ? '' : 'in '}${Math.round(abs / 60_000)}m${past ? ' ago' : ''}`;
  if (abs < 86_400_000) return `${past ? '' : 'in '}${Math.round(abs / 3_600_000)}h${past ? ' ago' : ''}`;
  return `${past ? '' : 'in '}${Math.round(abs / 86_400_000)}d${past ? ' ago' : ''}`;
}

const TAG_HUES = [210, 340, 120, 30, 270, 180, 50, 300, 160, 0];
function tagColor(tag: string, alpha: number): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  const hue = TAG_HUES[Math.abs(hash) % TAG_HUES.length];
  return `hsla(${hue}, 70%, 45%, ${alpha})`;
}
