'use client';

import { useEffect, useState } from 'react';
import { browseApi, tenantsApi } from '@/lib/api';
import type { TenantConfig, PowerBiWorkspace, PowerBiDataset } from '@/lib/types';

export default function BrowseClient() {
  const [tenantId, setTenantId] = useState('');
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [workspaces, setWorkspaces] = useState<PowerBiWorkspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<PowerBiWorkspace | null>(null);
  const [datasets, setDatasets] = useState<PowerBiDataset[]>([]);

  const [wsCollapsed, setWsCollapsed] = useState(false);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [loadingWs, setLoadingWs] = useState(false);
  const [loadingDs, setLoadingDs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive tenant ID from URL (static export can't use useParams)
  useEffect(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    // /tenants/{id}/browse → parts = ['tenants', '{id}', 'browse']
    if (parts.length >= 2) setTenantId(parts[1]);
  }, []);

  // Load tenant details
  useEffect(() => {
    if (!tenantId) return;
    setLoadingTenant(true);
    tenantsApi.get(tenantId)
      .then(setTenant)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingTenant(false));
  }, [tenantId]);

  // Load workspaces when tenant is loaded
  useEffect(() => {
    if (!tenantId || !tenant) return;
    setLoadingWs(true);
    setError(null);
    browseApi.workspaces(tenantId)
      .then(setWorkspaces)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingWs(false));
  }, [tenantId, tenant]);

  const handleSelectWorkspace = (ws: PowerBiWorkspace) => {
    setSelectedWs(ws);
    setWsCollapsed(true);
    setDatasets([]);
    setLoadingDs(true);
    setError(null);
    browseApi.datasets(tenantId, ws.id)
      .then(setDatasets)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingDs(false));
  };

  const handleAddModel = (ds: PowerBiDataset) => {
    const params = new URLSearchParams({
      tenantId,
      workspaceId: selectedWs?.id ?? '',
      datasetId: ds.id,
      displayName: ds.name,
    });
    window.location.href = `/models/new?${params.toString()}`;
  };

  if (loadingTenant) {
    return <div className="animate-pulse h-10 w-48 rounded bg-gray-200 dark:bg-gray-700" />;
  }

  if (!tenant) {
    return <p className="text-red-600 dark:text-red-400">Tenant not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <nav className="mb-1 text-sm text-gray-400 dark:text-gray-500">
          <a href="/tenants" className="hover:underline">Tenants</a>
          {' / '}
          <span className="text-gray-600 dark:text-gray-300">{tenant.displayName}</span>
          {' / '}
          <span className="text-gray-600 dark:text-gray-300">Browse</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Browse models &mdash; {tenant.displayName}
        </h1>
      </div>

      {/* Warning banner */}
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
        <strong>Important:</strong> The registered application (<code className="text-xs">{tenant.clientId}</code>) must
        be added as a <strong>Member</strong> (or Admin) of each Power BI workspace you want to monitor.
        Only workspaces where the application has membership are listed below.
        Go to <em>Power BI &rarr; Workspace settings &rarr; Access</em> and add the application&rsquo;s service principal.
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Workspaces */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Workspaces
            {workspaces.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">({workspaces.length})</span>
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
        ) : loadingWs ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Loading workspaces…
          </div>
        ) : workspaces.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No workspaces found. Make sure the app registration has access.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws)}
                className={`rounded-lg border p-3 text-left text-sm transition
                  ${selectedWs?.id === ws.id
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
      </section>

      {/* Datasets */}
      {selectedWs && (
        <section>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
            Datasets in <span className="font-semibold">{selectedWs.name}</span>
          </h2>
          {loadingDs ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading datasets…
            </div>
          ) : datasets.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No datasets found in this workspace.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Configured by</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">ID</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {datasets.map((ds) => (
                    <tr key={ds.id}>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{ds.name}</td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{ds.configuredBy || '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-400 dark:text-gray-500">{ds.id}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleAddModel(ds)}
                          className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 transition"
                        >
                          + Add model
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
