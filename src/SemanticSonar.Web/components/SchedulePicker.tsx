'use client';

import { SCHEDULE_PRESETS } from '@/lib/types';

interface Props {
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}

export function SchedulePicker({ value, onChange, disabled }: Props) {
  const isPreset = SCHEDULE_PRESETS.some((p) => p.minutes === value);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {SCHEDULE_PRESETS.map((preset) => (
          <button
            key={preset.minutes}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.minutes)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              value === preset.minutes
                ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-600/20 dark:text-brand-400'
                : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:bg-brand-600/20'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom value input */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">Custom (minutes):</span>
        <input
          type="number"
          min={60}
          max={43200}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 60 && v <= 43200) onChange(v);
          }}
          className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        {!isPreset && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ≈ {formatMinutes(value)}
          </span>
        )}
      </div>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  if (minutes < 10080) return `${(minutes / 1440).toFixed(1)} days`;
  return `${(minutes / 10080).toFixed(1)} weeks`;
}
