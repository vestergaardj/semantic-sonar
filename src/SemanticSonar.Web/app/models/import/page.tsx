'use client';

import { useEffect, useState } from 'react';
import { modelsApi, tenantsApi, browseApi } from '@/lib/api';
import type { TenantConfig, PowerBiWorkspace, PowerBiDataset, CreateModelInput } from '@/lib/types';
import { SchedulePicker } from '@/components/SchedulePicker';
import { TagSelector } from '@/components/TagInput';

export default function ImportModelsPage() {
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [workspaces, setWorkspaces] = useState<PowerBiWorkspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<PowerBiWorkspace | null>(null);
  const [datasets, setDatasets] = useState<PowerBiDataset[]>([]);
  const [existingModels, setExistingModels] = useState<Set<string>>(new Set());

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queryMode, setQueryMode] = useState<'dax' | 'rest'>('dax');
  const [interval, setInterval] = useState(60);

  const [loadingWs, setLoadingWs] = useState(false);
  const [loadingDs, setLoadingDs] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number } | null>(null);

  const [wsSearch, setWsSearch] = useState('');
  const [dsSearch, setDsSearch] = useState('');
  const [wsCollapsed, setWsCollapsed] = useState(false);
  const [tag, setTag] = useState<string | undefined>(undefined);

  useEffect(() => {
    tenantsApi.list().then(setTenants).catch(() => {});
  }, []);

  // Load existing models for duplicate detection
  useEffect(() => {
    if (!tenantId) return;
    modelsApi.list(tenantId).then((models) => {
      const ids = new Set(models.map((m) => `${m.workspaceId}::${m.datasetId}`));
      setExistingModels(ids);
    }).catch(() => {});
  }, [tenantId]);

  // Load workspaces when tenant changes
  useEffect(() => {
    if (!tenantId) { setWorkspaces([]); setSelectedWs(null); setDatasets([]); return; }
    setLoadingWs(true);
    setError(null);
    setSelectedWs(null);
    setDatasets([]);
    setSelected(new Set());
    browseApi.workspaces(tenantId)
      .then(setWorkspaces)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingWs(false));
  }, [tenantId]);

  const handleSelectWorkspace = (ws: PowerBiWorkspace) => {
    setSelectedWs(ws);
    setWsCollapsed(true);
    setDatasets([]);
    setSelected(new Set());
    setLoadingDs(true);
    setError(null);
    setResult(null);
    browseApi.datasets(tenantId, ws.id)
      .then(setDatasets)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingDs(false));
  };

  const toggleDataset = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const importable = filteredDatasets.filter((ds) => !isAlreadyMonitored(ds));
    if (importable.every((ds) => selected.has(ds.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.map((ds) => ds.id)));
    }
  };

  const isAlreadyMonitored = (ds: PowerBiDataset) =>
    selectedWs ? existingModels.has(`${selectedWs.id}::${ds.id}`) : false;

  const handleImport = async () => {
    if (selected.size === 0 || !selectedWs) return;
    setImporting(true);
    setError(null);
    setResult(null);

    const inputs: CreateModelInput[] = [...selected].map((dsId) => {
      const ds = datasets.find((d) => d.id === dsId)!;
      return {
        tenantId,
        workspaceId: selectedWs.id,
        datasetId: ds.id,
        displayName: ds.name,
        daxQuery: queryMode === 'rest' ? '' : 'EVALUATE\nROW("Test", 1)',
        queryMode,
        intervalMinutes: interval,
        tags: tag ? [tag] : undefined,
      };
    });

    try {
      const created = await modelsApi.bulkCreate(inputs);
      setResult({ count: created.length });
      // Refresh existing models set
      const newIds = new Set(existingModels);
      created.forEach((m) => newIds.add(`${m.workspaceId}::${m.datasetId}`));
      setExistingModels(newIds);
      setSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  // Filter workspaces
  const filteredWorkspaces = (() => {
    const sorted = [...workspaces].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    const q = wsSearch.trim();
    if (!q) return sorted;
    const escaped = q.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(escaped, 'i');
    return sorted.filter((ws) => re.test(ws.name));
  })();

  // Filter datasets
  const filteredDatasets = (() => {
    const sorted = [...datasets].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    const q = dsSearch.trim();
    if (!q) return sorted;
    const escaped = q.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(escaped, 'i');
    return sorted.filter((ds) => re.test(ds.name));
  })();

  const importableCount = filteredDatasets.filter((ds) => !isAlreadyMonitored(ds)).length;
  const allSelected = importableCount > 0 && filteredDatasets.filter((ds) => !isAlreadyMonitored(ds)).every((ds) => selected.has(ds.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <nav className="mb-1 text-sm text-gray-400 dark:text-gray-500" aria-label="Breadcrumb">
          <a href="/models" className="hover:underline">Models</a>
          {' / '}
          <span className="text-gray-600 dark:text-gray-300">Import from workspace</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Import models from workspace</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Scan a workspace and select datasets to add as monitored models in bulk.
        </p>
      </div>

      {/* Step 1: Tenant */}
      <div>
        <label htmlFor="tenant" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          1. Select tenant
        </label>
        <select
          id="tenant"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="mt-1 block w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="">Choose a tenant…</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.displayName}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
          Successfully imported {result.count} model{result.count !== 1 ? 's' : ''}!{' '}
          <a href="/models" className="underline">View models</a>
        </div>
      )}

      {/* Step 2: Workspace */}
      {tenantId && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              2. Select workspace
              {workspaces.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({filteredWorkspaces.length}{filteredWorkspaces.length !== workspaces.length ? ` of ${workspaces.length}` : ''})
                </span>
              )}
            </h2>
            {selectedWs && (
              <button
                type="button"
                onClick={() => setWsCollapsed((v) => !v)}
                className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {wsCollapsed ? 'Change' : 'Collapse'}
              </button>
            )}
          </div>

          {/* Collapsed: show selected workspace summary */}
          {wsCollapsed && selectedWs ? (
            <div className="rounded-lg border border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-500 p-3 text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100">{selectedWs.name}</span>
              <span className="block mt-0.5 text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{selectedWs.id}</span>
            </div>
          ) : (
            <>
              {workspaces.length > 5 && (
                <input
                  type="text"
                  placeholder="Search workspaces… (use * as wildcard)"
                  value={wsSearch}
                  onChange={(e) => setWsSearch(e.target.value)}
                  aria-label="Search workspaces"
                  className="mb-3 w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              )}

              {loadingWs ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Loading workspaces…
                </div>
              ) : workspaces.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No workspaces found.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => handleSelectWorkspace(ws)}
                      className={`rounded-lg border p-3 text-left text-sm transition ${
                        selectedWs?.id === ws.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 ring-1 ring-brand-500'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">{ws.name}</span>
                      <span className="block mt-0.5 text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{ws.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Step 3: Select datasets */}
      {selectedWs && (
        <section>
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            3. Select datasets to import from <span className="font-semibold">{selectedWs.name}</span>
          </h2>

          {datasets.length > 5 && (
            <input
              type="text"
              placeholder="Search datasets… (use * as wildcard)"
              value={dsSearch}
              onChange={(e) => setDsSearch(e.target.value)}
              aria-label="Search datasets"
              className="mb-3 w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          )}

          {loadingDs ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading datasets…
            </div>
          ) : datasets.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No datasets found in this workspace.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all importable datasets"
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                      />
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Configured by</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {filteredDatasets.map((ds) => {
                    const monitored = isAlreadyMonitored(ds);
                    return (
                      <tr key={ds.id} className={monitored ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(ds.id)}
                            onChange={() => toggleDataset(ds.id)}
                            disabled={monitored}
                            aria-label={`Select ${ds.name}`}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-30 dark:border-gray-600 dark:bg-gray-700"
                          />
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{ds.name}</td>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{ds.configuredBy || '—'}</td>
                        <td className="px-4 py-2">
                          {monitored ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                              Already monitored
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">Available</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Step 4: Configure & import */}
      {selected.size > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            4. Configure import ({selected.size} dataset{selected.size !== 1 ? 's' : ''} selected)
          </h2>

          <div className="space-y-4">
            {/* Query mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Query mode</label>
              <div className="flex gap-3 max-w-lg">
                <button
                  type="button"
                  onClick={() => setQueryMode('dax')}
                  className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition ${
                    queryMode === 'dax'
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="block font-semibold">DAX query</span>
                  <span className="block text-xs font-normal mt-0.5 opacity-75">Standard models</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQueryMode('rest')}
                  className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition ${
                    queryMode === 'rest'
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="block font-semibold">REST ping</span>
                  <span className="block text-xs font-normal mt-0.5 opacity-75">AAS / SSAS models</span>
                </button>
              </div>
              {queryMode === 'dax' && (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  Models will be created with a generic test query. You can customize the DAX per-model afterwards.
                </p>
              )}
            </div>

            {/* Schedule */}
            <div>
              <label id="schedule-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Schedule interval</label>
              <div aria-labelledby="schedule-label">
                <SchedulePicker value={interval} onChange={setInterval} />
              </div>
            </div>

            {/* Tags */}
            <TagSelector value={tag} onChange={setTag} />

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition"
            >
              {importing ? 'Importing…' : `Import ${selected.size} model${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
