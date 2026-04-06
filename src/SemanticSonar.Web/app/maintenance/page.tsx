'use client';

import { useEffect, useState } from 'react';
import { modelsApi, tenantsApi } from '@/lib/api';
import type { SemanticModelConfig, TenantConfig, MaintenanceWindow } from '@/lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Display order: Mon(1)–Sun(0)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function windowKey(w: MaintenanceWindow) {
  return `${w.startTimeUtc}-${w.endTimeUtc}-${w.daysOfWeek.sort().join(',')}-${w.suppressAlerts}-${w.skipCanary}`;
}

function windowLabel(w: MaintenanceWindow) {
  const days = w.daysOfWeek.length === 7
    ? 'Every day'
    : DAY_ORDER.filter((d) => w.daysOfWeek.includes(d)).map((d) => DAYS[d]).join(', ');
  return `${w.startTimeUtc} – ${w.endTimeUtc} UTC · ${days}`;
}

interface WindowGroup {
  key: string;
  window: MaintenanceWindow;
  models: SemanticModelConfig[];
}

export default function MaintenancePage() {
  const [models, setModels] = useState<SemanticModelConfig[]>([]);
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New window form
  const [startTime, setStartTime] = useState('02:00');
  const [endTime, setEndTime] = useState('06:00');
  const [days, setDays] = useState<number[]>([0, 6]);
  const [suppress, setSuppress] = useState(true);
  const [skip, setSkip] = useState(false);

  // Model assignment
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Editing existing window — which models are a candidate for removal
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [removeModels, setRemoveModels] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    Promise.all([modelsApi.list(), tenantsApi.list()])
      .then(([m, t]) => { setModels(m); setTenants(t); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.displayName]));

  // Group models by unique maintenance windows
  const groups: WindowGroup[] = [];
  const seen = new Map<string, WindowGroup>();
  for (const model of models) {
    for (const w of model.maintenanceWindows ?? []) {
      const k = windowKey(w);
      if (!seen.has(k)) {
        const g: WindowGroup = { key: k, window: w, models: [] };
        seen.set(k, g);
        groups.push(g);
      }
      seen.get(k)!.models.push(model);
    }
  }

  // Models that don't already have the new window being created
  const newWindow: MaintenanceWindow = {
    startTimeUtc: startTime,
    endTimeUtc: endTime,
    daysOfWeek: days.sort((a, b) => a - b),
    suppressAlerts: suppress,
    skipCanary: skip,
  };
  const newKey = windowKey(newWindow);
  const alreadyHasWindow = new Set(
    (seen.get(newKey)?.models ?? []).map((m) => m.id),
  );

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const toggleModel = (id: string) =>
    setSelectedModels((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleRemoveModel = (id: string) =>
    setRemoveModels((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAssign = async () => {
    if (selectedModels.size === 0) return;
    if (days.length === 0) { setError('Select at least one day.'); return; }
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const updates = [...selectedModels].map((id) => {
        const model = models.find((m) => m.id === id)!;
        const existing = model.maintenanceWindows ?? [];
        return modelsApi.update(model.id, model.tenantId, {
          maintenanceWindows: [...existing, newWindow],
        });
      });
      const updated = await Promise.all(updates);
      setModels((prev) =>
        prev.map((m) => updated.find((u) => u.id === m.id) ?? m),
      );
      setSelectedModels(new Set());
      setSaveMsg(`Window assigned to ${updated.length} model${updated.length !== 1 ? 's' : ''}.`);
      setTimeout(() => setSaveMsg(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (group: WindowGroup) => {
    if (removeModels.size === 0) return;
    setRemoving(true);
    setError(null);
    try {
      const updates = [...removeModels].map((id) => {
        const model = group.models.find((m) => m.id === id)!;
        const filtered = (model.maintenanceWindows ?? []).filter(
          (w) => windowKey(w) !== group.key,
        );
        return modelsApi.update(model.id, model.tenantId, {
          maintenanceWindows: filtered,
        });
      });
      const updated = await Promise.all(updates);
      setModels((prev) =>
        prev.map((m) => updated.find((u) => u.id === m.id) ?? m),
      );
      setRemoveModels(new Set());
      setEditingKey(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Maintenance Windows
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Define a time window, then assign multiple models at once.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Create / Assign ───────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Create &amp; assign window
        </h2>

        {/* Time range */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="start" className="block text-xs font-medium text-gray-500 dark:text-gray-400">Start (UTC)</label>
            <input
              id="start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label htmlFor="end" className="block text-xs font-medium text-gray-500 dark:text-gray-400">End (UTC)</label>
            <input
              id="end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Days */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Days</p>
          <div className="flex gap-1">
            {DAY_ORDER.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  days.includes(i)
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {DAYS[i]}
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={suppress} onChange={() => setSuppress(!suppress)} className="rounded" />
            Suppress alerts
          </label>
          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={skip} onChange={() => setSkip(!skip)} className="rounded" />
            Skip canary entirely
          </label>
        </div>

        {/* Model selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Select models to assign this window to
            </p>
            {!loading && models.length > 0 && (() => {
              const assignable = models.filter((m) => !alreadyHasWindow.has(m.id));
              const allSelected = assignable.length > 0 && assignable.every((m) => selectedModels.has(m.id));
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (allSelected) {
                      setSelectedModels(new Set());
                    } else {
                      setSelectedModels(new Set(assignable.map((m) => m.id)));
                    }
                  }}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              );
            })()}
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">Loading models…</p>
          ) : models.length === 0 ? (
            <p className="text-sm text-gray-400">No models configured yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100 dark:border-gray-600 dark:divide-gray-700">
              {models.map((m) => {
                const already = alreadyHasWindow.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm transition ${
                      already
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={already}
                      checked={selectedModels.has(m.id)}
                      onChange={() => toggleModel(m.id)}
                      className="rounded"
                    />
                    <span className="flex-1 truncate text-gray-800 dark:text-gray-200">
                      {m.displayName}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {tenantMap[m.tenantId] ?? m.tenantId}
                    </span>
                    {already && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                        Already assigned
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAssign}
            disabled={saving || selectedModels.size === 0}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {saving ? 'Assigning…' : `Assign to ${selectedModels.size} model${selectedModels.size !== 1 ? 's' : ''}`}
          </button>
          {saveMsg && <span className="text-sm text-green-600">{saveMsg}</span>}
        </div>
      </div>

      {/* ── Existing Windows ─────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Active windows
          {groups.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">({groups.length})</span>
          )}
        </h2>

        {groups.length === 0 && !loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No maintenance windows configured on any model yet.
          </p>
        )}

        {groups.map((g) => (
          <div
            key={g.key}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {g.window.startTimeUtc} – {g.window.endTimeUtc} UTC
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {g.window.daysOfWeek.length === 7
                    ? 'Every day'
                    : DAY_ORDER.filter((d) => g.window.daysOfWeek.includes(d)).map((d) => DAYS[d]).join(', ')}
                  {g.window.suppressAlerts && ' · Suppress alerts'}
                  {g.window.skipCanary && ' · Skip canary'}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {g.models.length} model{g.models.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {g.models.map((m) => (
                <span
                  key={m.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                    editingKey === g.key && removeModels.has(m.id)
                      ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-400 line-through'
                      : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {m.displayName}
                  {editingKey === g.key && (
                    <button
                      type="button"
                      onClick={() => toggleRemoveModel(m.id)}
                      className="ml-0.5 text-gray-400 hover:text-red-500"
                      title={removeModels.has(m.id) ? 'Keep' : 'Remove from window'}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              {editingKey === g.key ? (
                <>
                  <button
                    onClick={() => handleRemove(g)}
                    disabled={removing || removeModels.size === 0}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {removing ? 'Removing…' : `Remove ${removeModels.size} model${removeModels.size !== 1 ? 's' : ''}`}
                  </button>
                  <button
                    onClick={() => { setEditingKey(null); setRemoveModels(new Set()); }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setEditingKey(g.key); setRemoveModels(new Set()); }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition"
                >
                  Edit models
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
