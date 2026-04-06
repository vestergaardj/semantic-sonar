'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { modelsApi, resultsApi, browseApi } from '@/lib/api';
import type { SemanticModelConfig, CanaryResult, DatasetRefreshEntry, MaintenanceWindow, ModelHealthScore } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { LatencyChart } from '@/components/LatencyChart';
import { SchedulePicker } from '@/components/SchedulePicker';
import { HealthBadge } from '@/components/HealthBadge';
import { MaintenanceEditor } from '@/components/MaintenanceEditor';
import { TagInput } from '@/components/TagInput';
import { SCHEDULE_PRESETS } from '@/lib/types';

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ModelDetailClient() {
  // In static export, useParams() returns the build-time shell value.
  // Derive model ID from URL in an effect (runs only on client).
  const [modelId, setModelId] = useState('');
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? '';

  useEffect(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    setModelId(parts.length >= 2 ? parts[1] : '');
  }, []);

  const [model, setModel] = useState<SemanticModelConfig | null>(null);
  const [results, setResults] = useState<CanaryResult[]>([]);
  const [refreshHistory, setRefreshHistory] = useState<DatasetRefreshEntry[]>([]);
  const [healthScore, setHealthScore] = useState<ModelHealthScore | null>(null);
  const [loadingRefreshes, setLoadingRefreshes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDax, setEditDax] = useState('');
  const [editInterval, setEditInterval] = useState(60);
  const [editQueryMode, setEditQueryMode] = useState<'dax' | 'rest'>('dax');
  const [editMaintenanceWindows, setEditMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);

  const load = async () => {
    if (!modelId) return; // Wait for modelId to be derived from URL
    if (!tenantId) {
      setError('Missing tenant ID.');
      setLoading(false);
      return;
    }
    try {
      const [m, r] = await Promise.all([
        modelsApi.get(modelId, tenantId),
        resultsApi.forModel(modelId, 50),
      ]);
      setModel(m);
      setResults(r);
      setEditName(m.displayName);
      setEditDax(m.daxQuery);
      setEditInterval(m.intervalMinutes);
      setEditQueryMode(m.queryMode ?? 'dax');
      setEditMaintenanceWindows(m.maintenanceWindows ?? []);
      setEditTags(m.tags ?? []);
      // Load health score (best-effort)
      resultsApi.healthScores().then((scores) => {
        const match = scores.find((s) => s.modelId === m.id);
        if (match) setHealthScore(match);
      }).catch(() => {});
      // Load refresh history (best-effort)
      setLoadingRefreshes(true);
      browseApi.refreshHistory(m.tenantId, m.workspaceId, m.datasetId, 10)
        .then(setRefreshHistory)
        .catch(() => {})
        .finally(() => setLoadingRefreshes(false));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [modelId, tenantId]);

  const handleSave = async () => {
    if (!model) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updated = await modelsApi.update(model.id, model.tenantId, {
        displayName: editName,
        daxQuery: editQueryMode === 'rest' ? '' : editDax,
        intervalMinutes: editInterval,
        queryMode: editQueryMode,
        maintenanceWindows: editMaintenanceWindows,
        tags: editTags,
      });
      setModel(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    if (!model) return;
    setRunning(true);
    try {
      await modelsApi.runNow(model.id, model.tenantId);
      alert('Run triggered. Results will appear after a few seconds.');
    } finally {
      setRunning(false);
    }
  };

  const handleEnable = async () => {
    if (!model) return;
    const updated = await modelsApi.enable(model.id, model.tenantId);
    setModel(updated);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
        {error ?? 'Model not found.'}
      </div>
    );
  }

  const isAtRisk = model.consecutiveFailureCount >= 10 && model.isActive;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="mb-1 text-sm text-gray-400 dark:text-gray-500" aria-label="Breadcrumb">
            <a href="/models" className="hover:underline">Models</a>
            {' / '}
            <span className="text-gray-600 dark:text-gray-300">{model.displayName}</span>
          </nav>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{model.displayName}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <StatusBadge isActive={model.isActive} consecutiveFailureCount={model.consecutiveFailureCount} lastRunSuccess={model.lastRunSuccess} />
            {healthScore && <HealthBadge health={healthScore} compact />}
            <span>Workspace: <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">{model.workspaceId}</code></span>
            <span>Dataset: <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">{model.datasetId}</code></span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${model.queryMode === 'rest' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300'}`}>{model.queryMode === 'rest' ? 'REST ping' : 'DAX query'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!model.isActive && (
            <button
              onClick={handleEnable}
              className="rounded-md border border-green-500 px-3 py-1.5 text-sm text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
            >
              Re-enable
            </button>
          )}
          <button
            onClick={handleRunNow}
            disabled={running}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run now'}
          </button>
        </div>
      </div>

      {/* Failure warning */}
      {model.consecutiveFailureCount > 0 && (
        <div
          className={`rounded-md border p-3 text-sm ${
            !model.isActive
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400'
              : isAtRisk
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400'
              : 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400'
          }`}
        >
          {!model.isActive
            ? `Disabled after ${model.consecutiveFailureCount} consecutive failures.`
            : `${model.consecutiveFailureCount} consecutive failure${model.consecutiveFailureCount !== 1 ? 's' : ''}.${
                isAtRisk ? ` Will be disabled at 30.` : ''
              }`}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: 'Interval', value: SCHEDULE_PRESETS.find((p) => p.minutes === model.intervalMinutes)?.label ?? `${model.intervalMinutes}m` },
          { label: 'Next run', value: model.isActive ? formatDate(model.nextRunTime) : 'Paused' },
          { label: 'Last run', value: formatDate(model.lastRunAt) },
          { label: 'Last result', value: model.lastRunSuccess == null ? 'Never' : model.lastRunSuccess ? '✓ OK' : '✗ Failed' },
          { label: 'Last refresh', value: model.lastRefreshStatus ?? 'Unknown', extra: model.lastRefreshTime ? formatDate(model.lastRefreshTime) : undefined },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
            <p className={`mt-1 text-sm font-semibold ${
              s.label === 'Last refresh' && s.value === 'Failed' ? 'text-red-600' :
              s.label === 'Last refresh' && s.value === 'Completed' ? 'text-green-600' :
              'text-gray-900 dark:text-gray-100'
            }`}>{s.value}</p>
            {'extra' in s && s.extra && <p className="mt-0.5 text-xs text-gray-400">{s.extra}</p>}
          </div>
        ))}
      </div>

      {/* Health score */}
      {healthScore && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Model health</h2>
          <HealthBadge health={healthScore} />
        </div>
      )}

      {/* Latency chart */}
      {results.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Latency history (last {results.length} runs)</h2>
          <LatencyChart results={results} />
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Run history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-100 text-sm dark:divide-gray-700" aria-label="Run history">
              <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left" scope="col">Executed</th>
                  <th className="px-4 py-2 text-left" scope="col">Status</th>
                  <th className="px-4 py-2 text-right" scope="col">Latency</th>
                  <th className="px-4 py-2 text-right" scope="col">Rows</th>
                  <th className="px-4 py-2 text-left" scope="col">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatDate(r.executedAt)}</td>
                    <td className="px-4 py-2">
                      <span className={`font-medium ${r.success ? 'text-green-600' : 'text-red-600'}`}>
                        {r.success ? '✓ OK' : '✗ Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{formatMs(r.latencyMs)}</td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{r.rowCount ?? '—'}</td>
                    <td className="px-4 py-2 max-w-xs truncate text-gray-500 dark:text-gray-400" title={r.errorMessage ?? ''}>
                      {r.errorMessage ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Refresh history */}
      {(refreshHistory.length > 0 || loadingRefreshes) && (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Dataset refresh history</h2>
          </div>
          {loadingRefreshes ? (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading refreshes…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-gray-100 text-sm dark:divide-gray-700" aria-label="Refresh history">
                <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left" scope="col">Started</th>
                    <th className="px-4 py-2 text-left" scope="col">Ended</th>
                    <th className="px-4 py-2 text-left" scope="col">Status</th>
                    <th className="px-4 py-2 text-left" scope="col">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {refreshHistory.map((r) => (
                    <tr key={r.requestId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{r.startTime ? formatDate(r.startTime) : '—'}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{r.endTime ? formatDate(r.endTime) : '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`font-medium ${
                          r.status === 'Completed' ? 'text-green-600' :
                          r.status === 'Failed' ? 'text-red-600' :
                          r.status === 'Unknown' ? 'text-yellow-600' :
                          'text-gray-600 dark:text-gray-400'
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{r.refreshType ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Edit configuration</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="editName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Display name</label>
            <input
              id="editName"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Query mode</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditQueryMode('dax')}
                className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition ${editQueryMode === 'dax' ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300' : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'}`}
              >
                <span className="block font-semibold">DAX query</span>
                <span className="block text-xs font-normal mt-0.5 opacity-75">Executes a DAX query against the model</span>
              </button>
              <button
                type="button"
                onClick={() => setEditQueryMode('rest')}
                className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition ${editQueryMode === 'rest' ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300' : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'}`}
              >
                <span className="block font-semibold">REST ping</span>
                <span className="block text-xs font-normal mt-0.5 opacity-75">For live-connected AAS / SSAS models</span>
              </button>
            </div>
          </div>

          {editQueryMode === 'dax' && (
          <div>
            <label htmlFor="editDax" className="block text-sm font-medium text-gray-700 dark:text-gray-300">DAX query</label>
            <textarea
              id="editDax"
              rows={4}
              value={editDax}
              onChange={(e) => setEditDax(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          )}

          <div>
            <label id="schedule-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Schedule interval</label>
            <div className="mt-2" aria-labelledby="schedule-label">
              <SchedulePicker value={editInterval} onChange={setEditInterval} />
            </div>
          </div>

          <TagInput tags={editTags} onChange={setEditTags} />

          <MaintenanceEditor
            windows={editMaintenanceWindows}
            onChange={setEditMaintenanceWindows}
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saveSuccess && <span className="text-sm text-green-600">Saved!</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
