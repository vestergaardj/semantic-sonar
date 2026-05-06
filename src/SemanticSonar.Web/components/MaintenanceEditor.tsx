'use client';

import type { MaintenanceWindow } from '@/lib/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  windows: MaintenanceWindow[];
  onChange: (windows: MaintenanceWindow[]) => void;
}

const emptyWindow: MaintenanceWindow = {
  startTimeUtc: '00:00',
  endTimeUtc: '06:00',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  suppressAlerts: true,
  skipCanary: false,
};

export function MaintenanceEditor({ windows, onChange }: Props) {
  const addWindow = () => onChange([...windows, { ...emptyWindow }]);

  const removeWindow = (idx: number) => onChange(windows.filter((_, i) => i !== idx));

  const updateWindow = (idx: number, patch: Partial<MaintenanceWindow>) =>
    onChange(windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)));

  const toggleDay = (idx: number, day: number) => {
    const w = windows[idx];
    const days = w.daysOfWeek.includes(day)
      ? w.daysOfWeek.filter((d) => d !== day)
      : [...w.daysOfWeek, day].sort();
    updateWindow(idx, { daysOfWeek: days });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Maintenance windows
        </label>
        <button
          type="button"
          onClick={addWindow}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          + Add window
        </button>
      </div>

      {windows.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          No maintenance windows configured. Canary checks run continuously.
        </p>
      )}

      {windows.map((w, idx) => (
        <div
          key={idx}
          className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2 dark:border-gray-600 dark:bg-gray-700/50"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Window {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeWindow(idx)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>

          {/* Time range */}
          <div className="flex items-center gap-2 text-sm">
            <label className="text-xs text-gray-500 dark:text-gray-400 w-10">From</label>
            <input
              type="time"
              value={w.startTimeUtc}
              onChange={(e) => updateWindow(idx, { startTimeUtc: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <label className="text-xs text-gray-500 dark:text-gray-400 w-6">to</label>
            <input
              type="time"
              value={w.endTimeUtc}
              onChange={(e) => updateWindow(idx, { endTimeUtc: e.target.value })}
              className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <span className="text-xs text-gray-400">UTC</span>
          </div>

          {/* Days of week */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-10">Days</span>
            {DAY_NAMES.map((name, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(idx, day)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                  w.daysOfWeek.includes(day)
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={w.suppressAlerts}
                onChange={(e) => updateWindow(idx, { suppressAlerts: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-gray-600 dark:text-gray-400">Suppress alerts</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={w.skipCanary}
                onChange={(e) => updateWindow(idx, { skipCanary: e.target.checked })}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-gray-600 dark:text-gray-400">Skip canary entirely</span>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
